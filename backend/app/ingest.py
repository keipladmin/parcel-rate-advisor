"""Wire parsed GEODATA lines into the mocked `determine()` stub.

Bridges `parser.ParsedFile` (structured consignment/line records) to the existing
`Determination` model — one call to `determine()` per `INTERINVOICELINE`, in parse order.
"""

from __future__ import annotations

from .determine import determine
from .models import Determination
from .parser import ParsedFile


def run_determinations(parsed: ParsedFile) -> list[Determination]:
    """Run every parsed consignment line through `determine()` and return the results."""
    results: list[Determination] = []
    for shipment in parsed.shipments:
        consignment_reference = shipment.fields.get("MPSID") or shipment.numorder
        for position, line in enumerate(shipment.lines, start=1):
            description = line.get("CCONTENT", "")
            origin = line.get("CORIGIN") or None
            commodity_code = line.get("RCTARIF") or None
            rate = determine(description, origin, commodity_code)
            results.append(
                Determination(
                    item_ref=f"{consignment_reference}-{position}",
                    description=description,
                    origin=origin,
                    commodity_code=commodity_code,
                    category=rate.category,
                    duty_rate=rate.duty_rate,
                    vat_rate=rate.vat_rate,
                    confidence=rate.confidence,
                )
            )
    return results
