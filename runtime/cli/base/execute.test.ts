import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import {
  DEPLOYMENT_AGENT_PROFILE_FIELDS,
  DEPLOYMENT_MANIFEST_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS,
  DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_REQUIRED_FIELDS,
  DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS,
  DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS,
  DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS,
} from "../../base/deploymentManifest.js";
import { formatBaseExecuteCliOutput } from "./execute.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type { AgentAction } from "../../core/action.js";
import type { SimulatePolicy } from "../../core/policy.js";
import type { BuildExecuteTransactionResult } from "../../transactions/builder.js";
import type { BaseExecuteCliReport } from "./execute.js";
import type { Hex } from "viem";

const DRY_RUN_ALLOWED: BaseExecuteCliReport = {
  mode: "dry-run",
  chainId: 84532,
  agent: "0x0000000000000000000000000000000000001001",
  target: "0x0000000000000000000000000000000000001002",
  allowed: true,
  decision: {
    allowed: true,
    code: "Allowed",
  },
  transaction: {
    to: "0x0000000000000000000000000000000000001001",
    value: "0",
    data: "0xabcdef",
  },
};

const DENIED: BaseExecuteCliReport = {
  mode: "dry-run",
  chainId: 84532,
  allowed: false,
  decision: {
    allowed: false,
    code: "CapabilityDenied",
  },
  transaction: null,
};

const SENT: BaseExecuteCliReport = {
  ...DRY_RUN_ALLOWED,
  mode: "send",
  hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  explorerUrl: "https://sepolia.basescan.org/tx/0x1111111111111111111111111111111111111111111111111111111111111111",
  receipt: {
    blockNumber: "123",
    status: "success",
  },
};

const RUNNER_MANIFEST: DeploymentManifest = {
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  owner: "0x0000000000000000000000000000000000001000",
  contracts: {
    capabilityRegistry: "0x0000000000000000000000000000000000001003",
    policyEngine: "0x0000000000000000000000000000000000001004",
    reputationRegistry: "0x0000000000000000000000000000000000001005",
    agentAccount: "0x0000000000000000000000000000000000001001",
    testTargetProtocol: "0x0000000000000000000000000000000000001002",
  },
  transactions: {
    deployCapabilityRegistry: "0x0000000000000000000000000000000000000000000000000000000000000000",
    deployPolicyEngine: "0x0000000000000000000000000000000000000000000000000000000000000001",
    deployReputationRegistry: "0x0000000000000000000000000000000000000000000000000000000000000002",
    deployAgentAccount: "0x0000000000000000000000000000000000000000000000000000000000000003",
    deployTestTargetProtocol: "0x0000000000000000000000000000000000000000000000000000000000000004",
    setCapability: "0x0000000000000000000000000000000000000000000000000000000000000005",
    setPolicy: "0x0000000000000000000000000000000000000000000000000000000000000006",
    smokeExecute: "0x0000000000000000000000000000000000000000000000000000000000000007",
  },
  smokeTest: {
    capability: "0x000000000000000000000000000000000000000000000000000000000000abcd",
    targetWasCalled: false,
  },
};

const RUNNER_ACTION: AgentAction = {
  capability: RUNNER_MANIFEST.smokeTest.capability,
  target: RUNNER_MANIFEST.contracts.testTargetProtocol,
  value: 0n,
  data: "0xabcdef",
  usesBorrowing: false,
};

const RUNNER_TRANSACTION = {
  to: RUNNER_MANIFEST.contracts.agentAccount,
  value: 0n,
  data: "0xabcdef",
} as const;

function asArrayObject<T extends object>(value: T): T {
  return Object.assign([], value) as unknown as T;
}

describe("formatBaseExecuteCliOutput", () => {
  it("renders allowed dry-run execution output as stable JSON", () => {
    expect(formatBaseExecuteCliOutput(DRY_RUN_ALLOWED)).toBe(JSON.stringify(DRY_RUN_ALLOWED, null, 2));
  });

  it("renders denied policy decisions with a null transaction", () => {
    expect(formatBaseExecuteCliOutput(DENIED)).toBe(JSON.stringify(DENIED, null, 2));
  });

  it("renders sent transaction receipts without losing explorer evidence", () => {
    expect(formatBaseExecuteCliOutput(SENT)).toBe(JSON.stringify(SENT, null, 2));
  });

  it("rejects denied reports with unsupported top-level fields before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      note: "extra evidence",
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report must not include unsupported fields");
  });

  it("rejects allowed dry-run reports with unsupported top-level fields before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      note: "extra evidence",
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report must not include unsupported fields");
  });

  it("rejects sent reports with unsupported top-level fields before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      note: "extra evidence",
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report must not include unsupported fields");
  });

  it("rejects denied reports that carry allowed execution identity before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      agent: DRY_RUN_ALLOWED.agent,
    } as unknown as BaseExecuteCliReport)).toThrow("Denied CLI report must not include allowed execution identity");
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      target: DRY_RUN_ALLOWED.target,
    } as unknown as BaseExecuteCliReport)).toThrow("Denied CLI report must not include allowed execution identity");
  });

  it("rejects malformed report envelopes before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput(null as unknown as BaseExecuteCliReport)).toThrow(
      "CLI report must be an object",
    );
    expect(() => formatBaseExecuteCliOutput([] as unknown as BaseExecuteCliReport)).toThrow(
      "CLI report must be an object",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      mode: "preview",
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report mode must be dry-run or send");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      allowed: "true",
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report allowed flag must be a boolean");
  });

  it("rejects malformed report chain IDs before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      chainId: "84532",
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report chain ID must be an integer");
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      chainId: 84532.5,
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report chain ID must be an integer");
  });

  it("rejects non-positive report chain IDs before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      chainId: 0,
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report chain ID must be a positive integer");
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      chainId: -84532,
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report chain ID must be a positive integer");
  });

  it("rejects malformed report decisions before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      decision: null,
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report decision must be an object");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      decision: [],
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report decision must be an object");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      decision: { allowed: "true", code: "Allowed" },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report decision allowed flag must be a boolean");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      decision: { allowed: true, code: "UnknownDecision" },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report decision code must be known");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      decision: {
        ...DRY_RUN_ALLOWED.decision,
        note: "extra evidence",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report decision must not include unsupported fields");
  });

  it("rejects report decisions that disagree with top-level allowed before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      decision: {
        allowed: false,
        code: "CapabilityDenied",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report allowed flag must match the policy decision");
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      allowed: true,
      decision: {
        allowed: false,
        code: "CapabilityDenied",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report allowed flag must match the policy decision");
  });

  it("rejects allowed report decisions with denial codes before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      decision: {
        allowed: true,
        code: "CapabilityDenied",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("Allowed CLI report decision code must be Allowed");
  });

  it("rejects denied report decisions with the Allowed code before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      decision: {
        allowed: false,
        code: "Allowed",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("Denied CLI report decision code must not be Allowed");
  });

  it("rejects malformed allowed report agent addresses before JSON serialization", () => {
    const { agent: _agent, ...missingAgent } = DRY_RUN_ALLOWED;

    expect(() => formatBaseExecuteCliOutput(missingAgent as unknown as BaseExecuteCliReport)).toThrow(
      "Allowed CLI report must include a valid agent address",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      agent: "not-an-address",
    } as unknown as BaseExecuteCliReport)).toThrow("Allowed CLI report must include a valid agent address");
  });

  it("rejects malformed allowed report target addresses before JSON serialization", () => {
    const { target: _target, ...missingTarget } = DRY_RUN_ALLOWED;

    expect(() => formatBaseExecuteCliOutput(missingTarget as unknown as BaseExecuteCliReport)).toThrow(
      "Allowed CLI report must include a valid target address",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      target: "not-an-address",
    } as unknown as BaseExecuteCliReport)).toThrow("Allowed CLI report must include a valid target address");
  });

  it("rejects malformed report transactions before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: null,
    } as unknown as BaseExecuteCliReport)).toThrow("Allowed CLI report must include a transaction");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: [],
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report transaction must be an object");
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      transaction: DRY_RUN_ALLOWED.transaction,
    } as unknown as BaseExecuteCliReport)).toThrow("Denied CLI report must not include a transaction");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        to: "not-an-address",
        value: "0",
        data: "0xabcdef",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report transaction must include a valid recipient address");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        to: DRY_RUN_ALLOWED.transaction.to,
        value: 0n,
        data: "0xabcdef",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report transaction value must be a string");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        to: DRY_RUN_ALLOWED.transaction.to,
        value: "-1",
        data: "0xabcdef",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "CLI report transaction value must be a non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        to: DRY_RUN_ALLOWED.transaction.to,
        value: "1.5",
        data: "0xabcdef",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "CLI report transaction value must be a non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        to: DRY_RUN_ALLOWED.transaction.to,
        value: "00",
        data: "0xabcdef",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "CLI report transaction value must be a canonical non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        to: DRY_RUN_ALLOWED.transaction.to,
        value: "01",
        data: "0xabcdef",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "CLI report transaction value must be a canonical non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        to: DRY_RUN_ALLOWED.transaction.to,
        value: "0",
        data: "abcdef",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report transaction data must be hex calldata");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        ...DRY_RUN_ALLOWED.transaction,
        note: "extra evidence",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("CLI report transaction must not include unsupported fields");
  });

  it("rejects allowed report transactions sent to a different agent before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      transaction: {
        ...DRY_RUN_ALLOWED.transaction,
        to: "0x0000000000000000000000000000000000009999",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "Allowed CLI report transaction recipient must match the agent address",
    );
  });

  it("rejects malformed sent hashes before JSON serialization", () => {
    const { hash: _hash, ...missingHash } = SENT;

    expect(() => formatBaseExecuteCliOutput(missingHash as unknown as BaseExecuteCliReport)).toThrow(
      "Sent CLI report hash must be a valid 32-byte hash",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      hash: "0x123",
    } as unknown as BaseExecuteCliReport)).toThrow("Sent CLI report hash must be a valid 32-byte hash");
  });

  it("rejects malformed sent explorer URLs before JSON serialization", () => {
    const { explorerUrl: _explorerUrl, ...missingExplorerUrl } = SENT;

    expect(() => formatBaseExecuteCliOutput(missingExplorerUrl as unknown as BaseExecuteCliReport)).toThrow(
      "Sent CLI report explorer URL must be a valid URL",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      explorerUrl: "not-a-url",
    } as unknown as BaseExecuteCliReport)).toThrow("Sent CLI report explorer URL must be a valid URL");
  });

  it("rejects sent explorer URLs that do not reference the transaction hash before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      explorerUrl: "https://sepolia.basescan.org/tx/0x2222222222222222222222222222222222222222222222222222222222222222",
    } as unknown as BaseExecuteCliReport)).toThrow("Sent CLI report explorer URL must reference the transaction hash");
  });

  it("rejects malformed sent receipts before JSON serialization", () => {
    const { receipt: _receipt, ...missingReceipt } = SENT;

    expect(() => formatBaseExecuteCliOutput(missingReceipt as unknown as BaseExecuteCliReport)).toThrow(
      "Sent CLI report receipt must be an object",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: [],
    } as unknown as BaseExecuteCliReport)).toThrow("Sent CLI report receipt must be an object");
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: {
        blockNumber: 123,
        status: "success",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("Sent CLI report receipt block number must be a string");
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: {
        blockNumber: "123",
        status: "pending",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("Sent CLI report receipt status must be success or reverted");
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: {
        blockNumber: "latest",
        status: "success",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "Sent CLI report receipt block number must be a non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: {
        blockNumber: "-1",
        status: "success",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "Sent CLI report receipt block number must be a non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: {
        blockNumber: "00123",
        status: "success",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "Sent CLI report receipt block number must be a canonical non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: {
        blockNumber: "00",
        status: "success",
      },
    } as unknown as BaseExecuteCliReport)).toThrow(
      "Sent CLI report receipt block number must be a canonical non-negative integer string",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...SENT,
      receipt: {
        ...SENT.receipt,
        note: "extra evidence",
      },
    } as unknown as BaseExecuteCliReport)).toThrow("Sent CLI report receipt must not include unsupported fields");
  });

  it("rejects sent-only evidence on non-sent reports before JSON serialization", () => {
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      hash: SENT.hash,
    } as unknown as BaseExecuteCliReport)).toThrow("Non-sent CLI report must not include sent transaction evidence");
    expect(() => formatBaseExecuteCliOutput({
      ...DRY_RUN_ALLOWED,
      explorerUrl: SENT.explorerUrl,
    } as unknown as BaseExecuteCliReport)).toThrow(
      "Non-sent CLI report must not include sent transaction evidence",
    );
    expect(() => formatBaseExecuteCliOutput({
      ...DENIED,
      mode: "send",
      receipt: SENT.receipt,
    } as unknown as BaseExecuteCliReport)).toThrow(
      "Non-sent CLI report must not include sent transaction evidence",
    );
  });
});

