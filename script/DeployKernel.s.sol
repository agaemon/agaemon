// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

interface DeployKernelVm {
    function addr(uint256 privateKey) external returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployKernel {
    DeployKernelVm private constant vm = DeployKernelVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event KernelDeployed(address indexed owner, address registry, address policy, address reputation, address agent);

    function run()
        external
        returns (address registryAddress, address policyAddress, address reputationAddress, address agentAddress)
    {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        CapabilityRegistry registry = new CapabilityRegistry();
        PolicyEngine policy = new PolicyEngine(registry);
        ReputationRegistry reputation = new ReputationRegistry();
        AgentAccount agent = new AgentAccount(owner, registry, policy, reputation);

        emit KernelDeployed(owner, address(registry), address(policy), address(reputation), address(agent));

        vm.stopBroadcast();

        return (address(registry), address(policy), address(reputation), address(agent));
    }
}
