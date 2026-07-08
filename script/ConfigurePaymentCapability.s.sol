// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

interface ConfigurePaymentCapabilityVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigurePaymentCapability {
    ConfigurePaymentCapabilityVm private constant vm =
        ConfigurePaymentCapabilityVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant PAYMENT = keccak256("PAYMENT");

    event PaymentCapabilityConfigured(address indexed registry, address indexed adapter);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address adapterAddress = vm.envAddress("TREASURY_PAYMENT_ADAPTER");

        vm.startBroadcast(privateKey);

        CapabilityRegistry(registryAddress).setCapability(PAYMENT, adapterAddress, true);
        emit PaymentCapabilityConfigured(registryAddress, adapterAddress);

        vm.stopBroadcast();
    }
}
