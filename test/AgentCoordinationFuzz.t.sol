// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";
import {AgentDirectory} from "../src/AgentDirectory.sol";
import {MemoryRegistry} from "../src/MemoryRegistry.sol";

contract AgentCoordinationFuzzTest {
    AgentDirectory private directory;
    MemoryRegistry private memoryRegistry;
    AgentCoordination private coordination;

    address private assigner = address(0xA11CE);
    address private assignee = address(0xB0B);
    bytes32 private roleHash = keccak256("agentos.kernel.operator");
    bytes32 private metadataURIHash = keccak256("agentos://base-sepolia/agent-account/v1");
    bytes32 private taskHash = keccak256("agentos.kernel.fuzz.lifecycle");
    bytes32 private contextHash = keccak256("agentos://base-sepolia/coordination/fuzz/lifecycle");

    function setUp() public {
        directory = new AgentDirectory();
        memoryRegistry = new MemoryRegistry();
        coordination = new AgentCoordination(address(directory), address(memoryRegistry));

        directory.registerAgent(assigner, roleHash, metadataURIHash, true);
        directory.registerAgent(assignee, roleHash, metadataURIHash, true);
    }

    function testFuzzTerminalAssignmentCannotChange(
        bool cancelInsteadOfComplete,
        bytes32 rawResultHash,
        bytes32 rawCancellationHash
    ) public {
        bytes32 resultHash = nonzero(rawResultHash, "result");
        bytes32 cancellationHash = nonzero(rawCancellationHash, "cancel");
        uint256 assignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);

        coordination.acceptAssignment(assignmentId);
        if (cancelInsteadOfComplete) {
            coordination.cancelAssignment(assignmentId, cancellationHash);
        } else {
            coordination.completeAssignment(assignmentId, resultHash);
        }
        AgentCoordination.AssignmentStatus terminalStatus = statusOf(assignmentId);

        (bool acceptOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.acceptAssignment, (assignmentId)));
        (bool completeOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.completeAssignment, (assignmentId, resultHash)));
        (bool cancelOk,) = address(coordination).call(
            abi.encodeCall(AgentCoordination.cancelAssignment, (assignmentId, cancellationHash))
        );

        require(!acceptOk, "terminal assignment should not be accepted again");
        require(!completeOk, "terminal assignment should not be completed again");
        require(!cancelOk, "terminal assignment should not be cancelled again");
        require(statusOf(assignmentId) == terminalStatus, "terminal status should not change");
    }

    function statusOf(uint256 assignmentId) private view returns (AgentCoordination.AssignmentStatus status) {
        (,,,, status,,,,,,) = coordination.assignmentOf(assignmentId);
    }

    function nonzero(bytes32 value, string memory salt) private pure returns (bytes32) {
        return value == bytes32(0) ? keccak256(bytes(salt)) : value;
    }
}
