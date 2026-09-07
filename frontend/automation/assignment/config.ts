import path from "node:path";
import type { AutomationConfig } from "./types";

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !["false", "0", "no"].includes(value.toLowerCase());
}

/** Reads adapter configuration from environment variables — nothing is hardcoded here. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AutomationConfig {
  return {
    // Dev-only default so `npm run automate:assignments` works out of the box locally;
    // any real deployment must set ASSIGNMENT_APP_URL explicitly.
    appUrl: env.ASSIGNMENT_APP_URL ?? "http://localhost:5173",
    headless: parseBool(env.HEADLESS, true),
    maxRetries: Number(env.AUTOMATION_MAX_RETRIES ?? 3),
    username: env.ASSIGNMENT_APP_USERNAME,
    password: env.ASSIGNMENT_APP_PASSWORD,
    artifactsDir: env.AUTOMATION_ARTIFACTS_DIR ?? path.join("artifacts", "automation"),
  };
}
