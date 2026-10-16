"""Run: python -m etl.pipeline [--refresh]. Build from pinned raw snapshots by default."""

import argparse, hashlib, json, csv, io, shutil, tempfile
from pathlib import Path
from datetime import datetime, timezone
import requests, polars as pl, pycountry
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from etl.schema import Observation, validate_observations

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
OECD_URL = "https://sdmx.oecd.org/public/rest/v1/data/OECD.GOV.GIP,DSD_GOV@DF_GOV_EMPPS_REP_2025,1.0/A..EMPG..S13..?startPeriod=2010&format=csvfile"
EURO_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp?lang=EN&freq=A&unit=PC_GDP&sector=S13&na_item=D1&sinceTimePeriod=2010"
POP_URL = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000&date=2010:2025"
WWBI_BASE = "https://data360api.worldbank.org/data360/data?DATABASE_ID=WB_WWBI&INDICATOR=WB_WWBI_BI_EMP_TOTL_PB&SEX=_T&AGE=_T&URBANISATION=_T&COMP_BREAKDOWN_1=_Z&COMP_BREAKDOWN_2=_Z&COMP_BREAKDOWN_3=_Z"
SOURCES = {
    "oecd": dict(
        file="oecd-employment-all.csv",
        name="OECD · Government at a Glance 2025",
        url=OECD_URL,
        documentation="https://www.oecd.org/en/publications/government-at-a-glance-2025_0efd0bcd-en/full-report/employment-in-general-government_dafcfac5.html",
        license="OECD terms of use",
        license_url="https://www.oecd.org/en/about/terms-conditions.html",
    ),
    "eurostat": dict(
        file="eurostat-compensation.json",
        name="Eurostat · gov_10a_exp",
        url=EURO_URL,
        documentation="https://ec.europa.eu/eurostat/cache/metadata/en/gov_10a_exp_esms.htm",
        license="Eurostat reuse policy",
        license_url="https://ec.europa.eu/eurostat/about-us/policies/copyright",
    ),
    "population": dict(
        file="worldbank-population.json",
        name="World Bank · SP.POP.TOTL",
        url=POP_URL,
        documentation="https://data.worldbank.org/indicator/SP.POP.TOTL",
        license="CC BY 4.0, World Bank additional terms",
        license_url="https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets",
    ),
    "wwbi": dict(
        file="wwbi-employment.json",
        name="World Bank · Worldwide Bureaucracy Indicators",
        url=WWBI_BASE,
        documentation="https://datacatalogfiles.worldbank.org/ddh-published/0038132/6/DR0046449/WWBI%20Codebook%20v3.1.pdf",
        license="CC BY 4.0, World Bank additional terms",
        license_url="https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets",
    ),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")


def download(raw):
    session = requests.Session()
    session.headers["User-Agent"] = (
        "Mozilla/5.0 GlobalPublicSectorAtlas/0.1 (+https://atlas.kawka.pro)"
    )
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=4, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504]
            )
        ),
    )
    meta = {}
    for key, s in SOURCES.items():
        response = session.get(s["url"], timeout=120)
        response.raise_for_status()
        if key.startswith("wwbi"):
            data = response.json()
            values = list(data["value"])
            expected = data["count"]
            while len(values) < expected:
                page = session.get(s["url"] + f"&skip={len(values)}", timeout=120)
                page.raise_for_status()
                batch = page.json()["value"]
                if not batch:
                    raise ValueError("Incomplete WWBI pagination")
                if batch[0] == values[0]:
                    raise ValueError("WWBI ignored pagination")
                values.extend(batch)
            if len(values) != expected:
                raise ValueError("WWBI count mismatch")
            write_json(raw / s["file"], dict(count=expected, value=values))
        else:
            (raw / s["file"]).write_bytes(response.content)
        meta[key] = {
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "sha256": digest(raw / s["file"]),
        }
    write_json(raw / "manifest.json", meta)


