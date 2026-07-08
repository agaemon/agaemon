import { decodeFunctionData, getAddress } from "viem";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  COORDINATION_PAYOUT_RECEIPT_ABI,
  createRecordCoordinationPayoutReceiptTransaction,
  formatCoordinationPayoutReceipt,
} from "./receipt.js";

const registry = "0x0000000000000000000000000000000000000a01" as Address;
const coordination = "0x0000000000000000000000000000000000000c00" as Address;
const agent = "0x0000000000000000000000000000000000000a11" as Address;
const recipient = "0x0000000000000000000000000000000000000b0b" as Address;
const payoutTxHash = "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex;

describe("createRecordCoordinationPayoutReceiptTransaction", () => {
  it("builds an owner transaction that records an assignment payout receipt", () => {
    const transaction = createRecordCoordinationPayoutReceiptTransaction({
      registry,
      coordination,
      assignmentId: 7n,
      agent,
      recipient,
      amountWei: 1_000_000_000_000n,
      payoutTxHash,
    });

    const decoded = decodeFunctionData({
      abi: COORDINATION_PAYOUT_RECEIPT_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe(registry);
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("recordPayoutReceipt");
    expect(decoded.args).toStrictEqual([
      coordination,
      7n,
      agent,
      getAddress(recipient),
      1_000_000_000_000n,
      payoutTxHash,
    ]);
  });
});

describe("formatCoordinationPayoutReceipt", () => {
  it("formats receipt tuples into named fields", () => {
    const receipt = formatCoordinationPayoutReceipt([
      agent,
      recipient,
      1_000_000_000_000n,
      payoutTxHash,
      123n,
      456n,
      true,
    ]);

    expect(receipt).toStrictEqual({
      agent,
      recipient,
      amountWei: 1_000_000_000_000n,
      payoutTxHash,
      blockNumber: 123n,
      timestamp: 456n,
      recorded: true,
    });
  });
});
