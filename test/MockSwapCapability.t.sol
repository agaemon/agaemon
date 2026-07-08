// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {MockSwapAdapter} from "../src/adapters/MockSwapAdapter.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {MockERC20} from "../src/testsupport/MockERC20.sol";

contract MockSwapCapabilityTest {
    bytes32 private constant SWAP_EXACT_ETH_FOR_TOKEN = keccak256("SWAP_EXACT_ETH_FOR_TOKEN");

    CapabilityRegistry private registry;
    PolicyEngine private policy;
    ReputationRegistry private reputation;
    AgentAccount private agent;
    MockSwapAdapter private adapter;
    MockERC20 private token;
    address private recipient = address(0xCAFE);

    function setUp() public {
        registry = new CapabilityRegistry();
        policy = new PolicyEngine(registry);
        reputation = new ReputationRegistry();
        agent = new AgentAccount(address(this), registry, policy, reputation);
        token = new MockERC20("AgentOS Swap Token", "AOST", 18);
        adapter = new MockSwapAdapter(1000 ether);

        token.mint(address(adapter), 1_000_000 ether);
        registry.setCapability(SWAP_EXACT_ETH_FOR_TOKEN, address(adapter), true);
        policy.setPolicy(address(agent), 0.05 ether, 0.1 ether, false);
        policy.setSwapPolicy(address(agent), address(adapter), address(token), 950 ether);
    }

    function testAllowedSwapTransfersOutputToken() public {
        uint256 ethIn = 0.01 ether;
        uint256 minOut = 9.5 ether;

        agent.execute{value: ethIn}(swapAction(address(adapter), minOut));

        require(token.balanceOf(recipient) == 10 ether, "recipient should receive quoted output");
        require(address(adapter).balance == ethIn, "adapter should retain input ETH");
    }

    function testUnknownAdapterIsDenied() public {
        MockSwapAdapter unknown = new MockSwapAdapter(1000 ether);
        token.mint(address(unknown), 1_000_000 ether);

        (bool ok,) = address(agent).call{value: 0.01 ether}(abi.encodeCall(IAgent.execute, (swapAction(address(unknown), 9.5 ether))));

        require(!ok, "unknown adapter should be denied");
        require(token.balanceOf(recipient) == 0, "recipient should not receive output");
    }

    function testLowMinOutputIsDenied() public {
        (bool ok,) = address(agent).call{value: 0.01 ether}(abi.encodeCall(IAgent.execute, (swapAction(address(adapter), 9 ether))));

        require(!ok, "low min output should be denied");
        require(token.balanceOf(recipient) == 0, "recipient should not receive output");
    }

    function testOverEthInputLimitIsDenied() public {
        (bool ok,) = address(agent).call{value: 0.06 ether}(abi.encodeCall(IAgent.execute, (swapAction(address(adapter), 57 ether))));

        require(!ok, "over-limit ETH input should be denied");
        require(token.balanceOf(recipient) == 0, "recipient should not receive output");
    }

    function testInvalidSwapCalldataIsDenied() public {
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP_EXACT_ETH_FOR_TOKEN,
            target: address(adapter),
            value: 0.01 ether,
            data: abi.encodeWithSelector(MockSwapAdapter.quote.selector, address(token), 0.01 ether),
            usesBorrowing: false
        });

        (bool ok,) = address(agent).call{value: 0.01 ether}(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "invalid swap calldata should be denied");
        require(token.balanceOf(recipient) == 0, "recipient should not receive output");
    }

    function swapAction(address target, uint256 minOut) private view returns (IAgent.AgentAction memory) {
        return IAgent.AgentAction({
            capability: SWAP_EXACT_ETH_FOR_TOKEN,
            target: target,
            value: 0.01 ether,
            data: abi.encodeCall(MockSwapAdapter.swapExactEthForToken, (address(token), recipient, minOut)),
            usesBorrowing: false
        });
    }
}
