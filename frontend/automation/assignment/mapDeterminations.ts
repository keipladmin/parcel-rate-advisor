import { groupBy } from "../../src/groupBy";
import type { AssignmentInput, RawDetermination } from "./types";

/** Groups a flat determinations export into the adapter's per-consignment input shape. */
export function toAssignmentInputs(determinations: RawDetermination[]): AssignmentInput[] {
  const groups = groupBy(determinations, (d) => d.consignment_reference ?? "(unknown consignment)");
  return [...groups.entries()].map(([consignmentReference, lines]) => ({
    consignmentReference,
    lines: lines.map((d) => ({
      lineReference: d.line_id ?? d.item_ref,
      description: d.description,
      origin: d.origin,
      commodityCode: d.commodity_code,
      rate: d.duty_rate,
      confidence: d.confidence,
    })),
  }));
}
