// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BaseTest} from "../../utils/BaseTest.sol";
import {MarketMakerModule} from "../../../src/modules/marketmaker/MarketMakerModule.sol";
import {IQuoter} from "../../../src/interfaces/IQuoter.sol";
import {MockOracle} from "../../../src/mocks/MockOracle.sol";

contract MarketMakerModuleTest is BaseTest {
    MarketMakerModule internal mm;
    address internal operator = makeAddr("operator");

    function setUp() public override {
        super.setUp();
        mm = new MarketMakerModule(admin, vault, oracle);
        _register(address(mm));
        vm.startPrank(admin);
        mm.listMarket(ETH_USD, "ETH/USD", 30, 10_000e18); // 0.30% spread, $10k indicative size
        mm.setOperator(operator, true);
        vm.stopPrank();
    }

    // --------------------------------------------------------------- quotes

    function test_QuoteAroundOraclePrice() public view {
        IQuoter.Quote memory q = mm.getQuote(ETH_USD);
        assertEq(q.mid, 3000e18);
        assertEq(q.bid, 2995.5e18); // 3000 × (1 − 0.15%)
        assertEq(q.ask, 3004.5e18); // 3000 × (1 + 0.15%)
        assertEq(q.spreadBps, 30);
    }

    function test_QuoteFollowsOracle() public {
        vm.prank(admin);
        oracle.setPrice(ETH_USD, 2398.42e18);
        IQuoter.Quote memory q = mm.getQuote(ETH_USD);
        assertEq(q.mid, 2398.42e18);
        assertLt(q.bid, q.mid);
        assertGt(q.ask, q.mid);
    }

    function test_RoundingNeverNarrowsTheSpread() public {
        // odd spread and an awkward price: bid rounds down, ask rounds up
        vm.prank(operator);
        mm.setSpread(ETH_USD, 7);
        vm.prank(admin);
        oracle.setPrice(ETH_USD, 1_234_567_890_123_456_789);
        IQuoter.Quote memory q = mm.getQuote(ETH_USD);
        assertLe(q.bid, q.mid);
        assertGe(q.ask, q.mid);
        assertGe((q.ask - q.bid) * 10_000, q.mid * 7 - 10_000, "spread at least as wide as configured");
    }

    function testFuzz_BidBelowMidBelowAsk(uint256 price, uint256 spread) public {
        price = bound(price, 1, 1e30);
        spread = bound(spread, mm.MIN_SPREAD_BPS(), mm.MAX_SPREAD_BPS());
        vm.prank(admin);
        oracle.setPrice(ETH_USD, price);
        vm.prank(operator);
        mm.setSpread(ETH_USD, spread);
        IQuoter.Quote memory q = mm.getQuote(ETH_USD);
        assertLe(q.bid, q.mid);
        assertGe(q.ask, q.mid);
    }

    // --------------------------------------------------------------- oracle

    function test_RevertWhen_OraclePriceMissing() public {
        bytes32 btc = keccak256("BTC/USD");
        vm.prank(admin);
        mm.listMarket(btc, "BTC/USD", 30, 1e18);
        vm.expectRevert(abi.encodeWithSelector(MockOracle.PriceUnavailable.selector, btc));
        mm.getQuote(btc);
        (uint8 status,) = mm.quoteStatus(btc);
        assertEq(status, mm.STATUS_ORACLE_UNAVAILABLE());
    }

    function test_StopsQuotingWhenOracleStale() public {
        vm.prank(admin);
        oracle.setMaxAge(1 hours);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert();
        mm.getQuote(ETH_USD);
        (uint8 status, IQuoter.Quote memory q) = mm.quoteStatus(ETH_USD);
        assertEq(status, mm.STATUS_ORACLE_UNAVAILABLE());
        assertEq(q.bid, 0);
    }

    function test_RevertWhen_MarketNotListed() public {
        bytes32 sol = keccak256("SOL/USD");
        vm.expectRevert(abi.encodeWithSelector(MarketMakerModule.MarketNotListed.selector, sol));
        mm.getQuote(sol);
        (uint8 status,) = mm.quoteStatus(sol);
        assertEq(status, mm.STATUS_MARKET_NOT_LISTED());
    }

    // --------------------------------------------------------------- spread

    function test_OperatorSetsSpread() public {
        vm.prank(operator);
        mm.setSpread(ETH_USD, 100);
        (, uint256 spread,) = mm.markets(ETH_USD);
        assertEq(spread, 100);
    }

    function test_RevertWhen_SpreadOutsideLimits() public {
        vm.startPrank(operator);
        vm.expectRevert(abi.encodeWithSelector(MarketMakerModule.SpreadOutOfRange.selector, 4, 5, 1_000));
        mm.setSpread(ETH_USD, 4);
        vm.expectRevert(abi.encodeWithSelector(MarketMakerModule.SpreadOutOfRange.selector, 1_001, 5, 1_000));
        mm.setSpread(ETH_USD, 1_001);
        vm.stopPrank();
    }

    // -------------------------------------------------------- access control

    function test_RevertWhen_StrangerChangesSettings() public {
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(MarketMakerModule.NotOperator.selector, bob));
        mm.setSpread(ETH_USD, 50);
        vm.expectRevert(abi.encodeWithSelector(MarketMakerModule.NotOperator.selector, bob));
        mm.setQuotingEnabled(false);
        vm.expectRevert(abi.encodeWithSelector(MarketMakerModule.NotOperator.selector, bob));
        mm.publishQuote(ETH_USD);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        mm.setOperator(bob, true);
        vm.stopPrank();
    }

    function test_OwnerCanRevokeOperator() public {
        vm.prank(admin);
        mm.setOperator(operator, false);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(MarketMakerModule.NotOperator.selector, operator));
        mm.setSpread(ETH_USD, 50);
    }

    // ------------------------------------------------------- enable / disable

    function test_PauseAndResume() public {
        vm.prank(operator);
        mm.setQuotingEnabled(false);
        vm.expectRevert(MarketMakerModule.QuotingPaused.selector);
        mm.getQuote(ETH_USD);
        (uint8 status,) = mm.quoteStatus(ETH_USD);
        assertEq(status, mm.STATUS_PAUSED());

        vm.prank(operator);
        mm.setQuotingEnabled(true);
        assertEq(mm.getQuote(ETH_USD).mid, 3000e18);
    }

    function test_PublishQuoteEmitsSnapshot() public {
        vm.expectEmit(true, true, false, true);
        emit MarketMakerModule.QuotePublished(ETH_USD, 3000e18, 2995.5e18, 3004.5e18, 30, operator);
        vm.prank(operator);
        mm.publishQuote(ETH_USD);
    }

    // ------------------------------------------------------ vault integration

    function test_QuotesAreIndicativeUntilFunded() public {
        (uint256 funded, uint256 bidSide, uint256 askSide, uint256 indicative) = mm.liquidity(ETH_USD);
        assertEq(funded, 0);
        assertEq(bidSide, 0, "nothing executable without funding");
        assertEq(askSide, 0);
        assertEq(indicative, 10_000e18);

        _fundReserve(address(mm), 4_000e18); // liquidity lives in the SAME CoreVault
        (funded, bidSide, askSide,) = mm.liquidity(ETH_USD);
        assertEq(funded, 4_000e18);
        assertEq(bidSide, 4_000e18, "capped by funded liquidity");
        assertEq(askSide, 0, "no ETH inventory in the vault");
        assertTrue(vault.isSolvent());
    }

    function test_DoesNotTouchUserCollateral() public {
        _deposit(alice, 1_000e18);
        vm.prank(operator);
        mm.publishQuote(ETH_USD);
        assertEq(vault.freeCollateral(alice), 1_000e18);
        assertEq(vault.lockedBy(alice, address(mm)), 0);
    }
}
