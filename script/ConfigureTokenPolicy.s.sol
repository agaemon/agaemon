// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface ConfigureTokenPolicyVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigureTokenPolicy {
    ConfigureTokenPolicyVm private constant vm =
        ConfigureTokenPolicyVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant ERC20_TRANSFER = keccak256("ERC20_TRANSFER");

    event TokenPolicyConfigured(address indexed agent, address indexed token);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address tokenAddress = vm.envAddress("TEST_ERC20_TOKEN");

        vm.startBroadcast(privateKey);

        CapabilityRegistry(registryAddress).setCapability(ERC20_TRANSFER, tokenAddress, true);
        PolicyEngine(policyAddress).setTokenPolicy(agentAddress, tokenAddress, 10 ether, 15 ether);

        emit TokenPolicyConfigured(agentAddress, tokenAddress);

        vm.stopBroadcast();
    }
}
