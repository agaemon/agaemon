// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CoordinationPayoutReceiptRegistry} from "../src/CoordinationPayoutReceiptRegistry.sol";

interface DeployCoordinationPayoutReceiptRegistryVm {
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployCoordinationPayoutReceiptRegistry {
    DeployCoordinationPayoutReceiptRegistryVm private constant vm =
        DeployCoordinationPayoutReceiptRegistryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CoordinationPayoutReceiptRegistryDeployed(address registry);

    function run() external returns (address registryAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);

        CoordinationPayoutReceiptRegistry registry = new CoordinationPayoutReceiptRegistry();
        emit CoordinationPayoutReceiptRegistryDeployed(address(registry));

        vm.stopBroadcast();

        return address(registry);
    }
}
