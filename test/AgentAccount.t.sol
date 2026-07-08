// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgent} from "../src/interfaces/IAgent.sol";
import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract AgentAccountTest {
    bytes32 private constant SWAP = keccak256("SWAP");

    CapabilityRegistry private registry;
    PolicyEngine private policy;
    ReputationRegistry private reputation;
    AgentAccount private agent;
    TargetProtocol private target;
    DelegateCaller private delegateCaller;

    function setUp() public {
        registry = new CapabilityRegistry();
        policy = new PolicyEngine(registry);
        reputation = new ReputationRegistry();
        agent = new AgentAccount(address(this), registry, policy, reputation);
        target = new TargetProtocol();
        delegateCaller = new DelegateCaller();

        registry.setCapability(SWAP, address(target), true);
        policy.setPolicy(address(agent), 1 ether, 3 ether, false);
    }

    function testUnknownTargetIsDenied() public {
        TargetProtocol unknown = new TargetProtocol();
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: address(unknown),
            value: 0,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });

        (bool ok,) = address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "unknown target should be denied");
        require(!unknown.wasCalled(), "unknown target should not be called");
    }

    function testOverActionValueLimitIsDenied() public {
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: 2 ether,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });

        (bool ok,) = address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "over-limit action should be denied");
        require(!target.wasCalled(), "target should not be called");
    }

    function testPausedAccountIsDenied() public {
        agent.pause();

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: 0,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });

        (bool ok,) = address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "paused account should be denied");
        require(!target.wasCalled(), "target should not be called");
    }

    function testUnauthorizedDelegateIsDenied() public {
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: 0,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });

        (bool ok,) = delegateCaller.execute(address(agent), action);

        require(!ok, "unauthorized delegate should be denied");
        require(!target.wasCalled(), "target should not be called");
    }

    function testAuthorizedDelegateCanExecuteAllowedAction() public {
        agent.delegate(address(delegateCaller));

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: 0,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });

        (bool ok,) = delegateCaller.execute(address(agent), action);

        require(ok, "authorized delegate should execute");
        require(target.wasCalled(), "target should be called");
    }
}

contract TargetProtocol {
    bool public wasCalled;

    function mark() external payable {
        wasCalled = true;
    }
}

contract DelegateCaller {
    function execute(address agent, IAgent.AgentAction memory action) external returns (bool ok, bytes memory result) {
        return agent.call(abi.encodeCall(IAgent.execute, (action)));
    }
}
