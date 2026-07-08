// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

interface ConfigurePayoutCapabilityVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigurePayoutCapability {
    ConfigurePayoutCapabilityVm private constant vm =
        ConfigurePayoutCapabilityVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant PAYOUT = keccak256("PAYOUT");

    event PayoutCapabilityConfigured(address indexed registry, address indexed adapter);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address adapterAddress = vm.envAddress("PAYOUT_RULE_ADAPTER");

        vm.startBroadcast(privateKey);

        CapabilityRegistry(registryAddress).setCapability(PAYOUT, adapterAddress, true);
        emit PayoutCapabilityConfigured(registryAddress, adapterAddress);

        vm.stopBroadcast();
    }
}
