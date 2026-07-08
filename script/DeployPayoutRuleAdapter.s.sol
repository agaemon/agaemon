// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayoutRuleAdapter} from "../src/adapters/PayoutRuleAdapter.sol";

interface DeployPayoutRuleAdapterVm {
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployPayoutRuleAdapter {
    DeployPayoutRuleAdapterVm private constant vm =
        DeployPayoutRuleAdapterVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event PayoutRuleAdapterDeployed(address adapter);

    function run() external returns (address adapterAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);

        PayoutRuleAdapter adapter = new PayoutRuleAdapter();
        emit PayoutRuleAdapterDeployed(address(adapter));

        vm.stopBroadcast();

        return address(adapter);
    }
}
