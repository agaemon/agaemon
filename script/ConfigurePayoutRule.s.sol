// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayoutRuleAdapter} from "../src/adapters/PayoutRuleAdapter.sol";

interface ConfigurePayoutRuleVm {
    function envAddress(string calldata name) external view returns (address);
    function envOr(string calldata name, address defaultValue) external view returns (address);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ConfigurePayoutRule {
    ConfigurePayoutRuleVm private constant vm =
        ConfigurePayoutRuleVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event PayoutRuleConfigured(
        address indexed adapter,
        address indexed agent,
        address indexed recipient,
        uint256 maxActionValue,
        uint256 maxDailyValue
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address adapterAddress = vm.envAddress("PAYOUT_RULE_ADAPTER");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address recipientAddress = vm.envOr("PAYOUT_RECIPIENT", vm.envAddress("PAYMENT_RECIPIENT"));
        uint256 maxActionValue = vm.envOr("PAYOUT_MAX_ACTION_VALUE_WEI", uint256(0.000002 ether));
        uint256 maxDailyValue = vm.envOr("PAYOUT_MAX_DAILY_VALUE_WEI", uint256(0.000005 ether));

        vm.startBroadcast(privateKey);

        PayoutRuleAdapter(adapterAddress).setPayoutRule(
            agentAddress, payable(recipientAddress), maxActionValue, maxDailyValue, true
        );
        emit PayoutRuleConfigured(adapterAddress, agentAddress, recipientAddress, maxActionValue, maxDailyValue);

        vm.stopBroadcast();
    }
}
