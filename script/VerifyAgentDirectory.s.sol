// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentDirectory} from "../src/AgentDirectory.sol";

interface VerifyAgentDirectoryVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
}

contract VerifyAgentDirectory {
    VerifyAgentDirectoryVm private constant vm =
        VerifyAgentDirectoryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address directoryAddress = vm.envAddress("AGENT_DIRECTORY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        bytes32 expectedRoleHash = keccak256(bytes(vm.envString("AGENT_ROLE_LABEL")));
        bytes32 expectedMetadataURIHash = keccak256(bytes(vm.envString("AGENT_METADATA_URI")));

        AgentDirectory directory = AgentDirectory(directoryAddress);
        require(directory.owner() != address(0), "directory owner is zero");

        (bytes32 roleHash, bytes32 metadataURIHash, bool active, bool registered) = directory.profileOf(agentAddress);
        require(registered, "agent is not registered");
        require(active, "agent is not active");
        require(roleHash == expectedRoleHash, "role hash mismatch");
        require(metadataURIHash == expectedMetadataURIHash, "metadata URI hash mismatch");
    }
}