type BaseExecuteCliArgs = {
  send: boolean;
  manifestPath: string;
};

type ExecuteCliModule = typeof import("./execute.js") & {
  applyBaseExecuteDotEnv?: (contents: string, env: Record<string, string | undefined>) => void;
  formatBaseExecuteCliUsage?: () => string;
  isBaseExecuteDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  isBaseExecuteCliHelpRequest?: (argv: readonly string[]) => boolean;
  loadBaseExecuteDotEnv?: (
    path: string,
    env: Record<string, string | undefined>,
    readText: (path: string) => string,
  ) => void;
  parseBaseExecuteCliArgs?: (argv: readonly string[]) => BaseExecuteCliArgs;
  parseBaseExecuteDotEnv?: (contents: string) => readonly (readonly [string, string])[];
  readRequiredBaseExecuteEnv?: (env: Record<string, string | undefined>, key: string, message?: string) => string;
  runBaseExecuteCli?: (options?: {
    argv?: readonly string[];
    env?: Record<string, string | undefined>;
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
    readManifest?: (path: string) => Promise<DeploymentManifest>;
    createPublicClient?: (rpcUrl: string) => {
      getChainId(): Promise<number>;
      readContract(): Promise<unknown>;
      waitForTransactionReceipt(
        parameters: { hash: string },
      ): Promise<{ blockNumber: bigint; status: "success" | "reverted" }>;
    };
    createPolicySimulator?: (
      client: unknown,
      manifest: DeploymentManifest,
    ) => SimulatePolicy;
    createAction?: (manifest: DeploymentManifest) => AgentAction;
    buildTransaction?: (params: {
      agent: string;
      action: AgentAction;
      simulatePolicy: SimulatePolicy;
    }) => Promise<BuildExecuteTransactionResult>;
    createAccount?: (privateKey: Hex) => ReturnType<typeof privateKeyToAccount>;
    createWalletClient?: (params: { account: ReturnType<typeof privateKeyToAccount>; rpcUrl: string }) => {
      sendTransaction(parameters: {
        account: ReturnType<typeof privateKeyToAccount>;
        chain: unknown;
        to: Hex;
        value: bigint;
        data: Hex;
      }): Promise<Hex>;
    };
  }) => Promise<void>;
};

describe("isBaseExecuteDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const scriptPath = resolve("runtime/cli/base/execute.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBaseExecuteDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBaseExecuteDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBaseExecuteDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/base/manifestVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/base/execute.ts")).href;

    expect(() => module.isBaseExecuteDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isBaseExecuteDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBaseExecuteCliArgs", () => {
  it("renders help usage and detects standalone help flags", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.formatBaseExecuteCliUsage?.()).toBe([
      "Usage: npm run base:execute -- [options]",
      "",
      "Options:",
      "  --manifest <path>  Deployment manifest path (default: deployments/base-sepolia/latest.json)",
      "  --send             Send transaction after policy approval (default: dry-run)",
      "  -h, --help         Show this help message",
    ].join("\n"));

    expect(module.isBaseExecuteCliHelpRequest?.(["--help"])).toBe(true);
    expect(module.isBaseExecuteCliHelpRequest?.(["-h"])).toBe(true);
    expect(module.isBaseExecuteCliHelpRequest?.(["--help", "--send"])).toBe(false);
    expect(module.isBaseExecuteCliHelpRequest?.([])).toBe(false);
  });

  it("uses the default dry-run manifest when no flags are provided", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteCliArgs?.([])).toEqual({
      send: false,
      manifestPath: "deployments/base-sepolia/latest.json",
    });
  });

  it("parses send mode and manifest flags", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteCliArgs?.(["--send", "--manifest", "deployments/base-sepolia/custom.json"])).toEqual({
      send: true,
      manifestPath: "deployments/base-sepolia/custom.json",
    });
    expect(module.parseBaseExecuteCliArgs?.(["--manifest=deployments/base-sepolia/custom.json"])).toEqual({
      send: false,
      manifestPath: "deployments/base-sepolia/custom.json",
    });
  });

  it("normalizes manifest flag value whitespace", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteCliArgs?.(["--manifest", " deployments/base-sepolia/custom.json\n"])).toEqual({
      send: false,
      manifestPath: "deployments/base-sepolia/custom.json",
    });
    expect(module.parseBaseExecuteCliArgs?.(["--manifest= deployments/base-sepolia/custom.json "])).toEqual({
      send: false,
      manifestPath: "deployments/base-sepolia/custom.json",
    });
  });

  it("rejects manifest flags without a value", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(() => module.parseBaseExecuteCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parseBaseExecuteCliArgs?.(["--manifest="])).toThrow("--manifest requires a value");
    expect(() => module.parseBaseExecuteCliArgs?.(["--manifest", ""])).toThrow("--manifest requires a value");
    expect(() => module.parseBaseExecuteCliArgs?.(["--manifest", "  "])).toThrow("--manifest requires a value");
    expect(() => module.parseBaseExecuteCliArgs?.(["--manifest", "--send"])).toThrow("--manifest requires a value");
    expect(() => module.parseBaseExecuteCliArgs?.(["--manifest=--send"])).toThrow("--manifest requires a value");
  });

  it("rejects unsupported arguments", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(() => module.parseBaseExecuteCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
    expect(() => module.parseBaseExecuteCliArgs?.(["--send=false"])).toThrow("Unsupported argument: --send=false");
    expect(() => module.parseBaseExecuteCliArgs?.(["deployments/base-sepolia/custom.json"])).toThrow(
      "Unsupported argument: deployments/base-sepolia/custom.json",
    );
  });

  it("rejects duplicate options before manifest loading", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(() => module.parseBaseExecuteCliArgs?.(["--send", "--send"])).toThrow("Duplicate argument: --send");
    expect(() => module.parseBaseExecuteCliArgs?.([
      "--manifest",
      "deployments/base-sepolia/one.json",
      "--manifest",
      "deployments/base-sepolia/two.json",
    ])).toThrow("Duplicate argument: --manifest");
    expect(() => module.parseBaseExecuteCliArgs?.([
      "--manifest=deployments/base-sepolia/one.json",
      "--manifest=deployments/base-sepolia/two.json",
    ])).toThrow("Duplicate argument: --manifest");
    expect(() => module.parseBaseExecuteCliArgs?.([
      "--manifest",
      "deployments/base-sepolia/one.json",
      "--manifest=deployments/base-sepolia/two.json",
    ])).toThrow("Duplicate argument: --manifest");
  });
});

