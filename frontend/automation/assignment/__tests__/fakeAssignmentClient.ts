import { ConsignmentNotFoundError, LineNotFoundError } from "../errors";
import type { AssignmentClient } from "../types";

interface FakeLine {
  dutyRate: string;
  /** Values the UI would reject (mirrors the "rate >= 0" rule from ReviewScreen). */
  rejectValue?: number;
}

export interface FakeClientOptions {
  consignments: Record<string, Record<string, FakeLine> | undefined>;
  //: Number of times findLine should throw a transient error before succeeding, per line.
  transientFailuresBeforeSuccess?: Record<string, number>;
}

/** In-memory stand-in for PlaywrightAssignmentClient — no browser involved. */
export class FakeAssignmentClient implements AssignmentClient {
  public confirmCalls: string[] = [];
  public enterCalls: string[] = [];
  private readonly transientCounters = new Map<string, number>();

  constructor(private readonly options: FakeClientOptions) {}

  async launch(): Promise<void> {}
  async open(): Promise<void> {}
  async close(): Promise<void> {}

  async findConsignment(consignmentReference: string): Promise<void> {
    if (!this.options.consignments[consignmentReference]) {
      throw new ConsignmentNotFoundError(consignmentReference);
    }
  }

  async findLine(consignmentReference: string, lineReference: string): Promise<void> {
    await this.findConsignment(consignmentReference);
    const key = `${consignmentReference}:${lineReference}`;
    const remainingFailures = this.options.transientFailuresBeforeSuccess?.[key] ?? 0;
    const used = this.transientCounters.get(key) ?? 0;
    if (used < remainingFailures) {
      this.transientCounters.set(key, used + 1);
      throw new Error("Navigation timeout of 5000ms exceeded");
    }
    const lines = this.options.consignments[consignmentReference];
    if (!lines?.[lineReference]) {
      throw new LineNotFoundError(consignmentReference, lineReference);
    }
  }

  async readDutyRate(consignmentReference: string, lineReference: string): Promise<string> {
    await this.findLine(consignmentReference, lineReference);
    return this.options.consignments[consignmentReference]![lineReference].dutyRate;
  }

  async enterDutyRate(consignmentReference: string, lineReference: string, value: number): Promise<void> {
    await this.findLine(consignmentReference, lineReference);
    this.enterCalls.push(`${consignmentReference}:${lineReference}`);
    this.options.consignments[consignmentReference]![lineReference].dutyRate = String(value);
  }

  async confirmLine(consignmentReference: string, lineReference: string): Promise<void> {
    await this.findLine(consignmentReference, lineReference);
    this.confirmCalls.push(`${consignmentReference}:${lineReference}`);
  }

  async readLineError(consignmentReference: string, lineReference: string): Promise<string | null> {
    const line = this.options.consignments[consignmentReference]?.[lineReference];
    const value = Number(line?.dutyRate);
    if (line?.rejectValue !== undefined && value === line.rejectValue) {
      return "Rate must be greater than or equal to 0";
    }
    return null;
  }

  async captureDiagnostics(name: string): Promise<{ screenshotPath: string | null; url: string }> {
    return { screenshotPath: null, url: `fake://${name}` };
  }
}
