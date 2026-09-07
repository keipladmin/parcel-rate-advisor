import type { Determination } from "./api";
import { CONFIDENCE_THRESHOLD } from "./confidenceThreshold";

export { CONFIDENCE_THRESHOLD };

export interface ReviewLine {
  determination: Determination;
  // Operator-editable overrides. Empty string means "not yet keyed in".
  category: string;
  dutyRate: string;
  vatRate: string;
  // Set once an operator (or the automation adapter) has confirmed the line's values.
  confirmed: boolean;
  error?: string;
}

//: Same rule the assignment screen's UI and the automation adapter both enforce.
export function validateRates(dutyRate: string, vatRate: string): string | null {
  const duty = dutyRate.trim() === "" ? null : Number(dutyRate);
  const vat = vatRate.trim() === "" ? null : Number(vatRate);
  if (duty !== null && (Number.isNaN(duty) || duty < 0)) {
    return "Duty rate must be greater than or equal to 0";
  }
  if (vat !== null && (Number.isNaN(vat) || vat < 0)) {
    return "VAT rate must be greater than or equal to 0";
  }
  return null;
}

export function statusFor(determination: Determination): "auto_resolved" | "pending_review" {
  return determination.confidence >= CONFIDENCE_THRESHOLD ? "auto_resolved" : "pending_review";
}

export function buildReviewLines(determinations: Determination[]): ReviewLine[] {
  return determinations.map((determination) => {
    const autoResolved = statusFor(determination) === "auto_resolved";
    return {
      determination,
      category: autoResolved ? determination.category : "",
      dutyRate: autoResolved ? String(determination.duty_rate) : "",
      vatRate: autoResolved ? String(determination.vat_rate) : "",
      confirmed: false,
    };
  });
}

//: Final export value per line — the operator's keyed-in value if present, otherwise the
//: mocked determination itself (a pending_review row must still carry it, not be blanked).
function resolvedValues(line: ReviewLine) {
  const { determination } = line;
  return {
    category: line.category.trim() || determination.category,
    dutyRate: line.dutyRate.trim() !== "" ? Number(line.dutyRate) : determination.duty_rate,
    vatRate: line.vatRate.trim() !== "" ? Number(line.vatRate) : determination.vat_rate,
  };
}

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toResponseCsv(lines: ReviewLine[]): string {
  const header = [
    "consignment_reference",
    "line_id",
    "description",
    "origin",
    "commodity_code",
    "category",
    "duty_rate",
    "vat_rate",
    "confidence",
    "status",
  ];
  const rows = lines.map((line) => {
    const { determination } = line;
    const { category, dutyRate, vatRate } = resolvedValues(line);
    return [
      determination.consignment_reference ?? "",
      determination.line_id ?? "",
      determination.description,
      determination.origin ?? "",
      determination.commodity_code ?? "",
      category,
      dutyRate,
      vatRate,
      determination.confidence,
      statusFor(determination),
    ]
      .map(csvEscape)
      .join(",");
  });
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

export function downloadResponseCsv(lines: ReviewLine[], filename = "response-export.csv"): void {
  const blob = new Blob([toResponseCsv(lines)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
