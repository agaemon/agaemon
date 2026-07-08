import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAgentOsSdkExampleCatalog,
  verifyAgentOsSdkExampleCatalog,
} from "../../sdk/exampleCatalog.js";
import { createAgentOsSdkIntegrationServer } from "../../sdk/server.js";

import type { Server } from "node:http";
import type {
  AgentOsSdkExampleCatalog,
  CreateAgentOsSdkExampleCatalogParams,
} from "../../sdk/exampleCatalog.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8788;

export interface AgentOsSdkIntegrationServeCliArgs {
  host: string;
  port: number;
}

export interface AgentOsSdkIntegrationServeCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  createCatalog?: (params?: CreateAgentOsSdkExampleCatalogParams) => AgentOsSdkExampleCatalog;
  listen?: (server: Server, port: number, host: string) => Promise<void>;
}

if (isAgentOsSdkIntegrationServeDirectRun(import.meta.url, process.argv)) {
  await runAgentOsSdkIntegrationServeCli();
}

export async function runAgentOsSdkIntegrationServeCli(
  options: AgentOsSdkIntegrationServeCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const createCatalog = options.createCatalog ?? createAgentOsSdkExampleCatalog;
  const listen = options.listen ?? defaultListen;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateCatalogCreator(createCatalog);
  validateListener(listen);
  const args = parseAgentOsSdkIntegrationServeCliArgs(argv);
  const catalog = createCatalog();
  const verification = verifyAgentOsSdkExampleCatalog({ catalog });
  const server = createAgentOsSdkIntegrationServer({ catalog, verification });

  await listen(server, args.port, args.host);
  writeOutput(formatAgentOsSdkIntegrationServeCliOutput(args));
}

export function parseAgentOsSdkIntegrationServeCliArgs(
  argv: readonly string[],
): AgentOsSdkIntegrationServeCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--host" || arg === "--port") {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--host|--port)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    host: values.get("--host") ?? DEFAULT_HOST,
    port: readPort(values.get("--port") ?? String(DEFAULT_PORT)),
  };
}

export function formatAgentOsSdkIntegrationServeCliOutput(
  args: AgentOsSdkIntegrationServeCliArgs,
): string {
  const origin = `http://${args.host}:${args.port}`;
  return [
    "AgentOS SDK integration server",
    `url: ${origin}/api/sdk/examples`,
    `examples: ${origin}/api/sdk/examples`,
    `verify: ${origin}/api/sdk/examples/verify`,
    `health: ${origin}/healthz`,
    "trustBoundary: AI proposes. Policy decides. Accounts execute.",
    "callClass: local-only read-only",
  ].join("\n");
}

export function isAgentOsSdkIntegrationServeDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readPort(rawValue: string): number {
  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("--port must be an integer from 0 to 65535");
  }
  return port;
}

function defaultListen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

function validateOptions(options: unknown): asserts options is AgentOsSdkIntegrationServeCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("AgentOS SDK integration serve options must be an object");
  }
}

function validateStringArray(argv: unknown, message: string): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateCatalogCreator(
  createCatalog: unknown,
): asserts createCatalog is (params?: CreateAgentOsSdkExampleCatalogParams) => AgentOsSdkExampleCatalog {
  if (typeof createCatalog !== "function") throw new Error("Catalog creator must be a function");
}

function validateListener(
  listen: unknown,
): asserts listen is (server: Server, port: number, host: string) => Promise<void> {
  if (typeof listen !== "function") throw new Error("Server listener must be a function");
}