describe("runBaseExecuteCli", () => {
  const runWithManifest = async (
    manifest: unknown,
    options: {
      createPublicClient?: (rpcUrl: string) => {
        getChainId(): Promise<number>;
        readContract(): Promise<unknown>;
        waitForTransactionReceipt(
          parameters: { hash: string },
        ): Promise<{ blockNumber: bigint; status: "success" | "reverted" }>;
      };
    } = {},
  ) => {
    const module = await import("./execute.js") as ExecuteCliModule;

    return module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed manifests");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed manifests");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => manifest as DeploymentManifest,
      createPublicClient: options.createPublicClient ?? (() => {
        throw new Error("RPC client should not be created for malformed manifests");
      }),
      createPolicySimulator: () => async () => {
        throw new Error("policy simulator should not run for malformed manifests");
      },
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed manifests");
      },
      createAccount: () => {
        throw new Error("account should not be created for malformed manifests");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed manifests");
      },
    });
  };

  const runWithAction = async (action: unknown) => {
    const module = await import("./execute.js") as ExecuteCliModule;

    return module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed actions");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed actions");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed actions");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed actions");
        },
      }),
      createPolicySimulator: () => async () => {
        throw new Error("policy simulator should not run for malformed actions");
      },
      createAction: () => action as AgentAction,
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed actions");
      },
      createAccount: () => {
        throw new Error("account should not be created for malformed actions");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed actions");
      },
    });
  };

  it("rejects malformed runner options before reading injected hooks", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.(null as never)).rejects.toThrow(
      "Runner options must be an object",
    );
    await expect(module.runBaseExecuteCli?.("not-options" as never)).rejects.toThrow(
      "Runner options must be an object",
    );
  });

  it("prints help without loading dotenv or mutating exit code", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const outputs: string[] = [];

    await module.runBaseExecuteCli?.({
      argv: ["--help"],
      env: {},
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => {
        throw new Error("dotenv loader should not run for help");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for help");
      },
    });

    expect(outputs).toEqual([module.formatBaseExecuteCliUsage?.()]);
  });

  it("rejects malformed output writers before rendering help", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--help"],
      env: {},
      writeOutput: "not-a-function" as unknown as (output: string) => void,
      loadDotEnv: () => {
        throw new Error("dotenv loader should not run for malformed output writers");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed output writers");
      },
    })).rejects.toThrow("Output writer must be a function");
  });

  it("rejects malformed argument vectors before help detection or argument parsing", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: "not-argv" as unknown as readonly string[],
      env: {},
      writeOutput: () => {
        throw new Error("output should not be written for malformed argv");
      },
      loadDotEnv: () => {
        throw new Error("dotenv loader should not run for malformed argv");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed argv");
      },
      readManifest: async () => {
        throw new Error("manifest should not be read for malformed argv");
      },
      createPublicClient: () => {
        throw new Error("RPC client should not be created for malformed argv");
      },
    })).rejects.toThrow("Argument vector must be an array of strings");

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", 123] as unknown as readonly string[],
      env: {},
      writeOutput: () => {
        throw new Error("output should not be written for malformed argv");
      },
      loadDotEnv: () => {
        throw new Error("dotenv loader should not run for malformed argv");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed argv");
      },
      readManifest: async () => {
        throw new Error("manifest should not be read for malformed argv");
      },
      createPublicClient: () => {
        throw new Error("RPC client should not be created for malformed argv");
      },
    })).rejects.toThrow("Argument vector must be an array of strings");
  });

  it("rejects invalid arguments before loading dotenv or downstream dependencies", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--unknown"],
      env: {},
      writeOutput: () => {
        throw new Error("output should not be written for invalid arguments");
      },
      loadDotEnv: () => {
        throw new Error("dotenv loader should not run for invalid arguments");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for invalid arguments");
      },
      readManifest: async () => {
        throw new Error("manifest should not be read for invalid arguments");
      },
      createPublicClient: () => {
        throw new Error("RPC client should not be created for invalid arguments");
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
  });

  it("rejects malformed dotenv loaders after argument validation and before manifest loading", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {},
      writeOutput: () => {
        throw new Error("output should not be written for malformed dotenv loaders");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed dotenv loaders");
      },
      loadDotEnv: "not-a-function" as unknown as (path: string, env: Record<string, string | undefined>) => void,
      readManifest: async () => {
        throw new Error("manifest should not be read for malformed dotenv loaders");
      },
      createPublicClient: () => {
        throw new Error("RPC client should not be created for malformed dotenv loaders");
      },
    })).rejects.toThrow("Dotenv loader must be a function");
  });

  it("rejects malformed injected environments before dotenv loading", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: "not-an-env-object" as unknown as Record<string, string | undefined>,
      writeOutput: () => {
        throw new Error("output should not be written for malformed environments");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed environments");
      },
      loadDotEnv: () => {
        throw new Error("dotenv loader should not run for malformed environments");
      },
      readManifest: async () => {
        throw new Error("manifest should not be read for malformed environments");
      },
      createPublicClient: () => {
        throw new Error("RPC client should not be created for malformed environments");
      },
    })).rejects.toThrow("Environment must be an object");

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: [] as unknown as Record<string, string | undefined>,
      writeOutput: () => {
        throw new Error("output should not be written for malformed environments");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed environments");
      },
      loadDotEnv: () => {
        throw new Error("dotenv loader should not run for malformed environments");
      },
      readManifest: async () => {
        throw new Error("manifest should not be read for malformed environments");
      },
      createPublicClient: () => {
        throw new Error("RPC client should not be created for malformed environments");
      },
    })).rejects.toThrow("Environment must be an object");
  });

  it("rejects malformed defined environment values before manifest loading", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: 123,
        PRIVATE_KEY: undefined,
      } as unknown as Record<string, string | undefined>,
      writeOutput: () => {
        throw new Error("output should not be written for malformed environment values");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed environment values");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => {
        throw new Error("manifest should not be read for malformed environment values");
      },
      createPublicClient: () => {
        throw new Error("RPC client should not be created for malformed environment values");
      },
    })).rejects.toThrow("Environment values must be strings when defined");
  });

  it("rejects malformed manifest readers before manifest loading", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {},
      writeOutput: () => {
        throw new Error("output should not be written for malformed manifest readers");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed manifest readers");
      },
      loadDotEnv: () => undefined,
      readManifest: "not-a-function" as unknown as (path: string) => Promise<DeploymentManifest>,
      createPublicClient: () => {
        throw new Error("RPC client should not be created for malformed manifest readers");
      },
    })).rejects.toThrow("Manifest reader must be a function");
  });

  it("rejects malformed manifest object shapes before RPC client creation", async () => {
    await expect(runWithManifest(asArrayObject(RUNNER_MANIFEST))).rejects.toThrow(
      "Deployment manifest must be an object",
    );
  });

  it("rejects malformed manifest contracts object shapes before action creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: asArrayObject(RUNNER_MANIFEST.contracts),
    })).rejects.toThrow("Deployment manifest contracts must be an object");
  });

  it("rejects malformed manifest smoke-test object shapes before action creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      smokeTest: asArrayObject(RUNNER_MANIFEST.smokeTest),
    })).rejects.toThrow("Deployment manifest smokeTest must be an object");
  });

  it("rejects deployment manifests with unsupported top-level fields before RPC client creation", async () => {
    expect(DEPLOYMENT_MANIFEST_FIELDS).toEqual([
      ...DEPLOYMENT_MANIFEST_REQUIRED_FIELDS,
      ...DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS,
    ]);

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      note: "extra evidence",
    })).rejects.toThrow("Deployment manifest must not include unsupported fields");
  });

  it("rejects manifest contracts with unsupported fields before action creation", async () => {
    expect(DEPLOYMENT_MANIFEST_CONTRACT_FIELDS).toEqual([
      ...DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS,
      ...DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS,
    ]);

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: {
        ...RUNNER_MANIFEST.contracts,
        unknownContract: "0x0000000000000000000000000000000000009999",
      },
    })).rejects.toThrow("Deployment manifest contracts must not include unsupported fields");
  });

  it("rejects manifest smoke tests with unsupported fields before action creation", async () => {
    expect(DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS).toEqual(["capability", "targetWasCalled"]);

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      smokeTest: {
        ...RUNNER_MANIFEST.smokeTest,
        note: "extra evidence",
      },
    })).rejects.toThrow("Deployment manifest smokeTest must not include unsupported fields");
  });

  it("rejects malformed manifest transaction object shapes before RPC client creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: asArrayObject(RUNNER_MANIFEST.transactions),
    })).rejects.toThrow("Deployment manifest transactions must be an object");
  });

  it("rejects manifest transactions with unsupported fields before RPC client creation", async () => {
    expect(DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS).toEqual([
      ...DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS,
      ...DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS,
    ]);

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        unknownTransaction: "0x9999999999999999999999999999999999999999999999999999999999999999",
      },
    })).rejects.toThrow("Deployment manifest transactions must not include unsupported fields");
  });

  it("rejects malformed manifest agent-profile object shapes before RPC client creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: asArrayObject({
        roleLabel: "agentos.kernel.operator",
        metadataURI: "agentos://base-sepolia/agent-account/v1",
      }),
    })).rejects.toThrow("Deployment manifest agentProfile must be an object");
  });

  it("rejects manifest agent profiles with unsupported fields before RPC client creation", async () => {
    expect(DEPLOYMENT_AGENT_PROFILE_FIELDS).toEqual(["roleLabel", "metadataURI"]);

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: {
        roleLabel: "agentos.kernel.operator",
        metadataURI: "agentos://base-sepolia/agent-account/v1",
        note: "extra evidence",
      },
    })).rejects.toThrow("Deployment manifest agentProfile must not include unsupported fields");
  });

  it("does not require optional manifest envelope fields before RPC client creation", async () => {
    await expect(runWithManifest(RUNNER_MANIFEST, {
      createPublicClient: () => {
        throw new Error("optional manifest envelope fields were not required");
      },
    })).rejects.toThrow("optional manifest envelope fields were not required");
  });

  it("rejects malformed manifest agent-profile role labels before RPC client creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: {
        metadataURI: "agentos://base-sepolia/agent-account/v1",
      },
    })).rejects.toThrow("Deployment manifest agentProfile.roleLabel must be a non-empty string");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: {
        roleLabel: "",
        metadataURI: "agentos://base-sepolia/agent-account/v1",
      },
    })).rejects.toThrow("Deployment manifest agentProfile.roleLabel must be a non-empty string");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: {
        roleLabel: 123,
        metadataURI: "agentos://base-sepolia/agent-account/v1",
      },
    })).rejects.toThrow("Deployment manifest agentProfile.roleLabel must be a non-empty string");
  });

  it("rejects malformed manifest agent-profile metadata URIs before RPC client creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: {
        roleLabel: "agentos.kernel.operator",
      },
    })).rejects.toThrow("Deployment manifest agentProfile.metadataURI must be a non-empty string");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: {
        roleLabel: "agentos.kernel.operator",
        metadataURI: "",
      },
    })).rejects.toThrow("Deployment manifest agentProfile.metadataURI must be a non-empty string");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      agentProfile: {
        roleLabel: "agentos.kernel.operator",
        metadataURI: 123,
      },
    })).rejects.toThrow("Deployment manifest agentProfile.metadataURI must be a non-empty string");
  });

  it("rejects malformed manifest network labels before RPC client creation", async () => {
    const { network: _network, ...missingNetwork } = RUNNER_MANIFEST;

    await expect(runWithManifest(missingNetwork)).rejects.toThrow(
      "Deployment manifest network must be a non-empty string",
    );
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      network: "",
    })).rejects.toThrow("Deployment manifest network must be a non-empty string");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      network: 84532,
    })).rejects.toThrow("Deployment manifest network must be a non-empty string");
  });

  it("rejects malformed manifest owners before RPC client creation", async () => {
    const { owner: _owner, ...missingOwner } = RUNNER_MANIFEST;

    await expect(runWithManifest(missingOwner)).rejects.toThrow(
      "Deployment manifest owner must be a valid address",
    );
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      owner: "not-an-address",
    })).rejects.toThrow("Deployment manifest owner must be a valid address");
  });

  it("rejects malformed manifest deployed-at values before RPC client creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      deployedAt: "",
    })).rejects.toThrow("Deployment manifest deployedAt must be a non-empty string");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      deployedAt: 123,
    })).rejects.toThrow("Deployment manifest deployedAt must be a non-empty string");
  });

  it("rejects malformed manifest chain IDs before RPC client creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      chainId: "84532",
    })).rejects.toThrow("Deployment manifest chainId must be an integer");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      chainId: 84532.5,
    })).rejects.toThrow("Deployment manifest chainId must be an integer");
  });

  it("rejects malformed manifest RPC environment keys before environment lookup", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      rpcUrlEnv: "",
    })).rejects.toThrow("Deployment manifest rpcUrlEnv must be a valid environment key");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      rpcUrlEnv: "BAD KEY",
    })).rejects.toThrow("Deployment manifest rpcUrlEnv must be a valid environment key");
  });

  it("rejects malformed manifest deploy capability registry transactions before RPC client creation", async () => {
    const { deployCapabilityRegistry: _deployCapabilityRegistry, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest deployCapabilityRegistry transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        deployCapabilityRegistry: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest deployCapabilityRegistry transaction must be a valid hash");
  });

  it("rejects malformed manifest deploy policy engine transactions before RPC client creation", async () => {
    const { deployPolicyEngine: _deployPolicyEngine, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest deployPolicyEngine transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        deployPolicyEngine: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest deployPolicyEngine transaction must be a valid hash");
  });

  it("rejects malformed manifest deploy reputation registry transactions before RPC client creation", async () => {
    const { deployReputationRegistry: _deployReputationRegistry, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest deployReputationRegistry transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        deployReputationRegistry: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest deployReputationRegistry transaction must be a valid hash");
  });

  it("rejects malformed manifest deploy agent account transactions before RPC client creation", async () => {
    const { deployAgentAccount: _deployAgentAccount, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest deployAgentAccount transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        deployAgentAccount: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest deployAgentAccount transaction must be a valid hash");
  });

  it("rejects malformed manifest deploy test target protocol transactions before RPC client creation", async () => {
    const { deployTestTargetProtocol: _deployTestTargetProtocol, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest deployTestTargetProtocol transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        deployTestTargetProtocol: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest deployTestTargetProtocol transaction must be a valid hash");
  });

  it("rejects malformed manifest set capability transactions before RPC client creation", async () => {
    const { setCapability: _setCapability, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest setCapability transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        setCapability: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest setCapability transaction must be a valid hash");
  });

  it("rejects malformed manifest set policy transactions before RPC client creation", async () => {
    const { setPolicy: _setPolicy, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest setPolicy transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        setPolicy: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest setPolicy transaction must be a valid hash");
  });

  it("rejects malformed manifest smoke execute transactions before RPC client creation", async () => {
    const { smokeExecute: _smokeExecute, ...missingTransaction } = RUNNER_MANIFEST.transactions;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: missingTransaction,
    })).rejects.toThrow("Deployment manifest smokeExecute transaction must be a valid hash");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      transactions: {
        ...RUNNER_MANIFEST.transactions,
        smokeExecute: "not-a-hash",
      },
    })).rejects.toThrow("Deployment manifest smokeExecute transaction must be a valid hash");
  });

  it("rejects malformed optional manifest transaction hashes before RPC client creation", async () => {
    for (const field of DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS) {
      await expect(runWithManifest({
        ...RUNNER_MANIFEST,
        transactions: {
          ...RUNNER_MANIFEST.transactions,
          [field]: "not-a-hash",
        },
      })).rejects.toThrow(`Deployment manifest ${field} transaction must be a valid hash`);
    }
  });

  it("does not require optional manifest transaction hashes before RPC client creation", async () => {
    await expect(runWithManifest(RUNNER_MANIFEST, {
      createPublicClient: () => {
        throw new Error("optional transaction hashes were not required");
      },
    })).rejects.toThrow("optional transaction hashes were not required");
  });

  it("rejects malformed manifest capability registries before RPC client creation", async () => {
    const { capabilityRegistry: _capabilityRegistry, ...missingCapabilityRegistry } = RUNNER_MANIFEST.contracts;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: missingCapabilityRegistry,
    })).rejects.toThrow("Deployment manifest capability registry must be a valid address");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: {
        ...RUNNER_MANIFEST.contracts,
        capabilityRegistry: "not-an-address",
      },
    })).rejects.toThrow("Deployment manifest capability registry must be a valid address");
  });

  it("rejects malformed manifest reputation registries before RPC client creation", async () => {
    const { reputationRegistry: _reputationRegistry, ...missingReputationRegistry } = RUNNER_MANIFEST.contracts;

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: missingReputationRegistry,
    })).rejects.toThrow("Deployment manifest reputation registry must be a valid address");
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: {
        ...RUNNER_MANIFEST.contracts,
        reputationRegistry: "not-an-address",
      },
    })).rejects.toThrow("Deployment manifest reputation registry must be a valid address");
  });

  it("rejects malformed optional manifest contract addresses before RPC client creation", async () => {
    for (const field of DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS) {
      await expect(runWithManifest({
        ...RUNNER_MANIFEST,
        contracts: {
          ...RUNNER_MANIFEST.contracts,
          [field]: "not-an-address",
        },
      })).rejects.toThrow("Deployment manifest optional contract addresses must be valid when present");
    }
  });

  it("does not require optional manifest contract addresses before RPC client creation", async () => {
    await expect(runWithManifest(RUNNER_MANIFEST, {
      createPublicClient: () => {
        throw new Error("optional contract addresses were not required");
      },
    })).rejects.toThrow("optional contract addresses were not required");
  });

  it("rejects malformed manifest agent accounts before transaction building", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: {
        ...RUNNER_MANIFEST.contracts,
        agentAccount: "not-an-address",
      },
    }, {
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed manifests");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed manifests");
        },
      }),
    })).rejects.toThrow("Deployment manifest agent account must be a valid address");
  });

  it("rejects malformed manifest policy engines before transaction building", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: {
        ...RUNNER_MANIFEST.contracts,
        policyEngine: "not-an-address",
      },
    }, {
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed manifests");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed manifests");
        },
      }),
    })).rejects.toThrow("Deployment manifest policy engine must be a valid address");
  });

  it("rejects malformed manifest smoke-test targets before action creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      contracts: {
        ...RUNNER_MANIFEST.contracts,
        testTargetProtocol: "not-an-address",
      },
    }, {
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed manifests");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed manifests");
        },
      }),
    })).rejects.toThrow("Deployment manifest smoke-test target must be a valid address");
  });

  it("rejects malformed manifest smoke-test objects before action creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      smokeTest: undefined,
    })).rejects.toThrow("Deployment manifest smokeTest must be an object");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      smokeTest: "invalid",
    })).rejects.toThrow("Deployment manifest smokeTest must be an object");
  });

  it("rejects malformed manifest smoke-test capabilities before action creation", async () => {
    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      smokeTest: {
        ...RUNNER_MANIFEST.smokeTest,
        capability: "0x123",
      },
    })).rejects.toThrow("Deployment manifest smoke-test capability must be bytes32");

    await expect(runWithManifest({
      ...RUNNER_MANIFEST,
      smokeTest: {
        ...RUNNER_MANIFEST.smokeTest,
        capability: "not-hex",
      },
    })).rejects.toThrow("Deployment manifest smoke-test capability must be bytes32");
  });

  it("rejects malformed connected chain IDs before chain comparison", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithConnectedChainId = async (chainId: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed connected chain IDs");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed connected chain IDs");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => chainId as number,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed connected chain IDs");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed connected chain IDs");
        },
      }),
      createPolicySimulator: () => async () => {
        throw new Error("policy simulator should not run for malformed connected chain IDs");
      },
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed connected chain IDs");
      },
      createAccount: () => {
        throw new Error("account should not be created for malformed connected chain IDs");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed connected chain IDs");
      },
    });

    await expect(runWithConnectedChainId("84532")).rejects.toThrow("Connected chain ID must be an integer");
    await expect(runWithConnectedChainId(84532.5)).rejects.toThrow("Connected chain ID must be an integer");
  });

  it("rejects malformed public-client factories before client creation", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed public-client factories");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed public-client factories");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: "not-a-function" as unknown as (rpcUrl: string) => {
        getChainId(): Promise<number>;
        readContract(): Promise<unknown>;
        waitForTransactionReceipt(
          parameters: { hash: string },
        ): Promise<{ blockNumber: bigint; status: "success" | "reverted" }>;
      },
      createPolicySimulator: () => async () => {
        throw new Error("policy simulator should not run for malformed public-client factories");
      },
      createAction: () => {
        throw new Error("action should not be created for malformed public-client factories");
      },
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed public-client factories");
      },
    })).rejects.toThrow("Public client factory must be a function");
  });

  it("rejects malformed public clients before chain reads", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithPublicClient = async (client: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed public clients");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed public clients");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => client as {
        getChainId(): Promise<number>;
        readContract(): Promise<unknown>;
        waitForTransactionReceipt(
          parameters: { hash: string },
        ): Promise<{ blockNumber: bigint; status: "success" | "reverted" }>;
      },
      createPolicySimulator: () => async () => {
        throw new Error("policy simulator should not run for malformed public clients");
      },
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed public clients");
      },
      createAccount: () => {
        throw new Error("account should not be created for malformed public clients");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed public clients");
      },
    });

    await expect(runWithPublicClient(null)).rejects.toThrow("Public client must include RPC methods");
    await expect(runWithPublicClient({
      getChainId: async () => RUNNER_MANIFEST.chainId,
      readContract: async () => undefined,
    })).rejects.toThrow("Public client must include RPC methods");
  });

  it("rejects malformed manifest explorer URLs before sent output formatting", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const privateKey = `0x${"1".repeat(64)}` as Hex;
    const hash = `0x${"2".repeat(64)}` as Hex;
    const account = privateKeyToAccount(privateKey);

    const runWithExplorerUrl = async (explorerUrl: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: privateKey,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed manifest explorer URLs");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed manifest explorer URLs");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => ({
        ...RUNNER_MANIFEST,
        explorerUrl,
      } as DeploymentManifest),
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => ({ blockNumber: 123n, status: "success" }),
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: () => ({
        sendTransaction: async () => hash,
      }),
    });

    await expect(runWithExplorerUrl("")).rejects.toThrow("Deployment manifest explorerUrl must be a valid URL");
    await expect(runWithExplorerUrl("not-a-url")).rejects.toThrow(
      "Deployment manifest explorerUrl must be a valid URL",
    );
  });

  it("rejects malformed action factories before action creation", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed action factories");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed action factories");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed action factories");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed action factories");
        },
      }),
      createPolicySimulator: () => async () => {
        throw new Error("policy simulator should not run for malformed action factories");
      },
      createAction: "not-a-function" as unknown as (manifest: DeploymentManifest) => AgentAction,
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed action factories");
      },
      createAccount: () => {
        throw new Error("account should not be created for malformed action factories");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed action factories");
      },
    })).rejects.toThrow("Action factory must be a function");
  });

  it("rejects malformed action object shapes before policy simulation", async () => {
    await expect(runWithAction(null)).rejects.toThrow("Execution action must be an object");
    await expect(runWithAction([])).rejects.toThrow("Execution action must be an object");
  });

  it("rejects malformed action capabilities before transaction building", async () => {
    await expect(runWithAction({
      ...RUNNER_ACTION,
      capability: "0x123",
    })).rejects.toThrow("Execution action capability must be bytes32");

    await expect(runWithAction({
      ...RUNNER_ACTION,
      capability: "not-hex",
    })).rejects.toThrow("Execution action capability must be bytes32");
  });

  it("rejects malformed action targets before transaction building", async () => {
    await expect(runWithAction({
      ...RUNNER_ACTION,
      target: "not-an-address",
    })).rejects.toThrow("Execution action target must be a valid address");
  });

  it("rejects malformed action payloads before transaction building", async () => {
    await expect(runWithAction({
      ...RUNNER_ACTION,
      value: "0",
    })).rejects.toThrow("Execution action value must be a bigint");

    await expect(runWithAction({
      ...RUNNER_ACTION,
      data: "abcdef",
    })).rejects.toThrow("Execution action data must be hex calldata");

    await expect(runWithAction({
      ...RUNNER_ACTION,
      usesBorrowing: "false",
    })).rejects.toThrow("Execution action borrowing flag must be a boolean");
  });

  it("rejects execution actions with unsupported fields before policy simulation", async () => {
    await expect(runWithAction({
      ...RUNNER_ACTION,
      note: "extra evidence",
    })).rejects.toThrow("Execution action must not include unsupported fields");
  });

  it("rejects malformed transaction result allowed flags before output or send paths", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithTransactionResult = async (result: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed transaction results");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed transaction results");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed transaction results");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => result as BuildExecuteTransactionResult,
      createAccount: () => {
        throw new Error("account should not be created for malformed transaction results");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed transaction results");
      },
    });

    await expect(runWithTransactionResult({
      allowed: "true",
      decision: { allowed: true, code: "Allowed" },
      transaction: RUNNER_TRANSACTION,
    })).rejects.toThrow("Transaction result allowed flag must be a boolean");

    await expect(runWithTransactionResult(null)).rejects.toThrow("Transaction result must be an object");
    await expect(runWithTransactionResult([])).rejects.toThrow("Transaction result must be an object");
  });

  it("rejects malformed policy-simulator factories before transaction building", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed policy-simulator factories");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed policy-simulator factories");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed policy-simulator factories");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed policy-simulator factories");
        },
      }),
      createPolicySimulator: "not-a-function" as unknown as (
        client: unknown,
        manifest: DeploymentManifest,
      ) => SimulatePolicy,
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed policy-simulator factories");
      },
      createAccount: () => {
        throw new Error("account should not be created for malformed policy-simulator factories");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed policy-simulator factories");
      },
    })).rejects.toThrow("Policy simulator factory must be a function");
  });

  it("rejects malformed policy simulators before transaction building", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed policy simulators");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed policy simulators");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed policy simulators");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed policy simulators");
        },
      }),
      createPolicySimulator: () => "not-a-function" as unknown as SimulatePolicy,
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => {
        throw new Error("transaction builder should not run for malformed policy simulators");
      },
      createAccount: () => {
        throw new Error("account should not be created for malformed policy simulators");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed policy simulators");
      },
    })).rejects.toThrow("Policy simulator must be a function");
  });

  it("rejects malformed transaction builders before simulator creation", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed transaction builders");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed transaction builders");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used for malformed transaction builders");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed transaction builders");
        },
      }),
      createPolicySimulator: () => {
        throw new Error("policy simulator should not be created for malformed transaction builders");
      },
      createAction: () => RUNNER_ACTION,
      buildTransaction: "not-a-function" as unknown as typeof import("../../transactions/builder.js").buildExecuteTransaction,
      createAccount: () => {
        throw new Error("account should not be created for malformed transaction builders");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed transaction builders");
      },
    })).rejects.toThrow("Transaction builder must be a function");
  });

  it("rejects malformed transaction result decisions before output or send paths", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithTransactionResult = async (result: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed transaction decisions");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed transaction decisions");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed transaction decisions");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => result as BuildExecuteTransactionResult,
      createAccount: () => {
        throw new Error("account should not be created for malformed transaction decisions");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed transaction decisions");
      },
    });

    await expect(runWithTransactionResult({
      allowed: true,
      decision: { allowed: "true", code: "Allowed" },
      transaction: RUNNER_TRANSACTION,
    })).rejects.toThrow("Transaction result decision allowed flag must be a boolean");

    await expect(runWithTransactionResult({
      allowed: true,
      decision: { allowed: true, code: "UnknownDecision" },
      transaction: RUNNER_TRANSACTION,
    })).rejects.toThrow("Transaction result decision code must be known");

    await expect(runWithTransactionResult({
      allowed: true,
      decision: { allowed: true, code: "CapabilityDenied" },
      transaction: RUNNER_TRANSACTION,
    })).rejects.toThrow("Allowed transaction result decision code must be Allowed");

    await expect(runWithTransactionResult({
      allowed: false,
      decision: { allowed: false, code: "Allowed" },
      transaction: null,
    })).rejects.toThrow("Denied transaction result decision code must not be Allowed");

    await expect(runWithTransactionResult({
      allowed: true,
      decision: { allowed: true, code: "Allowed", note: "extra evidence" },
      transaction: RUNNER_TRANSACTION,
    })).rejects.toThrow("Transaction result decision must not include unsupported fields");
  });

  it("rejects transaction results with unsupported top-level fields before output or send paths", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithTransactionResult = async (result: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for unsupported transaction result fields");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for unsupported transaction result fields");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for unsupported transaction result fields");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => result as BuildExecuteTransactionResult,
      createAccount: () => {
        throw new Error("account should not be created for unsupported transaction result fields");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for unsupported transaction result fields");
      },
    });

    await expect(runWithTransactionResult({
      allowed: true,
      decision: { allowed: true, code: "Allowed" },
      transaction: RUNNER_TRANSACTION,
      note: "extra evidence",
    })).rejects.toThrow("Transaction result must not include unsupported fields");

    await expect(runWithTransactionResult({
      allowed: false,
      decision: { allowed: false, code: "CapabilityDenied" },
      transaction: null,
      note: "extra evidence",
    })).rejects.toThrow("Transaction result must not include unsupported fields");
  });

  it("rejects transaction result transactions with unsupported fields before send paths", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for unsupported execution transaction fields");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for unsupported execution transaction fields");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for unsupported execution transaction fields");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: {
          ...RUNNER_TRANSACTION,
          note: "extra evidence",
        },
      } as unknown as BuildExecuteTransactionResult),
      createAccount: () => {
        throw new Error("account should not be created for unsupported execution transaction fields");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for unsupported execution transaction fields");
      },
    })).rejects.toThrow("Execution transaction must not include unsupported fields");
  });

  it("rejects transaction result decisions that disagree with the result allowed flag", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithTransactionResult = async (result: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for contradictory transaction decisions");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for contradictory transaction decisions");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for contradictory transaction decisions");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => result as BuildExecuteTransactionResult,
      createAccount: () => {
        throw new Error("account should not be created for contradictory transaction decisions");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for contradictory transaction decisions");
      },
    });

    await expect(runWithTransactionResult({
      allowed: true,
      decision: { allowed: false, code: "CapabilityDenied" },
      transaction: RUNNER_TRANSACTION,
    })).rejects.toThrow("Transaction result allowed flag must match the policy decision");

    await expect(runWithTransactionResult({
      allowed: false,
      decision: { allowed: true, code: "Allowed" },
      transaction: null,
    })).rejects.toThrow("Transaction result allowed flag must match the policy decision");
  });

  it("rejects malformed send-mode accounts before wallet client creation", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed send accounts");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed send accounts");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed send accounts");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => ({ address: "not-an-address" }) as unknown as ReturnType<typeof privateKeyToAccount>,
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed send accounts");
      },
    })).rejects.toThrow("Send account must include a valid address");
  });

  it("rejects malformed account factories before account creation", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed account factories");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed account factories");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed account factories");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: "not-a-function" as unknown as (privateKey: Hex) => ReturnType<typeof privateKeyToAccount>,
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed account factories");
      },
    })).rejects.toThrow("Account factory must be a function");
  });

  it("rejects malformed wallet-client factories before wallet client creation", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const account = privateKeyToAccount(`0x${"1".repeat(64)}` as Hex);

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed wallet-client factories");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed wallet-client factories");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed wallet-client factories");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: "not-a-function" as unknown as (
        params: { account: ReturnType<typeof privateKeyToAccount>; rpcUrl: string },
      ) => {
        sendTransaction(parameters: {
          account: ReturnType<typeof privateKeyToAccount>;
          chain: unknown;
          to: Hex;
          value: bigint;
          data: Hex;
        }): Promise<Hex>;
      },
    })).rejects.toThrow("Wallet client factory must be a function");
  });

  it("rejects malformed wallet clients before transaction sending", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const account = privateKeyToAccount(`0x${"1".repeat(64)}` as Hex);

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed wallet clients");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed wallet clients");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed wallet clients");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: () => ({}) as {
        sendTransaction(parameters: {
          account: ReturnType<typeof privateKeyToAccount>;
          chain: unknown;
          to: Hex;
          value: bigint;
          data: Hex;
        }): Promise<Hex>;
      },
    })).rejects.toThrow("Wallet client must include sendTransaction");
  });

  it("rejects inconsistent transaction-builder results before output or send paths", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithTransactionResult = async (result: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for inconsistent transaction results");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for inconsistent transaction results");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for inconsistent transaction results");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => result as BuildExecuteTransactionResult,
      createAccount: () => {
        throw new Error("account should not be created for inconsistent transaction results");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for inconsistent transaction results");
      },
    });

    await expect(runWithTransactionResult({
      allowed: true,
      decision: { allowed: true, code: "Allowed" },
      transaction: null,
    })).rejects.toThrow("Allowed execution result must include a transaction");

    await expect(runWithTransactionResult({
      allowed: false,
      decision: { allowed: false, code: "CapabilityDenied" },
      transaction: RUNNER_TRANSACTION,
    })).rejects.toThrow("Denied execution result must not include a transaction");
  });

  it("rejects malformed exit-code setters before denied output", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    await expect(module.runBaseExecuteCli?.({
      argv: ["--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed exit-code setters");
      },
      setExitCode: "not-a-function" as unknown as (code: number) => void,
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed exit-code setters");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: false, code: "CapabilityDenied" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: false,
        decision: { allowed: false, code: "CapabilityDenied" },
        transaction: null,
      }),
      createAccount: () => {
        throw new Error("account should not be created for malformed exit-code setters");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed exit-code setters");
      },
    })).rejects.toThrow("Exit code setter must be a function");
  });

  it("rejects malformed transaction payloads before output or send paths", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    const runWithTransaction = async (transaction: unknown) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: `0x${"1".repeat(64)}`,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed transaction payloads");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed transaction payloads");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed transaction payloads");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction,
      } as BuildExecuteTransactionResult),
      createAccount: () => {
        throw new Error("account should not be created for malformed transaction payloads");
      },
      createWalletClient: () => {
        throw new Error("wallet should not be created for malformed transaction payloads");
      },
    });

    await expect(runWithTransaction([])).rejects.toThrow("Execution transaction must be an object");

    await expect(runWithTransaction({
      to: "not-an-address",
      value: 0n,
      data: RUNNER_TRANSACTION.data,
    })).rejects.toThrow("Execution transaction must include a valid recipient address");

    await expect(runWithTransaction({
      to: RUNNER_TRANSACTION.to,
      value: "0",
      data: RUNNER_TRANSACTION.data,
    })).rejects.toThrow("Execution transaction value must be a bigint");

    await expect(runWithTransaction({
      to: RUNNER_TRANSACTION.to,
      value: 0n,
      data: "abcdef",
    })).rejects.toThrow("Execution transaction data must be hex calldata");
  });

  it("rejects malformed sent transaction hashes before receipt waiting", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const privateKey = `0x${"1".repeat(64)}` as Hex;
    const account = privateKeyToAccount(privateKey);

    const runWithHash = async (hash: Hex) => module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: privateKey,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed sent hashes");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed sent hashes");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("receipt wait should not run for malformed sent hashes");
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: () => ({
        sendTransaction: async () => hash,
      }),
    });

    await expect(runWithHash("0x123" as Hex)).rejects.toThrow(
      "Sent transaction hash must be a valid 32-byte hash",
    );
    await expect(runWithHash("not-a-hash" as Hex)).rejects.toThrow(
      "Sent transaction hash must be a valid 32-byte hash",
    );
  });

  it("rejects malformed receipt block numbers before output", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const privateKey = `0x${"1".repeat(64)}` as Hex;
    const hash = `0x${"2".repeat(64)}` as Hex;
    const account = privateKeyToAccount(privateKey);

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: privateKey,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed receipt block numbers");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed receipt block numbers");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => ({
          blockNumber: "123",
          status: "success",
        } as unknown as { blockNumber: bigint; status: "success" | "reverted" }),
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: () => ({
        sendTransaction: async () => hash,
      }),
    })).rejects.toThrow("Transaction receipt block number must be a bigint");
  });

  it("rejects malformed receipt object shapes before output", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const privateKey = `0x${"1".repeat(64)}` as Hex;
    const hash = `0x${"2".repeat(64)}` as Hex;
    const account = privateKeyToAccount(privateKey);

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: privateKey,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed receipt object shapes");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed receipt object shapes");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => [] as unknown as {
          blockNumber: bigint;
          status: "success" | "reverted";
        },
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: () => ({
        sendTransaction: async () => hash,
      }),
    })).rejects.toThrow("Transaction receipt must be an object");
  });

  it("rejects malformed receipt statuses before output", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const privateKey = `0x${"1".repeat(64)}` as Hex;
    const hash = `0x${"2".repeat(64)}` as Hex;
    const account = privateKeyToAccount(privateKey);

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: privateKey,
      },
      writeOutput: () => {
        throw new Error("output should not be written for malformed receipt statuses");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for malformed receipt statuses");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => ({
          blockNumber: 123n,
          status: "pending",
        } as unknown as { blockNumber: bigint; status: "success" | "reverted" }),
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: () => ({
        sendTransaction: async () => hash,
      }),
    })).rejects.toThrow("Transaction receipt status must be success or reverted");
  });

  it("rejects transaction receipts with unsupported fields before output", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const privateKey = `0x${"1".repeat(64)}` as Hex;
    const hash = `0x${"2".repeat(64)}` as Hex;
    const account = privateKeyToAccount(privateKey);

    await expect(module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " https://example.invalid ",
        PRIVATE_KEY: privateKey,
      },
      writeOutput: () => {
        throw new Error("output should not be written for unsupported receipt fields");
      },
      setExitCode: () => {
        throw new Error("exit code should not be set for unsupported receipt fields");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => RUNNER_MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => RUNNER_MANIFEST.chainId,
        readContract: async () => {
          throw new Error("policy RPC should not be used by injected simulator");
        },
        waitForTransactionReceipt: async () => ({
          blockNumber: 123n,
          status: "success",
          note: "extra evidence",
        } as unknown as { blockNumber: bigint; status: "success" | "reverted" }),
      }),
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: () => account,
      createWalletClient: () => ({
        sendTransaction: async () => hash,
      }),
    })).rejects.toThrow("Transaction receipt must not include unsupported fields");
  });

  it("renders allowed dry-run output through injected dependencies without sending", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBaseExecuteCli?.({
      argv: ["--manifest", "test-manifest.json"],
      env: { BASE_SEPOLIA_RPC_URL: " https://example.invalid " },
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("exit code should not be set for allowed dry-run");
      },
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return RUNNER_MANIFEST;
      },
      createPublicClient: (rpcUrl) => {
        calls.push(`rpc:${rpcUrl}`);
        return {
          getChainId: async () => RUNNER_MANIFEST.chainId,
          readContract: async () => {
            throw new Error("policy RPC should not be used by injected simulator");
          },
          waitForTransactionReceipt: async () => {
            throw new Error("receipt wait should not run in dry-run mode");
          },
        };
      },
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
    });

    expect(calls).toEqual([
      "dotenv:.env",
      "manifest:test-manifest.json",
      "rpc:https://example.invalid",
    ]);
    expect(outputs).toEqual([
      JSON.stringify({
        mode: "dry-run",
        chainId: RUNNER_MANIFEST.chainId,
        agent: RUNNER_MANIFEST.contracts.agentAccount,
        target: RUNNER_ACTION.target,
        allowed: true,
        decision: {
          allowed: true,
          code: "Allowed",
        },
        transaction: {
          to: RUNNER_TRANSACTION.to,
          value: "0",
          data: RUNNER_TRANSACTION.data,
        },
      }, null, 2),
    ]);
  });

  it("renders sent transaction output through injected wallet dependencies without live send", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const privateKey = `0x${"1".repeat(64)}` as Hex;
    const hash = `0x${"2".repeat(64)}` as Hex;
    const account = privateKeyToAccount(privateKey);

    await module.runBaseExecuteCli?.({
      argv: ["--send", "--manifest", "test-manifest.json"],
      env: {
        BASE_SEPOLIA_RPC_URL: " http://127.0.0.1:1 ",
        PRIVATE_KEY: ` ${privateKey}\n`,
      },
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("exit code should not be set for allowed send");
      },
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return RUNNER_MANIFEST;
      },
      createPublicClient: (rpcUrl) => {
        calls.push(`rpc:${rpcUrl}`);
        return {
          getChainId: async () => RUNNER_MANIFEST.chainId,
          readContract: async () => {
            throw new Error("policy RPC should not be used by injected simulator");
          },
          waitForTransactionReceipt: async ({ hash: receiptHash }) => {
            calls.push(`receipt:${receiptHash}`);
            return { blockNumber: 123n, status: "success" };
          },
        };
      },
      createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
      createAction: () => RUNNER_ACTION,
      buildTransaction: async () => ({
        allowed: true,
        decision: { allowed: true, code: "Allowed" },
        transaction: RUNNER_TRANSACTION,
      }),
      createAccount: (normalizedPrivateKey) => {
        calls.push(`account:${normalizedPrivateKey}`);
        return privateKeyToAccount(normalizedPrivateKey);
      },
      createWalletClient: ({ account: walletAccount, rpcUrl }) => {
        calls.push(`wallet:${walletAccount.address}:${rpcUrl}`);
        return {
          sendTransaction: async ({ account: sendAccount, to, value, data }) => {
            calls.push(`send:${sendAccount.address}:${to}:${value.toString()}:${data}`);
            return hash;
          },
        };
      },
    });

    expect(calls).toEqual([
      "dotenv:.env",
      "manifest:test-manifest.json",
      "rpc:http://127.0.0.1:1",
      `account:${privateKey}`,
      `wallet:${account.address}:http://127.0.0.1:1`,
      `send:${account.address}:${RUNNER_TRANSACTION.to}:0:${RUNNER_TRANSACTION.data}`,
      `receipt:${hash}`,
    ]);
    expect(outputs).toEqual([
      JSON.stringify({
        mode: "send",
        chainId: RUNNER_MANIFEST.chainId,
        agent: RUNNER_MANIFEST.contracts.agentAccount,
        target: RUNNER_ACTION.target,
        allowed: true,
        decision: {
          allowed: true,
          code: "Allowed",
        },
        transaction: {
          to: RUNNER_TRANSACTION.to,
          value: "0",
          data: RUNNER_TRANSACTION.data,
        },
        hash,
        explorerUrl: `${RUNNER_MANIFEST.explorerUrl}/tx/${hash}`,
        receipt: {
          blockNumber: "123",
          status: "success",
        },
      }, null, 2),
    ]);
  });
});

