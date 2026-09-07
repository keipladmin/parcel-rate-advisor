import { useEffect, useMemo, useState } from "react";
import type { Determination } from "./api";
import { groupBy } from "./groupBy";
import {
  buildReviewLines,
  downloadResponseCsv,
  statusFor,
  validateRates,
  CONFIDENCE_THRESHOLD,
  type ReviewLine,
} from "./responseExport";

interface ReviewScreenProps {
  determinations: Determination[];
}

export default function ReviewScreen({ determinations }: ReviewScreenProps) {
  const [lines, setLines] = useState<ReviewLine[]>(() => buildReviewLines(determinations));

  // Rebuild whenever a new batch of determinations comes in (e.g. a new file was ingested).
  useEffect(() => setLines(buildReviewLines(determinations)), [determinations]);

  function updateLine(index: number, patch: Partial<ReviewLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  // Editing a value un-confirms the line; it must be explicitly re-confirmed to take effect,
  // matching what the automation adapter checks before treating a line as done.
  function handleFieldChange(index: number, patch: Partial<ReviewLine>) {
    updateLine(index, { ...patch, confirmed: false, error: undefined });
  }

  function handleConfirm(index: number) {
    const line = lines[index];
    const error = validateRates(line.dutyRate, line.vatRate);
    updateLine(index, { error: error ?? undefined, confirmed: !error });
  }

  const groups = useMemo(
    () =>
      groupBy(
        lines.map((line, index) => ({ index, line })),
        (row) => row.line.determination.consignment_reference ?? "(unknown consignment)",
      ),
    [lines],
  );

  if (determinations.length === 0) {
    return null;
  }

  return (
    <section className="card">
      <h2>Manual assignment review</h2>
      <p>
        Lines below the {(CONFIDENCE_THRESHOLD * 100).toFixed(0)}% confidence threshold are left
        blank here for an operator (or the automation adapter) to key in by hand, rather than
        showing a fabricated rate. Use the Confirm button per line to validate and lock in a value.
      </p>
      {[...groups.entries()].map(([consignmentReference, rows]) => (
        <div
          key={consignmentReference}
          data-testid={`consignment-${consignmentReference}`}
          className="consignment-block"
        >
          <h3 className="consignment-title">{consignmentReference}</h3>
          <div className="table-scroll">
            <table className="assignment-table">
              <thead>
                <tr>
                  {[
                    "Line",
                    "Description",
                    "Origin",
                    "Commodity code",
                    "Category",
                    "Duty rate",
                    "VAT rate",
                    "Confidence",
                    "Status",
                    "",
                  ].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
            <tbody>
              {rows.map(({ index, line }) => {
                const { determination } = line;
                const lineRef = determination.line_id ?? String(index);
                const status = statusFor(determination);
                return (
                  <tr key={`${consignmentReference}-${lineRef}`} data-testid={`assignment-line-${lineRef}`}>
                    <td>{determination.line_id}</td>
                    <td>{determination.description}</td>
                    <td>{determination.origin}</td>
                    <td>{determination.commodity_code}</td>
                    <td>
                      <input
                        data-testid={`category-input-${lineRef}`}
                        className="rate-input"
                        value={line.category}
                        placeholder={status === "pending_review" ? "pending" : ""}
                        onChange={(e) => handleFieldChange(index, { category: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        data-testid={`duty-rate-input-${lineRef}`}
                        className="rate-input"
                        type="number"
                        step="0.0001"
                        min="0"
                        value={line.dutyRate}
                        placeholder={status === "pending_review" ? "pending" : ""}
                        onChange={(e) => handleFieldChange(index, { dutyRate: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        data-testid={`vat-rate-input-${lineRef}`}
                        className="rate-input"
                        type="number"
                        step="0.0001"
                        min="0"
                        value={line.vatRate}
                        placeholder={status === "pending_review" ? "pending" : ""}
                        onChange={(e) => handleFieldChange(index, { vatRate: e.target.value })}
                      />
                    </td>
                    <td>{determination.confidence.toFixed(2)}</td>
                    <td>
                      <div data-testid={`line-status-${lineRef}`} className={`badge badge-${line.confirmed ? "confirmed" : status}`}>
                        {line.confirmed ? "confirmed" : status}
                      </div>
                      {line.error && (
                        <div data-testid={`line-error-${lineRef}`} className="field-error">
                          {line.error}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        data-testid={`confirm-line-${lineRef}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleConfirm(index)}
                      >
                        Confirm
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={() => downloadResponseCsv(lines)}>
        Export response CSV
      </button>
    </section>
  );
}
