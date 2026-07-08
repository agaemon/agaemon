import { decodeFunctionData, parseUnits } from "viem";
import { describe, expect, it } from "vitest";

import { createErc20TransferAction, ERC20_TRANSFER_ABI, ERC20_TRANSFER_CAPABILITY } from "./transfer.js";

describe("createErc20TransferAction", () => {
  it("builds an ERC20_TRANSFER action with direct token transfer calldata", () => {
    const action = createErc20TransferAction({
      token: "0x0000000000000000000000000000000000000e20",
      recipient: "0x0000000000000000000000000000000000000b11",
      amount: parseUnits("2.5", 18),
    });

    const decoded = decodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      data: action.data,
    });

    expect(action.capability).toBe(ERC20_TRANSFER_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000e20");
    expect(action.value).toBe(0n);
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.args[0].toLowerCase()).toBe("0x0000000000000000000000000000000000000b11");
    expect(decoded.args[1]).toBe(parseUnits("2.5", 18));
  });
});
