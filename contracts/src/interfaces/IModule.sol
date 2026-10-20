// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IModule
/// @notice Minimal identity every financial module exposes. A new module only needs
///         this interface plus ICoreVault — the core never changes to add one.
interface IModule {
    function moduleName() external view returns (string memory);
}
