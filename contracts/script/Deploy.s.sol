// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {ModuleRegistry} from "../src/core/ModuleRegistry.sol";
import {CoreVault} from "../src/core/CoreVault.sol";
import {CreditRegistry} from "../src/core/CreditRegistry.sol";
import {PerpsModule} from "../src/modules/perps/PerpsModule.sol";
import {LendingModule} from "../src/modules/lending/LendingModule.sol";
import {MarketMakerModule} from "../src/modules/marketmaker/MarketMakerModule.sol";
import {MarketMakerSetup} from "./MarketMakerSetup.sol";

/// @notice Deploys the whole local prototype, seeds both pools, funds test accounts
///         and writes addresses to frontend/src/config/deployments.json.
/// Usage (Anvil running):  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract Deploy is Script, MarketMakerSetup {
    // Anvil account #0 — a PUBLICLY KNOWN test key. Never use it on a real network.
    uint256 internal constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    bytes32 internal constant ETH_USD = keccak256("ETH/USD");
    uint256 internal constant POOL_SEED = 1_000_000e18;
    uint256 internal constant TEST_ACCOUNT_FUNDS = 100_000e18;

    function run() external {
        uint256 key = vm.envOr("DEPLOYER_KEY", ANVIL_KEY_0);
        address deployer = vm.addr(key);

        vm.startBroadcast(key);

        MockERC20 usdc = new MockERC20("Mock USD Coin", "mUSDC");
        // start-chain.sh passes the REAL current ETH price and a staleness limit; tests use the defaults.
        uint256 initialPrice = vm.envOr("INITIAL_ETH_PRICE_WEI", uint256(3_000e18));
        uint256 maxAge = vm.envOr("ORACLE_MAX_AGE", uint256(0));
        MockOracle oracle = new MockOracle(deployer, maxAge);
        ModuleRegistry registry = new ModuleRegistry(deployer);
        CoreVault vault = new CoreVault(usdc, registry);
        CreditRegistry credit = new CreditRegistry(registry, vault);
        PerpsModule perps = new PerpsModule(deployer, vault, oracle, credit);
        LendingModule lending = new LendingModule(vault, credit);

        registry.registerModule(address(perps));
        registry.registerModule(address(lending));
        oracle.setPrice(ETH_USD, initialPrice);
        perps.listMarket(ETH_USD, "ETH/USD");

        // Seed protocol liquidity (clearly test money)
        usdc.mint(deployer, POOL_SEED);
        usdc.mint(deployer, POOL_SEED);
        usdc.approve(address(vault), 2 * POOL_SEED);
        vault.fundReserve(address(perps), POOL_SEED);
        vault.fundReserve(address(lending), POOL_SEED);

        // Fund Anvil accounts #1–#3 for testers
        usdc.mint(0x70997970C51812dc3A010C7d01b50e0d17dc79C8, TEST_ACCOUNT_FUNDS);
        usdc.mint(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, TEST_ACCOUNT_FUNDS);
        usdc.mint(0x90F79bf6EB2c4f870365E785982E1f101E93b906, TEST_ACCOUNT_FUNDS);

        // Market Maker (quote-only stub), deployed last so earlier addresses never change
        MarketMakerModule mm = _deployMarketMaker(deployer, vault, oracle, registry);

        vm.stopBroadcast();

        string memory obj = "deployments";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeUint(obj, "deployBlock", block.number);
        vm.serializeAddress(obj, "admin", deployer);
        vm.serializeAddress(obj, "MockUSDC", address(usdc));
        vm.serializeAddress(obj, "MockOracle", address(oracle));
        vm.serializeAddress(obj, "ModuleRegistry", address(registry));
        vm.serializeAddress(obj, "CoreVault", address(vault));
        vm.serializeAddress(obj, "CreditRegistry", address(credit));
        vm.serializeAddress(obj, "PerpsModule", address(perps));
        vm.serializeAddress(obj, "LendingModule", address(lending));
        string memory json = vm.serializeAddress(obj, "MarketMakerModule", address(mm));
        vm.writeJson(json, "../frontend/src/config/deployments.json");

        console.log("CoreVault     ", address(vault));
        console.log("PerpsModule   ", address(perps));
        console.log("LendingModule ", address(lending));
        console.log("MarketMaker   ", address(mm));
        console.log("Wrote frontend/src/config/deployments.json");
    }
}
