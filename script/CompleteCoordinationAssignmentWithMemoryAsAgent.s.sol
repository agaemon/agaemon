// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {AgentCoordination} from "../src/AgentCoordination.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";

interface CompleteCoordinationAssignmentWithMemoryAsAgentVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract CompleteCoordinationAssignmentWithMemoryAsAgent {
    CompleteCoordinationAssignmentWithMemoryAsAgentVm private constant vm =
        CompleteCoordinationAssignmentWithMemoryAsAgentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant COORDINATION_COMPLETE = keccak256("COORDINATION_COMPLETE");

    event CoordinationAssignmentCompletedWithMemoryAsAgent(
        address indexed agent,
        address indexed coordination,
        uint256 indexed assignmentId,
        bytes32 memoryId,
        bytes32 merkleRoot
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        bytes32 memoryId = keccak256(bytes(vm.envString("COORDINATION_RESULT_MEMORY_ID_LABEL")));
        bytes32 merkleRoot = keccak256(bytes(vm.envString("COORDINATION_RESULT_CONTENT")));

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: COORDINATION_COMPLETE,
            target: coordinationAddress,
            value: 0,
            data: abi.encodeWithSelector(
                AgentCoordination.completeAssignmentByAssigneeWithMemory.selector, assignmentId, memoryId, merkleRoot
            ),
            usesBorrowing: false
        });

        vm.startBroadcast(privateKey);

        AgentAccount(payable(agentAddress)).execute(action);
        emit CoordinationAssignmentCompletedWithMemoryAsAgent(
            agentAddress, coordinationAddress, assignmentId, memoryId, merkleRoot
        );

        vm.stopBroadcast();
    }
}
