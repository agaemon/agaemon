// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentDirectory} from "../src/AgentDirectory.sol";

interface RegisterAgentProfileVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract RegisterAgentProfile {
    RegisterAgentProfileVm private constant vm =
        RegisterAgentProfileVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event AgentProfileRegistered(address indexed directory, address indexed agent, bytes32 roleHash, bytes32 metadataURIHash);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address directoryAddress = vm.envAddress("AGENT_DIRECTORY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        bytes32 roleHash = keccak256(bytes(vm.envString("AGENT_ROLE_LABEL")));
        bytes32 metadataURIHash = keccak256(bytes(vm.envString("AGENT_METADATA_URI")));

        vm.startBroadcast(privateKey);

        AgentDirectory(directoryAddress).registerAgent(agentAddress, roleHash, metadataURIHash, true);
        emit AgentProfileRegistered(directoryAddress, agentAddress, roleHash, metadataURIHash);

        vm.stopBroadcast();
    }
}
