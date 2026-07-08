import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface Manifest {
  network: string;
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  owner: string;
  contracts: {
    agentAccount: string;
    agentDirectory: string;
    memoryRegistry: string;
    reputationRegistry: string;
    reputationHistory: string;
    agentCoordination: string;
  };
}

interface PublicClient {
  getChainId: () => Promise<number>;
  waitForTransactionReceipt?: (params: { hash: string }) => Promise<{ blockNumber: bigint; status: string }>;
  readContract?: (params: unknown) => Promise<unknown>;
  getTransactionCount?: (params: unknown) => Promise<number>;
}

interface WalletClient {
  sendTransaction: (params: unknown) => Promise<string>;
}

interface BuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: null | { to: string; value: bigint; data: string };
}

const AGENT = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const REGISTRY = "0x3333333333333333333333333333333333333333";
const DIRECTORY = "0x4444444444444444444444444444444444444444";
const MANIFEST: Manifest = {
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://explorer.example",
  owner: OWNER,
  contracts: {
    agentAccount: AGENT,
    agentDirectory: DIRECTORY,
    memoryRegistry: REGISTRY,
    reputationRegistry: "0x5555555555555555555555555555555555555555",
    reputationHistory: "0x6666666666666666666666666666666666666666",
    agentCoordination: "0x7777777777777777777777777777777777777777",
  },
};
const COMMITMENT = {
  memoryId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  merkleRoot: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  contentHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  storageURIHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
} as const;
const ALLOWED: BuildResult = {
  allowed: true,
  decision: { code: "Allowed" },
  transaction: { to: AGENT, value: 0n, data: "0x1234" },
};

