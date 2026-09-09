// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";
import {AgentDirectory} from "../src/AgentDirectory.sol";
import {MemoryRegistry} from "../src/MemoryRegistry.sol";

interface AgentCoordinationTestVm {
    function expectRevert(bytes4 revertData) external;
}

contract AgentCoordinationTest {
    AgentCoordinationTestVm private constant vm =
        AgentCoordinationTestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    AgentDirectory private directory;
    MemoryRegistry private memoryRegistry;
    AgentCoordination private coordination;
    AgentCoordinationCaller private caller;
    AgentCoordinationCaller private assigneeCaller;

    address private assigner = address(0xA11CE);
    address private assignee = address(0xB0B);
    address private unregisteredAgent = address(0xCAFE);
    bytes32 private roleHash = keccak256("agentos.kernel.operator");
    bytes32 private metadataURIHash = keccak256("agentos://base-sepolia/agent-account/v1");
    bytes32 private taskHash = keccak256("agentos.kernel.directory-profile-audit");
    bytes32 private contextHash = keccak256("agentos://base-sepolia/coordination/directory-profile-audit/v1");
    bytes32 private resultHash = keccak256("agentos://base-sepolia/coordination/directory-profile-audit/result/v1");
    bytes32 private resultMemoryId = keccak256("agentos.coordination.directory-profile-audit.result");
    bytes32 private resultMerkleRoot = keccak256("AgentOS coordination result memory");
    bytes32 private resultContentHash = resultMerkleRoot;
    bytes32 private resultStorageURIHash =
        keccak256("memory://agentos/base-sepolia/coordination/directory-profile-audit/result/v1");
    bytes32 private cancellationHash =
        keccak256("agentos://base-sepolia/coordination/directory-profile-audit/cancelled/v1");

    function setUp() public {
        directory = new AgentDirectory();
        memoryRegistry = new MemoryRegistry();
        coordination = new AgentCoordination(address(directory), address(memoryRegistry));
        caller = new AgentCoordinationCaller();
        assigneeCaller = new AgentCoordinationCaller();

        directory.registerAgent(assigner, roleHash, metadataURIHash, true);
        directory.registerAgent(assignee, roleHash, metadataURIHash, true);
        directory.registerAgent(address(assigneeCaller), roleHash, metadataURIHash, true);
    }

    function testConstructorRejectsZeroMemoryRegistry() public {
        vm.expectRevert(AgentCoordination.InvalidMemoryRegistry.selector);
        new AgentCoordination(address(directory), address(0));
    }

    function testOwnerCanCreateAssignmentForActiveAgents() public {
        uint256 assignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);

        require(assignmentId == 0, "first assignment id mismatch");
        require(coordination.assignmentCount() == 1, "assignment count mismatch");

        (
            address storedAssigner,
            address storedAssignee,
            bytes32 storedTaskHash,
            bytes32 storedContextHash,
            AgentCoordination.AssignmentStatus storedStatus,
            address acceptedBy,
            address completedBy,
            bytes32 storedResultHash,
            bytes32 storedCancellationHash,
            uint256 createdAt,
            uint256 updatedAt
        ) = coordination.assignmentOf(assignmentId);

        require(storedAssigner == assigner, "assigner mismatch");
        require(storedAssignee == assignee, "assignee mismatch");
        require(storedTaskHash == taskHash, "task hash mismatch");
        require(storedContextHash == contextHash, "context hash mismatch");
        require(storedStatus == AgentCoordination.AssignmentStatus.Created, "status mismatch");
        require(acceptedBy == address(0), "accepted by mismatch");
        require(completedBy == address(0), "completed by mismatch");
        require(storedResultHash == bytes32(0), "result hash mismatch");
        require(storedCancellationHash == bytes32(0), "cancellation hash mismatch");
        require(createdAt == block.timestamp, "timestamp mismatch");
        require(updatedAt == block.timestamp, "updated timestamp mismatch");

        (bytes32 storedResultMemoryId, bytes32 storedResultMerkleRoot) =
            coordination.assignmentMemoryResultOf(assignmentId);
        require(storedResultMemoryId == bytes32(0), "result memory id mismatch");
        require(storedResultMerkleRoot == bytes32(0), "result merkle root mismatch");
    }

    function testOwnerCanAcceptAndCompleteAssignment() public {
        uint256 assignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);

        coordination.acceptAssignment(assignmentId);
        (,,,, AgentCoordination.AssignmentStatus acceptedStatus, address acceptedBy,,,,, uint256 acceptedAt) =
            coordination.assignmentOf(assignmentId);

        require(acceptedStatus == AgentCoordination.AssignmentStatus.Accepted, "assignment not accepted");
        require(acceptedBy == address(this), "owner accepted by mismatch");
        require(acceptedAt == block.timestamp, "accepted timestamp mismatch");

        coordination.completeAssignment(assignmentId, resultHash);
        (,,,, AgentCoordination.AssignmentStatus completedStatus,, address completedBy, bytes32 storedResultHash,,,) =
            coordination.assignmentOf(assignmentId);

        require(completedStatus == AgentCoordination.AssignmentStatus.Completed, "assignment not completed");
        require(completedBy == address(this), "owner completed by mismatch");
        require(storedResultHash == resultHash, "result hash mismatch");
        (bytes32 storedResultMemoryId, bytes32 storedResultMerkleRoot) =
            coordination.assignmentMemoryResultOf(assignmentId);
        require(storedResultMemoryId == bytes32(0), "plain result memory id mismatch");
        require(storedResultMerkleRoot == bytes32(0), "plain result merkle root mismatch");
    }

    function testAssigneeCanAcceptAssignmentThroughAgentAccount() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);

        (bool ok,) = assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);
        (,,,, AgentCoordination.AssignmentStatus status, address acceptedBy,,,,,) =
            coordination.assignmentOf(assignmentId);

        require(ok, "assignee accept should pass");
        require(status == AgentCoordination.AssignmentStatus.Accepted, "assignment not accepted");
        require(acceptedBy == address(assigneeCaller), "assignee accepted by mismatch");
    }

    function testOnlyActiveAssigneeCanAcceptThroughAgentAccount() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);

        (bool nonAssigneeOk,) = caller.acceptAssignmentByAssignee(address(coordination), assignmentId);

        directory.setActive(address(assigneeCaller), false);
        (bool inactiveAssigneeOk,) = assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);

        require(!nonAssigneeOk, "non-assignee accept should fail");
        require(!inactiveAssigneeOk, "inactive assignee accept should fail");
    }

    function testAssigneeCanCompleteAssignmentThroughAgentAccount() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);

        assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);
        (bool ok,) = assigneeCaller.completeAssignmentByAssignee(address(coordination), assignmentId, resultHash);
        (,,,, AgentCoordination.AssignmentStatus status,, address completedBy, bytes32 storedResultHash,,,) =
            coordination.assignmentOf(assignmentId);

        require(ok, "assignee complete should pass");
        require(status == AgentCoordination.AssignmentStatus.Completed, "assignment not completed");
        require(completedBy == address(assigneeCaller), "assignee completed by mismatch");
        require(storedResultHash == resultHash, "result hash mismatch");
    }

    function testAssigneeCanCompleteAssignmentWithCommittedMemory() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);

        assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);
        assigneeCaller.commitMemory(
            address(memoryRegistry), resultMemoryId, resultMerkleRoot, resultContentHash, resultStorageURIHash
        );
        (bool ok,) = assigneeCaller.completeAssignmentByAssigneeWithMemory(
            address(coordination), assignmentId, resultMemoryId, resultMerkleRoot
        );
        (,,,, AgentCoordination.AssignmentStatus status,, address completedBy, bytes32 storedResultHash,,,) =
            coordination.assignmentOf(assignmentId);
        (bytes32 storedResultMemoryId, bytes32 storedResultMerkleRoot) =
            coordination.assignmentMemoryResultOf(assignmentId);

        require(ok, "memory-backed complete should pass");
        require(status == AgentCoordination.AssignmentStatus.Completed, "assignment not completed");
        require(completedBy == address(assigneeCaller), "assignee completed by mismatch");
        require(
            storedResultHash == coordination.memoryResultHash(resultMemoryId, resultMerkleRoot), "result hash mismatch"
        );
        require(storedResultMemoryId == resultMemoryId, "result memory id mismatch");
        require(storedResultMerkleRoot == resultMerkleRoot, "result merkle root mismatch");
    }

    function testAssigneeMemoryCompletionRequiresCommittedMemory() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);
        assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);

        (bool ok,) = assigneeCaller.completeAssignmentByAssigneeWithMemory(
            address(coordination), assignmentId, resultMemoryId, resultMerkleRoot
        );

        require(!ok, "missing memory commitment should fail");
    }

    function testAssigneeMemoryCompletionRejectsRootMismatch() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);
        assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);
        assigneeCaller.commitMemory(
            address(memoryRegistry), resultMemoryId, resultMerkleRoot, resultContentHash, resultStorageURIHash
        );

        (bool ok,) = assigneeCaller.completeAssignmentByAssigneeWithMemory(
            address(coordination), assignmentId, resultMemoryId, keccak256("different root")
        );

        require(!ok, "memory root mismatch should fail");
    }

    function testOnlyActiveAssigneeCanCompleteThroughAgentAccount() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);
        assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);

        (bool nonAssigneeOk,) = caller.completeAssignmentByAssignee(address(coordination), assignmentId, resultHash);

        directory.setActive(address(assigneeCaller), false);
        (bool inactiveAssigneeOk,) =
            assigneeCaller.completeAssignmentByAssignee(address(coordination), assignmentId, resultHash);

        require(!nonAssigneeOk, "non-assignee complete should fail");
        require(!inactiveAssigneeOk, "inactive assignee complete should fail");
    }

    function testAssigneeCompletionRequiresEvidence() public {
        uint256 assignmentId = coordination.createAssignment(assigner, address(assigneeCaller), taskHash, contextHash);
        assigneeCaller.acceptAssignmentByAssignee(address(coordination), assignmentId);

        (bool ok,) = assigneeCaller.completeAssignmentByAssignee(address(coordination), assignmentId, bytes32(0));

        require(!ok, "zero evidence complete should fail");
    }

    function testOwnerCanCancelAssignmentWithReason() public {
        uint256 assignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);

        coordination.cancelAssignment(assignmentId, cancellationHash);
        (,,,, AgentCoordination.AssignmentStatus status,,,, bytes32 storedCancellationHash,,) =
            coordination.assignmentOf(assignmentId);

        require(status == AgentCoordination.AssignmentStatus.Cancelled, "assignment not cancelled");
        require(storedCancellationHash == cancellationHash, "cancellation hash mismatch");
    }

    function testLifecycleRejectsInvalidAssignmentsAndEvidence() public {
        uint256 assignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);

        (bool missingAcceptOk,) = address(coordination).call(abi.encodeCall(AgentCoordination.acceptAssignment, (1)));
        (bool missingCompleteOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.completeAssignment, (1, resultHash)));
        (bool missingCancelOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.cancelAssignment, (1, cancellationHash)));
        (bool zeroResultOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.completeAssignment, (assignmentId, bytes32(0))));
        (bool zeroCancellationOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.cancelAssignment, (assignmentId, bytes32(0))));

        require(!missingAcceptOk, "missing assignment accept should fail");
        require(!missingCompleteOk, "missing assignment complete should fail");
        require(!missingCancelOk, "missing assignment cancel should fail");
        require(!zeroResultOk, "zero result should fail");
        require(!zeroCancellationOk, "zero cancellation should fail");
    }

    function testCannotCompleteBeforeAcceptance() public {
        uint256 assignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);

        (bool ok,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.completeAssignment, (assignmentId, resultHash)));

        require(!ok, "completion before acceptance should fail");
    }

    function testTerminalAssignmentsCannotChange() public {
        uint256 completedAssignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);
        coordination.acceptAssignment(completedAssignmentId);
        coordination.completeAssignment(completedAssignmentId, resultHash);

        uint256 cancelledAssignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);
        coordination.cancelAssignment(cancelledAssignmentId, cancellationHash);

        (bool acceptCompletedOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.acceptAssignment, (completedAssignmentId)));
        (bool completeCompletedOk,) = address(coordination)
            .call(abi.encodeCall(AgentCoordination.completeAssignment, (completedAssignmentId, resultHash)));
        (bool cancelCompletedOk,) = address(coordination)
            .call(abi.encodeCall(AgentCoordination.cancelAssignment, (completedAssignmentId, cancellationHash)));
        (bool acceptCancelledOk,) =
            address(coordination).call(abi.encodeCall(AgentCoordination.acceptAssignment, (cancelledAssignmentId)));

        require(!acceptCompletedOk, "completed assignment accept should fail");
        require(!completeCompletedOk, "completed assignment complete should fail");
        require(!cancelCompletedOk, "completed assignment cancel should fail");
        require(!acceptCancelledOk, "cancelled assignment accept should fail");
    }

    function testNonOwnerCannotCreateAssignment() public {
        (bool ok,) = caller.createAssignment(address(coordination), assigner, assignee, taskHash, contextHash);

        require(!ok, "non-owner assignment should fail");
        require(coordination.assignmentCount() == 0, "assignment should not be stored");
    }

    function testNonOwnerCannotUpdateLifecycle() public {
        uint256 assignmentId = coordination.createAssignment(assigner, assignee, taskHash, contextHash);

        (bool acceptOk,) = caller.acceptAssignment(address(coordination), assignmentId);
        (bool completeOk,) = caller.completeAssignment(address(coordination), assignmentId, resultHash);
        (bool cancelOk,) = caller.cancelAssignment(address(coordination), assignmentId, cancellationHash);

        require(!acceptOk, "non-owner accept should fail");
        require(!completeOk, "non-owner complete should fail");
        require(!cancelOk, "non-owner cancel should fail");
    }

    function testInactiveOrUnregisteredParticipantsAreRejected() public {
        (bool unregisteredAssignerOk,) = address(coordination)
            .call(
                abi.encodeCall(AgentCoordination.createAssignment, (unregisteredAgent, assignee, taskHash, contextHash))
            );
        (bool unregisteredAssigneeOk,) = address(coordination)
            .call(
                abi.encodeCall(AgentCoordination.createAssignment, (assigner, unregisteredAgent, taskHash, contextHash))
            );

        directory.setActive(assignee, false);
        (bool inactiveAssigneeOk,) = address(coordination)
            .call(abi.encodeCall(AgentCoordination.createAssignment, (assigner, assignee, taskHash, contextHash)));

        require(!unregisteredAssignerOk, "unregistered assigner should fail");
        require(!unregisteredAssigneeOk, "unregistered assignee should fail");
        require(!inactiveAssigneeOk, "inactive assignee should fail");
    }

    function testInvalidAssignmentFieldsAreRejected() public {
        (bool zeroAssignerOk,) = address(coordination)
            .call(abi.encodeCall(AgentCoordination.createAssignment, (address(0), assignee, taskHash, contextHash)));
        (bool zeroAssigneeOk,) = address(coordination)
            .call(abi.encodeCall(AgentCoordination.createAssignment, (assigner, address(0), taskHash, contextHash)));
        (bool zeroTaskOk,) = address(coordination)
            .call(abi.encodeCall(AgentCoordination.createAssignment, (assigner, assignee, bytes32(0), contextHash)));
        (bool zeroContextOk,) = address(coordination)
            .call(abi.encodeCall(AgentCoordination.createAssignment, (assigner, assignee, taskHash, bytes32(0))));

        require(!zeroAssignerOk, "zero assigner should fail");
        require(!zeroAssigneeOk, "zero assignee should fail");
        require(!zeroTaskOk, "zero task should fail");
        require(!zeroContextOk, "zero context should fail");
    }
}

