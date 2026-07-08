// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MemoryRegistry} from "../src/MemoryRegistry.sol";

contract MemoryRegistryFuzzTest {
    MemoryRegistry private registry;

    function setUp() public {
        registry = new MemoryRegistry();
    }

    function testFuzzZeroCommitmentFieldIsRejected(
        bytes32 memoryId,
        bytes32 merkleRoot,
        bytes32 contentHash,
        bytes32 storageURIHash,
        uint8 zeroField
    ) public {
        memoryId = nonzero(memoryId, "memoryId");
        merkleRoot = nonzero(merkleRoot, "merkleRoot");
        contentHash = nonzero(contentHash, "contentHash");
        storageURIHash = nonzero(storageURIHash, "storageURIHash");

        uint8 field = zeroField % 4;
        if (field == 0) memoryId = bytes32(0);
        if (field == 1) merkleRoot = bytes32(0);
        if (field == 2) contentHash = bytes32(0);
        if (field == 3) storageURIHash = bytes32(0);

        (bool ok,) = address(registry).call(
            abi.encodeCall(MemoryRegistry.commitMemory, (memoryId, merkleRoot, contentHash, storageURIHash))
        );

        require(!ok, "zero commitment field should be rejected");

        (,,, uint256 version,,) = registry.commitments(address(this), memoryId);
        require(version == 0, "invalid commit should not increment version");
    }

    function nonzero(bytes32 value, string memory salt) private pure returns (bytes32) {
        return value == bytes32(0) ? keccak256(bytes(salt)) : value;
    }
}
