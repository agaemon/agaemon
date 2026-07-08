// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CoordinationPayoutReceiptRegistry} from "../src/CoordinationPayoutReceiptRegistry.sol";

interface VerifyCoordinationPayoutReceiptVm {
    function envAddress(string calldata name) external view returns (address);
    function envBytes32(string calldata name) external view returns (bytes32);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
    function envUint(string calldata name) external view returns (uint256);
}

contract VerifyCoordinationPayoutReceipt {
    VerifyCoordinationPayoutReceiptVm private constant vm =
        VerifyCoordinationPayoutReceiptVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        address registryAddress = vm.envAddress("COORDINATION_PAYOUT_RECEIPT_REGISTRY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address recipientAddress = vm.envAddress("PAYOUT_RECIPIENT");
        uint256 amount = vm.envOr("COORDINATION_PAYOUT_AMOUNT_WEI", uint256(0.000001 ether));
        bytes32 payoutTxHash = vm.envBytes32("COORDINATION_PAYOUT_TX_HASH");

        (
            address storedAgent,
            address storedRecipient,
            uint256 storedAmount,
            bytes32 storedPayoutTxHash,
            uint256 storedBlockNumber,
            uint256 storedTimestamp,
            bool recorded
        ) = CoordinationPayoutReceiptRegistry(registryAddress).receiptOf(coordinationAddress, assignmentId);

        require(recorded, "payout receipt is not recorded");
        require(storedAgent == agentAddress, "receipt agent mismatch");
        require(storedRecipient == recipientAddress, "receipt recipient mismatch");
        require(storedAmount == amount, "receipt amount mismatch");
        require(storedPayoutTxHash == payoutTxHash, "receipt payout tx mismatch");
        require(storedBlockNumber > 0, "receipt block missing");
        require(storedTimestamp > 0, "receipt timestamp missing");
    }
}
