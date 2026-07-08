// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "./lib/Owned.sol";

interface IAgentCoordinationDirectory {
    function profileOf(address agent)
        external
        view
        returns (bytes32 roleHash, bytes32 metadataURIHash, bool active, bool registered);
}

interface IAgentCoordinationMemoryRegistry {
    function commitments(address agent, bytes32 memoryId)
        external
        view
        returns (
            bytes32 merkleRoot,
            bytes32 contentHash,
            bytes32 storageURIHash,
            uint256 version,
            uint256 blockNumber,
            uint256 timestamp
        );
}

contract AgentCoordination is Owned {
    enum AssignmentStatus {
        Created,
        Accepted,
        Completed,
        Cancelled
    }

    struct Assignment {
        address assigner;
        address assignee;
        bytes32 taskHash;
        bytes32 contextHash;
        AssignmentStatus status;
        address acceptedBy;
        address completedBy;
        bytes32 resultHash;
        bytes32 resultMemoryId;
        bytes32 resultMerkleRoot;
        bytes32 cancellationHash;
        uint256 createdAt;
        uint256 updatedAt;
    }

    IAgentCoordinationDirectory public immutable agentDirectory;
    IAgentCoordinationMemoryRegistry public immutable memoryRegistry;

    Assignment[] private assignments;

    event AssignmentCreated(
        uint256 indexed assignmentId,
        address indexed assigner,
        address indexed assignee,
        bytes32 taskHash,
        bytes32 contextHash
    );
    event AssignmentAccepted(uint256 indexed assignmentId, address indexed acceptedBy);
    event AssignmentCompleted(uint256 indexed assignmentId, bytes32 resultHash);
    event AssignmentMemoryResultLinked(uint256 indexed assignmentId, bytes32 indexed memoryId, bytes32 merkleRoot);
    event AssignmentCancelled(uint256 indexed assignmentId, bytes32 cancellationHash);

    error InvalidDirectory();
    error InvalidMemoryRegistry();
    error InvalidAssigner();
    error InvalidAssignee();
    error InvalidTask();
    error InvalidContext();
    error InvalidEvidence();
    error InvalidMemoryProof();
    error InvalidAssignment();
    error InvalidAssignmentStatus();
    error UnauthorizedAssignee();
    error AgentProfileInactive();

    constructor(address directory, address registry) Owned(msg.sender) {
        if (directory == address(0)) revert InvalidDirectory();
        if (registry == address(0)) revert InvalidMemoryRegistry();

        agentDirectory = IAgentCoordinationDirectory(directory);
        memoryRegistry = IAgentCoordinationMemoryRegistry(registry);
    }

    function createAssignment(address assigner, address assignee, bytes32 taskHash, bytes32 contextHash)
        external
        onlyOwner
        returns (uint256 assignmentId)
    {
        if (assigner == address(0)) revert InvalidAssigner();
        if (assignee == address(0)) revert InvalidAssignee();
        if (taskHash == bytes32(0)) revert InvalidTask();
        if (contextHash == bytes32(0)) revert InvalidContext();

        requireActiveAgent(assigner);
        requireActiveAgent(assignee);

        assignmentId = assignments.length;
        assignments.push(
            Assignment({
                assigner: assigner,
                assignee: assignee,
                taskHash: taskHash,
                contextHash: contextHash,
                status: AssignmentStatus.Created,
                acceptedBy: address(0),
                completedBy: address(0),
                resultHash: bytes32(0),
                resultMemoryId: bytes32(0),
                resultMerkleRoot: bytes32(0),
                cancellationHash: bytes32(0),
                createdAt: block.timestamp,
                updatedAt: block.timestamp
            })
        );

        emit AssignmentCreated(assignmentId, assigner, assignee, taskHash, contextHash);
    }

    function acceptAssignment(uint256 assignmentId) external onlyOwner {
        Assignment storage assignment = requireAssignment(assignmentId);
        acceptAssignment(assignmentId, assignment, msg.sender);
    }

    function acceptAssignmentByAssignee(uint256 assignmentId) external {
        Assignment storage assignment = requireAssignment(assignmentId);
        if (msg.sender != assignment.assignee) revert UnauthorizedAssignee();

        requireActiveAgent(msg.sender);
        acceptAssignment(assignmentId, assignment, msg.sender);
    }

    function completeAssignment(uint256 assignmentId, bytes32 resultHash) external onlyOwner {
        Assignment storage assignment = requireAssignment(assignmentId);
        completeAssignment(assignmentId, assignment, msg.sender, resultHash);
    }

    function completeAssignmentByAssignee(uint256 assignmentId, bytes32 resultHash) external {
        Assignment storage assignment = requireAssignment(assignmentId);
        if (msg.sender != assignment.assignee) revert UnauthorizedAssignee();

        requireActiveAgent(msg.sender);
        completeAssignment(assignmentId, assignment, msg.sender, resultHash);
    }

    function completeAssignmentByAssigneeWithMemory(uint256 assignmentId, bytes32 memoryId, bytes32 merkleRoot)
        external
    {
        Assignment storage assignment = requireAssignment(assignmentId);
        if (msg.sender != assignment.assignee) revert UnauthorizedAssignee();

        requireActiveAgent(msg.sender);
        completeAssignmentWithMemory(assignmentId, assignment, msg.sender, memoryId, merkleRoot);
    }

    function cancelAssignment(uint256 assignmentId, bytes32 cancellationHash) external onlyOwner {
        if (cancellationHash == bytes32(0)) revert InvalidEvidence();

        Assignment storage assignment = requireAssignment(assignmentId);
        if (assignment.status != AssignmentStatus.Created && assignment.status != AssignmentStatus.Accepted) {
            revert InvalidAssignmentStatus();
        }

        assignment.status = AssignmentStatus.Cancelled;
        assignment.cancellationHash = cancellationHash;
        assignment.updatedAt = block.timestamp;

        emit AssignmentCancelled(assignmentId, cancellationHash);
    }

    function assignmentCount() external view returns (uint256) {
        return assignments.length;
    }

    function assignmentOf(uint256 assignmentId)
        external
        view
        returns (
            address assigner,
            address assignee,
            bytes32 taskHash,
            bytes32 contextHash,
            AssignmentStatus status,
            address acceptedBy,
            address completedBy,
            bytes32 resultHash,
            bytes32 cancellationHash,
            uint256 createdAt,
            uint256 updatedAt
        )
    {
        Assignment storage assignment = assignments[assignmentId];
        return (
            assignment.assigner,
            assignment.assignee,
            assignment.taskHash,
            assignment.contextHash,
            assignment.status,
            assignment.acceptedBy,
            assignment.completedBy,
            assignment.resultHash,
            assignment.cancellationHash,
            assignment.createdAt,
            assignment.updatedAt
        );
    }

    function assignmentMemoryResultOf(uint256 assignmentId)
        external
        view
        returns (bytes32 resultMemoryId, bytes32 resultMerkleRoot)
    {
        Assignment storage assignment = assignments[assignmentId];
        return (assignment.resultMemoryId, assignment.resultMerkleRoot);
    }

    function memoryResultHash(bytes32 memoryId, bytes32 merkleRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(memoryId, merkleRoot));
    }

    function acceptAssignment(uint256 assignmentId, Assignment storage assignment, address acceptedBy) private {
        if (assignment.status != AssignmentStatus.Created) revert InvalidAssignmentStatus();

        assignment.status = AssignmentStatus.Accepted;
        assignment.acceptedBy = acceptedBy;
        assignment.updatedAt = block.timestamp;

        emit AssignmentAccepted(assignmentId, acceptedBy);
    }

    function completeAssignment(
        uint256 assignmentId,
        Assignment storage assignment,
        address completedBy,
        bytes32 resultHash
    ) private {
        completeAssignment(assignmentId, assignment, completedBy, resultHash, bytes32(0), bytes32(0));
    }

    function completeAssignment(
        uint256 assignmentId,
        Assignment storage assignment,
        address completedBy,
        bytes32 resultHash,
        bytes32 resultMemoryId,
        bytes32 resultMerkleRoot
    ) private {
        if (resultHash == bytes32(0)) revert InvalidEvidence();
        if (assignment.status != AssignmentStatus.Accepted) revert InvalidAssignmentStatus();

        assignment.status = AssignmentStatus.Completed;
        assignment.completedBy = completedBy;
        assignment.resultHash = resultHash;
        assignment.resultMemoryId = resultMemoryId;
        assignment.resultMerkleRoot = resultMerkleRoot;
        assignment.updatedAt = block.timestamp;

        emit AssignmentCompleted(assignmentId, resultHash);
    }

    function completeAssignmentWithMemory(
        uint256 assignmentId,
        Assignment storage assignment,
        address completedBy,
        bytes32 memoryId,
        bytes32 merkleRoot
    ) private {
        if (memoryId == bytes32(0) || merkleRoot == bytes32(0)) revert InvalidEvidence();

        (bytes32 storedMerkleRoot,,, uint256 version,,) = memoryRegistry.commitments(completedBy, memoryId);
        if (version == 0 || storedMerkleRoot != merkleRoot) revert InvalidMemoryProof();

        completeAssignment(
            assignmentId, assignment, completedBy, memoryResultHash(memoryId, merkleRoot), memoryId, merkleRoot
        );
        emit AssignmentMemoryResultLinked(assignmentId, memoryId, merkleRoot);
    }

    function requireAssignment(uint256 assignmentId) private view returns (Assignment storage assignment) {
        if (assignmentId >= assignments.length) revert InvalidAssignment();
        return assignments[assignmentId];
    }

    function requireActiveAgent(address agent) private view {
        (,, bool active, bool registered) = agentDirectory.profileOf(agent);
        if (!registered || !active) revert AgentProfileInactive();
    }
}
