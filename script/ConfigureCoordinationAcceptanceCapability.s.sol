// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

interface ConfigureCoordinationAcceptanceCapabilityVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigureCoordinationAcceptanceCapability {
    ConfigureCoordinationAcceptanceCapabilityVm private constant vm =
        ConfigureCoordinationAcceptanceCapabilityVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant COORDINATION_ACCEPT = keccak256("COORDINATION_ACCEPT");

    event CoordinationAcceptanceCapabilityConfigured(address indexed registry, address indexed coordination);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");

        vm.startBroadcast(privateKey);

        CapabilityRegistry(registryAddress).setCapability(COORDINATION_ACCEPT, coordinationAddress, true);
        emit CoordinationAcceptanceCapabilityConfigured(registryAddress, coordinationAddress);

        vm.stopBroadcast();
    }
}
