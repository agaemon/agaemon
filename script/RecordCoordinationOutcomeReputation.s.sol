// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";
import {ReputationHistory} from "../src/ReputationHistory.sol";

interface RecordCoordinationOutcomeReputationVm {
    function envAddress(string calldata name) external view returns (address);
    function envInt(string calldata name) external view returns (int256);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract RecordCoordinationOutcomeReputation {
    RecordCoordinationOutcomeReputationVm private constant vm =
        RecordCoordinationOutcomeReputationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CoordinationOutcomeReputationRecorded(
        address indexed history,
        address indexed coordination,
        uint256 indexed assignmentId,
        address agent,
        bytes32 evidenceHash,
        int256 scoreDelta
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address historyAddress = vm.envAddress("REPUTATION_HISTORY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        bytes32 actionHash = keccak256(bytes(vm.envString("COORDINATION_OUTCOME_ACTION_LABEL")));
        int256 scoreDelta = vm.envInt("COORDINATION_OUTCOME_REPUTATION_DELTA");

        (address assignee, bytes32 evidenceHash) = verifiedOutcome(coordinationAddress, assignmentId);

        vm.startBroadcast(privateKey);

        ReputationHistory(historyAddress).recordEvent(assignee, actionHash, evidenceHash, scoreDelta);
        emit CoordinationOutcomeReputationRecorded(
            historyAddress, coordinationAddress, assignmentId, assignee, evidenceHash, scoreDelta
        );

        vm.stopBroadcast();
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