describe("parseBaseExecuteDotEnv", () => {
  it("parses dotenv entries without mutating process.env", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteDotEnv?.([
      "",
      " # comment",
      "BASE_SEPOLIA_RPC_URL = \"https://example.invalid\"",
      "PRIVATE_KEY='0xabc'",
      "MALFORMED",
      "EMPTY=",
    ].join("\n"))).toEqual([
      ["BASE_SEPOLIA_RPC_URL", "https://example.invalid"],
      ["PRIVATE_KEY", "0xabc"],
      ["EMPTY", ""],
    ]);
  });

  it("parses shell-style exported dotenv entries", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteDotEnv?.([
      "export BASE_SEPOLIA_RPC_URL = \"https://example.invalid\"",
      "export PRIVATE_KEY='0xabc'",
      "export MALFORMED",
    ].join("\n"))).toEqual([
      ["BASE_SEPOLIA_RPC_URL", "https://example.invalid"],
      ["PRIVATE_KEY", "0xabc"],
    ]);
  });

  it("parses exported dotenv entries with shell whitespace", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteDotEnv?.([
      "export   BASE_SEPOLIA_RPC_URL=https://example.invalid",
      "export\tPRIVATE_KEY='0xabc'",
    ].join("\n"))).toEqual([
      ["BASE_SEPOLIA_RPC_URL", "https://example.invalid"],
      ["PRIVATE_KEY", "0xabc"],
    ]);
  });

  it("ignores exported dotenv entries without a key", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteDotEnv?.([
      "export =https://example.invalid",
      "export\t=0xabc",
    ].join("\n"))).toEqual([]);
  });

  it("ignores malformed dotenv key names", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.parseBaseExecuteDotEnv?.([
      "BAD KEY=value",
      "BAD-KEY=value",
      "1BAD=value",
      "_VALID=value",
      "export PRIVATE_KEY='0xabc'",
      "EMPTY=",
    ].join("\n"))).toEqual([
      ["_VALID", "value"],
      ["PRIVATE_KEY", "0xabc"],
      ["EMPTY", ""],
    ]);
  });
});

