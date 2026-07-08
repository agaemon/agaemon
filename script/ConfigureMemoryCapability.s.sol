// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

interface ConfigureMemoryCapabilityVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigureMemoryCapability {
    ConfigureMemoryCapabilityVm private constant vm =
        ConfigureMemoryCapabilityVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant MEMORY_COMMIT = keccak256("MEMORY_COMMIT");

    event MemoryCapabilityConfigured(address indexed registry, address indexed memoryRegistry);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address memoryRegistryAddress = vm.envAddress("MEMORY_REGISTRY");

        vm.startBroadcast(privateKey);

        CapabilityRegistry(registryAddress).setCapability(MEMORY_COMMIT, memoryRegistryAddress, true);
        emit MemoryCapabilityConfigured(registryAddress, memoryRegistryAddress);

        vm.stopBroadcast();
    }
}
