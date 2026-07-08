// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";

interface AcceptCoordinationAssignmentVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract AcceptCoordinationAssignment {
    AcceptCoordinationAssignmentVm private constant vm =
        AcceptCoordinationAssignmentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CoordinationAssignmentAccepted(address indexed coordination, uint256 indexed assignmentId);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");

        vm.startBroadcast(privateKey);

        AgentCoordination(coordinationAddress).acceptAssignment(assignmentId);
        emit CoordinationAssignmentAccepted(coordinationAddress, assignmentId);

        vm.stopBroadcast();
    }
}
