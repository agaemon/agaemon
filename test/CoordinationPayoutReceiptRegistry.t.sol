// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CoordinationPayoutReceiptRegistry} from "../src/CoordinationPayoutReceiptRegistry.sol";

contract CoordinationPayoutReceiptRegistryTest {
    CoordinationPayoutReceiptRegistry private registry;
    CoordinationPayoutReceiptRegistryCaller private caller;

    address private coordination = address(0xC00);
    address private agent = address(0xA11CE);
    address private recipient = address(0xB0B);
    uint256 private assignmentId = 7;
    uint256 private amount = 0.001 ether;
    bytes32 private payoutTxHash = keccak256("base-sepolia payout tx");

    function setUp() public {
        registry = new CoordinationPayoutReceiptRegistry();
        caller = new CoordinationPayoutReceiptRegistryCaller();
    }

    function testOwnerCanRecordAssignmentPayoutReceipt() public {
        registry.recordPayoutReceipt(coordination, assignmentId, agent, recipient, amount, payoutTxHash);

        (
            address storedAgent,
            address storedRecipient,
            uint256 storedAmount,
            bytes32 storedPayoutTxHash,
            uint256 storedBlockNumber,
            uint256 storedTimestamp,
            bool recorded
        ) = registry.receiptOf(coordination, assignmentId);

        require(storedAgent == agent, "agent mismatch");
        require(storedRecipient == recipient, "recipient mismatch");
        require(storedAmount == amount, "amount mismatch");
        require(storedPayoutTxHash == payoutTxHash, "payout tx hash mismatch");
        require(storedBlockNumber == block.number, "block number mismatch");
        require(storedTimestamp == block.timestamp, "timestamp mismatch");
        require(recorded, "receipt should be recorded");
    }

    function testDuplicateReceiptIsRejected() public {
        registry.recordPayoutReceipt(coordination, assignmentId, agent, recipient, amount, payoutTxHash);

        (bool ok,) = address(registry)
            .call(
                abi.encodeCall(
                    CoordinationPayoutReceiptRegistry.recordPayoutReceipt,
                    (coordination, assignmentId, agent, recipient, amount, payoutTxHash)
                )
            );

        require(!ok, "duplicate receipt should fail");
    }

    function testNonOwnerCannotRecordReceipt() public {
        (bool ok,) = caller.recordPayoutReceipt(
            address(registry), coordination, assignmentId, agent, recipient, amount, payoutTxHash
        );

        require(!ok, "non-owner receipt should fail");
    }

    function testInvalidReceiptFieldsAreRejected() public {
        (bool zeroCoordinationOk,) = address(registry)
            .call(
                abi.encodeCall(
                    CoordinationPayoutReceiptRegistry.recordPayoutReceipt,
                    (address(0), assignmentId, agent, recipient, amount, payoutTxHash)
                )
            );
        (bool zeroAgentOk,) = address(registry)
            .call(
                abi.encodeCall(
                    CoordinationPayoutReceiptRegistry.recordPayoutReceipt,
                    (coordination, assignmentId, address(0), recipient, amount, payoutTxHash)
                )
            );
        (bool zeroRecipientOk,) = address(registry)
            .call(
                abi.encodeCall(
                    CoordinationPayoutReceiptRegistry.recordPayoutReceipt,
                    (coordination, assignmentId, agent, address(0), amount, payoutTxHash)
                )
            );
        (bool zeroAmountOk,) = address(registry)
            .call(
                abi.encodeCall(
                    CoordinationPayoutReceiptRegistry.recordPayoutReceipt,
                    (coordination, assignmentId, agent, recipient, 0, payoutTxHash)
                )
            );
        (bool zeroPayoutTxOk,) = address(registry)
            .call(
                abi.encodeCall(
                    CoordinationPayoutReceiptRegistry.recordPayoutReceipt,
                    (coordination, assignmentId, agent, recipient, amount, bytes32(0))
                )
            );

        require(!zeroCoordinationOk, "zero coordination should fail");
        require(!zeroAgentOk, "zero agent should fail");
        require(!zeroRecipientOk, "zero recipient should fail");
        require(!zeroAmountOk, "zero amount should fail");
        require(!zeroPayoutTxOk, "zero payout tx should fail");
    }
}

contract CoordinationPayoutReceiptRegistryCaller {
    function recordPayoutReceipt(
        address registry,
        address coordination,
        uint256 assignmentId,
        address agent,
        address recipient,
        uint256 amount,
        bytes32 payoutTxHash
    ) external returns (bool ok, bytes memory result) {
        return registry.call(
            abi.encodeCall(
                CoordinationPayoutReceiptRegistry.recordPayoutReceipt,
                (coordination, assignmentId, agent, recipient, amount, payoutTxHash)
            )
        );
    }
}