def jsonstat_rows(data):
    """Decode JSON-stat row-major cells, retaining explicit absent cells and flags."""
    ids, sizes = data["id"], data["size"]
    categories = []
    for d in ids:
        idx = data["dimension"][d]["category"]["index"]
        categories.append(idx if isinstance(idx, list) else sorted(idx, key=idx.get))
    import itertools

    for flat, values in enumerate(itertools.product(*categories)):
        coords = dict(zip(ids, values))
        data_values = data["value"]
        flags = data.get("status", {})
        coords["value"] = (
            data_values.get(str(flat))
            if isinstance(data_values, dict)
            else data_values[flat]
        )
        coords["flag"] = (
            flags.get(str(flat), "") if isinstance(flags, dict) else flags[flat]
        )
        yield coords


def build(raw):
    meta = json.loads((raw / "manifest.json").read_text())
    rows = []
    for key, source in SOURCES.items():
        if digest(raw / source["file"]) != meta[key]["sha256"]:
            raise ValueError(f"Raw checksum mismatch: {key}")
    countries = {
        c.alpha_3: {"iso3": c.alpha_3, "iso2": c.alpha_2, "name": c.name}
        for c in pycountry.countries
    }
    countries["XKX"] = {"iso3": "XKX", "iso2": "XK", "name": "Kosovo"}

    def add(
        country,
        year,
        indicator,
        value,
        source,
        unit,
        scope="general_government",
        sector="TOTAL",
        status=None,
        inputs=None,
        definition="",
        methodology="",
        basis="persons",
        denominator="",
        group=None,
        flags="",
        notes="",
    ):
        if country not in countries:
            return
        rows.append(
            dict(
                id=f"{country}:{year}:{indicator}:{sector}",
                country=country,
                year=int(year),
                indicator=indicator,
                value=value,
                unit=unit,
                scope=scope,
                sector=sector,
                employment_basis=basis,
                denominator=denominator,
                comparability_group=group or f"{source}:{indicator}:{scope}:{sector}",
                status=status or ("missing" if value is None else "observed"),
                missing_reason="not_reported" if value is None else None,
                source_id=source,
                source_url=SOURCES[source]["url"],
                definition=definition,
                methodology=methodology,
                source_flags=flags,
                retrieved_at=meta[source]["retrieved_at"],
                raw_sha256=meta[source]["sha256"],
                input_ids=inputs or [],
                notes=notes,
            )
        )

    pop = json.loads((raw / SOURCES["population"]["file"]).read_text())
    if pop[0]["pages"] != 1 or len(pop[1]) != pop[0]["total"]:
        raise ValueError("Incomplete population response")
    pops = {}
    for r in pop[1]:
        country, year, value = r["countryiso3code"], int(r["date"]), r["value"]
        if country not in countries:
            continue
        pops[country, year] = value
        add(
            country,
            year,
            "population",
            value,
            "population",
            "persons",
            scope="total_economy",
            basis="residents",
            denominator="none",
            definition="Midyear resident population, de facto definition.",
            methodology="World Bank SP.POP.TOTL; no interpolation by Atlas.",
        )
    oecd = pl.read_csv(raw / SOURCES["oecd"]["file"], infer_schema_length=10000)
    if oecd.filter((pl.col("SECTOR") != "S13") | (pl.col("FREQ") != "A")).height:
        raise ValueError("Unexpected OECD dimensions")
    for r in oecd.to_dicts():
        country, year, value = r["REF_AREA"], int(r["TIME_PERIOD"]), r["OBS_VALUE"]
        if country not in countries:
            continue
        indicator = (
            "government_employment_share"
            if r["UNIT_MEASURE"] == "PT_EMP"
            else "government_employees"
        )
        if r["UNIT_MEASURE"] not in ("PT_EMP", "PS"):
            raise ValueError("Unexpected OECD unit")
        if value is not None:
            value = float(value) * 10 ** int(r["UNIT_MULT"])
        add(
            country,
            year,
            indicator,
            value,
            "oecd",
            "percent_employment" if indicator.endswith("share") else "persons",
            scope=(
                "general_government_excluding_ssf"
                if country == "JPN"
                else "general_government"
            ),
            denominator=(
                "total domestic employment" if indicator.endswith("share") else "none"
            ),
            definition="Employment in general government S.13: central, state, local government and social security funds; public corporations excluded.",
            methodology="OECD Government at a Glance 2025: National Accounts SNA 2008; Australia, Iceland, Japan, Korea, Türkiye and USA use ILOSTAT, Chile uses national Budget Directorate data. SDMX multiplier applied. Japan excludes social security funds and is excluded from Atlas rankings.",
            flags=r["OBS_STATUS"] or "",
            notes="General government is an institutional scope, not a direct measure of jobs financed only by taxes. National methods and outsourcing differ. Japan excludes social security funds; other country exceptions are documented by OECD.",
        )
        if indicator == "government_employees":
            population = pops.get((country, year))
            ratio = (
                value / population * 1000 if value is not None and population else None
            )
            add(
                country,
                year,
                "government_per_1000",
                ratio,
                "oecd",
                "per_1000_residents",
                scope=(
                    "general_government_excluding_ssf"
                    if country == "JPN"
                    else "general_government"
                ),
                status="derived" if ratio is not None else "missing",
                flags=r["OBS_STATUS"] or "",
                inputs=(
                    [
                        f"{country}:{year}:government_employees:TOTAL",
                        f"{country}:{year}:population:TOTAL",
                    ]
                    if ratio is not None
                    else []
                ),
                denominator="midyear resident population, same year",
                definition="General government employees per 1,000 residents.",
                methodology="OECD S.13 persons / World Bank SP.POP.TOTL from the identical year × 1000. No filling or cross-year matching.",
                notes="Domestic employment and resident population differ for cross-border workers; this is a scale indicator, not a resident employment probability. Japan excludes social security funds and is excluded from Atlas rankings.",
            )
    euro = json.loads((raw / SOURCES["eurostat"]["file"]).read_text())
    for r in jsonstat_rows(euro):
        if r["cofog99"] != "TOTAL" and len(r["cofog99"]) != 4:
            continue
        c = pycountry.countries.get(alpha_2="GR" if r["geo"] == "EL" else r["geo"])
        if not c:
            continue
        add(
            c.alpha_3,
            r["time"],
            "compensation_gdp",
            r["value"],
            "eurostat",
            "percent_gdp",
            sector=r["cofog99"],
            basis="not_applicable",
            denominator="GDP current prices",
            definition="General government S.13 compensation of employees (D.1): wages and salaries plus employers’ social contributions.",
            methodology="ESA 2010, COFOG level 1. Components are mutually exclusive functions, not staff counts. TOTAL is not added to components.",
            flags=r["flag"],
            notes="A functional wage-bill breakdown cannot be interpreted as an employment breakdown. Missing cells are not zero.",
        )
    wwbi = json.loads((raw / SOURCES["wwbi"]["file"]).read_text())
    if len(wwbi["value"]) != wwbi["count"]:
        raise ValueError("Incomplete WWBI snapshot")
    for r in wwbi["value"]:
        expected = {
            "SEX": "_T",
            "AGE": "_T",
            "URBANISATION": "_T",
            "COMP_BREAKDOWN_1": "_Z",
            "COMP_BREAKDOWN_2": "_Z",
            "COMP_BREAKDOWN_3": "_Z",
            "FREQ": "A",
            "UNIT_MEASURE": "PR_EMP",
        }
        if any(r.get(k) != v for k, v in expected.items()):
            raise ValueError("Unexpected WWBI dimensions")
        country, year = r["REF_AREA"], int(r["TIME_PERIOD"])
        scope = "public_sector_survey"
        value = float(r["OBS_VALUE"]) * 100 if r["OBS_VALUE"] is not None else None
        add(
            country,
            year,
            "public_employment_share",
            value,
            "wwbi",
            "percent_employment",
            scope=scope,
            denominator="total employed survey respondents",
            group=f"wwbi:survey_scope_unverified:{country}",
            definition="Public sector employment as a share of total employment, based on harmonised household and labour force surveys.",
            methodology="WWBI BI.EMP.TOTL.PB. PR_EMP proportions × 100 (not SDMX multiplier). Total sex/age/urbanisation; no subgroup aggregation.",
            flags=r.get("OBS_STATUS") or "",
            notes="Survey scope is not verified at observation level: public corporations may be included. EU-SILC-based EEA observations in 2004–2018 use NACE O/P/Q as a proxy, which can include private providers. API does not identify the underlying survey. No cross-country ranking; do not join to OECD or interpret as tax-financed employment.",
        )
    rows = validate_observations(rows)
    return sorted(rows, key=lambda x: x["id"]), countries, meta


