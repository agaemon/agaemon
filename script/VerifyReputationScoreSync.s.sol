// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationHistory} from "../src/ReputationHistory.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

interface VerifyReputationScoreSyncVm {
    function envAddress(string calldata name) external view returns (address);
}

contract VerifyReputationScoreSync {
    VerifyReputationScoreSyncVm private constant vm =
        VerifyReputationScoreSyncVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address registryAddress = vm.envAddress("REPUTATION_REGISTRY");
        address historyAddress = vm.envAddress("REPUTATION_HISTORY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");

        uint256 historyScore = aggregateHistoryScore(historyAddress, agentAddress);
        uint256 registryScore = ReputationRegistry(registryAddress).scoreOf(agentAddress);
        require(registryScore == historyScore, "registry score mismatch");
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
