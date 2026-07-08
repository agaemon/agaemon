// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";

interface CancelCoordinationAssignmentVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract CancelCoordinationAssignment {
    CancelCoordinationAssignmentVm private constant vm =
        CancelCoordinationAssignmentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CoordinationAssignmentCancelled(
        address indexed coordination, uint256 indexed assignmentId, bytes32 cancellationHash
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        bytes32 cancellationHash = keccak256(bytes(vm.envString("COORDINATION_CANCELLATION_URI")));

        vm.startBroadcast(privateKey);

        AgentCoordination(coordinationAddress).cancelAssignment(assignmentId, cancellationHash);
        emit CoordinationAssignmentCancelled(coordinationAddress, assignmentId, cancellationHash);

        vm.stopBroadcast();
    }
}
