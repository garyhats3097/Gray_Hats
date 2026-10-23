import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** Contract error name → plain-English explanation. */
const MESSAGES: Record<string, string> = {
  ZeroAmount: "Enter an amount greater than zero.",
  InsufficientFreeCollateral: "Not enough available collateral. Part of your deposit is locked by a module.",
  InsufficientLocked: "That amount is more than this module has locked.",
  InsufficientReserve: "The module's pool doesn't have enough liquidity right now.",
  ModuleNotActive: "This module is currently disabled by the admin.",
  ModuleNotRegistered: "This module is not registered with the core.",
  ExceedsBorrowLimit: "That is more than your borrowing capacity.",
  WouldBreakCollateralRequirement: "That collateral is backing your loan. Repay some debt first.",
  NoDebt: "You have no outstanding debt.",
  NotLiquidatable: "This position is not eligible for liquidation.",
  InvalidLeverage: "Leverage must be between 1x and 10x.",
  SizeTooSmall: "The minimum position size is $10.",
  MarketNotListed: "That market is not available.",
  NotPositionOwner: "You can only close your own positions.",
  PositionNotOpen: "This position is already closed.",
  PriceUnavailable: "No oracle price is available for this market.",
  PriceStale: "The oracle price is out of date.",
  ERC20InsufficientBalance: "Your wallet balance is too low.",
  ERC20InsufficientAllowance: "Token approval is missing or too low.",
  OwnableUnauthorizedAccount: "Only the admin account can do this.",
  NotOperator: "Only authorised Market Maker operators can change this.",
  SpreadOutOfRange: "The spread must be between 5 and 1,000 basis points (0.05%–10%).",
  QuotingPaused: "Quoting is paused.",
  MarketAlreadyListed: "That market is already listed.",
};

export function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You rejected the request in your wallet.";
    }
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name];
      if (reverted.reason) return reverted.reason;
      if (name) return `The contract rejected this action (${name}).`;
    }
    if (/user (rejected|denied)/i.test(error.message)) return "You rejected the request in your wallet.";
    return error.shortMessage;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
