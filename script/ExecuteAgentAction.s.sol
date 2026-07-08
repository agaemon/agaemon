// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgent} from "../src/interfaces/IAgent.sol";
import {TestTargetProtocol} from "../src/testsupport/TestTargetProtocol.sol";

interface ExecuteAgentActionVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ExecuteAgentAction {
    ExecuteAgentActionVm private constant vm =
        ExecuteAgentActionVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant SWAP = keccak256("SWAP");

    event AgentActionExecuted(address indexed agent, address indexed target);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address targetAddress = vm.envAddress("TEST_TARGET_PROTOCOL");

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: targetAddress,
            value: 0,
            data: abi.encodeCall(TestTargetProtocol.mark, ()),
            usesBorrowing: false
        });

        vm.startBroadcast(privateKey);

        IAgent(agentAddress).execute(action);

        emit AgentActionExecuted(agentAddress, targetAddress);

        vm.stopBroadcast();
    }
}
