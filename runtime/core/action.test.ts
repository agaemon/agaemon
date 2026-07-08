import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";

import { createAction } from "./action.js";

const capability = `0x${"11".repeat(32)}` as Hex;
const target = "0x0000000000000000000000000000000000000001" as Address;

describe("createAction", () => {
  it("fills safe defaults for optional action fields", () => {
    expect(createAction({ capability, target })).toEqual({
      capability,
      target,
      value: 0n,
      data: "0x",
      usesBorrowing: false,
    });
  });

  it("preserves explicit action fields", () => {
    expect(
      createAction({
        capability,
        target,
        value: 123n,
        data: "0x1234",
        usesBorrowing: true,
      }),
    ).toEqual({
      capability,
      target,
      value: 123n,
      data: "0x1234",
      usesBorrowing: true,
    });
  });
});
