// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICoreVault} from "../../interfaces/ICoreVault.sol";
import {ICreditRegistry} from "../../interfaces/ICreditRegistry.sol";
import {IModule} from "../../interfaces/IModule.sol";

/// @title LendingModule — credit-based borrowing, including UNDERCOLLATERALIZED loans (PROTOTYPE)
/// @notice Rules (see docs/CREDIT.md):
///  - Users allocate vault collateral to Lending (it is locked in the CoreVault).
///  - The borrow limit depends on the user's credit tier from the shared CreditRegistry:
///    Standard 75%, Trusted 90%, Established 100%, Prime 120% of collateral.
///  - The part above the collateral (unsecured) is capped by:
///      (a) 25% of everything the user has repaid before (from the registry), and
///      (b) a pool-wide cap: all unsecured debt together ≤ 10% of the pool's liquidity.
///  - Each loan keeps the liquidation threshold of the tier it was taken under, so a later
///    score change never makes an existing loan liquidatable by itself.
///  - Debt grows with simple 5% APR interest, accrued on every interaction.
///  - Health factor = collateral × threshold / debt. Below 1.0 anyone may liquidate: debt + 5%
///    is taken from the collateral; any shortfall is bad debt absorbed by the pool, and the
///    user is marked as defaulted in the registry (no more unsecured borrowing).
///  - Borrowed tokens come from the lending pool (the module's reserve in the vault), seeded by
///    the deploy script. There are no real lenders.
contract LendingModule is IModule, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    /// @notice Standard-tier terms (users without credit history).
    uint256 public constant LTV_BPS = 7_500;
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8_500;
    uint256 public constant LIQUIDATION_PENALTY_BPS = 500; // 5%
    uint256 public constant APR_BPS = 500; // 5% simple interest per year
    uint256 public constant YEAR = 365 days;
    /// @notice All unsecured debt together may use at most 10% of the pool's liquidity.
    uint256 public constant POOL_UNSECURED_CAP_BPS = 1_000;

    struct Loan {
        uint256 debt; // principal + accrued interest at lastAccrued
        uint256 lastAccrued;
        uint256 liquidationThresholdBps; // tier threshold at the latest borrow
        uint256 unsecured; // debt above collateral, as of the last update
    }

    ICoreVault public immutable vault;
    IERC20 public immutable token;
    ICreditRegistry public immutable credit;

    mapping(address => Loan) private _loans;
    /// @notice Sum of every loan's unsecured part (as of each loan's last update).
    uint256 public totalUnsecured;
    /// @notice Shortfalls from liquidated undercollateralized loans, absorbed by the pool.
    uint256 public totalBadDebt;

    event CollateralAdded(address indexed user, uint256 amount);
    event CollateralRemoved(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount, uint256 newDebt);
    event Repaid(address indexed user, address indexed payer, uint256 amount, uint256 newDebt);
    event InterestAccrued(address indexed user, uint256 interest, uint256 newDebt);
    event Liquidated(
        address indexed user, address indexed liquidator, uint256 debtCleared, uint256 collateralSeized, uint256 badDebt
    );

    error ZeroAmount();
    error ExceedsBorrowLimit(uint256 requested, uint256 available);
    error WouldBreakCollateralRequirement();
    error NoDebt();
    error NotLiquidatable();

    constructor(ICoreVault vault_, ICreditRegistry credit_) {
        vault = vault_;
        token = IERC20(vault_.collateralToken());
        credit = credit_;
    }

    function moduleName() external pure returns (string memory) {
        return "Lending";
    }

    // ============================================================ collateral

    function addCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        vault.lock(msg.sender, amount); // vault enforces free collateral
        credit.recordActivity(msg.sender);
        _syncUnsecured(msg.sender);
        emit CollateralAdded(msg.sender, amount);
    }

    function removeCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue(msg.sender);
        uint256 collateral = collateralOf(msg.sender);
        if (amount > collateral) revert WouldBreakCollateralRequirement();
        uint256 debt = _loans[msg.sender].debt;
        if (debt > 0 && _limitFor(msg.sender, collateral - amount) < debt) revert WouldBreakCollateralRequirement();
        vault.unlock(msg.sender, amount);
        _syncUnsecured(msg.sender);
        emit CollateralRemoved(msg.sender, amount);
    }

    // =========================================================== borrowing

    function borrow(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue(msg.sender);
        Loan storage loan = _loans[msg.sender];
        uint256 limit = _limitFor(msg.sender, collateralOf(msg.sender));
        uint256 available = limit > loan.debt ? limit - loan.debt : 0;
        if (amount > available) revert ExceedsBorrowLimit(amount, available);

        loan.debt += amount;
        // The loan takes the liquidation threshold of the tier it is borrowed under.
        loan.liquidationThresholdBps = credit.termsOf(msg.sender).liquidationThresholdBps;
        credit.recordActivity(msg.sender);
        _syncUnsecured(msg.sender);
        vault.payFromReserve(msg.sender, amount); // reverts if the pool lacks liquidity
        emit Borrowed(msg.sender, amount, loan.debt);
    }

    /// @notice Repay from the caller's wallet. Pass type(uint256).max to repay everything.
    ///         The caller must approve this module to spend mUSDC.
    function repay(address user, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue(user);
        Loan storage loan = _loans[user];
        if (loan.debt == 0) revert NoDebt();
        if (amount > loan.debt) amount = loan.debt;

        loan.debt -= amount;
        bool closed = loan.debt == 0;
        if (closed) loan.liquidationThresholdBps = 0;
        _syncUnsecured(user);
        token.safeTransferFrom(msg.sender, address(vault), amount);
        vault.creditReserve(amount);
        credit.recordRepayment(user, amount, closed);
        emit Repaid(user, msg.sender, amount, loan.debt);
    }

    // ========================================================= liquidation

    function liquidate(address user) external nonReentrant {
        _accrue(user);
        if (healthFactor(user) >= 1e18) revert NotLiquidatable();

        Loan storage loan = _loans[user];
        uint256 debt = loan.debt;
        uint256 collateral = collateralOf(user);
        uint256 seize = debt + debt * LIQUIDATION_PENALTY_BPS / BPS;
        uint256 badDebt;
        if (seize > collateral) {
            if (debt > collateral) badDebt = debt - collateral;
            seize = collateral;
        }

        loan.debt = 0;
        loan.liquidationThresholdBps = 0;
        totalBadDebt += badDebt;
        if (seize > 0) vault.realizeLoss(user, seize);
        if (collateral > seize) vault.unlock(user, collateral - seize);
        _syncUnsecured(user);
        credit.recordLiquidation(user, true);
        emit Liquidated(user, msg.sender, debt, seize, badDebt);
    }

    // ================================================================ views

    function collateralOf(address user) public view returns (uint256) {
        return vault.lockedBy(user, address(this));
    }

    /// @notice Debt including interest accrued up to now.
    function debtOf(address user) public view returns (uint256) {
        Loan storage loan = _loans[user];
        return loan.debt + _pendingInterest(loan);
    }

    /// @notice Total amount the user may owe right now (collateral × tier LTV, with unsecured caps).
    function borrowLimit(address user) public view returns (uint256) {
        return _limitFor(user, collateralOf(user));
    }

    function borrowCapacity(address user) public view returns (uint256) {
        uint256 limit = borrowLimit(user);
        uint256 debt = debtOf(user);
        return limit > debt ? limit - debt : 0;
    }

    /// @notice Liquidation threshold that applies to the user's loan (or would apply to a new one).
    function liquidationThresholdOf(address user) public view returns (uint256) {
        uint256 snap = _loans[user].liquidationThresholdBps;
        if (_loans[user].debt > 0 && snap != 0) return snap;
        return credit.termsOf(user).liquidationThresholdBps;
    }

    /// @notice 18-decimal health factor; type(uint256).max when there is no debt.
    function healthFactor(address user) public view returns (uint256) {
        uint256 debt = debtOf(user);
        if (debt == 0) return type(uint256).max;
        return collateralOf(user) * liquidationThresholdOf(user) * 1e18 / (BPS * debt);
    }

    /// @notice Collateral that can be released without breaking the borrow limit.
    function maxRemovable(address user) external view returns (uint256) {
        uint256 collateral = collateralOf(user);
        uint256 debt = debtOf(user);
        if (debt == 0) return collateral;
        // binary search over the (monotonic) limit function
        uint256 lo;
        uint256 hi = collateral;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (_limitFor(user, collateral - mid) >= debt) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    /// @notice Room left under the pool-wide unsecured cap for this user.
    function poolUnsecuredRoom(address user) public view returns (uint256) {
        uint256 cap = vault.moduleReserve(address(this)) * POOL_UNSECURED_CAP_BPS / BPS;
        uint256 others = totalUnsecured - _loans[user].unsecured;
        return cap > others ? cap - others : 0;
    }

    /// @notice Lending pool liquidity available to borrowers.
    function availableLiquidity() external view returns (uint256) {
        return vault.moduleReserve(address(this));
    }

    function getLoan(address user)
        external
        view
        returns (uint256 collateral, uint256 debt, uint256 capacity, uint256 health)
    {
        collateral = collateralOf(user);
        debt = debtOf(user);
        capacity = borrowCapacity(user);
        health = healthFactor(user);
    }

    // ============================================================ internals

    /// @dev Borrow limit for a given collateral amount under the user's current credit terms.
    function _limitFor(address user, uint256 collateral) private view returns (uint256) {
        ICreditRegistry.Terms memory t = credit.termsOf(user);
        uint256 byLtv = collateral * t.maxLtvBps / BPS;
        if (byLtv <= collateral) return byLtv; // fully collateralized tiers
        uint256 unsecured = byLtv - collateral;
        if (unsecured > t.unsecuredAllowance) unsecured = t.unsecuredAllowance;
        uint256 room = poolUnsecuredRoom(user);
        if (unsecured > room) unsecured = room;
        return collateral + unsecured;
    }

    /// @dev Keep totalUnsecured in step with this loan's debt above its collateral.
    function _syncUnsecured(address user) private {
        Loan storage loan = _loans[user];
        uint256 collateral = collateralOf(user);
        uint256 unsecured = loan.debt > collateral ? loan.debt - collateral : 0;
        totalUnsecured = totalUnsecured - loan.unsecured + unsecured;
        loan.unsecured = unsecured;
    }

    function _accrue(address user) private {
        Loan storage loan = _loans[user];
        uint256 interest = _pendingInterest(loan);
        // Never move the accrual point backwards (a test chain's clock can jump back).
        if (block.timestamp > loan.lastAccrued) loan.lastAccrued = block.timestamp;
        if (interest > 0) {
            loan.debt += interest;
            emit InterestAccrued(user, interest, loan.debt);
        }
    }

    function _pendingInterest(Loan storage loan) private view returns (uint256) {
        // If the clock is at or before the last accrual (e.g. a local chain restarted at an
        // earlier time), there is no new interest. Without this check the subtraction reverts.
        if (loan.debt == 0 || block.timestamp <= loan.lastAccrued) return 0;
        uint256 elapsed = block.timestamp - loan.lastAccrued;
        // round up so interest is never under-charged
        return (loan.debt * APR_BPS * elapsed + BPS * YEAR - 1) / (BPS * YEAR);
    }
}
