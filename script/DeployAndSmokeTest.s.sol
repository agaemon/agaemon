// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {TestTargetProtocol} from "../src/testsupport/TestTargetProtocol.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployAndSmokeTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant SWAP = keccak256("SWAP");

    event KernelDeployed(
        address indexed owner, address registry, address policy, address reputation, address agent, address target
    );

    function run()
        external
        returns (
            address registryAddress,
            address policyAddress,
            address reputationAddress,
            address agentAddress,
            address targetAddress
        )
    {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        CapabilityRegistry registry = new CapabilityRegistry();
        PolicyEngine policy = new PolicyEngine(registry);
        ReputationRegistry reputation = new ReputationRegistry();
        AgentAccount agent = new AgentAccount(owner, registry, policy, reputation);
        TestTargetProtocol target = new TestTargetProtocol();

        registry.setCapability(SWAP, address(target), true);
        policy.setPolicy(address(agent), 0.01 ether, 0.05 ether, false);

        IAgent.AgentAction memory action = IAgent.AgentAction({
            capability: SWAP,
            target: address(target),
            value: 0,
            data: abi.encodeCall(TestTargetProtocol.mark, ()),
            usesBorrowing: false
        });

        agent.execute(action);
        require(target.wasCalled(), "smoke test target was not called");

        emit KernelDeployed(
            owner, address(registry), address(policy), address(reputation), address(agent), address(target)
        );

        vm.stopBroadcast();

        return (address(registry), address(policy), address(reputation), address(agent), address(target));
    }
}
