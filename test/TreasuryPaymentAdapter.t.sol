// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {TreasuryPaymentAdapter} from "../src/adapters/TreasuryPaymentAdapter.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract TreasuryPaymentAdapterTest {
    bytes32 private constant PAYMENT = keccak256("PAYMENT");

    CapabilityRegistry private registry;
    PolicyEngine private policy;
    ReputationRegistry private reputation;
    AgentAccount private agent;
    TreasuryPaymentAdapter private adapter;
    PaymentRecipient private recipient;
    PaymentDelegateCaller private delegateCaller;

    function setUp() public {
        registry = new CapabilityRegistry();
        policy = new PolicyEngine(registry);
        reputation = new ReputationRegistry();
        agent = new AgentAccount(address(this), registry, policy, reputation);
        adapter = new TreasuryPaymentAdapter();
        recipient = new PaymentRecipient();
        delegateCaller = new PaymentDelegateCaller();

        registry.setCapability(PAYMENT, address(adapter), true);
        policy.setPolicy(address(agent), 0.05 ether, 0.1 ether, false);
    }

    function testAllowedPaymentForwardsEthThroughRegisteredAdapter() public {
        uint256 amount = 0.01 ether;
        IAgent.AgentAction memory action = paymentAction(address(adapter), amount);

        IAgent(address(agent)).execute{value: amount}(action);

        require(address(recipient).balance == amount, "recipient should receive payment");
        require(recipient.lastSender() == address(adapter), "adapter should forward payment");
        require(address(agent).balance == 0, "agent should not retain payment");
    }

    function testUnknownPaymentTargetIsDenied() public {
        uint256 amount = 0.01 ether;
        TreasuryPaymentAdapter unknownAdapter = new TreasuryPaymentAdapter();
        IAgent.AgentAction memory action = paymentAction(address(unknownAdapter), amount);

        (bool ok,) = address(agent).call{value: amount}(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "unknown payment target should be denied");
        require(address(recipient).balance == 0, "recipient should not receive denied payment");
    }

    function testOverLimitPaymentIsDenied() public {
        uint256 amount = 0.06 ether;
        IAgent.AgentAction memory action = paymentAction(address(adapter), amount);

        (bool ok,) = address(agent).call{value: amount}(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "over-limit payment should be denied");
        require(address(recipient).balance == 0, "recipient should not receive denied payment");
    }

    function testPausedPaymentIsDenied() public {
        uint256 amount = 0.01 ether;
        agent.pause();
        IAgent.AgentAction memory action = paymentAction(address(adapter), amount);

        (bool ok,) = address(agent).call{value: amount}(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "paused payment should be denied");
        require(address(recipient).balance == 0, "recipient should not receive denied payment");
    }

    function testUnauthorizedDelegatePaymentIsDenied() public {
        uint256 amount = 0.01 ether;
        IAgent.AgentAction memory action = paymentAction(address(adapter), amount);

        (bool ok,) = delegateCaller.execute{value: amount}(address(agent), action);

        require(!ok, "unauthorized delegate payment should be denied");
        require(address(recipient).balance == 0, "recipient should not receive denied payment");
    }

    function paymentAction(address target, uint256 amount) private view returns (IAgent.AgentAction memory) {
        return IAgent.AgentAction({
            capability: PAYMENT,
            target: target,
            value: amount,
            data: abi.encodeCall(TreasuryPaymentAdapter.pay, (payable(address(recipient)))),
            usesBorrowing: false
        });
    }
}

contract PaymentRecipient {
    address public lastSender;

    receive() external payable {
        lastSender = msg.sender;
    }
}

contract PaymentDelegateCaller {
    function execute(address agent, IAgent.AgentAction memory action)
        external
        payable
        returns (bool ok, bytes memory result)
    {
        return agent.call{value: msg.value}(abi.encodeCall(IAgent.execute, (action)));
    }
}
