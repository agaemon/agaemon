// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {MemoryRegistry} from "../src/MemoryRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface VerifyMemoryRegistryVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifyMemoryRegistry {
    VerifyMemoryRegistryVm private constant vm =
        VerifyMemoryRegistryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant MEMORY_COMMIT = keccak256("MEMORY_COMMIT");

    function run() external view {
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address memoryRegistryAddress = vm.envAddress("MEMORY_REGISTRY");

        require(
            CapabilityRegistry(registryAddress).isAllowed(MEMORY_COMMIT, memoryRegistryAddress),
            "memory registry is not allowed"
        );

        bytes32 contentHash = keccak256("AgentOS memory commitment smoke test");
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: MEMORY_COMMIT,
            target: memoryRegistryAddress,
            value: 0,
            data: abi.encodeWithSelector(
                MemoryRegistry.commitMemory.selector,
                keccak256("agentos.memory.smoke"),
                contentHash,
                contentHash,
                keccak256("memory://agentos/base-sepolia/smoke-test")
            ),
            usesBorrowing: false
        });

        (bool allowed, PolicyEngine.DecisionCode code) = PolicyEngine(policyAddress).checkAction(agentAddress, action);
        require(allowed, "memory commit is not policy allowed");
        require(code == PolicyEngine.DecisionCode.Allowed, "unexpected memory policy code");
    }
}