describe("memory CLI seams", () => {
  it("hardens memory commit parsing and injected execution", async () => {
    const module = await import("./commit.js");
    const scriptPath = resolve("runtime/cli/memory/commit.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    expect(module.isMemoryCommitDirectRun(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.parseMemoryCommitCliArgs([
      "--send",
      "--manifest=custom.json",
      "--memory-id-label", "label",
      "--content", "content",
      "--storage-uri=memory://custom",
    ])).toEqual({
      send: true,
      manifestPath: "custom.json",
      memoryIdLabel: "label",
      content: "content",
      storageURI: "memory://custom",
    });
    expect(() => module.parseMemoryCommitCliArgs(["--send", "--send"])).toThrow("Duplicate argument: --send");

    await module.runMemoryCommitCli({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output: string) => outputs.push(output),
      setExitCode: (code: number) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireMemoryRegistry: () => REGISTRY,
      createMemoryCommitment: () => COMMITMENT,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildMemoryCommitTransaction: async () => ({ allowed: false, decision: { code: "Denied" }, transaction: null }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ mode: "dry-run", registry: REGISTRY, allowed: false });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed memory commit injected seams before output", async () => {
    const module = await import("./commit.js");
    const calls: string[] = [];

    await expect(module.runMemoryCommitCli(null as never)).rejects.toThrow("Memory commit options must be an object");
    await expect(module.runMemoryCommitCli({
      writeOutput: "bad" as never,
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Output writer must be a function");
    expect(calls).toEqual([]);
  });

  it("rejects malformed memory commit build results before output or exit mutation", async () => {
    const module = await import("./commit.js");
    const calls: string[] = [];

    await expect(module.runMemoryCommitCli({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireMemoryRegistry: () => REGISTRY,
      createMemoryCommitment: () => COMMITMENT,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildMemoryCommitTransaction: async () => null as never,
    })).rejects.toThrow("Memory commit build result must be an object");
    expect(calls).toEqual([]);
  });

  it("hardens memory store parsing and injected execution", async () => {
    const module = await import("./store.js");
    const outputs: string[] = [];

    expect(module.parseMemoryStoreCliArgs([
      "--manifest", "custom.json",
      "--storage-dir=tmp/memory",
      "--memory-id-label", "label",
      "--content", "content",
    ])).toEqual({
      send: false,
      manifestPath: "custom.json",
      storageDir: "tmp/memory",
      memoryIdLabel: "label",
      content: "content",
    });
    expect(() => module.parseMemoryStoreCliArgs(["--unknown"])).toThrow("Unsupported argument: --unknown");

    await module.runMemoryStoreCli({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", LOCAL_MEMORY_STORAGE_DIR: "env/memory" },
      writeOutput: (output: string) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireMemoryRegistry: () => REGISTRY,
      storeLocalMemoryContent: async () => ({ ...COMMITMENT, storageURI: "memory://local/test", filePath: "env/memory/test.txt" }),
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildMemoryStoreTransaction: async () => ALLOWED,
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      mode: "dry-run",
      localStorage: { storageURI: "memory://local/test", filePath: "env/memory/test.txt" },
      commitment: { memoryId: COMMITMENT.memoryId },
      allowed: true,
    });
  });

  it("rejects malformed memory store injected seams before output", async () => {
    const module = await import("./store.js");
    const calls: string[] = [];

    await expect(module.runMemoryStoreCli([] as never)).rejects.toThrow("Memory store options must be an object");
    await expect(module.runMemoryStoreCli({
      setExitCode: "bad" as never,
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Exit code setter must be a function");
    expect(calls).toEqual([]);
  });

  it("rejects malformed memory store records and build results before output or exit mutation", async () => {
    const module = await import("./store.js");
    const calls: string[] = [];
    const baseOptions = {
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireMemoryRegistry: () => REGISTRY,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
    };

    await expect(module.runMemoryStoreCli({
      ...baseOptions,
      storeLocalMemoryContent: async () => ({ ...COMMITMENT, storageURI: "", filePath: "memory.txt" }),
      buildMemoryStoreTransaction: async () => ALLOWED,
    })).rejects.toThrow("Memory store record storageURI must not be empty");
    await expect(module.runMemoryStoreCli({
      ...baseOptions,
      storeLocalMemoryContent: async () => ({ ...COMMITMENT, storageURI: "memory://local/test", filePath: "memory.txt" }),
      buildMemoryStoreTransaction: async () => ({ allowed: true, decision: { code: "Allowed" }, transaction: { to: AGENT, value: 0n, data: "" } }),
    })).rejects.toThrow("Memory store build result transaction data must not be empty");
    expect(calls).toEqual([]);
  });

  it("hardens memory profile parsing and injected send output", async () => {
    const module = await import("./profile.js");
    const outputs: string[] = [];
    const publicClient = {
      getChainId: async () => 84532,
      readContract: async (params: unknown) => {
        const functionName = (params as { functionName: string }).functionName;
        if (functionName === "owner") return OWNER;
        if (functionName === "profileOf") return [COMMITMENT.memoryId, COMMITMENT.storageURIHash, true, true];
        return [COMMITMENT.merkleRoot, COMMITMENT.contentHash, COMMITMENT.storageURIHash, 1n, 2n, 3n];
      },
      getTransactionCount: async () => 7,
      waitForTransactionReceipt: async () => ({ blockNumber: 42n, status: "success" }),
    };

    expect(module.parseMemoryProfileCliArgs([
      "--send",
      "--publisher=local",
      "--role-label", "agent.role",
      "--profile-name", "Agent",
      "--profile-description=Description",
      "--memory-id-label", "agent.profile",
      "--storage-dir", "storage/profiles",
    ])).toMatchObject({
      send: true,
      publisher: "local",
      roleLabel: "agent.role",
      profileName: "Agent",
      profileDescription: "Description",
      memoryIdLabel: "agent.profile",
      storageDir: "storage/profiles",
    });

    await module.runMemoryProfileCli({
      argv: ["--send"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", PRIVATE_KEY: "0xabc" },
      writeOutput: (output: string) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAgentDirectory: () => DIRECTORY,
      requireMemoryRegistry: () => REGISTRY,
      createProfileDocument: () => "{\"name\":\"Agent\"}",
      publishMemoryContent: async () => ({
        ...COMMITMENT,
        publisher: "local",
        storageURI: "memory://local/profile",
        filePath: "storage/profiles/profile.txt",
      }),
      createProfileCommitment: () => ({ roleHash: COMMITMENT.memoryId, metadataURIHash: COMMITMENT.storageURIHash }),
      createPublicClient: () => publicClient,
      buildMemoryCommitTransaction: async () => ALLOWED,
      createRegisterProfileTransaction: () => ({ to: DIRECTORY, value: 0n, data: "0xabcd" }),
      callPasses: async () => true,
      createWalletAccount: () => ({ address: OWNER }),
      createWalletClient: () => ({
        sendTransaction: async (params: unknown) => ((params as { nonce: number }).nonce === 7 ? "0xmemory" : "0xregister"),
      } as WalletClient),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      mode: "send",
      memoryHash: "0xmemory",
      registerHash: "0xregister",
      memoryReceipt: { blockNumber: "42", status: "success" },
      registerReceipt: { blockNumber: "42", status: "success" },
    });
  });

  it("rejects malformed memory profile injected seams before output", async () => {
    const module = await import("./profile.js");
    const calls: string[] = [];

    await expect(module.runMemoryProfileCli(null as never)).rejects.toThrow(
      "Memory profile options must be an object",
    );
    await expect(module.runMemoryProfileCli({
      writeOutput: "bad" as never,
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Output writer must be a function");
    expect(calls).toEqual([]);
  });

  it("rejects malformed memory profile records, build results, and register transactions before output", async () => {
    const module = await import("./profile.js");
    const calls: string[] = [];
    const publicClient = {
      getChainId: async () => 84532,
      readContract: async (params: unknown) => {
        const functionName = (params as { functionName: string }).functionName;
        if (functionName === "owner") return OWNER;
        if (functionName === "profileOf") return [COMMITMENT.memoryId, COMMITMENT.storageURIHash, true, true];
        return [COMMITMENT.merkleRoot, COMMITMENT.contentHash, COMMITMENT.storageURIHash, 1n, 2n, 3n];
      },
    };
    const baseOptions = {
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAgentDirectory: () => DIRECTORY,
      requireMemoryRegistry: () => REGISTRY,
      createProfileDocument: () => "{\"name\":\"Agent\"}",
      createProfileCommitment: () => ({ roleHash: COMMITMENT.memoryId, metadataURIHash: COMMITMENT.storageURIHash }),
      createPublicClient: () => publicClient,
      callPasses: async () => true,
    };

    await expect(module.runMemoryProfileCli({
      ...baseOptions,
      publishMemoryContent: async () => ({ ...COMMITMENT, publisher: "local", storageURI: "" }),
      buildMemoryCommitTransaction: async () => ALLOWED,
      createRegisterProfileTransaction: () => ({ to: DIRECTORY, value: 0n, data: "0xabcd" }),
    })).rejects.toThrow("Memory profile published record storageURI must not be empty");
    await expect(module.runMemoryProfileCli({
      ...baseOptions,
      publishMemoryContent: async () => ({ ...COMMITMENT, publisher: "local", storageURI: "memory://local/profile" }),
      buildMemoryCommitTransaction: async () => null as never,
      createRegisterProfileTransaction: () => ({ to: DIRECTORY, value: 0n, data: "0xabcd" }),
    })).rejects.toThrow("Memory profile build result must be an object");
    await expect(module.runMemoryProfileCli({
      ...baseOptions,
      publishMemoryContent: async () => ({ ...COMMITMENT, publisher: "local", storageURI: "memory://local/profile" }),
      buildMemoryCommitTransaction: async () => ALLOWED,
      createRegisterProfileTransaction: () => ({ to: DIRECTORY, value: 0n, data: "" }),
    })).rejects.toThrow("Memory profile register transaction data must not be empty");
    expect(calls).toEqual([]);
  });

  it("hardens memory profile verification parsing and failed reports", async () => {
    const module = await import("./profileVerify.js");
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    expect(module.parseMemoryProfileVerifyCliArgs([
      "--manifest=custom.json",
      "--metadata-uri", "memory://local/profile",
      "--role-label", "agent.role",
      "--memory-id-label=agent.profile",
      "--storage-dir", "storage/profiles",
      "--ipfs-gateway-url", "https://gateway.example",
    ])).toMatchObject({ manifestPath: "custom.json", metadataURI: "memory://local/profile" });

    await module.runMemoryProfileVerifyCli({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", AGENT_METADATA_URI: "memory://local/profile" },
      writeOutput: (output: string) => outputs.push(output),
      setExitCode: (code: number) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAgentDirectory: () => DIRECTORY,
      requireMemoryRegistry: () => REGISTRY,
      readPublishedMemoryContent: async () => "{\"name\":\"Agent\"}",
      verifyPublishedMemoryContent: () => ({
        ok: false,
        computed: COMMITMENT,
        expected: COMMITMENT,
        checks: { memoryIdMatches: true, merkleRootMatches: true, contentHashMatches: true, storageURIHashMatches: false },
      }),
      createPublicClient: () => ({
        getChainId: async () => 84532,
        readContract: async (params: unknown) => {
          const functionName = (params as { functionName: string }).functionName;
          if (functionName === "profileOf") return [COMMITMENT.memoryId, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", true, true];
          return [COMMITMENT.merkleRoot, COMMITMENT.contentHash, COMMITMENT.storageURIHash, 1n, 2n, 3n];
        },
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ ok: false, checks: { storageURIHashMatches: false } });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed memory profile verification injected seams before output", async () => {
    const module = await import("./profileVerify.js");
    const calls: string[] = [];

    await expect(module.runMemoryProfileVerifyCli([] as never)).rejects.toThrow(
      "Memory profile verification options must be an object",
    );
    await expect(module.runMemoryProfileVerifyCli({
      setExitCode: "bad" as never,
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Exit code setter must be a function");
    expect(calls).toEqual([]);
  });

  it("rejects malformed memory profile verification content and reports before output", async () => {
    const module = await import("./profileVerify.js");
    const calls: string[] = [];
    const baseOptions = {
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", AGENT_METADATA_URI: "memory://local/profile" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAgentDirectory: () => DIRECTORY,
      requireMemoryRegistry: () => REGISTRY,
      createPublicClient: () => ({
        getChainId: async () => 84532,
        readContract: async (params: unknown) => {
          const functionName = (params as { functionName: string }).functionName;
          if (functionName === "profileOf") return [COMMITMENT.memoryId, COMMITMENT.storageURIHash, true, true];
          return [COMMITMENT.merkleRoot, COMMITMENT.contentHash, COMMITMENT.storageURIHash, 1n, 2n, 3n];
        },
      }),
    };

    await expect(module.runMemoryProfileVerifyCli({
      ...baseOptions,
      readPublishedMemoryContent: async () => "",
      verifyPublishedMemoryContent: () => ({
        ok: true,
        computed: COMMITMENT,
        expected: COMMITMENT,
        checks: { memoryIdMatches: true, merkleRootMatches: true, contentHashMatches: true, storageURIHashMatches: true },
      }),
    })).rejects.toThrow("Memory profile verification content must not be empty");
    await expect(module.runMemoryProfileVerifyCli({
      ...baseOptions,
      readPublishedMemoryContent: async () => "{\"name\":\"Agent\"}",
      verifyPublishedMemoryContent: () => null as never,
    })).rejects.toThrow("Memory profile verification result must be an object");
    expect(calls).toEqual([]);
  });

  it("hardens memory safety check parsing and injected checks", async () => {
    const module = await import("./safetyCheck.js");
    const outputs: string[] = [];

    expect(module.isMemorySafetyCheckDirectRun(
      pathToFileURL(resolve("runtime/cli/memory/safetyCheck.ts")).href,
      ["node", resolve("runtime/cli/memory/safetyCheck.ts")],
    )).toBe(true);
    expect(module.parseMemorySafetyCheckCliArgs(["--manifest=custom.json"])).toEqual({ manifestPath: "custom.json" });
    expect(() => module.parseMemorySafetyCheckCliArgs(["--manifest"])).toThrow("--manifest requires a value");

    await module.runMemorySafetyCheckCli({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output: string) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireMemoryRegistry: () => REGISTRY,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async (params: unknown) => {
        const kind = (params as { kind: string }).kind;
        if (kind === "allowed") return { allowed: true, decision: { code: "Allowed" }, transaction: ALLOWED.transaction };
        if (kind === "unknownRegistry") return { allowed: false, decision: { code: "CapabilityDenied" }, transaction: null };
        if (kind === "overLimit") return { allowed: false, decision: { code: "ActionValueExceeded" }, transaction: null };
        return { allowed: true, decision: { code: "Allowed" }, transaction: { to: AGENT, value: 0n, data: "0x1234" } };
      },
      callInvalidCommitment: async () => false,
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      chainId: 84532,
      agent: AGENT,
      registry: REGISTRY,
      checks: {
        allowedCommit: true,
        unknownRegistryDenied: true,
        overLimitDenied: true,
        invalidCommitmentRejected: true,
      },
    });
  });

  it("rejects malformed memory safety-check injected seams before output", async () => {
    const module = await import("./safetyCheck.js");
    const calls: string[] = [];

    await expect(module.runMemorySafetyCheckCli("bad" as never)).rejects.toThrow(
      "Memory safety check options must be an object",
    );
    await expect(module.runMemorySafetyCheckCli({
      writeOutput: () => calls.push("output"),
      callInvalidCommitment: "bad" as never,
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Invalid commitment checker must be a function");
    expect(calls).toEqual([]);
  });

  it("rejects malformed memory safety-check build results before output or exit mutation", async () => {
    const module = await import("./safetyCheck.js");
    const calls: string[] = [];

    await expect(module.runMemorySafetyCheckCli({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireMemoryRegistry: () => REGISTRY,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async () => ({ allowed: true, decision: { code: "" }, transaction: ALLOWED.transaction }),
      callInvalidCommitment: async () => false,
    })).rejects.toThrow("Memory safety check build result decision code must not be empty");
    expect(calls).toEqual([]);
  });
});
