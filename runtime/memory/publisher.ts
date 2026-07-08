import { createSingleLeafMemoryCommitment } from "./commitment.js";
import type { MemoryCommitment } from "./commitment.js";
import { storeLocalMemoryContent } from "./localStorage.js";

export type MemoryPublisherName = "local" | "ipfs";

export interface PublishedMemoryRecord extends MemoryCommitment {
  publisher: MemoryPublisherName;
  storageURI: string;
  filePath?: string | undefined;
  cid?: string | undefined;
  gatewayURL?: string | undefined;
}

export interface PublishMemoryContentParams {
  publisher?: string | undefined;
  memoryIdLabel: string;
  content: string;
  local?: {
    rootDir: string;
  };
  ipfs?: {
    apiUrl?: string | undefined;
    gatewayUrl?: string | undefined;
    bearerToken?: string | undefined;
    fileName?: string | undefined;
  };
}

export async function publishMemoryContent(params: PublishMemoryContentParams): Promise<PublishedMemoryRecord> {
  const publisher = (params.publisher ?? "local").toLowerCase();

  if (publisher === "local") {
    const rootDir = params.local?.rootDir;
    if (rootDir === undefined || rootDir.length === 0) {
      throw new Error("Local memory rootDir is required when MEMORY_PUBLISHER=local");
    }

    return {
      ...(await storeLocalMemoryContent({
        rootDir,
        memoryIdLabel: params.memoryIdLabel,
        content: params.content,
      })),
      publisher,
    };
  }

  if (publisher === "ipfs") {
    return publishIpfsMemoryContent(params);
  }

  throw new Error(`Unsupported memory publisher: ${params.publisher}`);
}

async function publishIpfsMemoryContent(params: PublishMemoryContentParams): Promise<PublishedMemoryRecord> {
  const apiUrl = params.ipfs?.apiUrl;
  if (apiUrl === undefined || apiUrl.length === 0) {
    throw new Error("IPFS_API_URL is required when MEMORY_PUBLISHER=ipfs");
  }

  const form = new FormData();
  form.append("file", new Blob([params.content], { type: "application/json" }), params.ipfs?.fileName ?? "memory.json");

  const bearerToken = params.ipfs?.bearerToken;
  const requestInit: RequestInit = {
    method: "POST",
    body: form,
  };
  if (bearerToken !== undefined && bearerToken.length > 0) {
    requestInit.headers = { Authorization: `Bearer ${bearerToken}` };
  }

  const addUrl = createIpfsAddUrl(apiUrl);
  let response: Response;
  try {
    response = await fetch(addUrl, requestInit);
  } catch (error) {
    throw new Error(`IPFS add request failed for ${addUrl}: ${errorMessage(error)}`);
  }
  const cid = await readIpfsAddCid(response);
  const storageURI = `ipfs://${cid}`;

  return {
    ...createSingleLeafMemoryCommitment({
      memoryIdLabel: params.memoryIdLabel,
      content: params.content,
      storageURI,
    }),
    publisher: "ipfs",
    storageURI,
    cid,
    gatewayURL: params.ipfs?.gatewayUrl === undefined ? undefined : createGatewayURL(params.ipfs.gatewayUrl, cid),
  };
}

function createIpfsAddUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith("/api/v0/add")) {
    url.pathname = path;
  } else if (path.endsWith("/api/v0")) {
    url.pathname = `${path}/add`;
  } else {
    url.pathname = `${path}/api/v0/add`;
  }

  url.searchParams.set("pin", "true");
  url.searchParams.set("cid-version", "1");
  return url.toString();
}

async function readIpfsAddCid(response: Response): Promise<string> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`IPFS add failed: ${response.status} ${text.trim()}`);
  }

  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (line === undefined) continue;
    const parsed = JSON.parse(line) as { Hash?: unknown };
    if (typeof parsed.Hash === "string" && parsed.Hash.length > 0) return parsed.Hash;
  }

  throw new Error("IPFS add response missing Hash");
}

function createGatewayURL(gatewayUrl: string, cid: string): string {
  return `${gatewayUrl.replace(/\/+$/, "")}/${cid}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
