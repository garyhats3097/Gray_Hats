// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {CreditRegistry} from "../../src/core/CreditRegistry.sol";
import {ICreditRegistry} from "../../src/interfaces/ICreditRegistry.sol";
import {IModule} from "../../src/interfaces/IModule.sol";

/// @dev Registered module that reports to the registry directly, to test scoring in isolation.
contract CreditWriter is IModule {
    CreditRegistry internal credit;

    constructor(CreditRegistry c) {
        credit = c;
    }

    function moduleName() external pure returns (string memory) {
        return "CreditWriter";
    }

    function activity(address u) external { credit.recordActivity(u); }
    function repayment(address u, uint256 a, bool closed) external { credit.recordRepayment(u, a, closed); }
    function liquidation(address u, bool lendingDefault) external { credit.recordLiquidation(u, lendingDefault); }
}

contract CreditRegistryTest is BaseTest {
    CreditWriter internal w;

    function setUp() public override {
        super.setUp();
        w = new CreditWriter(credit);
        _register(address(w));
    }

    function _terms(address u) internal view returns (ICreditRegistry.Terms memory) {
        return credit.termsOf(u);
    }

    function test_NewUserIsStandard() public view {
        ICreditRegistry.Terms memory t = _terms(alice);
        assertEq(t.score, 0);
        assertEq(t.tier, 0);
        assertEq(t.maxLtvBps, 7_500);
        assertEq(t.liquidationThresholdBps, 8_500);
        assertEq(t.unsecuredAllowance, 0);
    }

    function test_PointsAndCaps() public {
        // 5 closed loans → capped at 30; $10,000 repaid → capped at 30
        for (uint256 i; i < 5; i++) w.repayment(alice, 2_000e18, true);
        // $25,000 deposited → capped at 30
        _deposit(alice, 25_000e18);
        // 20 hours of age → capped at 10
        w.activity(alice);
        vm.warp(block.timestamp + 20 hours);

        (uint256 score, ICreditRegistry.Breakdown memory b) = credit.scoreOf(alice);
        assertEq(b.loansPoints, 30);
        assertEq(b.volumePoints, 30);
        assertEq(b.portfolioPoints, 30);
        assertEq(b.agePoints, 10);
        assertEq(score, 100);
    }

    function test_PartialRepaymentDoesNotCountAsLoan() public {
        w.repayment(alice, 500e18, false);
        ICreditRegistry.Record memory r = credit.recordOf(alice);
        assertEq(r.loansRepaid, 0);
        assertEq(r.repaidVolume, 500e18);
    }

    function test_TierBoundaries() public {
        _deposit(alice, 15_000e18); // portfolio 30 (the cap)
        w.repayment(alice, 900e18, false); // volume 9 → 39
        assertEq(_terms(alice).score, 39);
        assertEq(_terms(alice).tier, 0);
        w.repayment(alice, 100e18, false); // volume 10 → 40 → Trusted 90%
        assertEq(_terms(alice).tier, 1);
        assertEq(_terms(alice).maxLtvBps, 9_000);

        w.repayment(alice, 2_000e18, true); // volume 30, loans 10 → 30 + 30 + 10 = 70
        assertEq(_terms(alice).score, 70);
        assertEq(_terms(alice).tier, 2); // Established 100%

        w.repayment(alice, 1, true); // second loan → 80
        assertEq(_terms(alice).tier, 2);
        w.repayment(alice, 1, true); // third loan → 90
        assertEq(_terms(alice).tier, 3); // Prime 120%
        assertEq(_terms(alice).maxLtvBps, 12_000);
        assertEq(_terms(alice).liquidationThresholdBps, 12_500);
        assertEq(_terms(alice).unsecuredAllowance, uint256(3_000e18 + 2) * 2_500 / 10_000, "25% of repaid");
    }

    function test_UnsecuredAllowanceOnlyForPrime() public {
        w.repayment(alice, 3_000e18, true); // 10 + 30 = 40 → Trusted
        assertEq(_terms(alice).tier, 1);
        assertEq(_terms(alice).unsecuredAllowance, 0);
    }

    function test_PerpsLiquidationPenalty() public {
        _deposit(alice, 20_000e18); // 30
        w.liquidation(alice, false);
        (uint256 score, ICreditRegistry.Breakdown memory b) = credit.scoreOf(alice);
        assertEq(b.penaltyPoints, 10);
        assertEq(score, 20);
        for (uint256 i; i < 5; i++) w.liquidation(alice, false);
        (score,) = credit.scoreOf(alice);
        assertEq(score, 0, "never below zero");
    }

    function test_LendingDefaultZeroesScoreForever() public {
        for (uint256 i; i < 3; i++) w.repayment(alice, 2_000e18, true);
        _deposit(alice, 20_000e18);
        assertEq(_terms(alice).tier, 3);

        w.liquidation(alice, true);
        ICreditRegistry.Terms memory t = _terms(alice);
        assertEq(t.score, 0);
        assertTrue(t.defaulted);
        assertEq(t.tier, 0);
        assertEq(t.unsecuredAllowance, 0);

        w.repayment(alice, 50_000e18, true); // good behaviour afterwards doesn't undo a default
        assertEq(_terms(alice).score, 0);
    }

    function test_AgeCountsFromFirstActivity() public {
        w.activity(alice);
        vm.warp(block.timestamp + 3 hours + 59 minutes);
        (, ICreditRegistry.Breakdown memory b) = credit.scoreOf(alice);
        assertEq(b.agePoints, 3);
        w.activity(alice); // second activity does not reset the start
        vm.warp(block.timestamp + 1 minutes);
        (, b) = credit.scoreOf(alice);
        assertEq(b.agePoints, 4);
    }

    function test_RevertWhen_NonModuleWrites() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CreditRegistry.NotModule.selector, bob));
        credit.recordRepayment(bob, 1_000_000e18, true);
        vm.expectRevert(abi.encodeWithSelector(CreditRegistry.NotModule.selector, address(this)));
        credit.recordLiquidation(alice, true);
    }
}
