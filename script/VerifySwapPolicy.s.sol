// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {MockSwapAdapter} from "../src/adapters/MockSwapAdapter.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {MockERC20} from "../src/testsupport/MockERC20.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

interface VerifySwapPolicyVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifySwapPolicy {
    VerifySwapPolicyVm private constant vm =
        VerifySwapPolicyVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant SWAP_EXACT_ETH_FOR_TOKEN = keccak256("SWAP_EXACT_ETH_FOR_TOKEN");

    function run() external view {
        address registryAddress = vm.envAddress("CAPABILITY_REGISTRY");
        address policyAddress = vm.envAddress("POLICY_ENGINE");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address adapterAddress = vm.envAddress("MOCK_SWAP_ADAPTER");
        address tokenOut = vm.envAddress("TEST_ERC20_TOKEN");

        require(
            CapabilityRegistry(registryAddress).isAllowed(SWAP_EXACT_ETH_FOR_TOKEN, adapterAddress),
            "swap adapter is not allowed"
        );
        require(MockERC20(tokenOut).balanceOf(adapterAddress) >= 1 ether, "swap adapter has no output tokens");

        IAgent.AgentAction memory allowedAction = IAgent.AgentAction({
            capability: SWAP_EXACT_ETH_FOR_TOKEN,
            target: adapterAddress,
            value: 0.000001 ether,
            data: abi.encodeWithSelector(
                MockSwapAdapter.swapExactEthForToken.selector, tokenOut, agentAddress, 0.00095 ether
            ),
            usesBorrowing: false
        });

        (bool allowed, PolicyEngine.DecisionCode code) =
            PolicyEngine(policyAddress).checkAction(agentAddress, allowedAction);
        require(allowed, "swap is not policy allowed");
        require(code == PolicyEngine.DecisionCode.Allowed, "unexpected swap policy code");

        IAgent.AgentAction memory lowMinOutputAction = IAgent.AgentAction({
            capability: SWAP_EXACT_ETH_FOR_TOKEN,
            target: adapterAddress,
            value: 0.000001 ether,
            data: abi.encodeWithSelector(
                MockSwapAdapter.swapExactEthForToken.selector, tokenOut, agentAddress, 0.00094 ether
            ),
            usesBorrowing: false
        });

        (bool lowAllowed, PolicyEngine.DecisionCode lowCode) =
            PolicyEngine(policyAddress).checkAction(agentAddress, lowMinOutputAction);
        require(!lowAllowed, "low min-output swap should be denied");
        require(lowCode == PolicyEngine.DecisionCode.SwapMinOutputTooLow, "unexpected low min-output code");
    }
}
