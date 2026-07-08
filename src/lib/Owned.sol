// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract Owned {
    address public immutable owner;

    error NotOwner();
    error InvalidOwner();

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidOwner();
        owner = initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
}
