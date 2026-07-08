// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TreasuryPaymentAdapter} from "../src/adapters/TreasuryPaymentAdapter.sol";

interface DeployTreasuryPaymentAdapterVm {
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployTreasuryPaymentAdapter {
    DeployTreasuryPaymentAdapterVm private constant vm =
        DeployTreasuryPaymentAdapterVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event TreasuryPaymentAdapterDeployed(address adapter);

    function run() external returns (address adapterAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);

        TreasuryPaymentAdapter adapter = new TreasuryPaymentAdapter();
        emit TreasuryPaymentAdapterDeployed(address(adapter));

        vm.stopBroadcast();

        return address(adapter);
    }
}
