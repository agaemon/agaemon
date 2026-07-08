// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {MockERC20} from "../src/testsupport/MockERC20.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface VerifyTokenPolicyVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifyTokenPolicy {
    VerifyTokenPolicyVm private constant vm =
        VerifyTokenPolicyVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant ERC20_TRANSFER = keccak256("ERC20_TRANSFER");

    function run() external view {
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address tokenAddress = vm.envAddress("TEST_ERC20_TOKEN");
        address recipientAddress = vm.envAddress("TOKEN_RECIPIENT");

        require(CapabilityRegistry(registryAddress).isAllowed(ERC20_TRANSFER, tokenAddress), "token is not allowed");
        require(MockERC20(tokenAddress).balanceOf(agentAddress) >= 1 ether, "agent has no test tokens");

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: ERC20_TRANSFER,
            target: tokenAddress,
            value: 0,
            data: abi.encodeWithSelector(MockERC20.transfer.selector, recipientAddress, 1 ether),
            usesBorrowing: false
        });

        (bool allowed, PolicyEngine.DecisionCode code) = PolicyEngine(policyAddress).checkAction(agentAddress, action);
        require(allowed, "token transfer is not policy allowed");
        require(code == PolicyEngine.DecisionCode.Allowed, "unexpected token policy code");
    }
}
