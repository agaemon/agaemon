// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface ConfigureAgentVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigureAgent {
    ConfigureAgentVm private constant vm = ConfigureAgentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant SWAP = keccak256("SWAP");

    event AgentConfigured(address indexed agent, address indexed target);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address targetAddress = vm.envAddress("TEST_TARGET_PROTOCOL");

        vm.startBroadcast(privateKey);

        CapabilityRegistry(registryAddress).setCapability(SWAP, targetAddress, true);
        PolicyEngine(policyAddress).setPolicy(agentAddress, 0.01 ether, 0.05 ether, false);

        emit AgentConfigured(agentAddress, targetAddress);

        vm.stopBroadcast();
    }
}