describe("applyBaseExecuteDotEnv", () => {
  it("sets only missing environment keys from parsed dotenv entries", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const env: Record<string, string | undefined> = {
      BASE_SEPOLIA_RPC_URL: "https://existing.invalid",
    };

    module.applyBaseExecuteDotEnv?.([
      "BASE_SEPOLIA_RPC_URL=https://from-dotenv.invalid",
      "PRIVATE_KEY='0xabc'",
      "BAD KEY=value",
      "EMPTY=",
    ].join("\n"), env);

    expect(env).toEqual({
      BASE_SEPOLIA_RPC_URL: "https://existing.invalid",
      PRIVATE_KEY: "0xabc",
      EMPTY: "",
    });
  });
});

describe("loadBaseExecuteDotEnv", () => {
  it("loads dotenv contents through an injected reader without overriding existing env values", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const env: Record<string, string | undefined> = {
      BASE_SEPOLIA_RPC_URL: "https://existing.invalid",
    };
    const paths: string[] = [];

    module.loadBaseExecuteDotEnv?.(".env", env, (path) => {
      paths.push(path);
      return [
        "BASE_SEPOLIA_RPC_URL=https://from-dotenv.invalid",
        "PRIVATE_KEY='0xabc'",
      ].join("\n");
    });

    expect(paths).toEqual([".env"]);
    expect(env).toEqual({
      BASE_SEPOLIA_RPC_URL: "https://existing.invalid",
      PRIVATE_KEY: "0xabc",
    });
  });

  it("ignores dotenv read failures without mutating env values", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;
    const env: Record<string, string | undefined> = {
      BASE_SEPOLIA_RPC_URL: "https://existing.invalid",
    };
    let attemptedPath: string | undefined;

    expect(() => module.loadBaseExecuteDotEnv?.(".env", env, (path) => {
      attemptedPath = path;
      throw new Error("missing dotenv");
    })).not.toThrow();

    expect(attemptedPath).toBe(".env");
    expect(env).toEqual({
      BASE_SEPOLIA_RPC_URL: "https://existing.invalid",
    });
  });
});

