// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "./CapabilityRegistry.sol";
import {IAgent} from "./interfaces/IAgent.sol";
import {PolicyEngine} from "./PolicyEngine.sol";
import {ReputationRegistry} from "./ReputationRegistry.sol";

contract AgentAccount is IAgent {
    address public immutable owner;
    CapabilityRegistry private immutable capabilityRegistry;
    PolicyEngine public immutable policyEngine;
    ReputationRegistry public immutable reputationRegistry;

    bool public paused;
    mapping(address subagent => bool allowed) public delegates;

    error InvalidAddress();
    error NotOwner();
    error UnauthorizedCaller();
    error AgentPaused();
    error TargetCallFailed(bytes result);

    constructor(
        address initialOwner,
        CapabilityRegistry registry,
        PolicyEngine policy,
        ReputationRegistry reputationStore
    ) {
        if (
            initialOwner == address(0) || address(registry) == address(0) || address(policy) == address(0)
                || address(reputationStore) == address(0)
        ) revert InvalidAddress();

        owner = initialOwner;
        capabilityRegistry = registry;
        policyEngine = policy;
        reputationRegistry = reputationStore;
    }

    receive() external payable {}

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function execute(AgentAction calldata action) external payable returns (bytes memory result) {
        if (paused) revert AgentPaused();
        if (msg.sender != owner && !delegates[msg.sender]) revert UnauthorizedCaller();

        policyEngine.enforce(address(this), action);

        (bool ok, bytes memory targetResult) = action.target.call{value: action.value}(action.data);
        if (!ok) revert TargetCallFailed(targetResult);

        emit Executed(msg.sender, action.capability, action.target, action.value, targetResult);
        return targetResult;
    }

    function delegate(address subagent) external onlyOwner {
        if (subagent == address(0)) revert InvalidAddress();

        delegates[subagent] = true;
        emit DelegateSet(subagent, true);
    }

    function revokeDelegate(address subagent) external onlyOwner {
        if (subagent == address(0)) revert InvalidAddress();

        delegates[subagent] = false;
        emit DelegateSet(subagent, false);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function reputation() external view returns (uint256) {
        return reputationRegistry.scoreOf(address(this));
    }

    function capabilities() external view returns (address) {
        return address(capabilityRegistry);
    }
}
