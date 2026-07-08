// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface ConfigureSwapPolicyVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigureSwapPolicy {
    ConfigureSwapPolicyVm private constant vm =
        ConfigureSwapPolicyVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant SWAP_EXACT_ETH_FOR_TOKEN = keccak256("SWAP_EXACT_ETH_FOR_TOKEN");

    event SwapPolicyConfigured(address indexed agent, address indexed adapter, address indexed tokenOut);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address adapterAddress = vm.envAddress("MOCK_SWAP_ADAPTER");
        address tokenOut = vm.envAddress("TEST_ERC20_TOKEN");

        vm.startBroadcast(privateKey);

        CapabilityRegistry(registryAddress).setCapability(SWAP_EXACT_ETH_FOR_TOKEN, adapterAddress, true);
        PolicyEngine(policyAddress).setSwapPolicy(agentAddress, adapterAddress, tokenOut, 950 ether);

        emit SwapPolicyConfigured(agentAddress, adapterAddress, tokenOut);

        vm.stopBroadcast();
    }
}
