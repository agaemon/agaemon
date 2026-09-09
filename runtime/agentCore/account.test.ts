import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  AGENT_ACCOUNT_ABI,
  createDelegateTransaction,
  createRevokeDelegateTransaction,
  createPauseTransaction,
  resolveAgentAccountOperation,
  createUnpauseTransaction,
} from "./account.js";

describe("agent account operation transactions", () => {
  it("builds a delegate transaction", () => {
    const transaction = createDelegateTransaction({
      agent: "0x0000000000000000000000000000000000000a11",
      delegate: "0x0000000000000000000000000000000000000de1",
    });

    const decoded = decodeFunctionData({
      abi: AGENT_ACCOUNT_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000a11");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("delegate");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000dE1");
  });

  it("builds a revoke transaction", () => {
    const transaction = createRevokeDelegateTransaction({
      agent: "0x0000000000000000000000000000000000000a11",
      delegate: "0x0000000000000000000000000000000000000de1",
    });
    expect(transaction.to).toBe("0x0000000000000000000000000000000000000a11");
    expect(transaction.value).toBe(0n);
    expect(decodeFunctionData({ abi: AGENT_ACCOUNT_ABI, data: transaction.data })).toMatchObject({
      functionName: "revokeDelegate", args: ["0x0000000000000000000000000000000000000dE1"],
    });
  });

  it("builds pause and unpause transactions", () => {
    const pause = createPauseTransaction({ agent: "0x0000000000000000000000000000000000000a11" });
    const unpause = createUnpauseTransaction({ agent: "0x0000000000000000000000000000000000000a11" });

    const decodedPause = decodeFunctionData({ abi: AGENT_ACCOUNT_ABI, data: pause.data });
    const decodedUnpause = decodeFunctionData({ abi: AGENT_ACCOUNT_ABI, data: unpause.data });

    expect(pause.to).toBe("0x0000000000000000000000000000000000000a11");
    expect(pause.value).toBe(0n);
    expect(decodedPause.functionName).toBe("pause");
    expect(unpause.to).toBe("0x0000000000000000000000000000000000000a11");
    expect(unpause.value).toBe(0n);
    expect(decodedUnpause.functionName).toBe("unpause");
  });
});

describe("resolveAgentAccountOperation", () => {
  it("does not treat env delegate as a state-changing operation by itself", () => {
    const result = resolveAgentAccountOperation({
      envDelegate: "0x0000000000000000000000000000000000000dE1",
      pause: false,
      send: false,
      unpause: false,
    });

    expect(result).toBeNull();
  });

  it("requires an explicit operation when sending", () => {
    expect(() =>
      resolveAgentAccountOperation({
        envDelegate: "0x0000000000000000000000000000000000000dE1",
        pause: false,
        send: true,
        unpause: false,
      }),
    ).toThrow("--send requires --delegate, --revoke-delegate, --pause, or --unpause");
  });

  it("resolves revocation and rejects conflicting operations", () => {
    const revokeDelegate = "0x0000000000000000000000000000000000000dE1";
    const params = { revokeDelegate, pause: false, unpause: false, send: false } as const;
    expect(resolveAgentAccountOperation(params)).toEqual({ name: "revokeDelegate", delegate: revokeDelegate });
    for (const conflict of [{ delegate: revokeDelegate }, { pause: true }, { unpause: true }] as const) {
      expect(() => resolveAgentAccountOperation({ ...params, ...conflict })).toThrow("Choose only one operation");
    }
  });

  it("resolves explicit delegate operations", () => {
    const result = resolveAgentAccountOperation({
      delegate: "0x0000000000000000000000000000000000000dE1",
      envDelegate: "0x0000000000000000000000000000000000000b0b",
      pause: false,
      send: false,
      unpause: false,
    });

    expect(result).toEqual({
      name: "delegate",
      delegate: "0x0000000000000000000000000000000000000dE1",
    });
  });
});
