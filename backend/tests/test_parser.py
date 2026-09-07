from __future__ import annotations

from pathlib import Path

import pytest

from app.parser import parse_export

SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"


def _read(name: str) -> bytes:
    return (SAMPLES_DIR / name).read_bytes()


def test_b2b_sample_single_shipment_three_lines():
    parsed = parse_export(_read("geodata_b2b_sample"))

    assert parsed.encoding.lower() == "iso-8859-1"
    assert parsed.header == {"VERSION": "03.99", "CLASSIFICATION": "CONSO"}
    assert len(parsed.shipments) == 1

    shipment = parsed.shipments[0]
    assert shipment.fields["MPSID"] == "90000000000001"
    assert shipment.sender["SCOMPNAME"] == "ACME OPTICS LTD"
    assert shipment.receiver["RNAME1"] == "ACME OPTICS LTD"
    assert len(shipment.parcels) == 1
    assert shipment.inter is not None
    assert [line["CCONTENT"] for line in shipment.lines] == [
        "PLASTIC FRAMES",
        "METAL FRAMES",
        "PART FRAMES",
    ]
    assert not parsed.warnings


def test_ioss_sample_reads_extra_def_column():
    """INTERINVOICELINE gains a GOODSWEBPAGE column here — still parses by name, not position."""
    parsed = parse_export(_read("geodata_ioss_sample"))

    shipment = parsed.shipments[0]
    assert len(shipment.lines) == 4
    assert shipment.lines[0]["CCONTENT"] == "SAMPLE TALL TRAINING TOP (OXBLOOD)"
    assert shipment.lines[0]["RCTARIF"] == "6109902000"
    assert shipment.lines[0]["GOODSWEBPAGE"] == ""
    assert not parsed.warnings


def test_multi_shipment_sample_builds_two_blocks_by_encounter_order():
    parsed = parse_export(_read("geodata_multi_shipment_sample"))

    assert len(parsed.shipments) == 2
    first, second = parsed.shipments
    assert first.fields["MPSID"] == "90000000000003"
    assert [line["CCONTENT"] for line in first.lines] == [
        "SAMPLE WOOL TANK TOP",
        "SAMPLE FELTED WOOL SCARF",
    ]
    assert second.fields["MPSID"] == "90000000000004"
    assert [line["CCONTENT"] for line in second.lines] == ["SAMPLE CERAMIC MUG"]
    assert not parsed.warnings


def test_malformed_line_with_extra_fields_is_skipped_and_reported():
    text = (
        "#FILE;GEODATA_TEST;\n"
        "#ENCODING;ISO-8859-1;\n"
        "#VERSION;03.99;\n"
        "#DEF;GEODATA:HEADER;VERSION;CLASSIFICATION;;\n"
        "#DEF;GEODATA:SHIPMENT;NUMORDER;MPSID;;\n"
        "#DEF;GEODATA:INTERINVOICELINE;NUMORDER;QITEMS;CCONTENT;;\n"
        "HEADER;03.99;CONSO;\n"
        "SHIPMENT;3;90000000000009;\n"
        "INTERINVOICELINE;5;1;A MUG;EXTRA_FIELD;\n"
        "INTERINVOICELINE;5;2;A BOOK;\n"
        "#END;\n"
    ).encode("iso-8859-1")

    parsed = parse_export(text)

    shipment = parsed.shipments[0]
    # The malformed line is skipped entirely rather than misaligning columns.
    assert [line["CCONTENT"] for line in shipment.lines] == ["A BOOK"]
    assert len(parsed.warnings) == 1
    assert "INTERINVOICELINE" in parsed.warnings[0].message
    assert parsed.warnings[0].line_number == 9


def test_rejects_file_without_geodata_marker():
    with pytest.raises(ValueError):
        parse_export(b"NOT A GEODATA FILE\n")
