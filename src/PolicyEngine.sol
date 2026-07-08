// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CapabilityRegistry} from "./CapabilityRegistry.sol";
import {IAgent} from "./interfaces/IAgent.sol";
import {Owned} from "./lib/Owned.sol";

contract PolicyEngine is Owned {
    enum DecisionCode {
        Allowed,
        PolicyNotConfigured,
        CapabilityDenied,
        ActionValueExceeded,
        DailyValueExceeded,
        BorrowingDenied,
        TokenPolicyNotConfigured,
        InvalidTokenTransfer,
        TokenActionAmountExceeded,
        TokenDailyAmountExceeded,
        SwapPolicyNotConfigured,
        InvalidSwap,
        SwapMinOutputTooLow
    }

    struct Policy {
        uint256 maxActionValue;
        uint256 maxDailyValue;
        bool allowBorrowing;
        bool configured;
    }

    struct TokenPolicy {
        uint256 maxActionAmount;
        uint256 maxDailyAmount;
        bool configured;
    }

    bytes32 public constant ERC20_TRANSFER = keccak256("ERC20_TRANSFER");
    bytes32 public constant SWAP_EXACT_ETH_FOR_TOKEN = keccak256("SWAP_EXACT_ETH_FOR_TOKEN");
    bytes4 private constant ERC20_TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));
    bytes4 private constant SWAP_EXACT_ETH_FOR_TOKEN_SELECTOR =
        bytes4(keccak256("swapExactEthForToken(address,address,uint256)"));

    struct SwapPolicy {
        uint256 minOutputPerEth;
        bool configured;
    }

    CapabilityRegistry public immutable capabilityRegistry;

    mapping(address agent => Policy policy) public policies;
    mapping(address agent => mapping(uint256 day => uint256 spent)) public dailySpent;
    mapping(address agent => mapping(address token => TokenPolicy policy)) public tokenPolicies;
    mapping(address agent => mapping(address token => mapping(uint256 day => uint256 spent))) public dailyTokenSpent;
    mapping(address agent => mapping(address adapter => mapping(address tokenOut => SwapPolicy policy))) public
        swapPolicies;

    event PolicySet(address indexed agent, uint256 maxActionValue, uint256 maxDailyValue, bool allowBorrowing);
    event TokenPolicySet(address indexed agent, address indexed token, uint256 maxActionAmount, uint256 maxDailyAmount);
    event SwapPolicySet(address indexed agent, address indexed adapter, address indexed tokenOut, uint256 minOutputPerEth);
    event ActionRecorded(address indexed agent, uint256 indexed day, uint256 value);
    event TokenActionRecorded(address indexed agent, address indexed token, uint256 indexed day, uint256 amount);

    error PolicyRejected(DecisionCode code);
    error UnauthorizedPolicyCaller();

    constructor(CapabilityRegistry registry) Owned(msg.sender) {
        capabilityRegistry = registry;
    }

    function setPolicy(address agent, uint256 maxActionValue, uint256 maxDailyValue, bool allowBorrowing)
        external
        onlyOwner
    {
        policies[agent] = Policy({
            maxActionValue: maxActionValue,
            maxDailyValue: maxDailyValue,
            allowBorrowing: allowBorrowing,
            configured: true
        });

        emit PolicySet(agent, maxActionValue, maxDailyValue, allowBorrowing);
    }

    function setTokenPolicy(address agent, address token, uint256 maxActionAmount, uint256 maxDailyAmount)
        external
        onlyOwner
    {
        tokenPolicies[agent][token] =
            TokenPolicy({maxActionAmount: maxActionAmount, maxDailyAmount: maxDailyAmount, configured: true});

        emit TokenPolicySet(agent, token, maxActionAmount, maxDailyAmount);
    }

    function setSwapPolicy(address agent, address adapter, address tokenOut, uint256 minOutputPerEth) external onlyOwner {
        swapPolicies[agent][adapter][tokenOut] = SwapPolicy({minOutputPerEth: minOutputPerEth, configured: true});

        emit SwapPolicySet(agent, adapter, tokenOut, minOutputPerEth);
    }

    function checkAction(address agent, IAgent.AgentAction calldata action)
        public
        view
        returns (bool allowed, DecisionCode code)
    {
        Policy memory policy = policies[agent];
        if (!policy.configured) return (false, DecisionCode.PolicyNotConfigured);

        if (!capabilityRegistry.isAllowed(action.capability, action.target)) {
            return (false, DecisionCode.CapabilityDenied);
        }

        if (action.usesBorrowing && !policy.allowBorrowing) {
            return (false, DecisionCode.BorrowingDenied);
        }

        if (action.capability == ERC20_TRANSFER) {
            return checkTokenTransfer(agent, action);
        }

        if (action.capability == SWAP_EXACT_ETH_FOR_TOKEN) {
            return checkSwap(agent, action, policy);
        }

        if (action.value > policy.maxActionValue) {
            return (false, DecisionCode.ActionValueExceeded);
        }

        uint256 day = block.timestamp / 1 days;
        if (dailySpent[agent][day] + action.value > policy.maxDailyValue) {
            return (false, DecisionCode.DailyValueExceeded);
        }

        return (true, DecisionCode.Allowed);
    }

    function checkSwap(address agent, IAgent.AgentAction calldata action, Policy memory policy)
        private
        view
        returns (bool allowed, DecisionCode code)
    {
        (bool valid, address tokenOut,, uint256 minAmountOut) = decodeSwap(action.data);
        if (!valid || action.value == 0) {
            return (false, DecisionCode.InvalidSwap);
        }

        SwapPolicy memory swapPolicy = swapPolicies[agent][action.target][tokenOut];
        if (!swapPolicy.configured) {
            return (false, DecisionCode.SwapPolicyNotConfigured);
        }

        uint256 requiredMinOut = (action.value * swapPolicy.minOutputPerEth) / 1 ether;
        if (minAmountOut < requiredMinOut) {
            return (false, DecisionCode.SwapMinOutputTooLow);
        }

        if (action.value > policy.maxActionValue) {
            return (false, DecisionCode.ActionValueExceeded);
        }

        uint256 day = block.timestamp / 1 days;
        if (dailySpent[agent][day] + action.value > policy.maxDailyValue) {
            return (false, DecisionCode.DailyValueExceeded);
        }

        return (true, DecisionCode.Allowed);
    }

    function enforce(address agent, IAgent.AgentAction calldata action) external {
        if (msg.sender != agent) revert UnauthorizedPolicyCaller();

        (bool allowed, DecisionCode code) = checkAction(agent, action);
        if (!allowed) revert PolicyRejected(code);

        uint256 day = block.timestamp / 1 days;
        if (action.capability == ERC20_TRANSFER) {
            (, uint256 amount) = decodeTokenTransfer(action.data);
            dailyTokenSpent[agent][action.target][day] += amount;
            emit TokenActionRecorded(agent, action.target, day, amount);
        } else {
            dailySpent[agent][day] += action.value;
            emit ActionRecorded(agent, day, action.value);
        }
    }

    function checkTokenTransfer(address agent, IAgent.AgentAction calldata action)
        private
        view
        returns (bool allowed, DecisionCode code)
    {
        if (action.value != 0) {
            return (false, DecisionCode.InvalidTokenTransfer);
        }

        TokenPolicy memory tokenPolicy = tokenPolicies[agent][action.target];
        if (!tokenPolicy.configured) {
            return (false, DecisionCode.TokenPolicyNotConfigured);
        }

        (bool valid, uint256 amount) = decodeTokenTransfer(action.data);
        if (!valid) {
            return (false, DecisionCode.InvalidTokenTransfer);
        }

        if (amount > tokenPolicy.maxActionAmount) {
            return (false, DecisionCode.TokenActionAmountExceeded);
        }

        uint256 day = block.timestamp / 1 days;
        if (dailyTokenSpent[agent][action.target][day] + amount > tokenPolicy.maxDailyAmount) {
            return (false, DecisionCode.TokenDailyAmountExceeded);
        }

        return (true, DecisionCode.Allowed);
    }

    function decodeTokenTransfer(bytes calldata data) private pure returns (bool valid, uint256 amount) {
        if (data.length != 68) {
            return (false, 0);
        }

        bytes4 selector = bytes4(data[:4]);
        address recipient;
        (recipient, amount) = abi.decode(data[4:], (address, uint256));

        if (selector != ERC20_TRANSFER_SELECTOR || recipient == address(0)) {
            return (false, 0);
        }

        return (true, amount);
    }

    function decodeSwap(bytes calldata data)
        private
        pure
        returns (bool valid, address tokenOut, address recipient, uint256 minAmountOut)
    {
        if (data.length != 100) {
            return (false, address(0), address(0), 0);
        }

        bytes4 selector = bytes4(data[:4]);
        (tokenOut, recipient, minAmountOut) = abi.decode(data[4:], (address, address, uint256));

        if (selector != SWAP_EXACT_ETH_FOR_TOKEN_SELECTOR || tokenOut == address(0) || recipient == address(0)) {
            return (false, address(0), address(0), 0);
        }

        return (true, tokenOut, recipient, minAmountOut);
    }
}
