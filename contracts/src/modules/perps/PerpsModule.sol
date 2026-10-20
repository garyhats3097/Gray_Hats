// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICoreVault} from "../../interfaces/ICoreVault.sol";
import {IModule} from "../../interfaces/IModule.sol";
import {IPriceOracle} from "../../interfaces/IPriceOracle.sol";

/// @title PerpsModule — simplified perpetual futures (PROTOTYPE)
/// @notice Rules (see docs/PERPS.md):
///  - Isolated margin: each position has its own margin, locked in the CoreVault.
///  - size is the USD notional (18 decimals). margin = size / leverage.
///  - PnL = size * (price - entry) / entry   (negated for shorts).
///  - Fee: 0.1% of size on open and on close, paid into the perps pool.
///  - Liquidation when margin + PnL <= 5% of size. Anyone may liquidate; the whole
///    margin goes to the perps pool.
///  - Profits are paid from the perps pool (the module's reserve in the vault). If the
///    pool cannot cover a profit, the payout is capped and ProfitCapped is emitted.
///  - Losses beyond a position's margin (bad debt) are absorbed by the pool.
///  - No funding rate, no order book, no price impact.
contract PerpsModule is IModule, Ownable, ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_LEVERAGE = 10;
    uint256 public constant MAINTENANCE_MARGIN_BPS = 500; // 5% of size
    uint256 public constant FEE_BPS = 10; // 0.1% of size
    uint256 public constant MIN_SIZE = 10e18; // $10

    struct Position {
        address owner;
        bytes32 marketId;
        bool isLong;
        bool isOpen;
        uint256 size; // USD notional, 18 decimals
        uint256 margin; // collateral locked in the vault
        uint256 entryPrice; // USD, 18 decimals
        uint256 leverage;
        uint256 openedAt;
    }

    ICoreVault public immutable vault;
    IPriceOracle public immutable oracle;

    mapping(bytes32 => bool) public isMarketListed;
    bytes32[] public markets;

    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) private _userPositionIds;

    event MarketListed(bytes32 indexed marketId, string symbol);
    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        bytes32 indexed marketId,
        bool isLong,
        uint256 size,
        uint256 margin,
        uint256 leverage,
        uint256 entryPrice,
        uint256 fee
    );
    event PositionClosed(
        uint256 indexed positionId, address indexed user, uint256 exitPrice, int256 pnl, uint256 fee, int256 netSettlement
    );
    event PositionLiquidated(
        uint256 indexed positionId, address indexed user, address indexed liquidator, uint256 price, uint256 marginLost
    );
    event ProfitCapped(uint256 indexed positionId, uint256 owed, uint256 paid);
    event BadDebt(uint256 indexed positionId, uint256 amount);

    error MarketNotListed(bytes32 marketId);
    error InvalidLeverage(uint256 leverage);
    error SizeTooSmall(uint256 size);
    error NotPositionOwner();
    error PositionNotOpen();
    error NotLiquidatable();
    error MarketAlreadyListed();

    constructor(address owner_, ICoreVault vault_, IPriceOracle oracle_) Ownable(owner_) {
        vault = vault_;
        oracle = oracle_;
    }

    function moduleName() external pure returns (string memory) {
        return "Perpetuals";
    }

    function listMarket(bytes32 marketId, string calldata symbol) external onlyOwner {
        if (isMarketListed[marketId]) revert MarketAlreadyListed();
        isMarketListed[marketId] = true;
        markets.push(marketId);
        emit MarketListed(marketId, symbol);
    }

    // ============================================================== trading

    /// @notice Open a position. Locks `size / leverage` margin plus the opening fee,
    ///         then moves the fee into the perps pool.
    function openPosition(bytes32 marketId, bool isLong, uint256 size, uint256 leverage)
        external
        nonReentrant
        returns (uint256 positionId)
    {
        if (!isMarketListed[marketId]) revert MarketNotListed(marketId);
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert InvalidLeverage(leverage);
        if (size < MIN_SIZE) revert SizeTooSmall(size);

        uint256 price = oracle.getPrice(marketId); // reverts if unavailable/stale
        uint256 margin = _ceilDiv(size, leverage);
        uint256 fee = _fee(size);

        // The vault checks the user has enough FREE collateral for margin + fee.
        vault.lock(msg.sender, margin + fee);
        vault.realizeLoss(msg.sender, fee);

        positionId = nextPositionId++;
        positions[positionId] = Position({
            owner: msg.sender,
            marketId: marketId,
            isLong: isLong,
            isOpen: true,
            size: size,
            margin: margin,
            entryPrice: price,
            leverage: leverage,
            openedAt: block.timestamp
        });
        _userPositionIds[msg.sender].push(positionId);

        emit PositionOpened(positionId, msg.sender, marketId, isLong, size, margin, leverage, price, fee);
    }

    /// @notice Close your position at the current oracle price and settle through the vault.
    function closePosition(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (!p.isOpen) revert PositionNotOpen();
        if (p.owner != msg.sender) revert NotPositionOwner();

        uint256 price = oracle.getPrice(p.marketId);
        int256 pnl = _pnl(p, price);
        uint256 fee = _fee(p.size);
        int256 net = pnl - int256(fee);
        p.isOpen = false;

        if (net >= 0) {
            vault.unlock(p.owner, p.margin);
            uint256 owed = uint256(net);
            if (owed > 0) {
                uint256 reserve = vault.moduleReserve(address(this));
                uint256 paid = owed > reserve ? reserve : owed;
                if (paid < owed) emit ProfitCapped(positionId, owed, paid);
                if (paid > 0) vault.realizeProfit(p.owner, paid);
            }
        } else {
            uint256 loss = uint256(-net);
            if (loss > p.margin) {
                emit BadDebt(positionId, loss - p.margin);
                loss = p.margin;
            }
            vault.realizeLoss(p.owner, loss);
            if (p.margin > loss) vault.unlock(p.owner, p.margin - loss);
        }

        emit PositionClosed(positionId, p.owner, price, pnl, fee, net);
    }

    /// @notice Anyone can liquidate an undercollateralised position. Its whole margin
    ///         is moved into the perps pool.
    function liquidate(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (!p.isOpen) revert PositionNotOpen();
        uint256 price = oracle.getPrice(p.marketId);
        if (!_isLiquidatable(p, price)) revert NotLiquidatable();

        p.isOpen = false;
        vault.realizeLoss(p.owner, p.margin);
        emit PositionLiquidated(positionId, p.owner, msg.sender, price, p.margin);
    }

    // ================================================================ views

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    function getUserPositionIds(address user) external view returns (uint256[] memory) {
        return _userPositionIds[user];
    }

    function getMarkets() external view returns (bytes32[] memory) {
        return markets;
    }

    function unrealizedPnl(uint256 positionId) public view returns (int256) {
        Position storage p = positions[positionId];
        if (!p.isOpen) return 0;
        return _pnl(p, oracle.getPrice(p.marketId));
    }

    /// @notice Sum of unrealised PnL over the user's open positions (display only — never withdrawable).
    function totalUnrealizedPnl(address user) external view returns (int256 total) {
        uint256[] storage ids = _userPositionIds[user];
        for (uint256 i; i < ids.length; i++) {
            total += unrealizedPnl(ids[i]);
        }
    }

    function isLiquidatable(uint256 positionId) external view returns (bool) {
        Position storage p = positions[positionId];
        if (!p.isOpen) return false;
        return _isLiquidatable(p, oracle.getPrice(p.marketId));
    }

    /// @notice Price at which margin + PnL == maintenance margin.
    ///         Long:  entry * (1 - (margin - maint) / size)
    ///         Short: entry * (1 + (margin - maint) / size)
    function liquidationPrice(uint256 positionId) external view returns (uint256) {
        Position storage p = positions[positionId];
        uint256 maint = _maintenance(p.size);
        if (p.margin <= maint) return p.entryPrice;
        uint256 move = p.entryPrice * (p.margin - maint) / p.size;
        if (p.isLong) return p.entryPrice > move ? p.entryPrice - move : 0;
        return p.entryPrice + move;
    }

    /// @notice Preview for the trade form: margin and fee required to open.
    function quoteOpen(uint256 size, uint256 leverage) external pure returns (uint256 margin, uint256 fee) {
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert InvalidLeverage(leverage);
        margin = _ceilDiv(size, leverage);
        fee = _fee(size);
    }

    // ============================================================ internals

    function _pnl(Position storage p, uint256 price) private view returns (int256) {
        // size * |price - entry| / entry, rounded toward zero
        int256 diff = int256(price) - int256(p.entryPrice);
        int256 pnl = int256(p.size) * diff / int256(p.entryPrice);
        return p.isLong ? pnl : -pnl;
    }

    function _isLiquidatable(Position storage p, uint256 price) private view returns (bool) {
        int256 equity = int256(p.margin) + _pnl(p, price);
        return equity <= int256(_maintenance(p.size));
    }

    function _maintenance(uint256 size) private pure returns (uint256) {
        return size * MAINTENANCE_MARGIN_BPS / BPS;
    }

    function _fee(uint256 size) private pure returns (uint256) {
        return size * FEE_BPS / BPS;
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return (a + b - 1) / b;
    }
}