def publish(rows, countries, meta, raw):
    out = ROOT / "public/data"
    out.mkdir(exist_ok=True, parents=True)
    # Canonical public records, fully self-contained, grouped by country/year/indicator.
    canonical = ROOT / "data/observations"
    canonical.mkdir(exist_ok=True)
    grouped = {}
    for row in rows:
        grouped.setdefault((row["country"], row["year"], row["indicator"]), []).append(
            row
        )
    expected = set()
    for (country, year, indicator), values in grouped.items():
        p = canonical / country / str(year) / (indicator + ".json")
        write_json(p, values)
        expected.add(p)
    for p in canonical.glob("*/*/*.json"):
        if p not in expected:
            p.unlink()
    for country in sorted(set(r["country"] for r in rows)):
        write_json(
            out / "countries" / f"{country}.json",
            [r for r in rows if r["country"] == country],
        )
    write_json(out / "observations.json", rows)
    with (out / "observations.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "input_ids": json.dumps(row["input_ids"])})
    write_json(ROOT / "data/observation.schema.json", Observation.model_json_schema())
    sources = {k: {**s, **meta[k]} for k, s in SOURCES.items()}
    write_json(
        out / "catalog.json",
        {
            "schema_version": "1.0.0",
            "sources": sources,
            "countries": list(countries.values()),
            "observation_count": len(rows),
            "observed_countries": len(
                set(
                    r["country"]
                    for r in rows
                    if r["source_id"] != "population" and r["value"] is not None
                )
            ),
        },
    )
    # Compact UI payload; the inspector resolves exact full records on demand.
    keys = [
        "id",
        "country",
        "year",
        "indicator",
        "value",
        "unit",
        "scope",
        "sector",
        "status",
        "comparability_group",
        "source_id",
        "source_flags",
    ]
    write_json(
        out / "atlas.json",
        [
            {k: r[k] for k in keys}
            for r in rows
            if r["indicator"] not in ("population", "government_employees")
        ],
    )
    # Raw responses also downloadable; manifest identifies byte-for-byte evidence.
    for s in SOURCES.values():
        shutil.copy2(raw / s["file"], out / s["file"])
    write_json(out / "provenance.json", meta)
    print(
        f"Validated {len(rows)} observations; {len(grouped)} country/year/indicator files."
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if args.refresh:
        with tempfile.TemporaryDirectory(prefix="atlas-etl-") as temp:
            raw = Path(temp)
            download(raw)
            rows, countries, meta = build(raw)
            for p in raw.iterdir():
                shutil.copy2(p, RAW / p.name)
            publish(rows, countries, meta, raw)
    else:
        rows, countries, meta = build(RAW)
        publish(rows, countries, meta, RAW)


if __name__ == "__main__":
    main()
