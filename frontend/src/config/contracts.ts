import { keccak256, toHex, type Address } from "viem";
import deployments from "./deployments.json";
import {
  coreVaultAbi,
  creditRegistryAbi,
  lendingModuleAbi,
  marketMakerModuleAbi,
  mockERC20Abi,
  mockOracleAbi,
  moduleRegistryAbi,
  perpsModuleAbi,
} from "./abis";

/**
 * Every contract the app talks to: address + ABI.
 * deployments.json is written by contracts/script/Deploy.s.sol — never edit it by hand.
 */
export const contracts = {
  usdc: { address: deployments.MockUSDC as Address, abi: mockERC20Abi },
  oracle: { address: deployments.MockOracle as Address, abi: mockOracleAbi },
  registry: { address: deployments.ModuleRegistry as Address, abi: moduleRegistryAbi },
  vault: { address: deployments.CoreVault as Address, abi: coreVaultAbi },
  credit: { address: deployments.CreditRegistry as Address, abi: creditRegistryAbi },
  perps: { address: deployments.PerpsModule as Address, abi: perpsModuleAbi },
  lending: { address: deployments.LendingModule as Address, abi: lendingModuleAbi },
  marketMaker: { address: deployments.MarketMakerModule as Address, abi: marketMakerModuleAbi },
} as const;

export const ADMIN_ADDRESS = deployments.admin as Address;
export const DEPLOY_BLOCK = BigInt(deployments.deployBlock);
export const COLLATERAL_SYMBOL = "mUSDC";

export const ETH_USD = keccak256(toHex("ETH/USD"));

/** Human-readable module names, keyed by lower-cased contract address. */
export const MODULE_NAMES: Record<string, string> = {
  [contracts.perps.address.toLowerCase()]: "Perpetuals",
  [contracts.lending.address.toLowerCase()]: "Lending",
  [contracts.marketMaker.address.toLowerCase()]: "Market Maker",
};
