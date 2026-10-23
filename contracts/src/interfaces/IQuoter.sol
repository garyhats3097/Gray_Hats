// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IQuoter
/// @notice Shared interface for modules that publish bid/ask quotes.
interface IQuoter {
    /// @dev Prices are USD with 18 decimals. spreadBps is the full bid-to-ask spread.
    struct Quote {
        uint256 mid;
        uint256 bid;
        uint256 ask;
        uint256 spreadBps;
    }

    /// @notice Current indicative quote. Reverts if quoting is paused, the market is not
    ///         listed, or the oracle price is missing/stale.
    function getQuote(bytes32 marketId) external view returns (Quote memory);
}