describe("readRequiredBaseExecuteEnv", () => {
  it("rejects malformed helper inputs before environment lookup", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(() => module.readRequiredBaseExecuteEnv?.(
      null as unknown as Record<string, string | undefined>,
      "BASE_SEPOLIA_RPC_URL",
    )).toThrow("Environment must be an object");
    expect(() => module.readRequiredBaseExecuteEnv?.(
      { BASE_SEPOLIA_RPC_URL: 123 } as unknown as Record<string, string | undefined>,
      "BASE_SEPOLIA_RPC_URL",
    )).toThrow("Environment values must be strings when defined");
    expect(() => module.readRequiredBaseExecuteEnv?.(
      { BASE_SEPOLIA_RPC_URL: "https://example.invalid" },
      "BAD KEY",
    )).toThrow("Environment key must be a valid environment key");
  });

  it("rejects missing, empty, and whitespace-only values with the requested message", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(() => module.readRequiredBaseExecuteEnv?.({}, "BASE_SEPOLIA_RPC_URL")).toThrow(
      "BASE_SEPOLIA_RPC_URL is required",
    );
    expect(() => module.readRequiredBaseExecuteEnv?.({ BASE_SEPOLIA_RPC_URL: "" }, "BASE_SEPOLIA_RPC_URL")).toThrow(
      "BASE_SEPOLIA_RPC_URL is required",
    );
    expect(() => module.readRequiredBaseExecuteEnv?.({ BASE_SEPOLIA_RPC_URL: "  " }, "BASE_SEPOLIA_RPC_URL")).toThrow(
      "BASE_SEPOLIA_RPC_URL is required",
    );
    expect(() => module.readRequiredBaseExecuteEnv?.(
      {},
      "PRIVATE_KEY",
      "PRIVATE_KEY is required when --send is used",
    )).toThrow("PRIVATE_KEY is required when --send is used");
  });

  it("trims accepted required values before use", async () => {
    const module = await import("./execute.js") as ExecuteCliModule;

    expect(module.readRequiredBaseExecuteEnv?.(
      { BASE_SEPOLIA_RPC_URL: " https://example.invalid " },
      "BASE_SEPOLIA_RPC_URL",
    )).toBe("https://example.invalid");
    expect(module.readRequiredBaseExecuteEnv?.(
      { PRIVATE_KEY: "\n0xabc\t" },
      "PRIVATE_KEY",
    )).toBe("0xabc");
  });
});
