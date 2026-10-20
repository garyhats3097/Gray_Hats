// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../../utils/BaseTest.sol";
import {LendingModule} from "../../../src/modules/lending/LendingModule.sol";
import {CoreVault} from "../../../src/core/CoreVault.sol";

contract LendingModuleTest is BaseTest {
    LendingModule internal lending;

    function setUp() public override {
        super.setUp();
        lending = new LendingModule(vault);
        _register(address(lending));
        _fundReserve(address(lending), 100_000e18);
        _deposit(alice, 1_000e18);
        vm.prank(alice);
        usdc.approve(address(lending), type(uint256).max);
    }

    function _addCollateral(uint256 a) internal {
        vm.prank(alice);
        lending.addCollateral(a);
    }

    function _borrow(uint256 a) internal {
        vm.prank(alice);
        lending.borrow(a);
    }

    // ------------------------------------------------------------ collateral

    function test_AddCollateralLocksInVault() public {
        _addCollateral(400e18);
        assertEq(lending.collateralOf(alice), 400e18);
        assertEq(vault.lockedBy(alice, address(lending)), 400e18);
        assertEq(vault.freeCollateral(alice), 600e18);
    }

    function test_RevertWhen_AddingMoreThanFree() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientFreeCollateral.selector, 1_001e18, 1_000e18));
        lending.addCollateral(1_001e18);
    }

    // ------------------------------------------------------------- borrowing

    function test_BorrowUpToLtv() public {
        _addCollateral(400e18);
        assertEq(lending.borrowCapacity(alice), 300e18);
        uint256 walletBefore = usdc.balanceOf(alice);

        _borrow(300e18);

        assertEq(lending.debtOf(alice), 300e18);
        assertEq(usdc.balanceOf(alice), walletBefore + 300e18, "loan paid to wallet");
        assertEq(lending.availableLiquidity(), 99_700e18);
        assertEq(lending.borrowCapacity(alice), 0);
        assertTrue(vault.isSolvent());
    }

    function test_RevertWhen_BorrowAboveLtv() public {
        _addCollateral(400e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LendingModule.ExceedsBorrowLimit.selector, 301e18, 300e18));
        lending.borrow(301e18);
    }

    function test_RevertWhen_BorrowWithoutCollateral() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LendingModule.ExceedsBorrowLimit.selector, 1e18, 0));
        lending.borrow(1e18);
    }

    function test_RevertWhen_PoolHasNoLiquidity() public {
        LendingModule dry = new LendingModule(vault);
        _register(address(dry));
        vm.startPrank(alice);
        dry.addCollateral(400e18);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientReserve.selector, 100e18, 0));
        dry.borrow(100e18);
        vm.stopPrank();
    }

    function test_CannotWithdrawCollateralBackingALoan() public {
        _addCollateral(400e18);
        _borrow(300e18);

        // vault withdrawal of the locked part fails
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientFreeCollateral.selector, 601e18, 600e18));
        vault.withdraw(601e18);

        // removing collateral that backs the loan fails
        vm.prank(alice);
        vm.expectRevert(LendingModule.WouldBreakCollateralRequirement.selector);
        lending.removeCollateral(1e18);
    }

    // ------------------------------------------------------------- repayment

    function test_RepayPartialThenFullThenRemoveCollateral() public {
        _addCollateral(400e18);
        _borrow(300e18);

        vm.prank(alice);
        lending.repay(alice, 100e18);
        assertEq(lending.debtOf(alice), 200e18);

        // can now free some collateral: 200 debt needs ≥ 266.67 collateral
        vm.prank(alice);
        lending.removeCollateral(130e18);
        assertEq(lending.collateralOf(alice), 270e18);

        vm.prank(alice);
        lending.repay(alice, type(uint256).max);
        assertEq(lending.debtOf(alice), 0);

        vm.prank(alice);
        lending.removeCollateral(270e18);
        assertEq(vault.totalLocked(alice), 0);
        assertEq(lending.availableLiquidity(), 100_000e18);
        assertTrue(vault.isSolvent());
    }

    function test_InterestAccrues() public {
        _addCollateral(400e18);
        _borrow(200e18);
        vm.warp(block.timestamp + 365 days);
        // 5% simple interest
        assertApproxEqAbs(lending.debtOf(alice), 210e18, 1);

        vm.prank(alice);
        lending.repay(alice, type(uint256).max);
        assertEq(lending.debtOf(alice), 0);
        // interest went into the pool
        assertApproxEqAbs(lending.availableLiquidity(), 100_010e18, 1);
    }

    function test_RevertWhen_RepayWithNoDebt() public {
        vm.prank(alice);
        vm.expectRevert(LendingModule.NoDebt.selector);
        lending.repay(alice, 1e18);
    }

    // ----------------------------------------------------------- liquidation

    function test_HealthFactor() public {
        assertEq(lending.healthFactor(alice), type(uint256).max);
        _addCollateral(400e18);
        _borrow(300e18);
        // 400 * 0.85 / 300 = 1.1333
        assertApproxEqAbs(lending.healthFactor(alice), 1.133333333333333333e18, 1);
    }

    function test_Liquidate() public {
        _addCollateral(400e18);
        _borrow(300e18);

        vm.expectRevert(LendingModule.NotLiquidatable.selector);
        lending.liquidate(alice);

        // debt must grow to > 340 for HF < 1: ~2.7 years at 5%
        vm.warp(block.timestamp + 3 * 365 days);
        assertLt(lending.healthFactor(alice), 1e18);

        uint256 debt = lending.debtOf(alice); // 345
        vm.prank(bob);
        lending.liquidate(alice);

        uint256 seized = debt + debt * 500 / 10_000;
        assertEq(lending.debtOf(alice), 0);
        assertEq(vault.totalLocked(alice), 0);
        assertEq(vault.deposits(alice), 1_000e18 - seized);
        assertTrue(vault.isSolvent());
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_BorrowRepayKeepsSolvent(uint256 col, uint256 amt, uint256 dt) public {
        col = bound(col, 1e18, 1_000e18);
        _addCollateral(col);
        amt = bound(amt, 1, col * 7_500 / 10_000);
        _borrow(amt);
        vm.warp(block.timestamp + bound(dt, 0, 2 * 365 days));

        usdc.mint(alice, 1_000e18); // cover interest
        vm.prank(alice);
        lending.repay(alice, type(uint256).max);
        assertEq(lending.debtOf(alice), 0);

        vm.prank(alice);
        lending.removeCollateral(col);
        assertEq(vault.totalLocked(alice), 0);
        assertGe(lending.availableLiquidity(), 100_000e18);
        assertTrue(vault.isSolvent());
    }
}
