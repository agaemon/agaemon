// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationRegistry} from "../src/ReputationRegistry.sol";

interface VerifyReputationRegistryVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifyReputationRegistry {
    VerifyReputationRegistryVm private constant vm =
        VerifyReputationRegistryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address registryAddress = vm.envAddress("REPUTATION_REGISTRY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");

        ReputationRegistry registry = ReputationRegistry(registryAddress);
        require(registry.owner() != address(0), "owner is zero");
        registry.scoreOf(agentAddress);
    }
}
