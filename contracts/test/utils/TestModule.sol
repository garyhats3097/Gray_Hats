// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICoreVault} from "../../src/interfaces/ICoreVault.sol";
import {IModule} from "../../src/interfaces/IModule.sol";

/// @dev Minimal module that forwards calls to the vault so core tests can exercise
///      module-only functions without depending on Perps or Lending.
contract TestModule is IModule {
    ICoreVault public vault;

    constructor(ICoreVault vault_) {
        vault = vault_;
    }

    function moduleName() external pure returns (string memory) {
        return "Test";
    }

    function lock(address u, uint256 a) external { vault.lock(u, a); }
    function unlock(address u, uint256 a) external { vault.unlock(u, a); }
    function realizeLoss(address u, uint256 a) external { vault.realizeLoss(u, a); }
    function realizeProfit(address u, uint256 a) external { vault.realizeProfit(u, a); }
    function payFromReserve(address to, uint256 a) external { vault.payFromReserve(to, a); }
    function creditReserve(uint256 a) external { vault.creditReserve(a); }
}
