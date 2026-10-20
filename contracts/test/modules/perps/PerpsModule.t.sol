// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "../../utils/BaseTest.sol";
import {PerpsModule} from "../../../src/modules/perps/PerpsModule.sol";
import {CoreVault} from "../../../src/core/CoreVault.sol";
import {MockOracle} from "../../../src/mocks/MockOracle.sol";

contract PerpsModuleTest is BaseTest {
    PerpsModule internal perps;

    function setUp() public override {
        super.setUp();
        perps = new PerpsModule(admin, vault, oracle);
        _register(address(perps));
        vm.prank(admin);
        perps.listMarket(ETH_USD, "ETH/USD");
        _fundReserve(address(perps), 100_000e18);
        _deposit(alice, 1_000e18);
    }

    function _setPrice(uint256 p) internal {
        vm.prank(admin);
        oracle.setPrice(ETH_USD, p);
    }

    function _open(bool isLong, uint256 size, uint256 lev) internal returns (uint256 id) {
        vm.prank(alice);
        id = perps.openPosition(ETH_USD, isLong, size, lev);
    }

    // ------------------------------------------------------------------ open

    function test_OpenLocksMarginAndChargesFee() public {
        // $2,000 at 10x → $200 margin, $2 fee
        uint256 id = _open(true, 2_000e18, 10);
        PerpsModule.Position memory p = perps.getPosition(id);

        assertEq(p.margin, 200e18);
        assertEq(p.entryPrice, 3000e18);
        assertEq(vault.lockedBy(alice, address(perps)), 200e18);
        assertEq(vault.deposits(alice), 998e18, "fee left the user's deposit");
        assertEq(vault.freeCollateral(alice), 798e18);
        assertEq(vault.moduleReserve(address(perps)), 100_002e18, "fee went to pool");
    }

    function test_RevertWhen_LeverageAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PerpsModule.InvalidLeverage.selector, 11));
        perps.openPosition(ETH_USD, true, 2_000e18, 11);
    }

    function test_RevertWhen_InsufficientFreeCollateral() public {
        // $20,000 at 10x needs $2,000 margin + $20 fee; Alice has $1,000
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.InsufficientFreeCollateral.selector, 2_020e18, 1_000e18));
        perps.openPosition(ETH_USD, true, 20_000e18, 10);
    }

    function test_RevertWhen_MarketNotListed() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PerpsModule.MarketNotListed.selector, keccak256("BTC/USD")));
        perps.openPosition(keccak256("BTC/USD"), true, 2_000e18, 10);
    }

    function test_RevertWhen_OraclePriceMissing() public {
        bytes32 btc = keccak256("BTC/USD");
        vm.prank(admin);
        perps.listMarket(btc, "BTC/USD");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockOracle.PriceUnavailable.selector, btc));
        perps.openPosition(btc, true, 2_000e18, 10);
    }

    function test_RevertWhen_OraclePriceStale() public {
        vm.prank(admin);
        oracle.setMaxAge(1 hours);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(alice);
        vm.expectRevert();
        perps.openPosition(ETH_USD, true, 2_000e18, 10);
    }

    // ----------------------------------------------------------------- close

    function test_CloseLongInProfit() public {
        uint256 id = _open(true, 2_000e18, 10);
        _setPrice(3300e18); // +10% → PnL +$200
        assertEq(perps.unrealizedPnl(id), 200e18);

        vm.prank(alice);
        perps.closePosition(id);

        // 998 after open fee, +200 PnL, -2 close fee
        assertEq(vault.deposits(alice), 1_196e18);
        assertEq(vault.lockedBy(alice, address(perps)), 0);
        assertEq(vault.freeCollateral(alice), 1_196e18);
        assertTrue(vault.isSolvent());
    }

    function test_CloseShortInProfit() public {
        uint256 id = _open(false, 2_000e18, 10);
        _setPrice(2700e18); // -10% → short PnL +$200
        vm.prank(alice);
        perps.closePosition(id);
        assertEq(vault.deposits(alice), 1_196e18);
    }

    function test_CloseLongAtLoss() public {
        uint256 id = _open(true, 2_000e18, 10);
        _setPrice(2850e18); // -5% → PnL -$100
        vm.prank(alice);
        perps.closePosition(id);

        // 998 - 100 - 2
        assertEq(vault.deposits(alice), 896e18);
        assertEq(vault.totalLocked(alice), 0);
        assertEq(vault.moduleReserve(address(perps)), 100_000e18 + 2e18 + 100e18 + 2e18);
    }

    function test_RevertWhen_ClosingSomeoneElsesPosition() public {
        uint256 id = _open(true, 2_000e18, 10);
        vm.prank(bob);
        vm.expectRevert(PerpsModule.NotPositionOwner.selector);
        perps.closePosition(id);
    }

    function test_RevertWhen_ClosingTwice() public {
        uint256 id = _open(true, 2_000e18, 10);
        vm.startPrank(alice);
        perps.closePosition(id);
        vm.expectRevert(PerpsModule.PositionNotOpen.selector);
        perps.closePosition(id);
        vm.stopPrank();
    }

    function test_ProfitCappedWhenPoolEmpty() public {
        // fresh setup with an almost empty pool
        PerpsModule thin = new PerpsModule(admin, vault, oracle);
        _register(address(thin));
        vm.prank(admin);
        thin.listMarket(ETH_USD, "ETH/USD");

        vm.prank(alice);
        uint256 id = thin.openPosition(ETH_USD, true, 2_000e18, 10); // pool = 2 (fee)
        _setPrice(3300e18);
        vm.prank(alice);
        thin.closePosition(id);

        // owed 198, pool only had 2
        assertEq(vault.deposits(alice), 998e18 + 2e18);
        assertEq(vault.moduleReserve(address(thin)), 0);
        assertTrue(vault.isSolvent());
    }

    // ----------------------------------------------------------- liquidation

    function test_LiquidationPrice() public {
        uint256 longId = _open(true, 2_000e18, 10);
        uint256 shortId = _open(false, 2_000e18, 10);
        // margin 200, maint 100 → price may move 5% before liquidation
        assertEq(perps.liquidationPrice(longId), 2850e18);
        assertEq(perps.liquidationPrice(shortId), 3150e18);
    }

    function test_Liquidate() public {
        uint256 id = _open(true, 2_000e18, 10);
        _setPrice(2900e18);
        assertFalse(perps.isLiquidatable(id));
        vm.expectRevert(PerpsModule.NotLiquidatable.selector);
        perps.liquidate(id);

        _setPrice(2850e18);
        assertTrue(perps.isLiquidatable(id));
        vm.prank(bob); // anyone can liquidate
        perps.liquidate(id);

        assertEq(vault.deposits(alice), 798e18, "lost the 200 margin");
        assertEq(vault.totalLocked(alice), 0);
        assertEq(vault.freeCollateral(alice), 798e18);
    }

    function test_BadDebtLimitedToMargin() public {
        uint256 id = _open(true, 2_000e18, 10);
        _setPrice(1500e18); // -50% → PnL -$1,000, far beyond the $200 margin
        vm.prank(alice);
        perps.closePosition(id);
        // user only loses the margin of that position
        assertEq(vault.deposits(alice), 798e18);
        assertTrue(vault.isSolvent());
    }

    function test_DisabledModuleCannotOpenButCanClose() public {
        uint256 id = _open(true, 2_000e18, 10);
        vm.prank(admin);
        registry.setModuleActive(address(perps), false);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CoreVault.ModuleNotActive.selector, address(perps)));
        perps.openPosition(ETH_USD, true, 1_000e18, 5);

        vm.prank(alice);
        perps.closePosition(id);
        assertEq(vault.totalLocked(alice), 0);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_OpenCloseKeepsVaultSolvent(uint256 size, uint256 lev, uint256 exitPrice, bool isLong) public {
        lev = bound(lev, 1, 10);
        size = bound(size, 10e18, 900e18 * lev / 1); // margin+fee must fit in 1,000
        exitPrice = bound(exitPrice, 1e18, 10_000e18);
        (uint256 m, uint256 f) = perps.quoteOpen(size, lev);
        vm.assume(m + f <= 1_000e18);

        uint256 id = _open(isLong, size, lev);
        _setPrice(exitPrice);
        vm.prank(alice);
        perps.closePosition(id);

        assertEq(vault.totalLocked(alice), 0);
        assertTrue(vault.isSolvent());
        // the user can never lose more than margin + both fees
        assertGe(vault.deposits(alice) + m + 2 * f, 1_000e18 - 1);
    }
}
