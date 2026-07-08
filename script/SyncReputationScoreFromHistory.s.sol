// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationHistory} from "../src/ReputationHistory.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

interface SyncReputationScoreFromHistoryVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract SyncReputationScoreFromHistory {
    SyncReputationScoreFromHistoryVm private constant vm =
        SyncReputationScoreFromHistoryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event ReputationScoreSynced(
        address indexed registry,
        address indexed history,
        address indexed agent,
        uint256 historyScore,
        uint256 previousScore,
        int256 syncDelta
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("REPUTATION_REGISTRY");
        address historyAddress = vm.envAddress("REPUTATION_HISTORY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");

        ReputationRegistry registry = ReputationRegistry(registryAddress);
        uint256 previousScore = registry.scoreOf(agentAddress);
        uint256 historyScore = aggregateHistoryScore(historyAddress, agentAddress);
        require(previousScore <= uint256(type(int256).max), "previous score too large");
        require(historyScore <= uint256(type(int256).max), "history score too large");
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 syncDelta = int256(historyScore) - int256(previousScore);
        require(syncDelta != 0, "score already synced");

        vm.startBroadcast(privateKey);

        registry.adjustReputation(agentAddress, syncDelta);
        emit ReputationScoreSynced(
            registryAddress, historyAddress, agentAddress, historyScore, previousScore, syncDelta
        );

        vm.stopBroadcast();
    }

    function aggregateHistoryScore(address historyAddress, address agentAddress) private view returns (uint256) {
        ReputationHistory history = ReputationHistory(historyAddress);
        uint256 eventCount = history.eventCountOf(agentAddress);
        int256 score;

        for (uint256 eventId = 0; eventId < eventCount; eventId++) {
            (,, int256 scoreDelta,) = history.eventOf(agentAddress, eventId);
            score += scoreDelta;
        }

        require(score >= 0, "history score negative");
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(score);
    }
}
