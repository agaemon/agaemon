// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentDirectory} from "../src/AgentDirectory.sol";
import {ReputationHistory} from "../src/ReputationHistory.sol";

contract ReputationHistoryTest {
    AgentDirectory private directory;
    ReputationHistory private history;
    ReputationHistoryCaller private caller;

    address private agent = address(0xA11CE);
    address private unregisteredAgent = address(0xB0B);
    bytes32 private roleHash = keccak256("agentos.kernel.operator");
    bytes32 private metadataURIHash = keccak256("agentos://base-sepolia/agent-account/v1");
    bytes32 private actionHash = keccak256("agentos.kernel.directory-profile-registered");
    bytes32 private evidenceHash = keccak256("agentos://base-sepolia/reputation-history/directory-profile/v1");

    function setUp() public {
        directory = new AgentDirectory();
        history = new ReputationHistory(address(directory));
        caller = new ReputationHistoryCaller();

        directory.registerAgent(agent, roleHash, metadataURIHash, true);
    }

    function testOwnerCanRecordReputationEventForActiveAgent() public {
        uint256 eventId = history.recordEvent(agent, actionHash, evidenceHash, 1);

        require(eventId == 0, "first event id mismatch");
        require(history.eventCountOf(agent) == 1, "event count mismatch");

        (bytes32 storedActionHash, bytes32 storedEvidenceHash, int256 scoreDelta, uint256 timestamp) =
            history.eventOf(agent, eventId);

        require(storedActionHash == actionHash, "action hash mismatch");
        require(storedEvidenceHash == evidenceHash, "evidence hash mismatch");
        require(scoreDelta == 1, "score delta mismatch");
        require(timestamp == block.timestamp, "timestamp mismatch");
    }

    function testOwnerCanRecordNegativeEvent() public {
        history.recordEvent(agent, actionHash, evidenceHash, -1);

        (,, int256 scoreDelta,) = history.eventOf(agent, 0);

        require(scoreDelta == -1, "negative score delta mismatch");
    }

    function testNonOwnerCannotRecordReputationEvent() public {
        (bool ok,) = caller.recordEvent(address(history), agent, actionHash, evidenceHash, 1);

        require(!ok, "non-owner event should fail");
        require(history.eventCountOf(agent) == 0, "event should not be stored");
    }

    function testInactiveOrUnregisteredAgentIsRejected() public {
        (bool unregisteredOk,) = address(history)
            .call(abi.encodeCall(ReputationHistory.recordEvent, (unregisteredAgent, actionHash, evidenceHash, 1)));

        directory.setActive(agent, false);
        (bool inactiveOk,) =
            address(history).call(abi.encodeCall(ReputationHistory.recordEvent, (agent, actionHash, evidenceHash, 1)));

        require(!unregisteredOk, "unregistered agent should fail");
        require(!inactiveOk, "inactive agent should fail");
    }

    function testInvalidEventFieldsAreRejected() public {
        (bool zeroAgentOk,) = address(history)
            .call(abi.encodeCall(ReputationHistory.recordEvent, (address(0), actionHash, evidenceHash, 1)));
        (bool zeroActionOk,) =
            address(history).call(abi.encodeCall(ReputationHistory.recordEvent, (agent, bytes32(0), evidenceHash, 1)));
        (bool zeroEvidenceOk,) =
            address(history).call(abi.encodeCall(ReputationHistory.recordEvent, (agent, actionHash, bytes32(0), 1)));
        (bool zeroDeltaOk,) =
            address(history).call(abi.encodeCall(ReputationHistory.recordEvent, (agent, actionHash, evidenceHash, 0)));

        require(!zeroAgentOk, "zero agent should fail");
        require(!zeroActionOk, "zero action should fail");
        require(!zeroEvidenceOk, "zero evidence should fail");
        require(!zeroDeltaOk, "zero delta should fail");
    }
}

contract ReputationHistoryCaller {
    function recordEvent(address history, address agent, bytes32 actionHash, bytes32 evidenceHash, int256 scoreDelta)
        external
        returns (bool ok, bytes memory result)
    {
        return
            history.call(abi.encodeCall(ReputationHistory.recordEvent, (agent, actionHash, evidenceHash, scoreDelta)));
    }
}
