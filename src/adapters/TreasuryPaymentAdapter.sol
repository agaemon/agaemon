// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TreasuryPaymentAdapter {
    event PaymentForwarded(address indexed agent, address indexed recipient, uint256 amount);

    error InvalidRecipient();
    error EmptyPayment();
    error PaymentFailed();

    function pay(address payable recipient) external payable {
        if (recipient == address(0)) revert InvalidRecipient();
        if (msg.value == 0) revert EmptyPayment();

        (bool ok,) = recipient.call{value: msg.value}("");
        if (!ok) revert PaymentFailed();

        emit PaymentForwarded(msg.sender, recipient, msg.value);
    }
}
