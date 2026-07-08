import { describe, expect, it } from "vitest";

import {
  formatAgentOsSdkIntegrationServeCliOutput,
  parseAgentOsSdkIntegrationServeCliArgs,
  runAgentOsSdkIntegrationServeCli,
} from "./serve.js";
import type { AgentOsSdkExampleCatalog } from "../../sdk/exampleCatalog.js";

const CATALOG: AgentOsSdkExampleCatalog = {
  schemaVersion: 1,
  generatedAt: "2026-07-04T00:00:00.000Z",
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

describe("parseAgentOsSdkIntegrationServeCliArgs", () => {
  it("parses host and port", () => {
    expect(parseAgentOsSdkIntegrationServeCliArgs(["--host=0.0.0.0", "--port", "8788"])).toEqual({
      host: "0.0.0.0",
      port: 8788,
    });
  });

  it("rejects invalid ports", () => {
    expect(() => parseAgentOsSdkIntegrationServeCliArgs(["--port", "65536"])).toThrow(
      "--port must be an integer from 0 to 65535",
    );
  });
});

describe("runAgentOsSdkIntegrationServeCli", () => {
  it("starts a local-only SDK integration server without RPC or signer env", async () => {
    const outputs: string[] = [];
    const listens: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runAgentOsSdkIntegrationServeCli({
      argv: ["--host", "127.0.0.1", "--port", "8788"],
      env,
      writeOutput: (output) => outputs.push(output),
      createCatalog: () => CATALOG,
      listen: async (server, port, host) => {
        listens.push({ hasServer: typeof server.close === "function", port, host });
      },
    });

    expect(listens).toEqual([{ hasServer: true, port: 8788, host: "127.0.0.1" }]);
    expect(outputs[0]).toContain("AgentOS SDK integration server");
    expect(outputs[0]).toContain("examples: http://127.0.0.1:8788/api/sdk/examples");
    expect(outputs[0]).toContain("verify: http://127.0.0.1:8788/api/sdk/examples/verify");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatAgentOsSdkIntegrationServeCliOutput", () => {
  it("summarizes read-only integration API routes", () => {
    expect(formatAgentOsSdkIntegrationServeCliOutput({ host: "127.0.0.1", port: 8788 })).toContain(
      "health: http://127.0.0.1:8788/healthz",
    );
  });
});
