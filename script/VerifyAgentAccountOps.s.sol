// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";

interface VerifyAgentAccountOpsVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifyAgentAccountOps {
    VerifyAgentAccountOpsVm private constant vm =
        VerifyAgentAccountOpsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address ownerAddress = vm.envAddress("OWNER_ADDRESS");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address reputationAddress = vm.envAddress("REPUTATION_REGISTRY");

        AgentAccount agent = AgentAccount(payable(agentAddress));

        require(agent.owner() == ownerAddress, "agent owner mismatch");
        require(agent.capabilities() == registryAddress, "agent registry mismatch");
        require(address(agent.policyEngine()) == policyAddress, "agent policy mismatch");
        require(address(agent.reputationRegistry()) == reputationAddress, "agent reputation mismatch");
        agent.reputation();
    }
}
