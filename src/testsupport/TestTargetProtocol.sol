// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TestTargetProtocol {
    bool public wasCalled;

    event Marked(address indexed caller, uint256 value);

    function mark() external payable {
        wasCalled = true;
        emit Marked(msg.sender, msg.value);
    }
}
