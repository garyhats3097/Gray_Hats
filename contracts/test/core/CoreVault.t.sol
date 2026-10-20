// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../utils/BaseTest.sol";
import {TestModule} from "../utils/TestModule.sol";
import {CoreVault} from "../../src/core/CoreVault.sol";
import {ModuleRegistry} from "../../src/core/ModuleRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract CoreVaultTest is BaseTest {
    TestModule internal modA;
    TestModule internal modB;

    function setUp() public override {
        super.setUp();
        modA = new TestModule(vault);
        modB = new TestModule(vault);
        _register(address(modA));
        _register(address(modB));
    }

    // ------------------------------------------------------- deposit / withdraw

    function test_Deposit() public {
        _deposit(alice, 1_000e18);
        assertEq(vault.deposits(alice), 1_000e18);
        assertEq(vault.freeCollateral(alice), 1_000e18);
        assertEq(vault.totalDeposits(), 1_000e18);
        assertEq(usdc.balanceOf(address(vault)), 1_000e18);
    }

    function test_RevertWhen_DepositZero() public {
        vm.prank(alice);
        vm.expectRevert(CoreVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_Withdraw() public {
        _deposit(alice, 1_000e18);
        vm.prank(alice);
        vault.withdraw(400e18);
        assertEq(vault.deposits(alice), 600e18);
        assertEq(usdc.balanceOf(alice), 100_000e18 - 600e18);
    }

    function test_RevertWhen_WithdrawMoreThanDeposited() public {
        _deposit(alice, 1_000e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientFreeCollateral.selector, 1_001e18, 1_000e18));
        vault.withdraw(1_001e18);
    }

    function test_RevertWhen_WithdrawLockedCollateral() public {
        _deposit(alice, 1_000e18);
        modA.lock(alice, 200e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientFreeCollateral.selector, 801e18, 800e18));
        vault.withdraw(801e18);
        // exactly the free amount works
        vm.prank(alice);
        vault.withdraw(800e18);
        assertEq(vault.deposits(alice), 200e18);
    }

    // --------------------------------------------------------------- locking

    function test_LockAcrossTwoModulesNeverOverlaps() public {
        _deposit(alice, 1_000e18);
        modA.lock(alice, 200e18); // e.g. perps margin
        modB.lock(alice, 300e18); // e.g. lending collateral
        assertEq(vault.freeCollateral(alice), 500e18);
        assertEq(vault.totalLocked(alice), 500e18);

        // B cannot lock more than what is still free
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientFreeCollateral.selector, 501e18, 500e18));
        modB.lock(alice, 501e18);
    }

    function test_RevertWhen_ModuleUnlocksAnotherModulesLock() public {
        _deposit(alice, 1_000e18);
        modA.lock(alice, 200e18);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientLocked.selector, 1, 0));
        modB.unlock(alice, 1);
    }

    function test_Unlock() public {
        _deposit(alice, 1_000e18);
        modA.lock(alice, 200e18);
        modA.unlock(alice, 150e18);
        assertEq(vault.lockedBy(alice, address(modA)), 50e18);
        assertEq(vault.freeCollateral(alice), 950e18);
    }

    // ------------------------------------------------------------ settlement

    function test_LossOnlyComesFromThatModulesLock() public {
        _deposit(alice, 1_000e18);
        modA.lock(alice, 200e18);
        modB.lock(alice, 300e18);

        modA.realizeLoss(alice, 50e18);

        assertEq(vault.deposits(alice), 950e18);
        assertEq(vault.lockedBy(alice, address(modA)), 150e18);
        assertEq(vault.lockedBy(alice, address(modB)), 300e18, "B's lock untouched");
        assertEq(vault.moduleReserve(address(modA)), 50e18);

        // A cannot take more than its own lock, even though Alice has more deposits
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientLocked.selector, 151e18, 150e18));
        modA.realizeLoss(alice, 151e18);
    }

    function test_ProfitPaidFromReserve() public {
        _fundReserve(address(modA), 500e18);
        _deposit(alice, 1_000e18);
        modA.realizeProfit(alice, 120e18);
        assertEq(vault.deposits(alice), 1_120e18);
        assertEq(vault.moduleReserve(address(modA)), 380e18);
        assertTrue(vault.isSolvent());
    }

    function test_RevertWhen_ProfitExceedsReserve() public {
        _fundReserve(address(modA), 100e18);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientReserve.selector, 101e18, 100e18));
        modA.realizeProfit(alice, 101e18);
    }

    function test_RevertWhen_ModuleSpendsAnotherModulesReserve() public {
        _fundReserve(address(modA), 100e18);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientReserve.selector, 1, 0));
        modB.payFromReserve(bob, 1);
    }

    function test_PayFromReserveAndCredit() public {
        _fundReserve(address(modA), 1_000e18);
        modA.payFromReserve(bob, 300e18); // loan payout
        assertEq(usdc.balanceOf(bob), 100_300e18);
        assertEq(vault.moduleReserve(address(modA)), 700e18);

        // repayment: tokens arrive first, then the module credits them
        vm.prank(bob);
        usdc.transfer(address(vault), 300e18);
        modA.creditReserve(300e18);
        assertEq(vault.moduleReserve(address(modA)), 1_000e18);
        assertTrue(vault.isSolvent());
    }

    function test_RevertWhen_CreditWithoutTokens() public {
        _deposit(alice, 1_000e18);
        // the 1,000 belongs to Alice; a module cannot claim it as reserve
        vm.expectRevert(CoreVault.UnbackedCredit.selector);
        modA.creditReserve(1);
    }

    // --------------------------------------------------------- authorization

    function test_RevertWhen_UnregisteredCallerUsesModuleFunctions() public {
        _deposit(alice, 1_000e18);
        TestModule rogue = new TestModule(vault);

        vm.expectRevert(abi.encodeWithSelector(CoreVault.ModuleNotActive.selector, address(rogue)));
        rogue.lock(alice, 1);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.ModuleNotRegistered.selector, address(rogue)));
        rogue.realizeLoss(alice, 1);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.ModuleNotRegistered.selector, address(rogue)));
        rogue.unlock(alice, 1);

        // an EOA calling the vault directly is also rejected
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.ModuleNotActive.selector, bob));
        vault.lock(alice, 1);
    }

    function test_DisabledModuleCanWindDownButNotLock() public {
        _deposit(alice, 1_000e18);
        modA.lock(alice, 200e18);

        vm.prank(admin);
        registry.setModuleActive(address(modA), false);

        vm.expectRevert(abi.encodeWithSelector(CoreVault.ModuleNotActive.selector, address(modA)));
        modA.lock(alice, 1);

        modA.unlock(alice, 200e18); // users are never trapped
        assertEq(vault.freeCollateral(alice), 1_000e18);
    }

    function test_RevertWhen_NonOwnerRegistersModule() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        registry.registerModule(address(0xBEEF));
    }

    function test_RevertWhen_RegisteringTwice() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ModuleRegistry.AlreadyRegistered.selector, address(modA)));
        registry.registerModule(address(modA));
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_LockNeverExceedsDeposit(uint256 dep, uint256 a, uint256 b) public {
        dep = bound(dep, 1, 100_000e18);
        _deposit(alice, dep);
        a = bound(a, 1, dep);
        modA.lock(alice, a);
        b = bound(b, 1, type(uint128).max);
        if (b > dep - a) {
            vm.expectRevert();
            modB.lock(alice, b);
        } else {
            modB.lock(alice, b);
        }
        assertLe(vault.totalLocked(alice), vault.deposits(alice));
    }
}
