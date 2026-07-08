import { describe, expect, it } from "vitest";

import type {
  AgentOsSdkExampleCatalog,
  AgentOsSdkExampleCatalogVerification,
} from "../../sdk/exampleCatalog.js";
import {
  formatAgentOsSdkExampleCatalogCliOutput,
  parseAgentOsSdkExampleCatalogCliArgs,
  runAgentOsSdkExampleCatalogCli,
} from "./exampleCatalog.js";
import {
  formatAgentOsSdkExampleCatalogVerifyCliOutput,
  parseAgentOsSdkExampleCatalogVerifyCliArgs,
  runAgentOsSdkExampleCatalogVerifyCli,
} from "./exampleCatalogVerify.js";

const CATALOG: AgentOsSdkExampleCatalog = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T12:00:00.000Z",
  chainId: 84532,
  trustBoundary: {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    callClass: "local-only",
    mainnet: false,
    liveFunds: false,
  },
  examples: [],
};

const VERIFICATION: AgentOsSdkExampleCatalogVerification = {
  passed: true,
  failures: [],
  expected: CATALOG,
};

describe("parseAgentOsSdkExampleCatalogCliArgs", () => {
  it("parses output and format flags", () => {
    expect(parseAgentOsSdkExampleCatalogCliArgs([
      "--output",
      "artifacts/sdk/examples.json",
      "--format=summary",
    ])).toEqual({
      outputPath: "artifacts/sdk/examples.json",
      format: "summary",
    });
  });
});

describe("parseAgentOsSdkExampleCatalogVerifyCliArgs", () => {
  it("parses catalog, output, and format flags", () => {
    expect(parseAgentOsSdkExampleCatalogVerifyCliArgs([
      "--catalog=artifacts/sdk/examples.json",
      "--output",
      "artifacts/sdk/examples-verify.json",
      "--format",
      "summary",
    ])).toEqual({
      catalogPath: "artifacts/sdk/examples.json",
      outputPath: "artifacts/sdk/examples-verify.json",
      format: "summary",
    });
  });
});

describe("runAgentOsSdkExampleCatalogCli", () => {
  it("writes a local-only catalog without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runAgentOsSdkExampleCatalogCli({
      argv: ["--output", "artifacts/sdk/examples.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      createCatalog: () => CATALOG,
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      mkdirp: async () => {},
    });

    expect(writes).toEqual([
      {
        path: "artifacts/sdk/examples.json",
        contents: `${JSON.stringify(CATALOG, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("callClass: local-only");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("runAgentOsSdkExampleCatalogVerifyCli", () => {
  it("verifies a saved catalog locally without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runAgentOsSdkExampleCatalogVerifyCli({
      argv: ["--catalog", "artifacts/sdk/examples.json", "--output", "artifacts/sdk/examples-verify.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      readText: async () => JSON.stringify(CATALOG),
      verifyCatalog: () => VERIFICATION,
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      mkdirp: async () => {},
    });

    expect(writes).toEqual([
      {
        path: "artifacts/sdk/examples-verify.json",
        contents: `${JSON.stringify(VERIFICATION, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("passed: true");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatAgentOsSdkExampleCatalogCliOutput", () => {
  it("formats JSON output", () => {
    expect(formatAgentOsSdkExampleCatalogCliOutput(CATALOG, "json")).toBe(JSON.stringify(CATALOG, null, 2));
  });
});

describe("formatAgentOsSdkExampleCatalogVerifyCliOutput", () => {
  it("formats JSON output", () => {
    expect(formatAgentOsSdkExampleCatalogVerifyCliOutput(VERIFICATION, "json")).toBe(JSON.stringify(VERIFICATION, null, 2));
  });
});
