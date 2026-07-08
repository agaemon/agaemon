// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {MemoryRegistry} from "../src/MemoryRegistry.sol";

interface CommitCoordinationResultMemoryAsAgentVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract CommitCoordinationResultMemoryAsAgent {
    CommitCoordinationResultMemoryAsAgentVm private constant vm =
        CommitCoordinationResultMemoryAsAgentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant MEMORY_COMMIT = keccak256("MEMORY_COMMIT");

    event CoordinationResultMemoryCommitted(
        address indexed agent, address indexed memoryRegistry, bytes32 indexed memoryId, bytes32 merkleRoot
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address memoryRegistryAddress = vm.envAddress("MEMORY_REGISTRY");
        bytes32 memoryId = keccak256(bytes(vm.envString("COORDINATION_RESULT_MEMORY_ID_LABEL")));
        bytes32 contentHash = keccak256(bytes(vm.envString("COORDINATION_RESULT_CONTENT")));
        bytes32 storageURIHash = keccak256(bytes(vm.envString("COORDINATION_RESULT_STORAGE_URI")));

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: MEMORY_COMMIT,
            target: memoryRegistryAddress,
            value: 0,
            data: abi.encodeWithSelector(
                MemoryRegistry.commitMemory.selector, memoryId, contentHash, contentHash, storageURIHash
            ),
            usesBorrowing: false
        });

        vm.startBroadcast(privateKey);

        AgentAccount(payable(agentAddress)).execute(action);
        emit CoordinationResultMemoryCommitted(agentAddress, memoryRegistryAddress, memoryId, contentHash);

        vm.stopBroadcast();
    }
}
