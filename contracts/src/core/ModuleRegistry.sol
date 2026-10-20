// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";
import {IModule} from "../interfaces/IModule.sol";

/// @title ModuleRegistry
/// @notice Admin-controlled allow-list of modules that may call the CoreVault.
/// @dev Registered + active   → may lock new collateral and settle.
///      Registered + inactive → "wind-down": may NOT lock new collateral, but may still
///                              unlock/settle so users are never trapped.
///      Not registered        → no access at all.
contract ModuleRegistry is IModuleRegistry, Ownable {
    mapping(address => bool) private _registered;
    mapping(address => bool) private _active;
    address[] private _modules;

    error AlreadyRegistered(address module);
    error NotRegistered(address module);
    error ZeroAddress();

    constructor(address owner_) Ownable(owner_) {}

    function registerModule(address module) external onlyOwner {
        if (module == address(0)) revert ZeroAddress();
        if (_registered[module]) revert AlreadyRegistered(module);
        _registered[module] = true;
        _active[module] = true;
        _modules.push(module);
        emit ModuleRegistered(module, IModule(module).moduleName());
        emit ModuleStatusChanged(module, true);
    }

    function setModuleActive(address module, bool active) external onlyOwner {
        if (!_registered[module]) revert NotRegistered(module);
        _active[module] = active;
        emit ModuleStatusChanged(module, active);
    }

    function isRegistered(address module) external view returns (bool) {
        return _registered[module];
    }

    function isActive(address module) external view returns (bool) {
        return _active[module];
    }

    function getModules() external view returns (address[] memory) {
        return _modules;
    }
}
