// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentAccount} from "../src/AgentAccount.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IAgent} from "../src/interfaces/IAgent.sol";
import {MemoryRegistry} from "../src/MemoryRegistry.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract MemoryRegistryTest {
    bytes32 private constant MEMORY_COMMIT = keccak256("MEMORY_COMMIT");
    bytes32 private constant MEMORY_ID = keccak256("agentos.memory.test");
    bytes32 private constant MERKLE_ROOT = keccak256("root");
    bytes32 private constant CONTENT_HASH = keccak256("content");
    bytes32 private constant STORAGE_URI_HASH = keccak256("memory://agentos/test");

    CapabilityRegistry private capabilityRegistry;
    PolicyEngine private policyEngine;
    ReputationRegistry private reputation;
    AgentAccount private agent;
    MemoryRegistry private memoryRegistry;

    function setUp() public {
        capabilityRegistry = new CapabilityRegistry();
        policyEngine = new PolicyEngine(capabilityRegistry);
        reputation = new ReputationRegistry();
        agent = new AgentAccount(address(this), capabilityRegistry, policyEngine, reputation);
        memoryRegistry = new MemoryRegistry();

        policyEngine.setPolicy(address(agent), 0.01 ether, 0.05 ether, false);
        capabilityRegistry.setCapability(MEMORY_COMMIT, address(memoryRegistry), true);
    }

    function testAllowedMemoryCommitStoresLatestVersion() public {
        agent.execute(memoryAction(address(memoryRegistry), MEMORY_ID, MERKLE_ROOT, CONTENT_HASH, STORAGE_URI_HASH, 0));

        (
            bytes32 storedRoot,
            bytes32 storedContentHash,
            bytes32 storedStorageURIHash,
            uint256 version,
            uint256 blockNumber,
            uint256 timestamp
        ) = memoryRegistry.commitments(address(agent), MEMORY_ID);

        require(storedRoot == MERKLE_ROOT, "wrong root");
        require(storedContentHash == CONTENT_HASH, "wrong content hash");
        require(storedStorageURIHash == STORAGE_URI_HASH, "wrong storage uri hash");
        require(version == 1, "wrong version");
        require(blockNumber == block.number, "wrong block number");
        require(timestamp == block.timestamp, "wrong timestamp");
    }

    function testSecondMemoryCommitIncrementsVersion() public {
        agent.execute(memoryAction(address(memoryRegistry), MEMORY_ID, MERKLE_ROOT, CONTENT_HASH, STORAGE_URI_HASH, 0));

        bytes32 nextRoot = keccak256("next root");
        bytes32 nextContentHash = keccak256("next content");
        bytes32 nextStorageURIHash = keccak256("memory://agentos/test/2");

        agent.execute(memoryAction(address(memoryRegistry), MEMORY_ID, nextRoot, nextContentHash, nextStorageURIHash, 0));

        (bytes32 storedRoot, bytes32 storedContentHash, bytes32 storedStorageURIHash, uint256 version,,) =
            memoryRegistry.commitments(address(agent), MEMORY_ID);

        require(storedRoot == nextRoot, "wrong next root");
        require(storedContentHash == nextContentHash, "wrong next content hash");
        require(storedStorageURIHash == nextStorageURIHash, "wrong next storage uri hash");
        require(version == 2, "wrong next version");
    }

    function testInvalidMemoryCommitmentFieldsAreRejected() public {
        require(
            !executeMemoryAction(memoryAction(address(memoryRegistry), bytes32(0), MERKLE_ROOT, CONTENT_HASH, STORAGE_URI_HASH, 0)),
            "zero memory id should fail"
        );
        require(
            !executeMemoryAction(memoryAction(address(memoryRegistry), MEMORY_ID, bytes32(0), CONTENT_HASH, STORAGE_URI_HASH, 0)),
            "zero root should fail"
        );
        require(
            !executeMemoryAction(memoryAction(address(memoryRegistry), MEMORY_ID, MERKLE_ROOT, bytes32(0), STORAGE_URI_HASH, 0)),
            "zero content hash should fail"
        );
        require(
            !executeMemoryAction(memoryAction(address(memoryRegistry), MEMORY_ID, MERKLE_ROOT, CONTENT_HASH, bytes32(0), 0)),
            "zero storage uri hash should fail"
        );
    }

    function testUnknownMemoryRegistryTargetIsDenied() public {
        MemoryRegistry unknownRegistry = new MemoryRegistry();

        require(
            !executeMemoryAction(
                memoryAction(address(unknownRegistry), MEMORY_ID, MERKLE_ROOT, CONTENT_HASH, STORAGE_URI_HASH, 0)
            ),
            "unknown registry should fail"
        );
    }

    function testOverLimitMemoryActionValueIsDenied() public {
        require(
            !executeMemoryAction(
                memoryAction(address(memoryRegistry), MEMORY_ID, MERKLE_ROOT, CONTENT_HASH, STORAGE_URI_HASH, 0.06 ether)
            ),
            "over limit memory action should fail"
        );
    }

    function executeMemoryAction(IAgent.AgentAction memory action) private returns (bool ok) {
        (ok,) = address(agent).call{value: action.value}(abi.encodeCall(IAgent.execute, (action)));
    }

    function memoryAction(
        address target,
        bytes32 memoryId,
        bytes32 merkleRoot,
        bytes32 contentHash,
        bytes32 storageURIHash,
        uint256 value
    ) private pure returns (IAgent.AgentAction memory) {
        return IAgent.AgentAction({
            capability: MEMORY_COMMIT,
            target: target,
            value: value,
            data: abi.encodeCall(MemoryRegistry.commitMemory, (memoryId, merkleRoot, contentHash, storageURIHash)),
            usesBorrowing: false
        });
    }
}
