// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";

interface CreateCoordinationAssignmentVm {
    function envAddress(string calldata name) external view returns (address);
    function envOr(string calldata name, address defaultValue) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract CreateCoordinationAssignment {
    CreateCoordinationAssignmentVm private constant vm =
        CreateCoordinationAssignmentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CoordinationAssignmentCreated(
        address coordination,
        uint256 indexed assignmentId,
        address indexed assigner,
        address indexed assignee,
        bytes32 taskHash,
        bytes32 contextHash
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        address defaultAgent = vm.envAddress("AGENT_ACCOUNT");
        address assigner = vm.envOr("COORDINATION_ASSIGNER", defaultAgent);
        address assignee = vm.envOr("COORDINATION_ASSIGNEE", defaultAgent);
        bytes32 taskHash = keccak256(bytes(vm.envString("COORDINATION_TASK_LABEL")));
        bytes32 contextHash = keccak256(bytes(vm.envString("COORDINATION_CONTEXT_URI")));

        vm.startBroadcast(privateKey);

        uint256 assignmentId =
            AgentCoordination(coordinationAddress).createAssignment(assigner, assignee, taskHash, contextHash);
        emit CoordinationAssignmentCreated(coordinationAddress, assignmentId, assigner, assignee, taskHash, contextHash);

        vm.stopBroadcast();
    }
}
