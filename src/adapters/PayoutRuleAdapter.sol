// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../lib/Owned.sol";

contract PayoutRuleAdapter is Owned {
    struct PayoutRule {
        uint256 maxActionValue;
        uint256 maxDailyValue;
        bool enabled;
    }

    mapping(address agent => mapping(address recipient => PayoutRule rule)) public payoutRules;
    mapping(address agent => mapping(address recipient => mapping(uint256 day => uint256 amount))) public dailyPayouts;

    event PayoutRuleSet(
        address indexed agent,
        address indexed recipient,
        uint256 maxActionValue,
        uint256 maxDailyValue,
        bool enabled
    );
    event PayoutSent(
        address indexed agent,
        address indexed recipient,
        uint256 amount,
        uint256 indexed day,
        uint256 dailyAmount
    );

    error InvalidAgent();
    error InvalidRecipient();
    error InvalidPayoutRule();
    error PayoutRuleDisabled();
    error EmptyPayout();
    error PayoutActionLimitExceeded();
    error PayoutDailyLimitExceeded();
    error PayoutFailed();

    constructor() Owned(msg.sender) {}

    function setPayoutRule(
        address agent,
        address payable recipient,
        uint256 maxActionValue,
        uint256 maxDailyValue,
        bool enabled
    ) external onlyOwner {
        if (agent == address(0)) revert InvalidAgent();
        if (recipient == address(0)) revert InvalidRecipient();
        if (enabled && (maxActionValue == 0 || maxDailyValue < maxActionValue)) revert InvalidPayoutRule();

        payoutRules[agent][recipient] = PayoutRule({
            maxActionValue: maxActionValue,
            maxDailyValue: maxDailyValue,
            enabled: enabled
        });

        emit PayoutRuleSet(agent, recipient, maxActionValue, maxDailyValue, enabled);
    }

    function payout(address payable recipient) external payable {
        if (recipient == address(0)) revert InvalidRecipient();
        if (msg.value == 0) revert EmptyPayout();

        PayoutRule memory rule = payoutRules[msg.sender][recipient];
        if (!rule.enabled) revert PayoutRuleDisabled();
        if (msg.value > rule.maxActionValue) revert PayoutActionLimitExceeded();

        uint256 day = block.timestamp / 1 days;
        uint256 dailyAmount = dailyPayouts[msg.sender][recipient][day] + msg.value;
        if (dailyAmount > rule.maxDailyValue) revert PayoutDailyLimitExceeded();

        dailyPayouts[msg.sender][recipient][day] = dailyAmount;

        (bool ok,) = recipient.call{value: msg.value}("");
        if (!ok) revert PayoutFailed();

        emit PayoutSent(msg.sender, recipient, msg.value, day, dailyAmount);
    }
}
