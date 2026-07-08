// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";

interface CompleteCoordinationAssignmentVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract CompleteCoordinationAssignment {
    CompleteCoordinationAssignmentVm private constant vm =
        CompleteCoordinationAssignmentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CoordinationAssignmentCompleted(
        address indexed coordination, uint256 indexed assignmentId, bytes32 resultHash
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        bytes32 resultHash = keccak256(bytes(vm.envString("COORDINATION_RESULT_URI")));

        vm.startBroadcast(privateKey);

        AgentCoordination(coordinationAddress).completeAssignment(assignmentId, resultHash);
        emit CoordinationAssignmentCompleted(coordinationAddress, assignmentId, resultHash);

        vm.stopBroadcast();
    }
}
