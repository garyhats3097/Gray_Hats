// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICreditRegistry
/// @notice Shared, on-chain credit history. Registered modules report activity; anyone can read
///         a user's score and the borrowing terms it unlocks.
interface ICreditRegistry {
    struct Record {
        uint64 firstSeen; // first module interaction (account age starts here)
        uint32 loansRepaid; // loans paid back in full
        uint32 perpsLiquidations;
        uint32 lendingDefaults; // lending liquidations — any default makes the user ineligible
        uint256 repaidVolume; // total debt repaid, 18 decimals
    }

    /// @dev Points per component; score = sum − penalties, floored at 0, capped at 100.
    struct Breakdown {
        uint256 loansPoints;
        uint256 volumePoints;
        uint256 agePoints;
        uint256 portfolioPoints;
        uint256 penaltyPoints;
    }

    struct Terms {
        uint8 tier; // 0 Standard, 1 Trusted, 2 Established, 3 Prime
        uint256 score;
        uint256 maxLtvBps; // borrow limit as % of collateral (above 10_000 = undercollateralized)
        uint256 liquidationThresholdBps;
        uint256 unsecuredAllowance; // max amount that may be borrowed ABOVE the collateral
        bool defaulted;
    }

    event ActivityRecorded(address indexed user, address indexed module);
    event RepaymentRecorded(address indexed user, address indexed module, uint256 amount, bool loanClosed);
    event LiquidationRecorded(address indexed user, address indexed module, bool lendingDefault);

    function recordActivity(address user) external;
    function recordRepayment(address user, uint256 amount, bool loanClosed) external;
    function recordLiquidation(address user, bool lendingDefault) external;

    function recordOf(address user) external view returns (Record memory);
    function scoreOf(address user) external view returns (uint256 score, Breakdown memory breakdown);
    function termsOf(address user) external view returns (Terms memory);
}
