// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketMakerModule} from "../src/modules/marketmaker/MarketMakerModule.sol";
import {ModuleRegistry} from "../src/core/ModuleRegistry.sol";
import {ICoreVault} from "../src/interfaces/ICoreVault.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";

/// @dev Shared by Deploy.s.sol (fresh chains) and AddMarketMaker.s.sol (existing saved chains).
///      Must be called inside a broadcast by the registry owner (Anvil #0).
abstract contract MarketMakerSetup {
    // Anvil test account #1 — authorised as an operator so the demo can change settings.
    address internal constant DEMO_OPERATOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    bytes32 internal constant MM_SALT = keccak256("modular-defi.market-maker.v1");

    function _deployMarketMaker(address owner, ICoreVault vault, IPriceOracle oracle, ModuleRegistry registry)
        internal
        returns (MarketMakerModule mm)
    {
        // CREATE2 with a fixed salt: the address is the same on a fresh chain and on an existing
        // chain upgraded by AddMarketMaker.s.sol, so deployments.json never differs between them.
        mm = new MarketMakerModule{salt: MM_SALT}(owner, vault, oracle);
        registry.registerModule(address(mm));
        // 0.30% spread, $10,000 indicative size per side. No liquidity is funded: quotes are indicative.
        mm.listMarket(keccak256("ETH/USD"), "ETH/USD", 30, 10_000e18);
        mm.setOperator(DEMO_OPERATOR, true);
    }
}
