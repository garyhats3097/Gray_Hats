// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "../utils/BaseTest.sol";
import {TestModule} from "../utils/TestModule.sol";
import {CoreVault} from "../../src/core/CoreVault.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/// @dev The fuzzer calls these functions in random order with random inputs.
///      Inputs are bounded to sensible ranges; reverts are allowed (fail_on_revert = false).
contract VaultHandler is Test {
    CoreVault internal vault;
    MockERC20 internal usdc;
    TestModule[2] internal mods;
    address[3] internal users;

    constructor(CoreVault vault_, MockERC20 usdc_, TestModule a, TestModule b) {
        vault = vault_;
        usdc = usdc_;
        mods = [a, b];
        users = [makeAddr("u0"), makeAddr("u1"), makeAddr("u2")];
        for (uint256 i; i < 3; i++) {
            vm.prank(users[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
    }

    function getUsers() external view returns (address[3] memory) {
        return users;
    }

    function deposit(uint256 u, uint256 amt) external {
        address user = users[u % 3];
        amt = bound(amt, 1, 1_000_000e18);
        usdc.mint(user, amt);
        vm.prank(user);
        vault.deposit(amt);
    }

    function withdraw(uint256 u, uint256 amt) external {
        address user = users[u % 3];
        amt = bound(amt, 1, vault.deposits(user) + 1);
        vm.prank(user);
        vault.withdraw(amt);
    }

    function lock(uint256 m, uint256 u, uint256 amt) external {
        mods[m % 2].lock(users[u % 3], bound(amt, 1, 1_000_000e18));
    }

    function unlock(uint256 m, uint256 u, uint256 amt) external {
        mods[m % 2].unlock(users[u % 3], bound(amt, 1, 1_000_000e18));
    }

    function realizeLoss(uint256 m, uint256 u, uint256 amt) external {
        mods[m % 2].realizeLoss(users[u % 3], bound(amt, 1, 1_000_000e18));
    }

    function realizeProfit(uint256 m, uint256 u, uint256 amt) external {
        mods[m % 2].realizeProfit(users[u % 3], bound(amt, 1, 1_000_000e18));
    }

    function fundReserve(uint256 m, uint256 amt) external {
        amt = bound(amt, 1, 1_000_000e18);
        usdc.mint(address(this), amt);
        usdc.approve(address(vault), amt);
        vault.fundReserve(address(mods[m % 2]), amt);
    }

    function payFromReserve(uint256 m, uint256 amt) external {
        mods[m % 2].payFromReserve(address(0xdead), bound(amt, 1, 1_000_000e18));
    }

    function creditReserve(uint256 m, uint256 amt) external {
        amt = bound(amt, 1, 1_000_000e18);
        usdc.mint(address(vault), amt); // tokens arrive, e.g. a loan repayment
        mods[m % 2].creditReserve(amt);
    }
}

contract CoreVaultInvariantTest is BaseTest {
    VaultHandler internal handler;
    TestModule internal modA;
    TestModule internal modB;

    function setUp() public override {
        super.setUp();
        modA = new TestModule(vault);
        modB = new TestModule(vault);
        _register(address(modA));
        _register(address(modB));
        handler = new VaultHandler(vault, usdc, modA, modB);
        targetContract(address(handler));
    }

    /// I1: every claim is backed by real tokens.
    function invariant_Solvent() public view {
        assertGe(usdc.balanceOf(address(vault)), vault.totalDeposits() + vault.totalReserves());
    }

    /// I2 + bookkeeping: per-user locks never exceed deposits, and totals reconcile.
    function invariant_LocksWithinDepositsAndTotalsReconcile() public view {
        address[3] memory users = handler.getUsers();
        uint256 sumDeposits;
        for (uint256 i; i < 3; i++) {
            address u = users[i];
            assertLe(vault.totalLocked(u), vault.deposits(u));
            assertEq(vault.totalLocked(u), vault.lockedBy(u, address(modA)) + vault.lockedBy(u, address(modB)));
            sumDeposits += vault.deposits(u);
        }
        assertEq(sumDeposits, vault.totalDeposits());
        assertEq(vault.moduleReserve(address(modA)) + vault.moduleReserve(address(modB)), vault.totalReserves());
    }
}
