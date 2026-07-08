// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MemoryRegistry} from "../src/MemoryRegistry.sol";

interface DeployMemoryRegistryVm {
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployMemoryRegistry {
    DeployMemoryRegistryVm private constant vm =
        DeployMemoryRegistryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event MemoryRegistryDeployed(address registry);

    function run() external returns (address registryAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);

        MemoryRegistry registry = new MemoryRegistry();
        emit MemoryRegistryDeployed(address(registry));

        vm.stopBroadcast();

        return address(registry);
    }
}
