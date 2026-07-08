// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {TestTargetProtocol} from "../src/testsupport/TestTargetProtocol.sol";

interface VerifyDeploymentVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifyDeployment {
    VerifyDeploymentVm private constant vm =
        VerifyDeploymentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant SWAP = keccak256("SWAP");

    function run() external view {
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address targetAddress = vm.envAddress("TEST_TARGET_PROTOCOL");

        CapabilityRegistry registry = CapabilityRegistry(registryAddress);
        AgentAccount agent = AgentAccount(payable(agentAddress));
        TestTargetProtocol target = TestTargetProtocol(targetAddress);

        require(registry.isAllowed(SWAP, targetAddress), "target capability is not allowed");
        require(agent.capabilities() == registryAddress, "agent registry mismatch");
        require(!agent.paused(), "agent is paused");
        require(target.wasCalled(), "target was not called");
    }
}
