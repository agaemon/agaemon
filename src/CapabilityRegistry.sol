// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "./lib/Owned.sol";

contract CapabilityRegistry is Owned {
    mapping(bytes32 capability => mapping(address target => bool allowed)) private allowedTargets;

    event CapabilitySet(bytes32 indexed capability, address indexed target, bool allowed);

    error InvalidTarget();

    constructor() Owned(msg.sender) {}

    function setCapability(bytes32 capability, address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert InvalidTarget();

        allowedTargets[capability][target] = allowed;
        emit CapabilitySet(capability, target, allowed);
    }

    function isAllowed(bytes32 capability, address target) external view returns (bool) {
        return allowedTargets[capability][target];
    }
}
