#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { runAssignmentAutomation } from "./assignment/assignmentAdapter";
import { loadConfig } from "./assignment/config";
import { toAssignmentInputs } from "./assignment/mapDeterminations";
import type { RawDetermination } from "./assignment/types";

function parseInputPath(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf("--input");
  return flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
}

async function main(): Promise<void> {
  const inputPath =
    parseInputPath(process.argv.slice(2)) ?? process.env.AUTOMATION_INPUT_FILE ?? "determinations.json";
  const resolvedPath = path.resolve(process.cwd(), inputPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Determinations file not found: ${resolvedPath}`);
    console.error("Export it from /api/ingest (or the review screen) as JSON first.");
    process.exitCode = 1;
    return;
  }

  const determinations = JSON.parse(fs.readFileSync(resolvedPath, "utf-8")) as RawDetermination[];
  const assignments = toAssignmentInputs(determinations);
  const config = loadConfig();

  const result = await runAssignmentAutomation(assignments, config);

  console.log("Automation completed\n");
  console.log(`Processed:  ${result.processed}`);
  console.log(`Successful: ${result.successful}`);
  console.log(`Pending:    ${result.pending}`);
  console.log(`Failed:     ${result.failed}`);

  const failures = result.results.filter((r) => r.status === "failed");
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`- Consignment ${failure.consignmentReference}`);
      console.log(`  Line ${failure.lineReference}`);
      console.log(`  Error: ${failure.error}`);
    }
  }

  process.exitCode = result.failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("Automation crashed:", error);
  process.exitCode = 1;
});
