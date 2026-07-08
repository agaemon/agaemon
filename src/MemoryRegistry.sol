// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MemoryRegistry {
    struct Commitment {
        bytes32 merkleRoot;
        bytes32 contentHash;
        bytes32 storageURIHash;
        uint256 version;
        uint256 blockNumber;
        uint256 timestamp;
    }

    mapping(address agent => mapping(bytes32 memoryId => Commitment commitment)) public commitments;

    event MemoryCommitted(
        address indexed agent,
        bytes32 indexed memoryId,
        uint256 indexed version,
        bytes32 merkleRoot,
        bytes32 contentHash,
        bytes32 storageURIHash
    );

    error InvalidCommitment();

    function commitMemory(bytes32 memoryId, bytes32 merkleRoot, bytes32 contentHash, bytes32 storageURIHash)
        external
        returns (uint256 version)
    {
        if (
            memoryId == bytes32(0) || merkleRoot == bytes32(0) || contentHash == bytes32(0)
                || storageURIHash == bytes32(0)
        ) {
            revert InvalidCommitment();
        }

        Commitment storage commitment = commitments[msg.sender][memoryId];
        version = commitment.version + 1;

        commitment.merkleRoot = merkleRoot;
        commitment.contentHash = contentHash;
        commitment.storageURIHash = storageURIHash;
        commitment.version = version;
        commitment.blockNumber = block.number;
        commitment.timestamp = block.timestamp;

        emit MemoryCommitted(msg.sender, memoryId, version, merkleRoot, contentHash, storageURIHash);
    }
}
