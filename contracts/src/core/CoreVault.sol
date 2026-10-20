// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICoreVault} from "../interfaces/ICoreVault.sol";
import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";

/// @title CoreVault
/// @notice Holds all collateral and the single shared ledger. Modules never hold user
///         collateral; they ask the vault to lock, unlock and settle it.
/// @dev Invariants (tested in test/core/CoreVault.invariant.t.sol):
///      I1  token.balanceOf(vault) >= totalDeposits + totalReserves
///      I2  totalLocked[user] <= deposits[user]
///      I3  only module M changes locked[*][M]; only registered modules call module functions
///      I4  withdraw(x) requires x <= freeCollateral(user)
///      I5  a loss realised by module M comes only out of locked[user][M]
///      I6  a profit paid by module M comes only out of moduleReserve[M]
contract CoreVault is ICoreVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IModuleRegistry public immutable registry;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public totalLocked;
    mapping(address => mapping(address => uint256)) public lockedBy;
    mapping(address => uint256) public moduleReserve;

    uint256 public totalDeposits;
    uint256 public totalReserves;

    error ZeroAmount();
    error InsufficientFreeCollateral(uint256 requested, uint256 available);
    error InsufficientLocked(uint256 requested, uint256 locked);
    error InsufficientReserve(uint256 requested, uint256 reserve);
    error UnbackedCredit();
    error ModuleNotRegistered(address caller);
    error ModuleNotActive(address caller);

    /// @dev Any registered module (active or winding down).
    modifier onlyRegisteredModule() {
        if (!registry.isRegistered(msg.sender)) revert ModuleNotRegistered(msg.sender);
        _;
    }

    /// @dev Only active modules may take on new commitments.
    modifier onlyActiveModule() {
        if (!registry.isActive(msg.sender)) revert ModuleNotActive(msg.sender);
        _;
    }

    constructor(IERC20 token_, IModuleRegistry registry_) {
        token = token_;
        registry = registry_;
    }

    // ================================================================ users

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        deposits[msg.sender] += amount;
        totalDeposits += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 free = freeCollateral(msg.sender);
        if (amount > free) revert InsufficientFreeCollateral(amount, free);
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ============================================================== modules

    function lock(address user, uint256 amount) external onlyActiveModule {
        if (amount == 0) revert ZeroAmount();
        uint256 free = freeCollateral(user);
        if (amount > free) revert InsufficientFreeCollateral(amount, free);
        lockedBy[user][msg.sender] += amount;
        totalLocked[user] += amount;
        emit CollateralLocked(user, msg.sender, amount);
    }

    function unlock(address user, uint256 amount) external onlyRegisteredModule {
        if (amount == 0) revert ZeroAmount();
        _reduceLock(user, amount);
        emit CollateralUnlocked(user, msg.sender, amount);
    }

    function realizeLoss(address user, uint256 amount) external onlyRegisteredModule {
        if (amount == 0) revert ZeroAmount();
        _reduceLock(user, amount);
        deposits[user] -= amount; // safe: lock <= deposits (I2)
        totalDeposits -= amount;
        moduleReserve[msg.sender] += amount;
        totalReserves += amount;
        emit LossRealized(user, msg.sender, amount);
    }

    function realizeProfit(address user, uint256 amount) external onlyRegisteredModule {
        if (amount == 0) revert ZeroAmount();
        _reduceReserve(amount);
        deposits[user] += amount;
        totalDeposits += amount;
        emit ProfitRealized(user, msg.sender, amount);
    }

    function payFromReserve(address to, uint256 amount) external nonReentrant onlyActiveModule {
        if (amount == 0) revert ZeroAmount();
        _reduceReserve(amount);
        token.safeTransfer(to, amount);
        emit ReservePaidOut(msg.sender, to, amount);
    }

    function creditReserve(uint256 amount) external onlyRegisteredModule {
        if (amount == 0) revert ZeroAmount();
        // Only tokens that already arrived and are not owed to anyone may be credited (I1).
        if (token.balanceOf(address(this)) < totalDeposits + totalReserves + amount) revert UnbackedCredit();
        moduleReserve[msg.sender] += amount;
        totalReserves += amount;
        emit ReserveCredited(msg.sender, amount);
    }

    // ============================================================== funding

    function fundReserve(address module, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!registry.isRegistered(module)) revert ModuleNotRegistered(module);
        moduleReserve[module] += amount;
        totalReserves += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveFunded(module, msg.sender, amount);
    }

    // ================================================================ views

    function collateralToken() external view returns (address) {
        return address(token);
    }

    function freeCollateral(address user) public view returns (uint256) {
        return deposits[user] - totalLocked[user];
    }

    function isSolvent() external view returns (bool) {
        return token.balanceOf(address(this)) >= totalDeposits + totalReserves;
    }

    // ============================================================ internals

    function _reduceLock(address user, uint256 amount) private {
        uint256 locked = lockedBy[user][msg.sender];
        if (amount > locked) revert InsufficientLocked(amount, locked);
        lockedBy[user][msg.sender] = locked - amount;
        totalLocked[user] -= amount;
    }

    function _reduceReserve(uint256 amount) private {
        uint256 reserve = moduleReserve[msg.sender];
        if (amount > reserve) revert InsufficientReserve(amount, reserve);
        moduleReserve[msg.sender] = reserve - amount;
        totalReserves -= amount;
    }
}
