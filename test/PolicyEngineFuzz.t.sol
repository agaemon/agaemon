// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

contract PolicyEngineFuzzTest {
    bytes32 private constant SWAP = keccak256("SWAP");
    uint256 private constant MAX_ACTION_VALUE = 1 ether;
    uint256 private constant MAX_DAILY_VALUE = 100 ether;

    CapabilityRegistry private registry;
    PolicyEngine private policy;
    TargetProtocol private target;
    address private agent = address(0xA11CE);

    function setUp() public {
        registry = new CapabilityRegistry();
        policy = new PolicyEngine(registry);
        target = new TargetProtocol();

        registry.setCapability(SWAP, address(target), true);
        policy.setPolicy(agent, MAX_ACTION_VALUE, MAX_DAILY_VALUE, false);
    }

    function testFuzzValueAboveActionLimitIsDenied(uint256 rawValue) public view {
        uint256 value = MAX_ACTION_VALUE + 1 + (rawValue % 99 ether);
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: value,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });

        (bool allowed, PolicyEngine.DecisionCode code) = policy.checkAction(agent, action);

        require(!allowed, "over-limit action should be denied");
        require(code == PolicyEngine.DecisionCode.ActionValueExceeded, "wrong denial reason");
    }

    function testFuzzUnregisteredCapabilityTargetPairIsDenied(bytes32 capability, address rawTarget) public view {
        address fuzzTarget = rawTarget == address(0) ? address(0xBEEF) : rawTarget;
        bool registeredPair = capability == SWAP && fuzzTarget == address(target);
        if (registeredPair) {
            return;
        }

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: capability,
            target: fuzzTarget,
            value: 0,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });

        (bool allowed, PolicyEngine.DecisionCode code) = policy.checkAction(agent, action);

        require(!allowed, "unregistered capability target pair should be denied");
        require(code == PolicyEngine.DecisionCode.CapabilityDenied, "wrong denial reason");
    }
}

contract TargetProtocol {
    function mark() external payable {}
}
