// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayoutRuleAdapter} from "../src/adapters/PayoutRuleAdapter.sol";

contract PayoutRuleAdapterFuzzTest {
    uint256 private constant MAX_ACTION_VALUE = 0.02 ether;
    uint256 private constant MAX_DAILY_VALUE = 0.03 ether;

    PayoutRuleAdapter private adapter;
    PayoutRecipient private recipient;

    function setUp() public {
        adapter = new PayoutRuleAdapter();
        recipient = new PayoutRecipient();

        adapter.setPayoutRule(address(this), payable(address(recipient)), MAX_ACTION_VALUE, MAX_DAILY_VALUE, true);
    }

    function testFuzzValueAbovePayoutActionLimitIsRejected(uint256 rawAmount) public {
        uint256 amount = MAX_ACTION_VALUE + 1 + (rawAmount % MAX_ACTION_VALUE);

        (bool ok,) = address(adapter).call{value: amount}(
            abi.encodeCall(PayoutRuleAdapter.payout, (payable(address(recipient))))
        );

        require(!ok, "over-limit payout should be rejected");
        require(address(recipient).balance == 0, "recipient should not receive rejected payout");
        require(
            adapter.dailyPayouts(address(this), address(recipient), block.timestamp / 1 days) == 0,
            "rejected payout should not update daily amount"
        );
    }
}

contract PayoutRecipient {
    receive() external payable {}
}
