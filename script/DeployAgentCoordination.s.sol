// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentCoordination} from "../src/AgentCoordination.sol";

interface DeployAgentCoordinationVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployAgentCoordination {
    DeployAgentCoordinationVm private constant vm =
        DeployAgentCoordinationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event AgentCoordinationDeployed(address coordination, address directory, address memoryRegistry);

    function run() external returns (address coordinationAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address directoryAddress = vm.envAddress("AGENT_DIRECTORY");
        address memoryRegistryAddress = vm.envAddress("MEMORY_REGISTRY");

        vm.startBroadcast(privateKey);

        AgentCoordination coordination = new AgentCoordination(directoryAddress, memoryRegistryAddress);
        emit AgentCoordinationDeployed(address(coordination), directoryAddress, memoryRegistryAddress);

        vm.stopBroadcast();

        return address(coordination);
    }
}
