// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Prices are USD with 18 decimals (3000e18 = $3,000).
interface IPriceOracle {
    function getPrice(bytes32 marketId) external view returns (uint256 price);
}
