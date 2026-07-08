// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentDirectory} from "../src/AgentDirectory.sol";
import {MemoryRegistry} from "../src/MemoryRegistry.sol";

interface VerifyAgentProfileMemoryVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
}

contract VerifyAgentProfileMemory {
    VerifyAgentProfileMemoryVm private constant vm =
        VerifyAgentProfileMemoryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address directoryAddress = vm.envAddress("AGENT_DIRECTORY");
        address registryAddress = vm.envAddress("MEMORY_REGISTRY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        bytes32 expectedRoleHash = keccak256(bytes(vm.envString("AGENT_ROLE_LABEL")));
        bytes32 expectedMetadataURIHash = keccak256(bytes(vm.envString("AGENT_METADATA_URI")));
        bytes32 expectedMemoryId = keccak256(bytes(vm.envString("AGENT_PROFILE_MEMORY_ID_LABEL")));

        AgentDirectory directory = AgentDirectory(directoryAddress);
        (bytes32 roleHash, bytes32 metadataURIHash, bool active, bool registered) = directory.profileOf(agentAddress);

        require(registered, "agent profile missing");
        require(active, "agent profile inactive");
        require(roleHash == expectedRoleHash, "role hash mismatch");
        require(metadataURIHash == expectedMetadataURIHash, "metadata URI hash mismatch");

        MemoryRegistry registry = MemoryRegistry(registryAddress);
        (bytes32 merkleRoot, bytes32 contentHash, bytes32 storageURIHash, uint256 version,,) =
            registry.commitments(agentAddress, expectedMemoryId);

        require(version > 0, "profile memory missing");
        require(merkleRoot != bytes32(0), "profile memory root missing");
        require(contentHash != bytes32(0), "profile content hash missing");
        require(storageURIHash == expectedMetadataURIHash, "profile storage URI hash mismatch");
    }
}
