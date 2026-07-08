// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {PayoutRuleAdapter} from "../src/adapters/PayoutRuleAdapter.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract PayoutRuleAdapterTest {
    bytes32 private constant PAYOUT = keccak256("PAYOUT");

    CapabilityRegistry private registry;
    PolicyEngine private policy;
    ReputationRegistry private reputation;
    AgentAccount private agent;
    PayoutRuleAdapter private adapter;
    PayoutRecipient private recipient;
    PayoutRecipient private unknownRecipient;

    function setUp() public {
        registry = new CapabilityRegistry();
        policy = new PolicyEngine(registry);
        reputation = new ReputationRegistry();
        agent = new AgentAccount(address(this), registry, policy, reputation);
        adapter = new PayoutRuleAdapter();
        recipient = new PayoutRecipient();
        unknownRecipient = new PayoutRecipient();

        registry.setCapability(PAYOUT, address(adapter), true);
        policy.setPolicy(address(agent), 0.05 ether, 0.1 ether, false);
        adapter.setPayoutRule(address(agent), payable(address(recipient)), 0.02 ether, 0.03 ether, true);
    }

    function testAllowedPayoutForwardsEthToConfiguredRecipient() public {
        uint256 amount = 0.01 ether;
        IAgent.AgentAction memory action = payoutAction(payable(address(recipient)), amount);

        IAgent(address(agent)).execute{value: amount}(action);

        require(address(recipient).balance == amount, "recipient should receive payout");
        require(recipient.lastSender() == address(adapter), "adapter should forward payout");
        require(adapter.dailyPayouts(address(agent), address(recipient), block.timestamp / 1 days) == amount);
    }

    function testUnknownRecipientIsRejectedByAdapter() public {
        uint256 amount = 0.01 ether;
        IAgent.AgentAction memory action = payoutAction(payable(address(unknownRecipient)), amount);

        (bool ok,) = address(agent).call{value: amount}(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "unknown recipient payout should be rejected");
        require(address(unknownRecipient).balance == 0, "unknown recipient should not receive payout");
    }

    function testOverAdapterActionLimitIsRejectedByAdapter() public {
        uint256 amount = 0.021 ether;
        IAgent.AgentAction memory action = payoutAction(payable(address(recipient)), amount);

        (bool ok,) = address(agent).call{value: amount}(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "over adapter action limit should be rejected");
        require(address(recipient).balance == 0, "recipient should not receive rejected payout");
    }

    function testOverAdapterDailyLimitIsRejectedByAdapter() public {
        IAgent(address(agent)).execute{value: 0.02 ether}(payoutAction(payable(address(recipient)), 0.02 ether));

        (bool ok,) = address(agent).call{value: 0.02 ether}(
            abi.encodeCall(IAgent.execute, (payoutAction(payable(address(recipient)), 0.02 ether)))
        );

        require(!ok, "over adapter daily limit should be rejected");
        require(address(recipient).balance == 0.02 ether, "recipient should only receive first payout");
    }

    function testUnknownPayoutAdapterIsDeniedByPolicy() public {
        PayoutRuleAdapter unknownAdapter = new PayoutRuleAdapter();
        unknownAdapter.setPayoutRule(address(agent), payable(address(recipient)), 0.02 ether, 0.03 ether, true);
        uint256 amount = 0.01 ether;
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: PAYOUT,
            target: address(unknownAdapter),
            value: amount,
            data: abi.encodeCall(PayoutRuleAdapter.payout, (payable(address(recipient)))),
            usesBorrowing: false
        });

        (bool ok,) = address(agent).call{value: amount}(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "unknown payout adapter should be denied");
        require(address(recipient).balance == 0, "recipient should not receive denied payout");
    }

    function payoutAction(address payable payoutRecipient, uint256 amount) private view returns (IAgent.AgentAction memory) {
        return IAgent.AgentAction({
            capability: PAYOUT,
            target: address(adapter),
            value: amount,
            data: abi.encodeCall(PayoutRuleAdapter.payout, (payoutRecipient)),
            usesBorrowing: false
        });
    }
}

contract PayoutRecipient {
    address public lastSender;

    receive() external payable {
        lastSender = msg.sender;
    }
}
