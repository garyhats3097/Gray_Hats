// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — TEST TOKEN ONLY
/// @notice Anyone can mint. This token has no value and must never be used outside local testing.
/// @dev Uses 18 decimals (real USDC uses 6) to keep prototype math simple.
contract MockERC20 is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 10_000e18;
    uint256 public constant MAX_MINT = 1_000_000e18;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Faucet used by the "Get test mUSDC" button.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Used by deploy scripts and tests.
    function mint(address to, uint256 amount) external {
        require(amount <= MAX_MINT, "MockERC20: amount too large");
        _mint(to, amount);
    }
}
