export interface BaseSepoliaEnvExampleVerification {
  passed: boolean;
  failures: string[];
  variables: Record<string, string>;
}

const REQUIRED_KEYS = ["BASE_SEPOLIA_RPC_URL", "BASE_SEPOLIA_CHAIN_ID", "PRIVATE_KEY"] as const;

export function verifyBaseSepoliaEnvExample(contents: string): BaseSepoliaEnvExampleVerification {
  const env = parseDotEnv(contents);
  const failures: string[] = [];
  const variables: Record<string, string> = {};

  for (const key of REQUIRED_KEYS) {
    const value = env.get(key);
    if (value === undefined || value.trim().length === 0) {
      failures.push(`${key} is required in .env.example`);
      continue;
    }
    variables[key] = describeVariable(key, value);
  }

  const chainId = env.get("BASE_SEPOLIA_CHAIN_ID");
  if (chainId !== undefined && chainId.trim() !== "84532") failures.push("BASE_SEPOLIA_CHAIN_ID must be 84532");

  const privateKey = env.get("PRIVATE_KEY");
  if (privateKey !== undefined && !isPlaceholderPrivateKey(privateKey)) {
    failures.push("PRIVATE_KEY must be a placeholder in .env.example");
  }

  return {
    passed: failures.length === 0,
    failures,
    variables,
  };
}

function parseDotEnv(contents: string): Map<string, string> {
  const env = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (key.length > 0) env.set(key, value);
  }
  return env;
}

function describeVariable(key: string, value: string): string {
  if (key === "PRIVATE_KEY") return isPlaceholderPrivateKey(value) ? "placeholder" : "real-looking";
  if (key === "BASE_SEPOLIA_RPC_URL") return "present";
  return value.trim();
}

function isPlaceholderPrivateKey(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes("replace_with")) return true;
  if (trimmed.length === 0) return false;
  return !/^0x[0-9a-f]{64}$/.test(trimmed);
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
