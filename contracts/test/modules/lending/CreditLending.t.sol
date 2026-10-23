// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../../utils/BaseTest.sol";
import {LendingModule} from "../../../src/modules/lending/LendingModule.sol";
import {PerpsModule} from "../../../src/modules/perps/PerpsModule.sol";
import {ICreditRegistry} from "../../../src/interfaces/ICreditRegistry.sol";

/// @notice Undercollateralized lending driven by real on-chain credit history.
contract CreditLendingTest is BaseTest {
    LendingModule internal lending;

    function setUp() public override {
        super.setUp();
        lending = new LendingModule(vault, credit);
        _register(address(lending));
        _fundReserve(address(lending), 100_000e18);
        vm.prank(alice);
        usdc.approve(address(lending), type(uint256).max);
    }

    /// Builds a Prime borrower the honest way: deposit, then 3 loans of $1,000 fully repaid.
    /// Score = 30 (loans) + 30 ($3,000 repaid) + 30 (≥ $15,000 deposited) = 90 → Prime.
    function _makePrime() internal {
        _deposit(alice, 20_000e18);
        vm.startPrank(alice);
        lending.addCollateral(2_000e18);
        for (uint256 i; i < 3; i++) {
            lending.borrow(1_000e18);
            lending.repay(alice, type(uint256).max);
        }
        vm.stopPrank();
        assertEq(credit.termsOf(alice).tier, 3, "alice should be Prime");
    }

    function test_StandardUserCannotGoAbove75() public {
        _deposit(alice, 1_000e18);
        vm.prank(alice);
        lending.addCollateral(1_000e18);
        assertEq(lending.borrowLimit(alice), 750e18);
    }

    function test_PrimeBorrowsMoreThanCollateral() public {
        _makePrime();
        // collateral 2,000 → 120% = 2,400; unsecured 400 ≤ 25% × 3,000 repaid (750) ✓
        assertEq(lending.borrowLimit(alice), 2_400e18);
        vm.prank(alice);
        lending.borrow(2_400e18);
        assertEq(lending.debtOf(alice), 2_400e18);
        assertGt(lending.debtOf(alice), lending.collateralOf(alice), "undercollateralized");
        assertEq(lending.totalUnsecured(), 400e18);
        // health uses the Prime threshold (125%): 2,000 × 1.25 / 2,400 ≈ 1.0417
        assertApproxEqAbs(lending.healthFactor(alice), 1.041666666666666666e18, 1);
        assertTrue(vault.isSolvent());
    }

    function test_RevertWhen_PrimeBorrowsAboveLimit() public {
        _makePrime();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LendingModule.ExceedsBorrowLimit.selector, 2_400e18 + 1, 2_400e18));
        lending.borrow(2_400e18 + 1);
    }

    function test_AntiGamingCapLimitsUnsecuredPart() public {
        _makePrime();
        vm.prank(alice);
        lending.addCollateral(8_000e18); // collateral 10,000 → 120% would be 12,000
        // but unsecured ≤ 25% of $3,000 repaid (+ tiny interest) ≈ 750
        uint256 limit = lending.borrowLimit(alice);
        assertLt(limit, 10_751e18);
        assertGe(limit, 10_750e18);
    }

    function test_PoolWideUnsecuredCap() public {
        // A thin pool: 10% of a 5,000 reserve = 500 of unsecured lending in total.
        LendingModule thin = new LendingModule(vault, credit);
        _register(address(thin));
        _makePrime();
        _fundReserve(address(thin), 5_000e18);
        vm.startPrank(alice);
        lending.removeCollateral(2_000e18);
        thin.addCollateral(2_000e18);
        vm.stopPrank();
        // 120% → 400 unsecured, under both the 750 allowance and the 500 pool cap
        assertEq(thin.borrowLimit(alice), 2_400e18);
        vm.prank(alice);
        thin.borrow(1_000e18); // reserve drops to 4,000 → pool cap 400
        assertEq(thin.borrowLimit(alice), 2_400e18);
        vm.prank(alice);
        thin.borrow(1_000e18); // reserve 3,000 → pool cap 300
        assertEq(thin.borrowLimit(alice), 2_300e18, "pool cap now binds");
    }

    function test_ExistingLoanKeepsItsThreshold() public {
        _makePrime();
        vm.prank(alice);
        lending.borrow(2_400e18);
        // Alice withdraws her free deposit: portfolio points drop and she falls out of Prime…
        uint256 free = vault.freeCollateral(alice);
        vm.prank(alice);
        vault.withdraw(free);
        assertLt(credit.termsOf(alice).tier, 3);
        // …but the loan keeps the 125% threshold it was taken under: not liquidatable.
        assertGt(lending.healthFactor(alice), 1e18);
        vm.expectRevert(LendingModule.NotLiquidatable.selector);
        lending.liquidate(alice);
    }

    function test_UndercollateralizedLiquidationCreatesBadDebtAndDefault() public {
        _makePrime();
        vm.prank(alice);
        lending.borrow(2_400e18);
        // debt must exceed 2,000 × 125% = 2,500 → ~0.84 years at 5%
        vm.warp(block.timestamp + 365 days);
        assertLt(lending.healthFactor(alice), 1e18);

        uint256 debt = lending.debtOf(alice);
        uint256 depositsBefore = vault.deposits(alice);
        vm.prank(bob);
        lending.liquidate(alice);

        assertEq(lending.debtOf(alice), 0);
        assertEq(vault.lockedBy(alice, address(lending)), 0);
        assertEq(vault.deposits(alice), depositsBefore - 2_000e18, "all collateral seized");
        assertEq(lending.totalBadDebt(), debt - 2_000e18, "shortfall recorded as bad debt");
        assertEq(lending.totalUnsecured(), 0);
        assertTrue(vault.isSolvent(), "vault stays solvent; the pool absorbed the loss");

        ICreditRegistry.Terms memory t = credit.termsOf(alice);
        assertTrue(t.defaulted);
        assertEq(t.score, 0);
        assertEq(t.unsecuredAllowance, 0);
    }

    function test_DefaultedUserBackToStandardOnly() public {
        test_UndercollateralizedLiquidationCreatesBadDebtAndDefault();
        vm.prank(alice);
        lending.addCollateral(1_000e18);
        assertEq(lending.borrowLimit(alice), 750e18);
    }

    function test_RemoveCollateralRespectsCreditLimit() public {
        _makePrime();
        vm.prank(alice);
        lending.borrow(2_000e18); // debt 2,000 on 2,000 collateral
        uint256 removable = lending.maxRemovable(alice);
        // need collateral c with min(1.2c, c + 750) ≥ 2,000 → c ≥ 1,666.67
        assertApproxEqAbs(removable, 333.333333333333333333e18, 1e6);
        vm.startPrank(alice);
        vm.expectRevert(LendingModule.WouldBreakCollateralRequirement.selector);
        lending.removeCollateral(removable + 1e18);
        lending.removeCollateral(removable);
        vm.stopPrank();
    }

    function test_RepaymentsBuildHistory() public {
        _deposit(alice, 1_000e18);
        vm.startPrank(alice);
        lending.addCollateral(1_000e18);
        lending.borrow(500e18);
        lending.repay(alice, 200e18);
        assertEq(credit.recordOf(alice).loansRepaid, 0, "partial repayment is not a closed loan");
        lending.repay(alice, type(uint256).max);
        vm.stopPrank();
        ICreditRegistry.Record memory r = credit.recordOf(alice);
        assertEq(r.loansRepaid, 1);
        assertEq(r.repaidVolume, 500e18);
        assertGt(r.firstSeen, 0);
    }

    function test_PerpsLiquidationLowersScore() public {
        PerpsModule perps = new PerpsModule(admin, vault, oracle, credit);
        _register(address(perps));
        vm.prank(admin);
        perps.listMarket(ETH_USD, "ETH/USD");
        _fundReserve(address(perps), 10_000e18);
        _makePrime();
        (uint256 before,) = credit.scoreOf(alice);

        vm.prank(alice);
        uint256 id = perps.openPosition(ETH_USD, true, 2_000e18, 10);
        vm.prank(admin);
        oracle.setPrice(ETH_USD, 2_800e18);
        perps.liquidate(id);

        (uint256 afterScore, ICreditRegistry.Breakdown memory b) = credit.scoreOf(alice);
        assertEq(b.penaltyPoints, 10);
        assertEq(afterScore + 10, before - 0, "10 point penalty");
    }
}
