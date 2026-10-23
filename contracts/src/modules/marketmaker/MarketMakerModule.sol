// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICoreVault} from "../../interfaces/ICoreVault.sol";
import {IModule} from "../../interfaces/IModule.sol";
import {IPriceOracle} from "../../interfaces/IPriceOracle.sol";
import {IQuoter} from "../../interfaces/IQuoter.sol";

/// @title MarketMakerModule — QUOTE-ONLY STUB (PROTOTYPE)
/// @notice Publishes indicative bid/ask quotes around the shared oracle price.
/// @dev What this stub does and does NOT do (see docs/MARKET_MAKER.md):
///  - Quotes: bid = mid − spread/2, ask = mid + spread/2, from the SAME oracle Perps uses.
///  - Spread limited to [MIN_SPREAD_BPS, MAX_SPREAD_BPS]; set by the owner or authorised operators.
///  - Quoting can be paused; it also stops automatically when the oracle price is missing/stale.
///  - Liquidity: the module's reserve inside the SAME CoreVault. Nothing is funded by default.
///    Quotes are INDICATIVE; executable size is capped by funded liquidity.
///  - It locks NO user collateral and executes NO trades yet. Inventory-backed trading and
///    liquidity provision (via vault.lock / settle) are future work.
contract MarketMakerModule is IModule, IQuoter, Ownable {
    uint256 public constant BPS = 10_000;
    uint256 public constant MIN_SPREAD_BPS = 5; // 0.05%
    uint256 public constant MAX_SPREAD_BPS = 1_000; // 10%

    /// @notice Status codes returned by quoteStatus (easier for a UI than catching reverts).
    uint8 public constant STATUS_OK = 0;
    uint8 public constant STATUS_PAUSED = 1;
    uint8 public constant STATUS_MARKET_NOT_LISTED = 2;
    uint8 public constant STATUS_ORACLE_UNAVAILABLE = 3;

    struct MarketConfig {
        bool listed;
        uint256 spreadBps;
        uint256 maxQuoteSize; // indicative size per side, USD (18 decimals)
    }

    ICoreVault public immutable vault;
    IPriceOracle public immutable oracle;

    bool public quotingEnabled = true;
    mapping(address => bool) public isOperator;
    mapping(bytes32 => MarketConfig) public markets;
    bytes32[] private _marketIds;

    event MarketListed(bytes32 indexed marketId, string symbol, uint256 spreadBps, uint256 maxQuoteSize);
    event OperatorSet(address indexed operator, bool allowed);
    event SpreadUpdated(bytes32 indexed marketId, uint256 oldSpreadBps, uint256 newSpreadBps, address indexed by);
    event MaxQuoteSizeUpdated(bytes32 indexed marketId, uint256 oldSize, uint256 newSize, address indexed by);
    event QuotingStatusChanged(bool enabled, address indexed by);
    event QuotePublished(bytes32 indexed marketId, uint256 mid, uint256 bid, uint256 ask, uint256 spreadBps, address indexed by);

    error NotOperator(address caller);
    error MarketNotListed(bytes32 marketId);
    error MarketAlreadyListed(bytes32 marketId);
    error SpreadOutOfRange(uint256 spreadBps, uint256 min, uint256 max);
    error QuotingPaused();

    modifier onlyOperator() {
        if (msg.sender != owner() && !isOperator[msg.sender]) revert NotOperator(msg.sender);
        _;
    }

    constructor(address owner_, ICoreVault vault_, IPriceOracle oracle_) Ownable(owner_) {
        vault = vault_;
        oracle = oracle_;
    }

    function moduleName() external pure returns (string memory) {
        return "Market Maker";
    }

    // ============================================================== admin

    function listMarket(bytes32 marketId, string calldata symbol, uint256 spreadBps, uint256 maxQuoteSize) external onlyOwner {
        if (markets[marketId].listed) revert MarketAlreadyListed(marketId);
        _checkSpread(spreadBps);
        markets[marketId] = MarketConfig({listed: true, spreadBps: spreadBps, maxQuoteSize: maxQuoteSize});
        _marketIds.push(marketId);
        emit MarketListed(marketId, symbol, spreadBps, maxQuoteSize);
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        isOperator[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    // ========================================================== operators

    function setSpread(bytes32 marketId, uint256 spreadBps) external onlyOperator {
        MarketConfig storage m = _listed(marketId);
        _checkSpread(spreadBps);
        emit SpreadUpdated(marketId, m.spreadBps, spreadBps, msg.sender);
        m.spreadBps = spreadBps;
    }

    function setMaxQuoteSize(bytes32 marketId, uint256 size) external onlyOperator {
        MarketConfig storage m = _listed(marketId);
        emit MaxQuoteSizeUpdated(marketId, m.maxQuoteSize, size, msg.sender);
        m.maxQuoteSize = size;
    }

    function setQuotingEnabled(bool enabled) external onlyOperator {
        quotingEnabled = enabled;
        emit QuotingStatusChanged(enabled, msg.sender);
    }

    /// @notice Record the current quote on-chain (a snapshot for the activity history).
    function publishQuote(bytes32 marketId) external onlyOperator returns (Quote memory q) {
        q = getQuote(marketId);
        emit QuotePublished(marketId, q.mid, q.bid, q.ask, q.spreadBps, msg.sender);
    }

    // ============================================================== views

    /// @inheritdoc IQuoter
    function getQuote(bytes32 marketId) public view returns (Quote memory) {
        if (!quotingEnabled) revert QuotingPaused();
        MarketConfig storage m = _listed(marketId);
        uint256 mid = oracle.getPrice(marketId); // reverts if missing or stale
        return _quote(mid, m.spreadBps);
    }

    /// @notice Same as getQuote, but returns a status code instead of reverting.
    function quoteStatus(bytes32 marketId) external view returns (uint8 status, Quote memory q) {
        MarketConfig storage m = markets[marketId];
        if (!m.listed) return (STATUS_MARKET_NOT_LISTED, q);
        if (!quotingEnabled) return (STATUS_PAUSED, q);
        try oracle.getPrice(marketId) returns (uint256 mid) {
            return (STATUS_OK, _quote(mid, m.spreadBps));
        } catch {
            return (STATUS_ORACLE_UNAVAILABLE, q);
        }
    }

    /// @notice Liquidity actually available to back quotes, from this module's vault reserve.
    /// @return funded      mUSDC held for this module in the CoreVault (0 unless someone funds it)
    /// @return bidSideUsd  executable size on the bid (buy ETH with mUSDC): min(maxQuoteSize, funded)
    /// @return askSideUsd  executable size on the ask (sell ETH): 0 — the vault holds no ETH inventory
    /// @return indicativeUsd quote size advertised per side (maxQuoteSize), NOT necessarily funded
    function liquidity(bytes32 marketId)
        external
        view
        returns (uint256 funded, uint256 bidSideUsd, uint256 askSideUsd, uint256 indicativeUsd)
    {
        MarketConfig storage m = markets[marketId];
        funded = vault.moduleReserve(address(this));
        indicativeUsd = m.maxQuoteSize;
        bidSideUsd = funded < m.maxQuoteSize ? funded : m.maxQuoteSize;
        askSideUsd = 0;
    }

    function getMarkets() external view returns (bytes32[] memory) {
        return _marketIds;
    }

    // ========================================================== internals

    /// @dev bid rounds DOWN and ask rounds UP, so the quoted spread is never narrower than set.
    function _quote(uint256 mid, uint256 spreadBps) private pure returns (Quote memory q) {
        q.mid = mid;
        q.spreadBps = spreadBps;
        q.bid = (mid * (2 * BPS - spreadBps)) / (2 * BPS);
        q.ask = (mid * (2 * BPS + spreadBps) + 2 * BPS - 1) / (2 * BPS);
    }

    function _listed(bytes32 marketId) private view returns (MarketConfig storage m) {
        m = markets[marketId];
        if (!m.listed) revert MarketNotListed(marketId);
    }

    function _checkSpread(uint256 spreadBps) private pure {
        if (spreadBps < MIN_SPREAD_BPS || spreadBps > MAX_SPREAD_BPS) {
            revert SpreadOutOfRange(spreadBps, MIN_SPREAD_BPS, MAX_SPREAD_BPS);
        }
    }
}
