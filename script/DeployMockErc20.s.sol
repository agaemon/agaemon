// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "../src/testsupport/MockERC20.sol";

interface DeployMockErc20Vm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployMockErc20 {
    DeployMockErc20Vm private constant vm = DeployMockErc20Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event MockErc20Deployed(address token, address indexed mintedTo, uint256 amount);

    function run() external returns (address tokenAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ACCOUNT");

        vm.startBroadcast(privateKey);

        MockERC20 token = new MockERC20("AgentOS Test Token", "AOTT", 18);
        token.mint(agent, 100 ether);

        emit MockErc20Deployed(address(token), agent, 100 ether);

        vm.stopBroadcast();

        return address(token);
    }
}
