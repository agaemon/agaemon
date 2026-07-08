// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CoordinationPayoutReceiptRegistry} from "../src/CoordinationPayoutReceiptRegistry.sol";

interface RecordCoordinationPayoutReceiptVm {
    function envAddress(string calldata name) external view returns (address);
    function envBytes32(string calldata name) external view returns (bytes32);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract RecordCoordinationPayoutReceipt {
    RecordCoordinationPayoutReceiptVm private constant vm =
        RecordCoordinationPayoutReceiptVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CoordinationPayoutReceiptRecorded(
        address indexed registry,
        address indexed coordination,
        uint256 indexed assignmentId,
        address agent,
        address recipient,
        uint256 amount,
        bytes32 payoutTxHash
    );

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("COORDINATION_PAYOUT_RECEIPT_REGISTRY");
        address coordinationAddress = vm.envAddress("AGENT_COORDINATION");
        uint256 assignmentId = vm.envUint("COORDINATION_ASSIGNMENT_ID");
        address agentAddress = vm.envAddress("AGENT_ACCOUNT");
        address recipientAddress = vm.envAddress("PAYOUT_RECIPIENT");
        uint256 amount = vm.envOr("COORDINATION_PAYOUT_AMOUNT_WEI", uint256(0.000001 ether));
        bytes32 payoutTxHash = vm.envBytes32("COORDINATION_PAYOUT_TX_HASH");

        vm.startBroadcast(privateKey);

        CoordinationPayoutReceiptRegistry(registryAddress)
            .recordPayoutReceipt(
                coordinationAddress, assignmentId, agentAddress, recipientAddress, amount, payoutTxHash
            );
        emit CoordinationPayoutReceiptRecorded(
            registryAddress, coordinationAddress, assignmentId, agentAddress, recipientAddress, amount, payoutTxHash
        );

        vm.stopBroadcast();
    }
}
