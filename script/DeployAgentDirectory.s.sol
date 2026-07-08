// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentDirectory} from "../src/AgentDirectory.sol";

interface DeployAgentDirectoryVm {
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployAgentDirectory {
    DeployAgentDirectoryVm private constant vm =
        DeployAgentDirectoryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event AgentDirectoryDeployed(address directory);

    function run() external returns (address directoryAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);

        AgentDirectory directory = new AgentDirectory();
        emit AgentDirectoryDeployed(address(directory));

        vm.stopBroadcast();

        return address(directory);
    }
}
