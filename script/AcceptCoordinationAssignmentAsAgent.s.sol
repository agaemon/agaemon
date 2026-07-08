// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {AgentCoordination} from "../src/AgentCoordination.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";

interface AcceptCoordinationAssignmentAsAgentVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract AcceptCoordinationAssignmentAsAgent {
    AcceptCoordinationAssignmentAsAgentVm private constant vm =
        AcceptCoordinationAssignmentAsAgentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant COORDINATION_ACCEPT = keccak256("COORDINATION_ACCEPT");

    event CoordinationAssignmentAcceptedAsAgent(
        address indexed agent, address indexed coordination, uint256 indexed assignmentId
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: COORDINATION_ACCEPT,
            target: coordinationAddress,
            value: 0,
            data: abi.encodeWithSelector(AgentCoordination.acceptAssignmentByAssignee.selector, assignmentId),
            usesBorrowing: false
        });

        vm.startBroadcast(privateKey);

        AgentAccount(payable(agentAddress)).execute(action);
        emit CoordinationAssignmentAcceptedAsAgent(agentAddress, coordinationAddress, assignmentId);

        vm.stopBroadcast();
    }
}
