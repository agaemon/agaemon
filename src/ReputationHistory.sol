// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "./lib/Owned.sol";

interface IAgentDirectoryProfile {
    function profileOf(address agent)
        external
        view
        returns (bytes32 roleHash, bytes32 metadataURIHash, bool active, bool registered);
}

contract ReputationHistory is Owned {
    struct ReputationEvent {
        bytes32 actionHash;
        bytes32 evidenceHash;
        int256 scoreDelta;
        uint256 timestamp;
    }

    IAgentDirectoryProfile public immutable agentDirectory;

    mapping(address agent => ReputationEvent[] events) private eventsByAgent;

    event ReputationEventRecorded(
        address indexed agent,
        uint256 indexed eventId,
        bytes32 indexed actionHash,
        bytes32 evidenceHash,
        int256 scoreDelta
    );

    error InvalidDirectory();
    error InvalidAgent();
    error InvalidAction();
    error InvalidEvidence();
    error InvalidDelta();
    error AgentProfileInactive();

    constructor(address directory) Owned(msg.sender) {
        if (directory == address(0)) revert InvalidDirectory();

        agentDirectory = IAgentDirectoryProfile(directory);
    }

    function recordEvent(address agent, bytes32 actionHash, bytes32 evidenceHash, int256 scoreDelta)
        external
        onlyOwner
        returns (uint256 eventId)
    {
        if (agent == address(0)) revert InvalidAgent();
        if (actionHash == bytes32(0)) revert InvalidAction();
        if (evidenceHash == bytes32(0)) revert InvalidEvidence();
        if (scoreDelta == 0) revert InvalidDelta();

        (,, bool active, bool registered) = agentDirectory.profileOf(agent);
        if (!registered || !active) revert AgentProfileInactive();

        eventId = eventsByAgent[agent].length;
        eventsByAgent[agent].push(
            ReputationEvent({
                actionHash: actionHash, evidenceHash: evidenceHash, scoreDelta: scoreDelta, timestamp: block.timestamp
            })
        );

        emit ReputationEventRecorded(agent, eventId, actionHash, evidenceHash, scoreDelta);
    }

    function eventCountOf(address agent) external view returns (uint256) {
        return eventsByAgent[agent].length;
    }

    function eventOf(address agent, uint256 eventId)
        external
        view
        returns (bytes32 actionHash, bytes32 evidenceHash, int256 scoreDelta, uint256 timestamp)
    {
        ReputationEvent memory reputationEvent = eventsByAgent[agent][eventId];
        return (
            reputationEvent.actionHash,
            reputationEvent.evidenceHash,
            reputationEvent.scoreDelta,
            reputationEvent.timestamp
        );
    }
}
