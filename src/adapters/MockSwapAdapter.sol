// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockSwapErc20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MockSwapAdapter {
    uint256 public immutable outputPerEth;

    event SwapExecuted(
        address indexed agent,
        address indexed tokenOut,
        address indexed recipient,
        uint256 ethIn,
        uint256 amountOut
    );

    error EmptySwap();
    error InvalidToken();
    error InvalidRecipient();
    error SlippageExceeded();
    error TransferFailed();

    constructor(uint256 outputPerEth_) {
        outputPerEth = outputPerEth_;
    }

    receive() external payable {}

    function quote(address tokenOut, uint256 ethIn) external view returns (uint256) {
        tokenOut;
        return quoteAmount(ethIn);
    }

    function swapExactEthForToken(address tokenOut, address recipient, uint256 minAmountOut)
        external
        payable
        returns (uint256 amountOut)
    {
        if (msg.value == 0) revert EmptySwap();
        if (tokenOut == address(0)) revert InvalidToken();
        if (recipient == address(0)) revert InvalidRecipient();

        amountOut = quoteAmount(msg.value);
        if (amountOut < minAmountOut) revert SlippageExceeded();

        bool ok = IMockSwapErc20(tokenOut).transfer(recipient, amountOut);
        if (!ok) revert TransferFailed();

        emit SwapExecuted(msg.sender, tokenOut, recipient, msg.value, amountOut);
    }

    function quoteAmount(uint256 ethIn) public view returns (uint256) {
        return (ethIn * outputPerEth) / 1 ether;
    }
}
