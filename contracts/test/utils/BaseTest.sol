// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockOracle} from "../../src/mocks/MockOracle.sol";
import {ModuleRegistry} from "../../src/core/ModuleRegistry.sol";
import {CoreVault} from "../../src/core/CoreVault.sol";
import {CreditRegistry} from "../../src/core/CreditRegistry.sol";

/// @dev Shared setup: token, oracle, registry and vault, plus funded users.
abstract contract BaseTest is Test {
    MockERC20 internal usdc;
    MockOracle internal oracle;
    ModuleRegistry internal registry;
    CoreVault internal vault;
    CreditRegistry internal credit;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal constant ETH_USD = keccak256("ETH/USD");

    function setUp() public virtual {
        usdc = new MockERC20("Mock USD Coin", "mUSDC");
        oracle = new MockOracle(admin, 0);
        registry = new ModuleRegistry(admin);
        vault = new CoreVault(usdc, registry);
        credit = new CreditRegistry(registry, vault);

        vm.prank(admin);
        oracle.setPrice(ETH_USD, 3000e18);

        _fund(alice, 100_000e18);
        _fund(bob, 100_000e18);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _deposit(address who, uint256 amount) internal {
        vm.prank(who);
        vault.deposit(amount);
    }

    function _register(address module) internal {
        vm.prank(admin);
        registry.registerModule(module);
    }

    function _fundReserve(address module, uint256 amount) internal {
        usdc.mint(admin, amount);
        vm.startPrank(admin);
        usdc.approve(address(vault), amount);
        vault.fundReserve(module, amount);
        vm.stopPrank();
    }
}
