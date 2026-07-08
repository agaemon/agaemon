// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgent {
    struct AgentAction {
        bytes32 capability;
        address target;
        uint256 value;
        bytes data;
        bool usesBorrowing;
    }

    event Executed(
        address indexed caller, bytes32 indexed capability, address indexed target, uint256 value, bytes result
    );
    event DelegateSet(address indexed subagent, bool allowed);
    event Paused(address indexed caller);
    event Unpaused(address indexed caller);

    function execute(AgentAction calldata action) external payable returns (bytes memory result);
    function delegate(address subagent) external;
    function pause() external;
    function unpause() external;
    function reputation() external view returns (uint256);
    function capabilities() external view returns (address);
}
