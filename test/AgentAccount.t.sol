// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgent} from "../src/interfaces/IAgent.sol";
import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

interface RevocationVm {
    function deal(address account, uint256 balance) external;
    function prank(address sender) external;
    function expectEmit(bool topic1, bool topic2, bool topic3, bool data, address emitter) external;
}

contract AgentAccountTest {
    RevocationVm private constant vm = RevocationVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    event DelegateSet(address indexed subagent, bool allowed);
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

    function testRevokedDelegateCannotExecuteAndCanBeRegranted() public {
        vm.deal(address(agent), 10);
        IAgent.AgentAction memory action = revocationAction();
        vm.expectEmit(true, false, false, true, address(agent));
        emit DelegateSet(address(delegateCaller), true);
        agent.delegate(address(delegateCaller));
        (bool first,) = delegateCaller.execute(address(agent), action);
        require(first && target.callCount() == 1, "grant must enable execution");
        uint256 spent = policy.dailySpent(address(agent), block.timestamp / 1 days);
        require(spent == 1, "first action must consume allowance");

        vm.expectEmit(true, false, false, true, address(agent));
        emit DelegateSet(address(delegateCaller), false);
        revoke(address(delegateCaller));
        require(!agent.delegates(address(delegateCaller)), "delegate must be removed");
        (bool ok, bytes memory result) = delegateCaller.execute(address(agent), action);
        require(!ok && bytes4(result) == AgentAccount.UnauthorizedCaller.selector, "revoked caller must be denied");
        require(target.callCount() == 1, "revoked caller must not reach target");
        require(policy.dailySpent(address(agent), block.timestamp / 1 days) == spent, "denial must preserve allowance");

        agent.delegate(address(delegateCaller));
        (bool restored,) = delegateCaller.execute(address(agent), action);
        require(restored && target.callCount() == 2, "regrant must restore execution");
    }

    function testRevokeWhilePausedDoesNotRestoreAuthorityOnUnpause() public {
        agent.delegate(address(delegateCaller));
        agent.pause();
        revoke(address(delegateCaller));
        require(agent.paused(), "revocation must not unpause");
        agent.unpause();
        (bool ok, bytes memory result) = delegateCaller.execute(address(agent), revocationAction());
        require(!ok && bytes4(result) == AgentAccount.UnauthorizedCaller.selector, "unpause must not restore delegate");
        require(target.callCount() == 0, "target must not be called");
    }

    function testOnlyOwnerCanRevokeIncludingAgainstAuthorizedDelegate() public {
        agent.delegate(address(delegateCaller));
        for (uint256 i; i < 2; ++i) {
            vm.prank(i == 0 ? address(delegateCaller) : address(0xbad));
            (bool ok, bytes memory result) = address(agent).call(
                abi.encodeCall(IAgent.revokeDelegate, (address(delegateCaller)))
            );
            require(!ok && bytes4(result) == AgentAccount.NotOwner.selector, "non-owner revoke must fail");
            require(agent.delegates(address(delegateCaller)), "failed revoke must preserve grant");
        }
    }

    function testRevokeZeroAddressIsDenied() public {
        (bool ok, bytes memory result) = address(agent).call(abi.encodeCall(IAgent.revokeDelegate, (address(0))));
        require(!ok && bytes4(result) == AgentAccount.InvalidAddress.selector, "zero address must be denied");
    }

    function testRepeatedRevokePreservesOtherDelegateAndOwner() public {
        vm.deal(address(agent), 10);
        DelegateCaller other = new DelegateCaller();
        agent.delegate(address(delegateCaller));
        agent.delegate(address(other));
        revoke(address(delegateCaller));
        vm.expectEmit(true, false, false, true, address(agent));
        emit DelegateSet(address(delegateCaller), false);
        revoke(address(delegateCaller));
        require(!agent.delegates(address(delegateCaller)), "repeated revoke must remain false");
        (bool ok,) = other.execute(address(agent), revocationAction());
        require(ok, "other delegate must retain authority");
        agent.delegate(address(this));
        revoke(address(this));
        agent.execute(revocationAction());
        require(target.callCount() == 2, "owner must retain authority");
    }

    function revoke(address subagent) private {
        IAgent(address(agent)).revokeDelegate(subagent);
    }

    function revocationAction() private view returns (IAgent.AgentAction memory) {
        return IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: 1,
            data: abi.encodeCall(TargetProtocol.mark, ()),
            usesBorrowing: false
        });
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
    uint256 public callCount;

    function mark() external payable {
        wasCalled = true;
        callCount++;
    }
}

contract DelegateCaller {
    function execute(address agent, IAgent.AgentAction memory action) external returns (bool ok, bytes memory result) {
        return agent.call(abi.encodeCall(IAgent.execute, (action)));
    }
}
