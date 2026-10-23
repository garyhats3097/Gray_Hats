// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICreditRegistry} from "../interfaces/ICreditRegistry.sol";
import {ICoreVault} from "../interfaces/ICoreVault.sol";
import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";

/// @title CreditRegistry — shared on-chain credit history (PROTOTYPE)
/// @notice Part of the core's common risk layer. Registered modules report repayments and
///         liquidations; the registry turns a user's history into a 0–100 score and borrowing
///         terms. Lending uses the terms to allow UNDERCOLLATERALIZED loans for the best users.
/// @dev Score (see docs/CREDIT.md):
///      loans repaid in full   10 pts each,        max 30
///      total amount repaid     1 pt per $100,      max 30
///      account age             1 pt per hour,      max 10
///      vault deposit           1 pt per $500,      max 30
///      perps liquidation      −10 pts each
///      any lending default  → score 0, Standard tier forever (no unsecured borrowing)
///
///      Tier         score   max LTV   liquidation at
///      Standard     0–39     75%       85%
///      Trusted     40–69     90%       95%
///      Established 70–84    100%      105%
///      Prime       85–100   120%      125%   ← borrows more than the collateral
///
///      Anti-gaming: the part above 100% may never exceed 25% of everything the user has
///      already repaid, so cheap borrow/repay loops cannot unlock a large unsecured loan.
contract CreditRegistry is ICreditRegistry {
    uint256 public constant BPS = 10_000;

    uint256 public constant POINTS_PER_LOAN = 10;
    uint256 public constant MAX_LOAN_POINTS = 30;
    uint256 public constant VOLUME_PER_POINT = 100e18;
    uint256 public constant MAX_VOLUME_POINTS = 30;
    uint256 public constant AGE_PER_POINT = 1 hours;
    uint256 public constant MAX_AGE_POINTS = 10;
    uint256 public constant PORTFOLIO_PER_POINT = 500e18;
    uint256 public constant MAX_PORTFOLIO_POINTS = 30;
    uint256 public constant PERPS_LIQUIDATION_PENALTY = 10;
    uint256 public constant UNSECURED_SHARE_OF_REPAID_BPS = 2_500; // 25%

    IModuleRegistry public immutable registry;
    ICoreVault public immutable vault;

    mapping(address => Record) private _records;

    error NotModule(address caller);

    modifier onlyModule() {
        if (!registry.isRegistered(msg.sender)) revert NotModule(msg.sender);
        _;
    }

    constructor(IModuleRegistry registry_, ICoreVault vault_) {
        registry = registry_;
        vault = vault_;
    }

    // ============================================================ writers

    function recordActivity(address user) external onlyModule {
        Record storage r = _records[user];
        if (r.firstSeen == 0) {
            r.firstSeen = uint64(block.timestamp);
            emit ActivityRecorded(user, msg.sender);
        }
    }

    function recordRepayment(address user, uint256 amount, bool loanClosed) external onlyModule {
        Record storage r = _records[user];
        if (r.firstSeen == 0) r.firstSeen = uint64(block.timestamp);
        r.repaidVolume += amount;
        if (loanClosed) r.loansRepaid += 1;
        emit RepaymentRecorded(user, msg.sender, amount, loanClosed);
    }

    function recordLiquidation(address user, bool lendingDefault) external onlyModule {
        Record storage r = _records[user];
        if (lendingDefault) r.lendingDefaults += 1;
        else r.perpsLiquidations += 1;
        emit LiquidationRecorded(user, msg.sender, lendingDefault);
    }

    // ============================================================== views

    function recordOf(address user) external view returns (Record memory) {
        return _records[user];
    }

    function scoreOf(address user) public view returns (uint256 score, Breakdown memory b) {
        Record storage r = _records[user];
        if (r.lendingDefaults > 0) return (0, b);

        b.loansPoints = _min(uint256(r.loansRepaid) * POINTS_PER_LOAN, MAX_LOAN_POINTS);
        b.volumePoints = _min(r.repaidVolume / VOLUME_PER_POINT, MAX_VOLUME_POINTS);
        if (r.firstSeen != 0 && block.timestamp > r.firstSeen) {
            b.agePoints = _min((block.timestamp - r.firstSeen) / AGE_PER_POINT, MAX_AGE_POINTS);
        }
        b.portfolioPoints = _min(vault.deposits(user) / PORTFOLIO_PER_POINT, MAX_PORTFOLIO_POINTS);
        b.penaltyPoints = uint256(r.perpsLiquidations) * PERPS_LIQUIDATION_PENALTY;

        uint256 total = b.loansPoints + b.volumePoints + b.agePoints + b.portfolioPoints;
        score = total > b.penaltyPoints ? total - b.penaltyPoints : 0;
        if (score > 100) score = 100;
    }

    function termsOf(address user) external view returns (Terms memory t) {
        Record storage r = _records[user];
        (t.score,) = scoreOf(user);
        t.defaulted = r.lendingDefaults > 0;

        if (t.defaulted || t.score < 40) {
            (t.tier, t.maxLtvBps, t.liquidationThresholdBps) = (0, 7_500, 8_500); // Standard
        } else if (t.score < 70) {
            (t.tier, t.maxLtvBps, t.liquidationThresholdBps) = (1, 9_000, 9_500); // Trusted
        } else if (t.score < 85) {
            (t.tier, t.maxLtvBps, t.liquidationThresholdBps) = (2, 10_000, 10_500); // Established
        } else {
            (t.tier, t.maxLtvBps, t.liquidationThresholdBps) = (3, 12_000, 12_500); // Prime
        }

        if (!t.defaulted && t.maxLtvBps > BPS) {
            t.unsecuredAllowance = r.repaidVolume * UNSECURED_SHARE_OF_REPAID_BPS / BPS;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
