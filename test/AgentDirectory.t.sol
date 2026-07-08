// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentDirectory} from "../src/AgentDirectory.sol";

contract AgentDirectoryTest {
    AgentDirectory private directory;
    DirectoryCaller private caller;

    address private agent = address(0xA11CE);
    bytes32 private roleHash = keccak256("agentos.kernel.operator");
    bytes32 private metadataURIHash = keccak256("agentos://base-sepolia/agent-account/v1");

    function setUp() public {
        directory = new AgentDirectory();
        caller = new DirectoryCaller();
    }

    function testOwnerCanRegisterAgentProfile() public {
        directory.registerAgent(agent, roleHash, metadataURIHash, true);

        (bytes32 storedRoleHash, bytes32 storedMetadataURIHash, bool active, bool registered) =
            directory.profileOf(agent);

        require(storedRoleHash == roleHash, "role hash mismatch");
        require(storedMetadataURIHash == metadataURIHash, "metadata hash mismatch");
        require(active, "agent should be active");
        require(registered, "agent should be registered");
    }

    function testOwnerCanToggleActiveStatus() public {
        directory.registerAgent(agent, roleHash, metadataURIHash, true);

        directory.setActive(agent, false);
        (,, bool active,) = directory.profileOf(agent);
        require(!active, "agent should be inactive");

        directory.setActive(agent, true);
        (,, active,) = directory.profileOf(agent);
        require(active, "agent should be active again");
    }

    function testNonOwnerCannotRegisterAgentProfile() public {
        (bool ok,) = caller.registerAgent(address(directory), agent, roleHash, metadataURIHash, true);

        require(!ok, "non-owner registration should fail");
        (,,, bool registered) = directory.profileOf(agent);
        require(!registered, "agent should not be registered");
    }

    function testInvalidProfileIsRejected() public {
        (bool zeroAgentOk,) =
            address(directory).call(abi.encodeCall(AgentDirectory.registerAgent, (address(0), roleHash, metadataURIHash, true)));
        (bool zeroRoleOk,) =
            address(directory).call(abi.encodeCall(AgentDirectory.registerAgent, (agent, bytes32(0), metadataURIHash, true)));
        (bool zeroMetadataOk,) =
            address(directory).call(abi.encodeCall(AgentDirectory.registerAgent, (agent, roleHash, bytes32(0), true)));

        require(!zeroAgentOk, "zero agent should fail");
        require(!zeroRoleOk, "zero role should fail");
        require(!zeroMetadataOk, "zero metadata should fail");
    }

    function testCannotSetActiveForUnregisteredAgent() public {
        (bool ok,) = address(directory).call(abi.encodeCall(AgentDirectory.setActive, (agent, true)));

        require(!ok, "unregistered active update should fail");
    }
}

contract DirectoryCaller {
    function registerAgent(
        address directory,
        address agent,
        bytes32 roleHash,
        bytes32 metadataURIHash,
        bool active
    ) external returns (bool ok, bytes memory result) {
        return directory.call(abi.encodeCall(AgentDirectory.registerAgent, (agent, roleHash, metadataURIHash, active)));
    }
}
