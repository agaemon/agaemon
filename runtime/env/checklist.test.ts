import { describe, expect, it } from "vitest";

import { createBaseSepoliaEnvChecklist } from "./checklist.js";

describe("createBaseSepoliaEnvChecklist", () => {
  it("marks release-only workflows as requiring no env values", () => {
    expect(createBaseSepoliaEnvChecklist({ scope: "release", env: {} })).toEqual({
      scope: "release",
      passed: true,
      missing: [],
      variables: [],
      notes: ["Base Sepolia release evidence commands read local files only."],
    });
  });

  it("requires only the RPC URL for read-only readiness", () => {
    expect(createBaseSepoliaEnvChecklist({ scope: "readiness", env: {} })).toMatchObject({
      scope: "readiness",
      passed: false,
      missing: ["BASE_SEPOLIA_RPC_URL"],
      variables: [
        {
          name: "BASE_SEPOLIA_RPC_URL",
          required: true,
          configured: false,
          secret: true,
          reason: "Required for read-only Base Sepolia manifest and readiness checks.",
        },
      ],
    });

    expect(
      createBaseSepoliaEnvChecklist({
        scope: "readiness",
        env: { BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org" },
      }).passed,
    ).toBe(true);
  });

  it("requires RPC, chain id, and private key for broadcast-capable workflows", () => {
    const report = createBaseSepoliaEnvChecklist({
      scope: "broadcast",
      env: {
        BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
        BASE_SEPOLIA_CHAIN_ID: "84532",
        PRIVATE_KEY: "0xabc123",
      },
    });

    expect(report).toMatchObject({
      scope: "broadcast",
      passed: true,
      missing: [],
    });
    expect(report.variables).toContainEqual({
      name: "BASE_SEPOLIA_RPC_URL",
      required: true,
      configured: true,
      secret: true,
      reason: "Required for read-only Base Sepolia manifest and readiness checks.",
      displayValue: "[redacted]",
    });
    expect(report.variables).toContainEqual({
      name: "PRIVATE_KEY",
      required: true,
      configured: true,
      secret: true,
      reason: "Required only when broadcasting transactions.",
      displayValue: "[redacted]",
    });
  });

  it("treats empty, placeholder, and wrong chain id values as missing", () => {
    const report = createBaseSepoliaEnvChecklist({
      scope: "broadcast",
      env: {
        BASE_SEPOLIA_RPC_URL: "",
        BASE_SEPOLIA_CHAIN_ID: "1",
        PRIVATE_KEY: "0xreplace_with_base_sepolia_test_wallet_private_key",
      },
    });

    expect(report).toMatchObject({
      passed: false,
      missing: ["BASE_SEPOLIA_RPC_URL", "BASE_SEPOLIA_CHAIN_ID", "PRIVATE_KEY"],
    });
    expect(report.variables).toContainEqual({
      name: "BASE_SEPOLIA_CHAIN_ID",
      required: true,
      configured: false,
      secret: false,
      reason: "Must be 84532 for Base Sepolia broadcasts.",
      displayValue: "1",
    });
  });

  it("combines all scopes without duplicating variables", () => {
    const report = createBaseSepoliaEnvChecklist({
      scope: "all",
      env: { BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org" },
    });

    expect(report.scope).toBe("all");
    expect(report.missing).toEqual(["BASE_SEPOLIA_CHAIN_ID", "PRIVATE_KEY"]);
    expect(report.variables.map((variable) => variable.name)).toEqual([
      "BASE_SEPOLIA_RPC_URL",
      "BASE_SEPOLIA_CHAIN_ID",
      "PRIVATE_KEY",
    ]);
  });
});
