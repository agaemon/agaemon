// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract ReputationRegistryFuzzTest {
    ReputationRegistry private registry;
    address private agent = address(0xA11CE);

    function setUp() public {
        registry = new ReputationRegistry();
    }

    function testFuzzNegativeDeltaCannotUnderflowReputation(uint256 rawCurrent, uint256 rawExcess) public {
        uint256 current = rawCurrent % 1_000_000 ether;
        if (current > 0) {
            registry.adjustReputation(agent, int256(current));
        }

        uint256 excess = 1 + (rawExcess % 1_000_000 ether);
        int256 delta = -int256(current + excess);

        (bool ok,) = address(registry).call(abi.encodeCall(ReputationRegistry.adjustReputation, (agent, delta)));

        require(!ok, "over-large negative delta should be rejected");
        require(registry.scoreOf(agent) == current, "rejected delta should not change score");
    }
}
