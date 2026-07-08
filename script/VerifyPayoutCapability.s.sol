// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PayoutRuleAdapter} from "../src/adapters/PayoutRuleAdapter.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface VerifyPayoutCapabilityVm {
    function envAddress(string calldata name) external view returns (address);
    function envOr(string calldata name, address defaultValue) external view returns (address);
}

contract VerifyPayoutCapability {
    VerifyPayoutCapabilityVm private constant vm =
        VerifyPayoutCapabilityVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant PAYOUT = keccak256("PAYOUT");

    function run() external view {
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address adapterAddress = vm.envAddress("PAYOUT_RULE_ADAPTER");
        address recipientAddress = vm.envOr("PAYOUT_RECIPIENT", vm.envAddress("PAYMENT_RECIPIENT"));

        require(CapabilityRegistry(registryAddress).isAllowed(PAYOUT, adapterAddress), "payout adapter is not allowed");

        (uint256 maxActionValue, uint256 maxDailyValue, bool enabled) =
            PayoutRuleAdapter(adapterAddress).payoutRules(agentAddress, recipientAddress);
        require(enabled, "payout rule is not enabled");
        require(maxActionValue >= 0.000001 ether, "payout action limit too low");
        require(maxDailyValue >= maxActionValue, "payout daily limit too low");

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: PAYOUT,
            target: adapterAddress,
            value: 0.000001 ether,
            data: abi.encodeCall(PayoutRuleAdapter.payout, (payable(recipientAddress))),
            usesBorrowing: false
        });

        (bool allowed, PolicyEngine.DecisionCode code) = PolicyEngine(policyAddress).checkAction(agentAddress, action);
        require(allowed, "payout action is not policy allowed");
        require(code == PolicyEngine.DecisionCode.Allowed, "unexpected payout policy code");
    }
}
