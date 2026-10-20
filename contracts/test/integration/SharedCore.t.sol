// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {PerpsModule} from "../../src/modules/perps/PerpsModule.sol";
import {LendingModule} from "../../src/modules/lending/LendingModule.sol";
import {CoreVault} from "../../src/core/CoreVault.sol";

/// @notice End-to-end: both modules on the same CoreVault.
contract SharedCoreTest is BaseTest {
    PerpsModule internal perps;
    LendingModule internal lending;

    function setUp() public override {
        super.setUp();
        perps = new PerpsModule(admin, vault, oracle);
        lending = new LendingModule(vault);
        _register(address(perps));
        _register(address(lending));
        vm.prank(admin);
        perps.listMarket(ETH_USD, "ETH/USD");
        _fundReserve(address(perps), 50_000e18);
        _fundReserve(address(lending), 50_000e18);

        _deposit(alice, 1_000e18);
        vm.prank(alice);
        usdc.approve(address(lending), type(uint256).max);
    }

    /// The worked example from the plan: 1,000 deposit, 200 perps margin, 300 lending collateral.
    function test_ModulesShareOneLedgerWithoutOverlap() public {
        vm.startPrank(alice);
        uint256 id = perps.openPosition(ETH_USD, true, 2_000e18, 10); // 200 margin + 2 fee
        lending.addCollateral(300e18);
        lending.borrow(225e18);
        vm.stopPrank();

        assertEq(vault.lockedBy(alice, address(perps)), 200e18);
        assertEq(vault.lockedBy(alice, address(lending)), 300e18);
        assertEq(vault.freeCollateral(alice), 498e18);

        // Cannot over-commit: neither module can take collateral the other holds
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientFreeCollateral.selector, 499e18, 498e18));
        lending.addCollateral(499e18);

        // Perp goes to liquidation; lending collateral must be untouched
        vm.prank(admin);
        oracle.setPrice(ETH_USD, 2_000e18);
        perps.liquidate(id);

        assertEq(vault.lockedBy(alice, address(perps)), 0);
        assertEq(vault.lockedBy(alice, address(lending)), 300e18, "lending collateral untouched");
        assertEq(lending.debtOf(alice), 225e18);
        assertEq(vault.deposits(alice), 798e18);
        assertEq(vault.freeCollateral(alice), 498e18);
        assertTrue(vault.isSolvent());
    }

    /// Phase 6 journey: deposit → trade → close → borrow → repay → withdraw everything.
    function test_FullJourney() public {
        vm.startPrank(alice);
        uint256 id = perps.openPosition(ETH_USD, false, 1_000e18, 5); // 200 margin + 1 fee
        vm.stopPrank();

        vm.prank(admin);
        oracle.setPrice(ETH_USD, 2_850e18); // -5% → short +50

        vm.startPrank(alice);
        perps.closePosition(id); // +50 - 1 fee
        assertEq(vault.deposits(alice), 1_048e18);
        assertEq(vault.totalLocked(alice), 0);

        lending.addCollateral(500e18);
        lending.borrow(300e18);
        lending.repay(alice, type(uint256).max);
        lending.removeCollateral(500e18);

        vault.withdraw(vault.freeCollateral(alice));
        vm.stopPrank();

        assertEq(vault.deposits(alice), 0);
        assertEq(usdc.balanceOf(alice), 100_048e18);
        assertTrue(vault.isSolvent());
    }
}
