// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgent} from "../src/interfaces/IAgent.sol";
import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

interface Vm {
    function assume(bool condition) external;
    function prank(address msgSender) external;
}

contract AgentAccountFuzzTest {
    bytes32 private constant SWAP = keccak256("SWAP");
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

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

    function testFuzzUnauthorizedCallerCannotExecute(address caller) public {
        vm.assume(caller != address(this));
        vm.assume(caller != address(0));

        IAgent.AgentAction memory action = allowedAction();

        vm.prank(caller);
        (bool ok,) = address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "unauthorized caller should be denied");
        require(!target.wasCalled(), "target should not be called");
    }

    function testFuzzPausedAccountBlocksAuthorizedCallers(bool useDelegate) public {
        if (useDelegate) {
            agent.delegate(address(delegateCaller));
        }
        agent.pause();

        IAgent.AgentAction memory action = allowedAction();
        (bool ok,) = useDelegate
            ? delegateCaller.execute(address(agent), action)
            : address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "paused account should deny authorized caller");
        require(!target.wasCalled(), "target should not be called");
    }

    function allowedAction() private view returns (IAgent.AgentAction memory) {
        return IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: 0,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });
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
