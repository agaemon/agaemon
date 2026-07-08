// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {TreasuryPaymentAdapter} from "../src/adapters/TreasuryPaymentAdapter.sol";

interface VerifyPaymentCapabilityVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifyPaymentCapability {
    VerifyPaymentCapabilityVm private constant vm =
        VerifyPaymentCapabilityVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant PAYMENT = keccak256("PAYMENT");

    function run() external view {
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address adapterAddress = vm.envAddress("TREASURY_PAYMENT_ADAPTER");
        address recipientAddress = vm.envAddress("PAYMENT_RECIPIENT");

        require(
            CapabilityRegistry(registryAddress).isAllowed(PAYMENT, adapterAddress), "payment adapter is not allowed"
        );

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: PAYMENT,
            target: adapterAddress,
            value: 0.000001 ether,
            data: abi.encodeCall(TreasuryPaymentAdapter.pay, (payable(recipientAddress))),
            usesBorrowing: false
        });

        (bool allowed, PolicyEngine.DecisionCode code) = PolicyEngine(policyAddress).checkAction(agentAddress, action);
        require(allowed, "payment action is not policy allowed");
        require(code == PolicyEngine.DecisionCode.Allowed, "unexpected payment policy code");
    }
}
