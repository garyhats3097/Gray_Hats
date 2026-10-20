// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICoreVault
/// @notice The only surface a module uses to touch user collateral.
/// @dev Accounting model (see docs/ACCOUNTING.md):
///      deposits[user]          what the user can claim from the vault
///      locked[user][module]    part of that deposit committed to one module
///      moduleReserve[module]   protocol liquidity owned by a module (perps pool, lending pool)
///      free(user) = deposits[user] - totalLocked[user]
interface ICoreVault {
    // ---------------------------------------------------------------- events
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event CollateralLocked(address indexed user, address indexed module, uint256 amount);
    event CollateralUnlocked(address indexed user, address indexed module, uint256 amount);
    event LossRealized(address indexed user, address indexed module, uint256 amount);
    event ProfitRealized(address indexed user, address indexed module, uint256 amount);
    event ReserveFunded(address indexed module, address indexed from, uint256 amount);
    event ReserveCredited(address indexed module, uint256 amount);
    event ReservePaidOut(address indexed module, address indexed to, uint256 amount);

    // ----------------------------------------------------------- user actions
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;

    // --------------------------------------------------------- module actions
    /// @notice Commit `amount` of the user's free collateral to the calling module.
    function lock(address user, uint256 amount) external;
    /// @notice Release `amount` of the calling module's lock back to the user's free balance.
    function unlock(address user, uint256 amount) external;
    /// @notice Move `amount` out of the user's lock (with the calling module) into that module's reserve.
    function realizeLoss(address user, uint256 amount) external;
    /// @notice Move `amount` from the calling module's reserve into the user's free balance.
    function realizeProfit(address user, uint256 amount) external;
    /// @notice Send `amount` tokens from the calling module's reserve to `to` (e.g. a loan payout).
    function payFromReserve(address to, uint256 amount) external;
    /// @notice Credit tokens already transferred into the vault to the calling module's reserve.
    function creditReserve(uint256 amount) external;

    // ------------------------------------------------------- anyone (funding)
    /// @notice Pull `amount` from the caller and add it to `module`'s reserve.
    function fundReserve(address module, uint256 amount) external;

    // ------------------------------------------------------------------ views
    function collateralToken() external view returns (address);
    function deposits(address user) external view returns (uint256);
    function totalLocked(address user) external view returns (uint256);
    function lockedBy(address user, address module) external view returns (uint256);
    function freeCollateral(address user) external view returns (uint256);
    function moduleReserve(address module) external view returns (uint256);
    function totalDeposits() external view returns (uint256);
    function totalReserves() external view returns (uint256);
    function isSolvent() external view returns (bool);
}
