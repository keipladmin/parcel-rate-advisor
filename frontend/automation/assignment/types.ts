/** Shared types for the assignment automation adapter.
 *
 * `RawDetermination` intentionally mirrors the backend's `Determination` model / the response
 * export's row shape (see ../../RESPONSE_FORMAT_SPEC.md) rather than importing it — the CLI
 * consumes a JSON export of determinations, not the live frontend bundle.
 */

export interface RawDetermination {
  item_ref: string;
  description: string;
  origin: string | null;
  commodity_code: string | null;
  category: string;
  duty_rate: number;
  vat_rate: number;
  confidence: number;
  consignment_reference: string | null;
  line_id: string | null;
}

export interface AssignmentLineInput {
  lineReference: string;
  description: string;
  origin: string | null;
  commodityCode: string | null;
  //: Mocked determine() rate — never entered into the UI unless confidence clears the threshold.
  rate: number | null;
  confidence: number;
  //: A human-approved override (e.g. keyed in on the review screen already); always wins.
  finalRate?: number | null;
}

export interface AssignmentInput {
  consignmentReference: string;
  lines: AssignmentLineInput[];
}

export type LineStatus = "success" | "failed" | "pending";

export interface LineResult {
  consignmentReference: string;
  lineReference: string;
  status: LineStatus;
  error?: string;
}

export interface AutomationResult {
  processed: number;
  successful: number;
  failed: number;
  pending: number;
  results: LineResult[];
}

export interface AutomationConfig {
  appUrl: string;
  headless: boolean;
  maxRetries: number;
  username?: string;
  password?: string;
  artifactsDir: string;
}

/** Contract implemented by the real Playwright client and by test doubles. */
export interface AssignmentClient {
  launch(): Promise<void>;
  open(): Promise<void>;
  findConsignment(consignmentReference: string): Promise<void>;
  findLine(consignmentReference: string, lineReference: string): Promise<void>;
  readDutyRate(consignmentReference: string, lineReference: string): Promise<string>;
  enterDutyRate(consignmentReference: string, lineReference: string, value: number): Promise<void>;
  confirmLine(consignmentReference: string, lineReference: string): Promise<void>;
  readLineError(consignmentReference: string, lineReference: string): Promise<string | null>;
  captureDiagnostics(name: string): Promise<{ screenshotPath: string | null; url: string }>;
  close(): Promise<void>;
}
