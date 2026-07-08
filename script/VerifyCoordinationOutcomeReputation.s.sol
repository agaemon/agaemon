// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";
import {ReputationHistory} from "../src/ReputationHistory.sol";

interface VerifyCoordinationOutcomeReputationVm {
    function envAddress(string calldata name) external view returns (address);
    function envInt(string calldata name) external view returns (int256);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
}

contract VerifyCoordinationOutcomeReputation {
    VerifyCoordinationOutcomeReputationVm private constant vm =
        VerifyCoordinationOutcomeReputationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address historyAddress = vm.envAddress("REPUTATION_HISTORY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        bytes32 expectedActionHash = keccak256(bytes(vm.envString("COORDINATION_OUTCOME_ACTION_LABEL")));
        int256 expectedScoreDelta = vm.envInt("COORDINATION_OUTCOME_REPUTATION_DELTA");
        (address assignee, bytes32 expectedEvidenceHash) = verifiedOutcome(coordinationAddress, assignmentId);

        ReputationHistory history = ReputationHistory(historyAddress);
        uint256 eventCount = history.eventCountOf(assignee);
        require(eventCount > 0, "assignee has no reputation events");

        bool found;
        for (uint256 eventId = 0; eventId < eventCount; eventId++) {
            (bytes32 actionHash, bytes32 evidenceHash, int256 scoreDelta,) = history.eventOf(assignee, eventId);
            if (
                actionHash == expectedActionHash && evidenceHash == expectedEvidenceHash
                    && scoreDelta == expectedScoreDelta
            ) {
                found = true;
            }
        }

        require(found, "expected coordination outcome reputation event missing");
    }

    function verifiedOutcome(address coordinationAddress, uint256 assignmentId)
        private
        view
        returns (address assignee, bytes32 evidenceHash)
    {
        AgentCoordination coordination = AgentCoordination(coordinationAddress);
        (
            ,
            address storedAssignee,,,
            AgentCoordination.AssignmentStatus status,,
            address completedBy,
            bytes32 resultHash,,,
        ) = coordination.assignmentOf(assignmentId);
        (bytes32 resultMemoryId, bytes32 resultMerkleRoot) = coordination.assignmentMemoryResultOf(assignmentId);

        require(status == AgentCoordination.AssignmentStatus.Completed, "assignment not completed");
        require(completedBy == storedAssignee, "assignment not completed by assignee");

        return (
            storedAssignee,
            keccak256(
                abi.encode(
                    coordinationAddress, assignmentId, storedAssignee, resultHash, resultMemoryId, resultMerkleRoot
                )
            )
        );
    }
}
