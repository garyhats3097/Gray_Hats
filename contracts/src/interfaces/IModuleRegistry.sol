// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IModuleRegistry {
    event ModuleRegistered(address indexed module, string name);
    event ModuleStatusChanged(address indexed module, bool active);

    function isRegistered(address module) external view returns (bool);
    function isActive(address module) external view returns (bool);
    function getModules() external view returns (address[] memory);
}
