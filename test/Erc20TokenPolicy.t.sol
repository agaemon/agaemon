// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {MockERC20} from "../src/testsupport/MockERC20.sol";

contract Erc20TokenPolicyTest {
    bytes32 private constant ERC20_TRANSFER = keccak256("ERC20_TRANSFER");

    CapabilityRegistry private registry;
    PolicyEngine private policy;
    ReputationRegistry private reputation;
    AgentAccount private agent;
    MockERC20 private token;
    address private recipient = address(0xBEEF);

    function setUp() public {
        registry = new CapabilityRegistry();
        policy = new PolicyEngine(registry);
        reputation = new ReputationRegistry();
        agent = new AgentAccount(address(this), registry, policy, reputation);
        token = new MockERC20("AgentOS Test Token", "AOTT", 18);

        token.mint(address(agent), 100 ether);
        registry.setCapability(ERC20_TRANSFER, address(token), true);
        policy.setPolicy(address(agent), 0.01 ether, 0.05 ether, false);
        policy.setTokenPolicy(address(agent), address(token), 10 ether, 15 ether);
    }

    function testAllowedErc20TransferMovesTokensFromAgent() public {
        IAgent.AgentAction memory action = transferAction(address(token), recipient, 5 ether);

        agent.execute(action);

        require(token.balanceOf(recipient) == 5 ether, "recipient should receive tokens");
        require(token.balanceOf(address(agent)) == 95 ether, "agent balance should decrease");
    }

    function testUnknownTokenTargetIsDenied() public {
        MockERC20 unknown = new MockERC20("Unknown", "UNK", 18);
        unknown.mint(address(agent), 100 ether);
        IAgent.AgentAction memory action = transferAction(address(unknown), recipient, 5 ether);

        (bool ok,) = address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "unknown token target should be denied");
        require(unknown.balanceOf(recipient) == 0, "recipient should not receive tokens");
    }

    function testOverActionTokenLimitIsDenied() public {
        IAgent.AgentAction memory action = transferAction(address(token), recipient, 11 ether);

        (bool ok,) = address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "over-limit token transfer should be denied");
        require(token.balanceOf(recipient) == 0, "recipient should not receive tokens");
    }

    function testOverDailyTokenLimitIsDenied() public {
        agent.execute(transferAction(address(token), recipient, 10 ether));

        (bool ok,) =
            address(agent).call(abi.encodeCall(IAgent.execute, (transferAction(address(token), recipient, 6 ether))));

        require(!ok, "daily token limit should be enforced");
        require(token.balanceOf(recipient) == 10 ether, "only first transfer should succeed");
    }

    function testInvalidTokenTransferCalldataIsDenied() public {
        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: ERC20_TRANSFER,
            target: address(token),
            value: 0,
            data: abi.encodeWithSelector(MockERC20.approve.selector, recipient, 5 ether),
            usesBorrowing: false
        });

        (bool ok,) = address(agent).call(abi.encodeCall(IAgent.execute, (action)));

        require(!ok, "invalid token calldata should be denied");
        require(token.allowance(address(agent), recipient) == 0, "approval should not be set");
    }

    function transferAction(address target, address to, uint256 amount)
        private
        pure
        returns (IAgent.AgentAction memory)
    {
        return IAgent.AgentAction({
            capability: ERC20_TRANSFER,
            target: target,
            value: 0,
            data: abi.encodeWithSelector(MockERC20.transfer.selector, to, amount),
            usesBorrowing: false
        });
    }
}
