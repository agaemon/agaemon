// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {MemoryRegistry} from "../src/MemoryRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface VerifyAgentCoordinationVm {
    function envAddress(string calldata name) external view returns (address);
    function envOr(string calldata name, address defaultValue) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
}

contract VerifyAgentCoordination {
    VerifyAgentCoordinationVm private constant vm =
        VerifyAgentCoordinationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant COORDINATION_ACCEPT = keccak256("COORDINATION_ACCEPT");
    bytes32 private constant COORDINATION_COMPLETE = keccak256("COORDINATION_COMPLETE");

    struct ExpectedAssignment {
        address assigner;
        address assignee;
        bytes32 taskHash;
        bytes32 contextHash;
        bytes32 resultHash;
        bytes32 resultMemoryId;
        bytes32 resultMerkleRoot;
    }

    function run() external view {
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        address directoryAddress = vm.envAddress("AGENT_DIRECTORY");
        address memoryRegistryAddress = vm.envAddress("MEMORY_REGISTRY");
        address defaultAgent = vm.envAddress("AGENT_ACCOUNT");
        bytes32 resultMemoryId = keccak256(bytes(vm.envString("COORDINATION_RESULT_MEMORY_ID_LABEL")));
        bytes32 resultMerkleRoot = keccak256(bytes(vm.envString("COORDINATION_RESULT_CONTENT")));
        ExpectedAssignment memory expected = ExpectedAssignment({
            assigner: vm.envOr("COORDINATION_ASSIGNER", defaultAgent),
            assignee: vm.envOr("COORDINATION_ASSIGNEE", defaultAgent),
            taskHash: keccak256(bytes(vm.envString("COORDINATION_TASK_LABEL"))),
            contextHash: keccak256(bytes(vm.envString("COORDINATION_CONTEXT_URI"))),
            resultHash: keccak256(abi.encode(resultMemoryId, resultMerkleRoot)),
            resultMemoryId: resultMemoryId,
            resultMerkleRoot: resultMerkleRoot
        });

        AgentCoordination coordination = AgentCoordination(coordinationAddress);
        require(coordination.owner() != address(0), "coordination owner is zero");
        require(address(coordination.agentDirectory()) == directoryAddress, "directory mismatch");
        require(address(coordination.memoryRegistry()) == memoryRegistryAddress, "memory registry mismatch");
        verifyResultMemory(memoryRegistryAddress, expected);
        verifyCoordinationPolicy(registryAddress, policyAddress, defaultAgent, coordinationAddress, COORDINATION_ACCEPT);
        verifyCoordinationPolicy(
            registryAddress, policyAddress, defaultAgent, coordinationAddress, COORDINATION_COMPLETE
        );

        uint256 assignmentCount = coordination.assignmentCount();
        require(assignmentCount > 0, "no assignments");

        bool found;
        for (uint256 assignmentId = 0; assignmentId < assignmentCount; assignmentId++) {
            if (assignmentMatches(coordination, assignmentId, expected)) {
                found = true;
            }
        }

        require(found, "expected completed assignment missing");
    }

    function verifyCoordinationPolicy(
        address registryAddress,
        address policyAddress,
        address agentAddress,
        address coordinationAddress,
        bytes32 capability
    ) private view {
        require(
            CapabilityRegistry(registryAddress).isAllowed(capability, coordinationAddress),
            "coordination capability is not allowed"
        );

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: capability,
            target: coordinationAddress,
            value: 0,
            data: coordinationActionData(capability),
            usesBorrowing: false
        });
        (bool allowed, PolicyEngine.DecisionCode code) = PolicyEngine(policyAddress).checkAction(agentAddress, action);
        require(allowed, "coordination capability is not policy allowed");
        require(code == PolicyEngine.DecisionCode.Allowed, "unexpected coordination policy code");
    }

    function coordinationActionData(bytes32 capability) private pure returns (bytes memory) {
        if (capability == COORDINATION_ACCEPT) {
            return abi.encodeWithSelector(AgentCoordination.acceptAssignmentByAssignee.selector, uint256(0));
        }

        return abi.encodeWithSelector(
            AgentCoordination.completeAssignmentByAssigneeWithMemory.selector,
            uint256(0),
            bytes32(uint256(1)),
            bytes32(uint256(1))
        );
    }

    function verifyResultMemory(address memoryRegistryAddress, ExpectedAssignment memory expected) private view {
        (bytes32 merkleRoot,,, uint256 version,,) =
            MemoryRegistry(memoryRegistryAddress).commitments(expected.assignee, expected.resultMemoryId);

        require(version > 0, "result memory missing");
        require(merkleRoot == expected.resultMerkleRoot, "result memory root mismatch");
    }

    function assignmentMatches(AgentCoordination coordination, uint256 assignmentId, ExpectedAssignment memory expected)
        private
        view
        returns (bool)
    {
        (
            address assigner,
            address assignee,
            bytes32 taskHash,
            bytes32 contextHash,
            AgentCoordination.AssignmentStatus status,
            address acceptedBy,
            address completedBy,
            bytes32 resultHash,,,
        ) = coordination.assignmentOf(assignmentId);

        return assigner == expected.assigner && assignee == expected.assignee && taskHash == expected.taskHash
            && contextHash == expected.contextHash && status == AgentCoordination.AssignmentStatus.Completed
            && acceptedBy == expected.assignee && completedBy == expected.assignee && resultHash == expected.resultHash
            && assignmentMemoryMatches(coordination, assignmentId, expected);
    }

    function assignmentMemoryMatches(
        AgentCoordination coordination,
        uint256 assignmentId,
        ExpectedAssignment memory expected
    ) private view returns (bool) {
        (bytes32 resultMemoryId, bytes32 resultMerkleRoot) = coordination.assignmentMemoryResultOf(assignmentId);
        return resultMemoryId == expected.resultMemoryId && resultMerkleRoot == expected.resultMerkleRoot;
    }
}
