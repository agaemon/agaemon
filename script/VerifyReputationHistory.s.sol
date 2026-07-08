// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationHistory} from "../src/ReputationHistory.sol";

interface VerifyReputationHistoryVm {
    function envAddress(string calldata name) external view returns (address);
    function envInt(string calldata name) external view returns (int256);
    function envString(string calldata name) external view returns (string memory);
}

contract VerifyReputationHistory {
    VerifyReputationHistoryVm private constant vm =
        VerifyReputationHistoryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address historyAddress = vm.envAddress("REPUTATION_HISTORY");
        address directoryAddress = vm.envAddress("AGENT_DIRECTORY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        bytes32 expectedActionHash = keccak256(bytes(vm.envString("REPUTATION_EVENT_ACTION_LABEL")));
        bytes32 expectedEvidenceHash = keccak256(bytes(vm.envString("REPUTATION_EVENT_EVIDENCE_URI")));
        int256 expectedScoreDelta = vm.envInt("REPUTATION_EVENT_DELTA");

        ReputationHistory history = ReputationHistory(historyAddress);
        require(history.owner() != address(0), "history owner is zero");
        require(address(history.agentDirectory()) == directoryAddress, "directory mismatch");

        uint256 eventCount = history.eventCountOf(agentAddress);
        require(eventCount > 0, "agent has no reputation events");

        bool found;
        for (uint256 eventId = 0; eventId < eventCount; eventId++) {
            (bytes32 actionHash, bytes32 evidenceHash, int256 scoreDelta,) = history.eventOf(agentAddress, eventId);
            if (
                actionHash == expectedActionHash && evidenceHash == expectedEvidenceHash
                    && scoreDelta == expectedScoreDelta
            ) {
                found = true;
            }
        }

        require(found, "expected reputation event missing");
    }
}
