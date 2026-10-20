// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @title MockOracle — TEST COMPONENT ONLY, NOT A PRODUCTION ORACLE
/// @notice The owner sets prices by hand so demos and tests are predictable.
///         A real deployment would use a decentralised oracle (e.g. Chainlink) with
///         manipulation resistance; this contract has none.
contract MockOracle is IPriceOracle, Ownable {
    struct PriceData {
        uint256 price; // USD, 18 decimals
        uint256 updatedAt;
    }

    /// @notice Prices older than this are rejected. 0 disables the check.
    uint256 public maxAge;
    mapping(bytes32 => PriceData) public prices;

    event PriceUpdated(bytes32 indexed marketId, uint256 price, uint256 timestamp);
    event MaxAgeUpdated(uint256 maxAge);

    error PriceUnavailable(bytes32 marketId);
    error PriceStale(bytes32 marketId, uint256 updatedAt);
    error InvalidPrice();

    constructor(address owner_, uint256 maxAge_) Ownable(owner_) {
        maxAge = maxAge_;
    }

    function setPrice(bytes32 marketId, uint256 price) external onlyOwner {
        if (price == 0) revert InvalidPrice();
        prices[marketId] = PriceData(price, block.timestamp);
        emit PriceUpdated(marketId, price, block.timestamp);
    }

    function setMaxAge(uint256 maxAge_) external onlyOwner {
        maxAge = maxAge_;
        emit MaxAgeUpdated(maxAge_);
    }

    function getPrice(bytes32 marketId) external view returns (uint256) {
        PriceData memory p = prices[marketId];
        if (p.price == 0) revert PriceUnavailable(marketId);
        if (maxAge != 0 && block.timestamp - p.updatedAt > maxAge) revert PriceStale(marketId, p.updatedAt);
        return p.price;
    }
}
