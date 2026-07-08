// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "./lib/Owned.sol";

contract ReputationRegistry is Owned {
    mapping(address agent => uint256 score) private scores;

    event ReputationAdjusted(address indexed agent, int256 delta, uint256 newScore);

    error NegativeReputation();

    constructor() Owned(msg.sender) {}

    function adjustReputation(address agent, int256 delta) external onlyOwner {
        uint256 current = scores[agent];

        if (delta < 0) {
            uint256 decrease = uint256(-delta);
            if (decrease > current) revert NegativeReputation();
            scores[agent] = current - decrease;
        } else {
            scores[agent] = current + uint256(delta);
        }

        emit ReputationAdjusted(agent, delta, scores[agent]);
    }

    function scoreOf(address agent) external view returns (uint256) {
        return scores[agent];
    }
}
