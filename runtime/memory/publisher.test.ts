import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keccak256, stringToHex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publishMemoryContent } from "./publisher.js";

describe("publishMemoryContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses local content-addressed storage by default", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-publisher-"));
    const content = "AgentOS publisher local test";
    const expectedContentHash = keccak256(stringToHex(content));

    const published = await publishMemoryContent({
      publisher: "local",
      memoryIdLabel: "agentos.profile.local",
      content,
      local: { rootDir },
    });

    expect(published.publisher).toBe("local");
    expect(published.memoryId).toBe(keccak256(stringToHex("agentos.profile.local")));
    expect(published.contentHash).toBe(expectedContentHash);
    expect(published.merkleRoot).toBe(expectedContentHash);
    expect(published.storageURI).toBe(`memory://local/${expectedContentHash}`);
    expect(published.storageURIHash).toBe(keccak256(stringToHex(published.storageURI)));
    expect(published.filePath).toBe(join(rootDir, `${expectedContentHash}.txt`));
  });

  it("uploads memory content to a Kubo-compatible IPFS endpoint", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ Name: "agent-profile.json", Hash: "bafyprofilecid" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const published = await publishMemoryContent({
      publisher: "ipfs",
      memoryIdLabel: "agentos.profile.ipfs",
      content: "{\"profile\":true}\n",
      ipfs: {
        apiUrl: "https://ipfs-api.example",
        gatewayUrl: "https://gateway.example/ipfs",
        bearerToken: "test-token",
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ipfs-api.example/api/v0/add?pin=true&cid-version=1");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toEqual({ Authorization: "Bearer test-token" });

    expect(published.publisher).toBe("ipfs");
    expect(published.cid).toBe("bafyprofilecid");
    expect(published.storageURI).toBe("ipfs://bafyprofilecid");
    expect(published.gatewayURL).toBe("https://gateway.example/ipfs/bafyprofilecid");
    expect(published.contentHash).toBe(keccak256(stringToHex("{\"profile\":true}\n")));
    expect(published.storageURIHash).toBe(keccak256(stringToHex("ipfs://bafyprofilecid")));
  });

  it("rejects IPFS responses without a CID hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ Name: "agent-profile.json" }), { status: 200 })),
    );

    await expect(
      publishMemoryContent({
        publisher: "ipfs",
        memoryIdLabel: "agentos.profile.ipfs",
        content: "{\"profile\":true}\n",
        ipfs: { apiUrl: "https://ipfs-api.example" },
      }),
    ).rejects.toThrow("IPFS add response missing Hash");
  });

  it("wraps IPFS connection failures with the configured API URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(
      publishMemoryContent({
        publisher: "ipfs",
        memoryIdLabel: "agentos.profile.ipfs",
        content: "{\"profile\":true}\n",
        ipfs: { apiUrl: "http://127.0.0.1:5001" },
      }),
    ).rejects.toThrow(
      "IPFS add request failed for http://127.0.0.1:5001/api/v0/add?pin=true&cid-version=1: fetch failed",
    );
  });

  it("rejects unsupported publisher names", async () => {
    await expect(
      publishMemoryContent({
        publisher: "arweave",
        memoryIdLabel: "agentos.profile.unsupported",
        content: "unsupported",
        local: { rootDir: "storage/memory" },
      }),
    ).rejects.toThrow("Unsupported memory publisher: arweave");
  });
});