contract AgentCoordinationCaller {
    function createAssignment(
        address coordination,
        address assigner,
        address assignee,
        bytes32 taskHash,
        bytes32 contextHash
    ) external returns (bool ok, bytes memory result) {
        return coordination.call(
            abi.encodeCall(AgentCoordination.createAssignment, (assigner, assignee, taskHash, contextHash))
        );
    }

    function acceptAssignment(address coordination, uint256 assignmentId)
        external
        returns (bool ok, bytes memory result)
    {
        return coordination.call(abi.encodeCall(AgentCoordination.acceptAssignment, (assignmentId)));
    }

    function acceptAssignmentByAssignee(address coordination, uint256 assignmentId)
        external
        returns (bool ok, bytes memory result)
    {
        return coordination.call(abi.encodeCall(AgentCoordination.acceptAssignmentByAssignee, (assignmentId)));
    }

    function completeAssignment(address coordination, uint256 assignmentId, bytes32 resultHash)
        external
        returns (bool ok, bytes memory result)
    {
        return coordination.call(abi.encodeCall(AgentCoordination.completeAssignment, (assignmentId, resultHash)));
    }

    function completeAssignmentByAssignee(address coordination, uint256 assignmentId, bytes32 resultHash)
        external
        returns (bool ok, bytes memory result)
    {
        return coordination.call(
            abi.encodeCall(AgentCoordination.completeAssignmentByAssignee, (assignmentId, resultHash))
        );
    }

    function completeAssignmentByAssigneeWithMemory(
        address coordination,
        uint256 assignmentId,
        bytes32 memoryId,
        bytes32 merkleRoot
    ) external returns (bool ok, bytes memory result) {
        return coordination.call(
            abi.encodeCall(
                AgentCoordination.completeAssignmentByAssigneeWithMemory, (assignmentId, memoryId, merkleRoot)
            )
        );
    }

    function commitMemory(
        address memoryRegistry,
        bytes32 memoryId,
        bytes32 merkleRoot,
        bytes32 contentHash,
        bytes32 storageURIHash
    ) external returns (bool ok, bytes memory result) {
        return memoryRegistry.call(
            abi.encodeCall(MemoryRegistry.commitMemory, (memoryId, merkleRoot, contentHash, storageURIHash))
        );
    }

    function cancelAssignment(address coordination, uint256 assignmentId, bytes32 cancellationHash)
        external
        returns (bool ok, bytes memory result)
    {
        return coordination.call(abi.encodeCall(AgentCoordination.cancelAssignment, (assignmentId, cancellationHash)));
    }
}
