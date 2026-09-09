// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

interface TransferResultVm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function prank(address sender) external;
    function assume(bool condition) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

contract TransferResultToken {
    mapping(address => uint256) public balanceOf;
    bytes private response = abi.encode(true);
    bool private shouldRevert;

    constructor(address holder) {
        balanceOf[holder] = 100 ether;
    }

    function setResponse(bytes memory data, bool reverts) external {
        response = data;
        shouldRevert = reverts;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        bytes memory data = response;
        bool reverts = shouldRevert;
        assembly {
            if reverts { revert(add(data, 32), mload(data)) }
            return(add(data, 32), mload(data))
        }
    }
}

contract Erc20TransferResultTest {
    TransferResultVm private constant vm = TransferResultVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant ERC20_TRANSFER = keccak256("ERC20_TRANSFER");
    bytes32 private constant EXECUTED = keccak256("Executed(address,bytes32,address,uint256,bytes)");
    address private constant RECIPIENT = address(0xBEEF);
    address private constant DELEGATE = address(0xD1);

    CapabilityRegistry private registry;
    PolicyEngine private policy;
    AgentAccount private agent;
    TransferResultToken private token;

    function setUp() public {
        registry = new CapabilityRegistry();
        policy = new PolicyEngine(registry);
        agent = new AgentAccount(address(this), registry, policy, new ReputationRegistry());
        token = new TransferResultToken(address(agent));
        registry.setCapability(ERC20_TRANSFER, address(token), true);
        policy.setPolicy(address(agent), 0, 0, false);
        policy.setTokenPolicy(address(agent), address(token), 10 ether, 15 ether);
        agent.delegate(DELEGATE);
    }

    function testFalseReturnRevertsAndPreservesAllowance() public {
        token.setResponse(abi.encode(false), false);
        assertRejected(abi.encode(false), false);
    }

    function testFuzzTrueReturnSucceeds(bool delegated) public {
        assertAccepted(abi.encode(true), delegated);
    }

    function testFuzzEmptyContractReturnSucceeds(bool delegated) public {
        token.setResponse("", false);
        assertAccepted("", delegated);
    }

    function testFuzzFalseReturnPreservesPriorSpendAndAllowsRetry(bool delegated) public {
        assertAccepted(abi.encode(true), delegated);
        token.setResponse(abi.encode(false), false);
        assertRejected(abi.encode(false), delegated);
        token.setResponse(abi.encode(true), false);
        assertAccepted(abi.encode(true), delegated);
        assertAccepted(abi.encode(true), delegated);
        require(
            policy.dailyTokenSpent(address(agent), address(token), block.timestamp / 1 days) == 15 ether,
            "only successful transfers consume allowance"
        );
    }

    function testFuzzNonCanonicalReturnWordIsRejected(uint256 word, bool delegated) public {
        vm.assume(word != 1);
        bytes memory response = abi.encode(word);
        token.setResponse(response, false);
        assertRejected(response, delegated);
    }

    function testMalformedReturnLengthsAreRejected() public {
        uint256[4] memory lengths = [uint256(1), 31, 33, 64];
        for (uint256 i; i < lengths.length; ++i) {
            bytes memory response = new bytes(lengths[i]);
            // A canonical true word with trailing data must also be rejected.
            if (lengths[i] >= 32) response[31] = bytes1(uint8(1));
            token.setResponse(response, false);
            assertRejected(response, false);
        }
    }

    function testFuzzTokenRevertBytesArePreserved(bool delegated) public {
        bytes memory response = abi.encodeWithSignature("Error(string)", "token rejected transfer");
        token.setResponse(response, true);
        assertRejected(response, delegated);
    }

    function testCodeLessTargetIsRejected() public {
        address target = address(0xCAFE);
        registry.setCapability(ERC20_TRANSFER, target, true);
        policy.setTokenPolicy(address(agent), target, 10 ether, 15 ether);
        (bool ok, bytes memory result) = address(agent).call(abi.encodeCall(IAgent.execute, (action(target))));
        require(!ok, "code-less token target must fail");
        require(
            keccak256(result) == keccak256(abi.encodeWithSelector(AgentAccount.TargetCallFailed.selector, bytes(""))),
            "empty result must be preserved"
        );
        require(
            policy.dailyTokenSpent(address(agent), target, block.timestamp / 1 days) == 0,
            "code-less target must not consume allowance"
        );
    }

    function testGenericActionPreservesFalseAndArbitraryResults() public {
        bytes32 capability = keccak256("GENERIC_CALL");
        registry.setCapability(capability, address(token), true);
        IAgent.AgentAction memory generic = action(address(token));
        generic.capability = capability;
        bytes[2] memory responses = [abi.encode(false), bytes(hex"123456")];
        for (uint256 i; i < responses.length; ++i) {
            token.setResponse(responses[i], false);
            require(
                keccak256(agent.execute(generic)) == keccak256(responses[i]),
                "generic return semantics must remain unchanged"
            );
        }
        require(token.balanceOf(RECIPIENT) == 10 ether, "generic calls must still execute");
        require(
            policy.dailyTokenSpent(address(agent), address(token), block.timestamp / 1 days) == 0,
            "generic capability must retain its accounting"
        );
    }

    function assertAccepted(bytes memory expected, bool delegated) private {
        uint256 spent = policy.dailyTokenSpent(address(agent), address(token), block.timestamp / 1 days);
        uint256 balance = token.balanceOf(address(agent));
        uint256 received = token.balanceOf(RECIPIENT);
        vm.recordLogs();
        if (delegated) vm.prank(DELEGATE);
        require(
            keccak256(agent.execute(action(address(token)))) == keccak256(expected), "return bytes must be preserved"
        );
        require(
            token.balanceOf(address(agent)) == balance - 5 ether && token.balanceOf(RECIPIENT) == received + 5 ether,
            "successful transfer must move tokens"
        );
        require(
            policy.dailyTokenSpent(address(agent), address(token), block.timestamp / 1 days) == spent + 5 ether,
            "successful transfer must consume allowance once"
        );
        TransferResultVm.Log[] memory logs = vm.getRecordedLogs();
        uint256 executed;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(agent) && logs[i].topics[0] == EXECUTED) {
                ++executed;
                require(
                    logs[i].topics[1] == bytes32(uint256(uint160(delegated ? DELEGATE : address(this)))),
                    "event caller must be preserved"
                );
                require(
                    logs[i].topics[2] == ERC20_TRANSFER
                        && logs[i].topics[3] == bytes32(uint256(uint160(address(token)))),
                    "event action must be preserved"
                );
                require(
                    keccak256(logs[i].data) == keccak256(abi.encode(uint256(0), expected)),
                    "event result must be preserved"
                );
            }
        }
        require(executed == 1, "successful transfer must emit Executed once");
    }

    function assertRejected(bytes memory expected, bool delegated) private {
        uint256 spent = policy.dailyTokenSpent(address(agent), address(token), block.timestamp / 1 days);
        uint256 balance = token.balanceOf(address(agent));
        uint256 received = token.balanceOf(RECIPIENT);
        vm.recordLogs();
        if (delegated) vm.prank(DELEGATE);
        (bool ok, bytes memory result) = address(agent).call(abi.encodeCall(IAgent.execute, (action(address(token)))));
        require(!ok, "invalid token result must revert");
        require(
            keccak256(result) == keccak256(abi.encodeWithSelector(AgentAccount.TargetCallFailed.selector, expected)),
            "failure bytes must be preserved"
        );
        require(
            policy.dailyTokenSpent(address(agent), address(token), block.timestamp / 1 days) == spent,
            "failed transfer must preserve allowance"
        );
        require(
            token.balanceOf(address(agent)) == balance && token.balanceOf(RECIPIENT) == received,
            "failed transfer must roll back balances"
        );
        TransferResultVm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            require(
                logs[i].emitter != address(agent) || logs[i].topics[0] != EXECUTED,
                "failed transfer must not emit Executed"
            );
        }
    }

    function action(address target) private pure returns (IAgent.AgentAction memory) {
        return IAgent.AgentAction({
            capability: ERC20_TRANSFER,
            target: target,
            value: 0,
            data: abi.encodeCall(TransferResultToken.transfer, (RECIPIENT, 5 ether)),
            usesBorrowing: false
        });
    }
}
