// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockSwapAdapter} from "../src/adapters/MockSwapAdapter.sol";
import {MockERC20} from "../src/testsupport/MockERC20.sol";

interface DeployMockSwapAdapterVm {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployMockSwapAdapter {
    DeployMockSwapAdapterVm private constant vm =
        DeployMockSwapAdapterVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event MockSwapAdapterDeployed(address adapter, address indexed tokenOut, uint256 fundedAmount);

    function run() external returns (address adapterAddress) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address tokenOut = vm.envAddress("TEST_ERC20_TOKEN");

        vm.startBroadcast(privateKey);

        MockSwapAdapter adapter = new MockSwapAdapter(1000 ether);
        MockERC20(tokenOut).mint(address(adapter), 1_000_000 ether);

        emit MockSwapAdapterDeployed(address(adapter), tokenOut, 1_000_000 ether);

        vm.stopBroadcast();

        return address(adapter);
    }
}
