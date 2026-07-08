// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "./lib/Owned.sol";

contract AgentDirectory is Owned {
    struct AgentProfile {
        bytes32 roleHash;
        bytes32 metadataURIHash;
        bool active;
        bool registered;
    }

    mapping(address agent => AgentProfile profile) private profiles;

    event AgentRegistered(
        address indexed agent,
        bytes32 indexed roleHash,
        bytes32 metadataURIHash,
        bool active
    );
    event AgentActiveSet(address indexed agent, bool active);

    error InvalidAgent();
    error InvalidRole();
    error InvalidMetadataURI();
    error AgentNotRegistered();

    constructor() Owned(msg.sender) {}

    function registerAgent(address agent, bytes32 roleHash, bytes32 metadataURIHash, bool active) external onlyOwner {
        if (agent == address(0)) revert InvalidAgent();
        if (roleHash == bytes32(0)) revert InvalidRole();
        if (metadataURIHash == bytes32(0)) revert InvalidMetadataURI();

        profiles[agent] = AgentProfile({
            roleHash: roleHash,
            metadataURIHash: metadataURIHash,
            active: active,
            registered: true
        });

        emit AgentRegistered(agent, roleHash, metadataURIHash, active);
    }

    function setActive(address agent, bool active) external onlyOwner {
        AgentProfile storage profile = profiles[agent];
        if (!profile.registered) revert AgentNotRegistered();

        profile.active = active;
        emit AgentActiveSet(agent, active);
    }

    function profileOf(address agent)
        external
        view
        returns (bytes32 roleHash, bytes32 metadataURIHash, bool active, bool registered)
    {
        AgentProfile memory profile = profiles[agent];
        return (profile.roleHash, profile.metadataURIHash, profile.active, profile.registered);
    }
}
