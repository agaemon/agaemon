// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "./lib/Owned.sol";

contract CoordinationPayoutReceiptRegistry is Owned {
    struct PayoutReceipt {
        address agent;
        address recipient;
        uint256 amount;
        bytes32 payoutTxHash;
        uint256 blockNumber;
        uint256 timestamp;
        bool recorded;
    }

    mapping(address coordination => mapping(uint256 assignmentId => PayoutReceipt receipt)) private receipts;

    event CoordinationPayoutReceiptRecorded(
        address indexed coordination,
        uint256 indexed assignmentId,
        address indexed agent,
        address recipient,
        uint256 amount,
        bytes32 payoutTxHash
    );

    error InvalidCoordination();
    error InvalidAgent();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidPayoutTransaction();
    error PayoutReceiptAlreadyRecorded();

    constructor() Owned(msg.sender) {}

    function recordPayoutReceipt(
        address coordination,
        uint256 assignmentId,
        address agent,
        address recipient,
        uint256 amount,
        bytes32 payoutTxHash
    ) external onlyOwner {
        if (coordination == address(0)) revert InvalidCoordination();
        if (agent == address(0)) revert InvalidAgent();
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (payoutTxHash == bytes32(0)) revert InvalidPayoutTransaction();

        PayoutReceipt storage receipt = receipts[coordination][assignmentId];
        if (receipt.recorded) revert PayoutReceiptAlreadyRecorded();

        receipts[coordination][assignmentId] = PayoutReceipt({
            agent: agent,
            recipient: recipient,
            amount: amount,
            payoutTxHash: payoutTxHash,
            blockNumber: block.number,
            timestamp: block.timestamp,
            recorded: true
        });

        emit CoordinationPayoutReceiptRecorded(coordination, assignmentId, agent, recipient, amount, payoutTxHash);
    }

    function receiptOf(address coordination, uint256 assignmentId)
        external
        view
        returns (
            address agent,
            address recipient,
            uint256 amount,
            bytes32 payoutTxHash,
            uint256 blockNumber,
            uint256 timestamp,
            bool recorded
        )
    {
        PayoutReceipt memory receipt = receipts[coordination][assignmentId];
        return (
            receipt.agent,
            receipt.recipient,
            receipt.amount,
            receipt.payoutTxHash,
            receipt.blockNumber,
            receipt.timestamp,
            receipt.recorded
        );
    }
}
