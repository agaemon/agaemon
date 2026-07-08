// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationHistory} from "../src/ReputationHistory.sol";

interface DeployReputationHistoryVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployReputationHistory {
    DeployReputationHistoryVm private constant vm =
        DeployReputationHistoryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event ReputationHistoryDeployed(address history, address directory);

    function run() external returns (address historyAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address directoryAddress = vm.envAddress("AGENT_DIRECTORY");

        vm.startBroadcast(privateKey);

        ReputationHistory history = new ReputationHistory(directoryAddress);
        emit ReputationHistoryDeployed(address(history), directoryAddress);

        vm.stopBroadcast();

        return address(history);
    }
}
