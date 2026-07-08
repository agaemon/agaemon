// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationHistory} from "../src/ReputationHistory.sol";

interface RecordReputationEventVm {
    function envAddress(string calldata name) external view returns (address);
    function envInt(string calldata name) external view returns (int256);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract RecordReputationEvent {
    RecordReputationEventVm private constant vm =
        RecordReputationEventVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event ReputationEventRecorded(
        address indexed history, address indexed agent, bytes32 actionHash, bytes32 evidenceHash
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address historyAddress = vm.envAddress("REPUTATION_HISTORY");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        bytes32 actionHash = keccak256(bytes(vm.envString("REPUTATION_EVENT_ACTION_LABEL")));
        bytes32 evidenceHash = keccak256(bytes(vm.envString("REPUTATION_EVENT_EVIDENCE_URI")));
        int256 scoreDelta = vm.envInt("REPUTATION_EVENT_DELTA");

        vm.startBroadcast(privateKey);

        ReputationHistory(historyAddress).recordEvent(agentAddress, actionHash, evidenceHash, scoreDelta);
        emit ReputationEventRecorded(historyAddress, agentAddress, actionHash, evidenceHash);

        vm.stopBroadcast();
    }
}
