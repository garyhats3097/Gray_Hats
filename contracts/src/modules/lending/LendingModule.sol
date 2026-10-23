// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICoreVault} from "../../interfaces/ICoreVault.sol";
import {IModule} from "../../interfaces/IModule.sol";

/// @title LendingModule — simplified over-collateralised borrowing (PROTOTYPE)
/// @notice Rules (see docs/LENDING.md):
///  - Users allocate vault collateral to Lending (it is locked in the CoreVault).
///  - Borrow mUSDC up to 75% of that collateral (LTV). Collateral and debt are both
///    mUSDC ($1), so no oracle is needed.
///  - Borrowed tokens come from the lending pool: the module's reserve in the vault,
///    seeded by the deploy script. There is no external liquidity.
///  - Debt grows with simple 5% APR interest, accrued on every interaction.
///  - Health factor = collateral * 85% / debt. Below 1.0 anyone may liquidate: debt + 5%
///    penalty is taken from the locked collateral into the pool, the rest is unlocked.
contract LendingModule is IModule, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant LTV_BPS = 7_500; // max borrow = 75% of collateral
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8_500; // liquidatable above 85%
    uint256 public constant LIQUIDATION_PENALTY_BPS = 500; // 5%
    uint256 public constant APR_BPS = 500; // 5% simple interest per year
    uint256 public constant YEAR = 365 days;

    struct Loan {
        uint256 debt; // principal + accrued interest at lastAccrued
        uint256 lastAccrued;
    }

    ICoreVault public immutable vault;
    IERC20 public immutable token;

    mapping(address => Loan) private _loans;

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

    constructor(ICoreVault vault_) {
        vault = vault_;
        token = IERC20(vault_.collateralToken());
    }

    function moduleName() external pure returns (string memory) {
        return "Lending";
    }

    // ============================================================ collateral

    function addCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        vault.lock(msg.sender, amount); // vault enforces free collateral
        emit CollateralAdded(msg.sender, amount);
    }

    function removeCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue(msg.sender);
        uint256 collateral = collateralOf(msg.sender);
        if (amount > collateral) revert WouldBreakCollateralRequirement();
        if ((collateral - amount) * LTV_BPS / BPS < _loans[msg.sender].debt) revert WouldBreakCollateralRequirement();
        vault.unlock(msg.sender, amount);
        emit CollateralRemoved(msg.sender, amount);
    }

    // =========================================================== borrowing

    function borrow(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue(msg.sender);
        uint256 available = _borrowCapacity(msg.sender);
        if (amount > available) revert ExceedsBorrowLimit(amount, available);

        Loan storage loan = _loans[msg.sender];
        loan.debt += amount;
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
        token.safeTransferFrom(msg.sender, address(vault), amount);
        vault.creditReserve(amount);
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
        vault.realizeLoss(user, seize);
        if (collateral > seize) vault.unlock(user, collateral - seize);
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

    function borrowCapacity(address user) external view returns (uint256) {
        uint256 limit = collateralOf(user) * LTV_BPS / BPS;
        uint256 debt = debtOf(user);
        return limit > debt ? limit - debt : 0;
    }

    /// @notice 18-decimal health factor; type(uint256).max when there is no debt.
    function healthFactor(address user) public view returns (uint256) {
        uint256 debt = debtOf(user);
        if (debt == 0) return type(uint256).max;
        return collateralOf(user) * LIQUIDATION_THRESHOLD_BPS * 1e18 / (BPS * debt);
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
        uint256 limit = collateral * LTV_BPS / BPS;
        capacity = limit > debt ? limit - debt : 0;
        health = healthFactor(user);
    }

    // ============================================================ internals

    function _borrowCapacity(address user) private view returns (uint256) {
        uint256 limit = collateralOf(user) * LTV_BPS / BPS;
        uint256 debt = _loans[user].debt; // already accrued by caller
        return limit > debt ? limit - debt : 0;
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
