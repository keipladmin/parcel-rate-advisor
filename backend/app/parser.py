"""Parser for the GEODATA flat-file export format (see ../../FORMAT_SPEC.md).

Column names for every record type are read from the file's own `#DEF` header lines rather
than hardcoded, so a future export with reordered/renamed/extra columns for a record type we
already handle still parses. Hierarchy is reconstructed by encounter order (no foreign keys in
the format): each `SHIPMENT` record starts a new block, and every `SENDER`/`RECEIVER`/`PARCEL`/
`INTER`/`INTERINVOICELINE` record belongs to the most-recently-seen `SHIPMENT`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: Fallback decoding — a strict superset of ASCII, so it never raises on arbitrary bytes.
_FALLBACK_ENCODING = "latin-1"

_FILE_MARKER = "#FILE;GEODATA"


@dataclass
class ParseWarning:
    line_number: int
    message: str


@dataclass
class Shipment:
    """One consignment block (`SHIPMENT` record plus everything that follows it)."""

    numorder: str
    fields: dict[str, str] = field(default_factory=dict)
    sender: dict[str, str] | None = None
    receiver: dict[str, str] | None = None
    parcels: list[dict[str, str]] = field(default_factory=list)
    inter: dict[str, str] | None = None
    lines: list[dict[str, str]] = field(default_factory=list)


@dataclass
class ParsedFile:
    file_id: str | None = None
    encoding: str | None = None
    version: str | None = None
    header: dict[str, str] | None = None
    consolidation: dict[str, str] | None = None
    shipments: list[Shipment] = field(default_factory=list)
    warnings: list[ParseWarning] = field(default_factory=list)


def looks_like_geodata_export(raw: bytes) -> bool:
    """Content-sniff for the format — the file has no filename extension to rely on."""
    text = raw.decode(_FALLBACK_ENCODING, errors="ignore")
    for line in text.splitlines():
        if line.strip():
            return line.startswith(_FILE_MARKER)
    return False


def _resolve_encoding(raw: bytes) -> tuple[str, list[ParseWarning]]:
    """Read the `#ENCODING` header (via a lossless fallback decode) and validate it."""
    warnings: list[ParseWarning] = []
    probe_text = raw.decode(_FALLBACK_ENCODING)
    declared: str | None = None
    for line_number, line in enumerate(probe_text.splitlines(), start=1):
        if line.startswith("#ENCODING;"):
            parts = line.split(";")
            if len(parts) > 1 and parts[1]:
                declared = parts[1]
            break
    if declared is None:
        warnings.append(ParseWarning(0, "No #ENCODING header found; using latin-1 fallback."))
        return _FALLBACK_ENCODING, warnings

    try:
        raw.decode(declared)
    except (LookupError, UnicodeDecodeError):
        warnings.append(
            ParseWarning(
                0,
                f"Declared encoding {declared!r} is unusable; falling back to latin-1.",
            )
        )
        return _FALLBACK_ENCODING, warnings
    return declared, warnings


def _split_def_line(line: str) -> list[str]:
    """`#DEF;GEODATA:<TYPE>;field1;field2;...;;` -> [record_type, field1, field2, ...]."""
    parts = line.split(";")
    record_type = parts[1].removeprefix("GEODATA:")
    fields = parts[2:]
    while fields and fields[-1] == "":
        fields.pop()
    return [record_type, *fields]


def _split_data_line(line: str) -> list[str]:
    """`TYPE;value1;value2;...;` -> [TYPE, value1, value2, ...] (one terminator stripped)."""
    parts = line.split(";")
    if parts and parts[-1] == "":
        parts.pop()
    return parts


def parse_export(raw: bytes) -> ParsedFile:
    """Parse a raw GEODATA export file into structured consignment/line records."""
    if not looks_like_geodata_export(raw):
        raise ValueError("Not a recognised GEODATA export (missing '#FILE;GEODATA' marker).")

    encoding, warnings = _resolve_encoding(raw)
    text = raw.decode(encoding)

    result = ParsedFile(warnings=warnings)
    result.encoding = encoding
    schemas: dict[str, list[str]] = {}
    current_shipment: Shipment | None = None

    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#END"):
            continue

        if line.startswith("#FILE;"):
            result.file_id = line.split(";")[1] if len(line.split(";")) > 1 else None
            continue
        if line.startswith("#ENCODING;"):
            continue
        if line.startswith("#VERSION;"):
            parts = line.split(";")
            result.version = parts[1] if len(parts) > 1 else None
            continue
        if line.startswith("#DEF;"):
            record_type, *field_names = _split_def_line(line)
            schemas[record_type] = field_names
            continue

        parts = _split_data_line(line)
        record_type, values = parts[0], parts[1:]
        schema = schemas.get(record_type)
        if schema is None:
            result.warnings.append(
                ParseWarning(line_number, f"Unknown record type {record_type!r}; skipped.")
            )
            continue
        if len(values) > len(schema):
            result.warnings.append(
                ParseWarning(
                    line_number,
                    f"{record_type} line has {len(values)} fields but only "
                    f"{len(schema)} are declared for it; skipped.",
                )
            )
            continue

        record = dict(zip(schema, values))

        if record_type == "HEADER":
            result.header = record
        elif record_type == "CONSOLIDATION":
            result.consolidation = record
        elif record_type == "SHIPMENT":
            current_shipment = Shipment(numorder=record.get("NUMORDER", ""), fields=record)
            result.shipments.append(current_shipment)
        elif current_shipment is None:
            result.warnings.append(
                ParseWarning(
                    line_number,
                    f"{record_type} line encountered before any SHIPMENT; skipped.",
                )
            )
        elif record_type == "SENDER":
            current_shipment.sender = record
        elif record_type == "RECEIVER":
            current_shipment.receiver = record
        elif record_type == "PARCEL":
            current_shipment.parcels.append(record)
        elif record_type == "INTER":
            current_shipment.inter = record
        elif record_type == "INTERINVOICELINE":
            current_shipment.lines.append(record)
        else:
            result.warnings.append(
                ParseWarning(line_number, f"Unhandled record type {record_type!r}; skipped.")
            )

    return result
