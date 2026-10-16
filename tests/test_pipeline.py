import json, math
from pathlib import Path
import pytest
from pydantic import ValidationError
from etl.pipeline import build, RAW, ROOT, jsonstat_rows, SOURCES, digest
from etl.schema import Observation, validate_observations


@pytest.fixture(scope="module")
def records():
    return build(RAW)[0]


def test_snapshots_complete_and_have_matching_checksums():
    manifest = json.loads((RAW / "manifest.json").read_text())
    for key, source in SOURCES.items():
        assert manifest[key]["sha256"] == digest(RAW / source["file"])
    wwbi = json.loads((RAW / "wwbi-employment.json").read_text())
    assert len(wwbi["value"]) == wwbi["count"]
    assert wwbi["count"] > 1000  # verifies the fixture includes the second page


def test_poland_oecd_observation_and_thousands_multiplier(records):
    data = {r["id"]: r for r in records}
    assert data["POL:2023:government_employment_share:TOTAL"]["value"] == 16.68
    assert data["POL:2023:government_employees:TOTAL"]["value"] == 2923000


def test_derived_values_use_identical_year_and_complete_lineage(records):
    data = {r["id"]: r for r in records}
    derived = [r for r in records if r["status"] == "derived"]
    assert derived
    for r in derived:
        a, b = [data[i] for i in r["input_ids"]]
        assert a["country"] == b["country"] == r["country"]
        assert a["year"] == b["year"] == r["year"]
        assert (
            a["indicator"] == "government_employees" and b["indicator"] == "population"
        )
        assert r["value"] == pytest.approx(a["value"] / b["value"] * 1000)


def test_wwbi_proportions_and_scope_not_merged(records):
    r = next(r for r in records if r["id"] == "POL:2020:public_employment_share:TOTAL")
    assert r["value"] == pytest.approx(20.5033)
    assert r["scope"] == "public_sector_survey"
    assert "unverified" in r["comparability_group"]
    jp = next(
        r
        for r in records
        if r["country"] == "JPN" and r["indicator"] == "government_per_1000"
    )
    assert jp["scope"] == "general_government_excluding_ssf"


def test_missing_values_cannot_be_zero_or_unexplained(records):
    missing = next(r for r in records if r["status"] == "missing")
    assert missing["value"] is None and missing["missing_reason"]
    with pytest.raises(ValidationError):
        Observation.model_validate({**missing, "value": 0})
    with pytest.raises(ValidationError):
        Observation.model_validate({**missing, "missing_reason": None})


def test_duplicates_nonfinite_and_broken_lineage_rejected(records):
    row = next(r for r in records if r["status"] == "observed")
    with pytest.raises(ValueError):
        validate_observations([row, row])
    with pytest.raises(ValidationError):
        Observation.model_validate({**row, "value": math.inf})
    with pytest.raises(ValueError):
        validate_observations([{**row, "status": "derived", "input_ids": ["missing"]}])


def test_jsonstat_dimension_order_null_and_zero():
    sample = {
        "id": ["geo", "time"],
        "size": [2, 2],
        "dimension": {
            "geo": {"category": {"index": {"PL": 1, "DE": 0}}},
            "time": {"category": {"index": {"2020": 0, "2021": 1}}},
        },
        "value": {"0": 0, "2": 3.2},
        "status": {"2": "p"},
    }
    rows = list(jsonstat_rows(sample))
    assert rows[0] == {"geo": "DE", "time": "2020", "value": 0, "flag": ""}
    assert rows[1]["value"] is None
    assert rows[2] == {"geo": "PL", "time": "2020", "value": 3.2, "flag": "p"}


def test_cofog_no_overlapping_levels_and_no_aggregates(records):
    for r in records:
        assert r["country"] not in ("OECD_REP", "EU27_2020")
        if r["indicator"] == "compensation_gdp":
            assert r["sector"] == "TOTAL" or len(r["sector"]) == 4


def test_source_preserved_in_exports(records):
    exported = json.loads((ROOT / "public/data/observations.json").read_text())
    assert exported == records
    for r in records:
        assert r["source_url"].startswith("https://")
        assert r["definition"] and r["methodology"] and r["retrieved_at"]
