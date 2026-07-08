// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {AgentCoordination} from "../src/AgentCoordination.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";

interface CompleteCoordinationAssignmentAsAgentVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract CompleteCoordinationAssignmentAsAgent {
    CompleteCoordinationAssignmentAsAgentVm private constant vm =
        CompleteCoordinationAssignmentAsAgentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant COORDINATION_COMPLETE = keccak256("COORDINATION_COMPLETE");

    event CoordinationAssignmentCompletedAsAgent(
        address indexed agent, address indexed coordination, uint256 indexed assignmentId, bytes32 resultHash
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        bytes32 resultHash = keccak256(bytes(vm.envString("COORDINATION_RESULT_URI")));

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: COORDINATION_COMPLETE,
            target: coordinationAddress,
            value: 0,
            data: abi.encodeWithSelector(
                AgentCoordination.completeAssignmentByAssignee.selector, assignmentId, resultHash
            ),
            usesBorrowing: false
        });

        vm.startBroadcast(privateKey);

        AgentAccount(payable(agentAddress)).execute(action);
        emit CoordinationAssignmentCompletedAsAgent(agentAddress, coordinationAddress, assignmentId, resultHash);

        vm.stopBroadcast();
    }
}
