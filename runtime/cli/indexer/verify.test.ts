import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type { AgentOsEventIndex } from "../../indexer/events.js";
import type { AgentOsEventIndexVerification } from "../../indexer/verify.js";
import {
  formatEventIndexVerifyCliOutput,
  parseEventIndexVerifyCliArgs,
  runEventIndexVerifyCli,
} from "./verify.js";

const INDEX: AgentOsEventIndex = {
  schemaVersion: 1,
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    network: "base-sepolia",
    chainId: 84532,
    contracts: {},
  },
  replay: {
    fromBlock: "100",
    toBlock: null,
    inputLogCount: 0,
    indexedEventCount: 0,
  },
  economicEvents: {
    eventCount: 0,
    latestBlock: null,
    byContract: [],
    byEventName: [],
  },
  events: [],
};
const MANIFEST = { network: "base-sepolia", chainId: 84532 } as DeploymentManifest;
const VERIFICATION: AgentOsEventIndexVerification = {
  passed: true,
  summary: { checks: 7, passed: 7, failed: 0 },
  failures: [],
  checks: [],
  store: {
    path: "artifacts/base-event-index.json",
    sha256: "a".repeat(64),
  },
};

describe("parseEventIndexVerifyCliArgs", () => {
  it("parses index, manifest, block expectations, output, and format", () => {
    expect(parseEventIndexVerifyCliArgs([
      "--index", "artifacts/custom-index.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--from-block", "100",
      "--to-block=200",
      "--expected-sha256", "a".repeat(64),
      "--output", "artifacts/custom-index-verification.json",
      "--format", "summary",
    ])).toEqual({
      indexPath: "artifacts/custom-index.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      fromBlock: 100n,
      toBlock: 200n,
      expectedSha256: "a".repeat(64),
      outputPath: "artifacts/custom-index-verification.json",
      format: "summary",
    });
  });
});

describe("runEventIndexVerifyCli", () => {
  it("verifies a saved index locally without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const verifyParams: unknown[] = [];
    let exitCode: number | undefined;

    const indexJson = JSON.stringify(INDEX);
    const indexSha256 = createHash("sha256").update(indexJson).digest("hex");

    await runEventIndexVerifyCli({
      argv: [
        "--from-block", "100",
        "--expected-sha256", indexSha256,
        "--output", "artifacts/base-event-index-verification.json",
        "--format", "summary",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => path.endsWith("base-event-index.json")
        ? indexJson
        : JSON.stringify(MANIFEST),
      readManifest: async () => MANIFEST,
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      verifyIndex: (params) => {
        verifyParams.push(params);
        return VERIFICATION;
      },
    });

    expect(exitCode).toBeUndefined();
    expect(verifyParams[0]).toMatchObject({
      index: INDEX,
      manifest: MANIFEST,
      expectedManifestPath: "deployments/base-sepolia/latest.json",
      expectedFromBlock: 100n,
      store: {
        path: "artifacts/base-event-index.json",
        sha256: indexSha256,
      },
      expectedStoreSha256: indexSha256,
    });
    expect(writes).toEqual([
      {
        path: "artifacts/base-event-index-verification.json",
        contents: `${JSON.stringify(VERIFICATION, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("overall: passed");
  });
});

describe("formatEventIndexVerifyCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatEventIndexVerifyCliOutput(VERIFICATION, "json")).toContain("\"passed\": true");
    expect(formatEventIndexVerifyCliOutput(VERIFICATION, "summary")).toContain("overall: passed");
  });
});
