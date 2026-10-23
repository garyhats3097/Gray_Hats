// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ModuleRegistry} from "../src/core/ModuleRegistry.sol";
import {ICoreVault} from "../src/interfaces/ICoreVault.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {MarketMakerModule} from "../src/modules/marketmaker/MarketMakerModule.sol";
import {MarketMakerSetup} from "./MarketMakerSetup.sol";

/// @notice Adds the Market Maker module to an EXISTING saved chain without redeploying anything
///         else, so balances, positions and loans are kept. start-chain.sh runs this automatically.
contract AddMarketMaker is Script, MarketMakerSetup {
    uint256 internal constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    string internal constant PATH = "../frontend/src/config/deployments.json";

    function run() external {
        string memory file = vm.readFile(PATH);
        ICoreVault vault = ICoreVault(vm.parseJsonAddress(file, ".CoreVault"));
        IPriceOracle oracle = IPriceOracle(vm.parseJsonAddress(file, ".MockOracle"));
        ModuleRegistry registry = ModuleRegistry(vm.parseJsonAddress(file, ".ModuleRegistry"));

        uint256 key = vm.envOr("DEPLOYER_KEY", ANVIL_KEY_0);
        vm.startBroadcast(key);
        MarketMakerModule mm = _deployMarketMaker(vm.addr(key), vault, oracle, registry);
        vm.stopBroadcast();

        // Rewrite deployments.json with every existing entry plus the new module.
        string memory obj = "deployments";
        vm.serializeUint(obj, "chainId", vm.parseJsonUint(file, ".chainId"));
        vm.serializeUint(obj, "deployBlock", vm.parseJsonUint(file, ".deployBlock"));
        vm.serializeAddress(obj, "admin", vm.parseJsonAddress(file, ".admin"));
        vm.serializeAddress(obj, "MockUSDC", vm.parseJsonAddress(file, ".MockUSDC"));
        vm.serializeAddress(obj, "MockOracle", address(oracle));
        vm.serializeAddress(obj, "ModuleRegistry", address(registry));
        vm.serializeAddress(obj, "CoreVault", address(vault));
        vm.serializeAddress(obj, "CreditRegistry", vm.parseJsonAddress(file, ".CreditRegistry"));
        vm.serializeAddress(obj, "PerpsModule", vm.parseJsonAddress(file, ".PerpsModule"));
        vm.serializeAddress(obj, "LendingModule", vm.parseJsonAddress(file, ".LendingModule"));
        string memory json = vm.serializeAddress(obj, "MarketMakerModule", address(mm));
        vm.writeJson(json, PATH);
        console.log("MarketMaker added at", address(mm));
    }
}
