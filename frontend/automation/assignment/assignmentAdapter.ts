import { CONFIDENCE_THRESHOLD } from "../../src/confidenceThreshold";
import { isTransientError } from "./errors";
import { PlaywrightAssignmentClient } from "./playwrightClient";
import type {
  AssignmentClient,
  AssignmentInput,
  AutomationConfig,
  AutomationResult,
  LineResult,
} from "./types";

type AssignmentLine = AssignmentInput["lines"][number];

async function withRetries<T>(action: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastError: unknown;
  const attempts = Math.max(1, maxRetries);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      // Deterministic/business errors (not-found, validation) are never worth retrying.
      if (!isTransientError(error) || attempt === attempts) throw error;
    }
  }
  throw lastError;
}

/** Runs the full pipeline: locate each consignment/line, populate high-confidence rates, report the rest. */
export async function runAssignmentAutomation(
  input: AssignmentInput[],
  config: AutomationConfig,
  client: AssignmentClient = new PlaywrightAssignmentClient(config),
): Promise<AutomationResult> {
  const results: LineResult[] = [];

  await client.launch();
  try {
    await client.open();

    for (const consignment of input) {
      try {
        await withRetries(() => client.findConsignment(consignment.consignmentReference), config.maxRetries);
      } catch (error) {
        const diagnostics = await client.captureDiagnostics(
          `consignment-${consignment.consignmentReference}-not-found`,
        );
        // One missing consignment must not block the rest of the batch.
        for (const line of consignment.lines) {
          results.push({
            consignmentReference: consignment.consignmentReference,
            lineReference: line.lineReference,
            status: "failed",
            error: `${describeError(error)} (url: ${diagnostics.url})`,
          });
        }
        continue;
      }

      for (const line of consignment.lines) {
        results.push(await processLine(client, consignment.consignmentReference, line, config));
      }
    }
  } finally {
    await client.close();
  }

  return summarize(results);
}

async function processLine(
  client: AssignmentClient,
  consignmentReference: string,
  line: AssignmentLine,
  config: AutomationConfig,
): Promise<LineResult> {
  const intendedRate =
    line.finalRate ?? (line.confidence >= CONFIDENCE_THRESHOLD ? line.rate : null);

  // Never fabricate a value: below-threshold lines with no human-approved override stay pending.
  if (intendedRate === null || intendedRate === undefined) {
    return {
      consignmentReference,
      lineReference: line.lineReference,
      status: "pending",
      error: "Below confidence threshold and no manually approved rate; left for manual review.",
    };
  }

  try {
    await withRetries(() => client.findLine(consignmentReference, line.lineReference), config.maxRetries);

    const currentValue = await withRetries(
      () => client.readDutyRate(consignmentReference, line.lineReference),
      config.maxRetries,
    );
    // Idempotency: if the line already carries the intended value, treat a re-run as successful
    // rather than re-entering/overwriting it.
    const alreadyCorrect = currentValue !== "" && Number(currentValue) === intendedRate;

    if (!alreadyCorrect) {
      await withRetries(
        () => client.enterDutyRate(consignmentReference, line.lineReference, intendedRate),
        config.maxRetries,
      );
      await withRetries(
        () => client.confirmLine(consignmentReference, line.lineReference),
        config.maxRetries,
      );
    }

    const validationMessage = await client.readLineError(consignmentReference, line.lineReference);
    if (validationMessage) {
      const diagnostics = await client.captureDiagnostics(
        `validation-${consignmentReference}-${line.lineReference}`,
      );
      return {
        consignmentReference,
        lineReference: line.lineReference,
        status: "failed",
        error: `${validationMessage} (attempted rate: ${intendedRate}, url: ${diagnostics.url})`,
      };
    }

    // Never assume the fill succeeded — read the UI back to confirm it actually took.
    const confirmedValue = await client.readDutyRate(consignmentReference, line.lineReference);
    if (Number(confirmedValue) !== intendedRate) {
      const diagnostics = await client.captureDiagnostics(
        `unconfirmed-${consignmentReference}-${line.lineReference}`,
      );
      return {
        consignmentReference,
        lineReference: line.lineReference,
        status: "failed",
        error: `Value not confirmed in UI after entry (url: ${diagnostics.url})`,
      };
    }

    return { consignmentReference, lineReference: line.lineReference, status: "success" };
  } catch (error) {
    const diagnostics = await client.captureDiagnostics(`error-${consignmentReference}-${line.lineReference}`);
    return {
      consignmentReference,
      lineReference: line.lineReference,
      status: "failed",
      error: `${describeError(error)} (url: ${diagnostics.url})`,
    };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarize(results: LineResult[]): AutomationResult {
  return {
    processed: results.length,
    successful: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    pending: results.filter((r) => r.status === "pending").length,
    results,
  };
}
