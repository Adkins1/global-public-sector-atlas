import { useEffect, useMemo, useState } from "react";
import {
  Globe2,
  ArrowUpRight,
  Download,
  Search,
  BarChart3,
  Map as MapIcon,
  ChartNoAxesCombined,
  Plus,
  X,
  Info,
  ArrowRight,
  Database,
  Check,
  ExternalLink,
} from "lucide-react";
import WorldMap from "./WorldMap";
import Chart from "./Chart";
import catalog from "../../public/data/catalog.json";
export type Row = {
  id: string;
  country: string;
  year: number;
  indicator: string;
  value: number | null;
  unit: string;
  scope: string;
  sector: string;
  status: string;
  comparability_group: string;
  source_id: string;
  source_flags: string;
};
const metrics = {
  government_employment_share: {
    pl: "Zatrudnienie w sektorze instytucji rządowych i samorządowych",
    en: "Employment in general government",
    shortpl: "Udział w zatrudnieniu",
    shorten: "Share of employment",
    unitpl: "% ogółu zatrudnionych",
    uniten: "% of total employment",
    source: "OECD",
    max: 2023,
  },
  government_per_1000: {
    pl: "Pracownicy sektora instytucji rządowych i samorządowych",
    en: "General government employees",
    shortpl: "Na 1000 mieszkańców",
    shorten: "Per 1,000 residents",
    unitpl: "osób na 1000 mieszkańców",
    uniten: "people per 1,000 residents",
    source: "OECD + World Bank",
    max: 2023,
  },
  compensation_gdp: {
    pl: "Koszty wynagrodzeń sektora instytucji rządowych i samorządowych",
    en: "General government compensation of employees",
    shortpl: "Koszty wynagrodzeń",
    shorten: "Compensation of employees",
    unitpl: "% PKB",
    uniten: "% of GDP",
    source: "Eurostat",
    max: 2024,
  },
  public_employment_share: {
    pl: "Zatrudnienie publiczne według badań ankietowych",
    en: "Public employment from household surveys",
    shortpl: "Sektor publiczny · WWBI",
    shorten: "Public sector · WWBI",
    unitpl: "% ogółu zatrudnionych",
    uniten: "% of total employment",
    source: "World Bank WWBI",
    max: 2018,
  },
};
type Metric = keyof typeof metrics;
const sectors: { [key: string]: [string, string] } = {
  GF01: ["Usługi ogólnopaństwowe", "General public services"],
  GF02: ["Obrona narodowa", "Defence"],
  GF03: ["Porządek i bezpieczeństwo", "Public order & safety"],
  GF04: ["Sprawy gospodarcze", "Economic affairs"],
  GF05: ["Ochrona środowiska", "Environmental protection"],
  GF06: ["Gospodarka mieszkaniowa", "Housing & community"],
  GF07: ["Zdrowie", "Health"],
  GF08: ["Kultura, rekreacja, religia", "Recreation, culture & religion"],
  GF09: ["Edukacja", "Education"],
  GF10: ["Ochrona socjalna", "Social protection"],
};
const colors = [
  "#1b725a",
  "#cb813f",
  "#6e81a1",
  "#b46475",
  "#81719a",
  "#699fa2",
];
export default function Atlas({ lang = "pl" }: { lang: "pl" | "en" }) {
  const t = (pl: string, en: string) => (lang === "pl" ? pl : en);
  const [all, setAll] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [metric, setMetric] = useState<Metric>("government_employment_share"),
    [year, setYear] = useState(2023),
    [tab, setTab] = useState("map"),
    [focus, setFocus] = useState("POL"),
    [selected, setSelected] = useState(["POL", "DEU", "SWE"]),
    [query, setQuery] = useState(""),
    [inspector, setInspector] = useState<any>(null),
    [detailError, setDetailError] = useState(false);
  useEffect(() => {
    if (!inspector) return;
    const previous = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspector(null);
      if (e.key === "Tab") {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[role=dialog] button, [role=dialog] a[href]",
          ),
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [Boolean(inspector)]);
  const names = useMemo(
    () => new Intl.DisplayNames([lang], { type: "region" }),
    [lang],
  );
  const countries = useMemo(
    () => new Map(catalog.countries.map((c) => [c.iso3, c])),
    [],
  );
  const name = (iso: string) => {
    const c = countries.get(iso);
    return c ? names.of(c.iso2) || c.name : iso;
  };
  const format = (n: number | null, d = 1) =>
    n === null
      ? "—"
      : new Intl.NumberFormat(lang, {
          maximumFractionDigits: d,
          minimumFractionDigits: d,
        }).format(n);
  useEffect(() => {
    let alive = true;
    fetch("/data/atlas.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((r) => {
        if (alive) {
          setAll(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          setLoading(false);
        }
      });
    const q = new URLSearchParams(location.search);
    const m = q.get("metric");
    if (m && m in metrics) setMetric(m as Metric);
    const y = Number(q.get("year"));
    if (y >= 2000 && y <= 2025) setYear(y);
    const c = q
      .get("countries")
      ?.split(",")
      .filter((x) => catalog.countries.some((c) => c.iso3 === x))
      .slice(0, 6);
    if (c?.length) {
      setSelected(c);
      setFocus(c[0]);
    }
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (loading) return;
    const url = new URL(location.href);
    url.searchParams.set("metric", metric);
    url.searchParams.set("year", String(year));
    url.searchParams.set("countries", selected.join(","));
    history.replaceState(null, "", url);
  }, [metric, year, selected, loading]);
  const m = metrics[metric],
    isSurvey = metric === "public_employment_share";
  const series = useMemo(
    () => all.filter((r) => r.indicator === metric && r.sector === "TOTAL"),
    [all, metric],
  );
  const years = useMemo(
    () => [...new Set(series.map((r) => r.year))].sort((a, b) => b - a),
    [series],
  );
  const rows = useMemo(
    () => series.filter((r) => r.year === year),
    [series, year],
  );
  const ranked = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.value !== null &&
            (!metric.startsWith("government_") ||
              r.scope === "general_government"),
        )
        .sort((a, b) =>
          isSurvey
            ? name(a.country).localeCompare(name(b.country), lang)
            : (b.value ?? 0) - (a.value ?? 0),
        ),
    [rows, isSurvey, lang, metric],
  );
  const active = rows.find((r) => r.country === focus);
  const values = ranked.map((r) => r.value as number).sort((a, b) => a - b);
  const median = values.length
    ? (values[Math.floor((values.length - 1) / 2)] +
        values[Math.floor(values.length / 2)]) /
      2
    : null;
  const focusRank =
    active?.value != null && ranked.some((r) => r.country === focus)
      ? ranked.filter((r) => (r.value ?? 0) > (active.value ?? 0)).length + 1
      : 0;
  const coverage = new Set(
    all
      .filter((r) => r.indicator === metric && r.value !== null)
      .map((r) => r.country),
  ).size;
  function switchMetric(v: Metric) {
    setMetric(v);
    setYear(metrics[v].max);
  }
  async function inspect(row: Row) {
    setInspector({ loading: true });
    setDetailError(false);
    try {
      const r = await fetch(`/data/countries/${row.country}.json`);
      if (!r.ok) throw Error();
      const data = await r.json();
      setInspector(data.find((x: Row) => x.id === row.id));
    } catch {
      setInspector(null);
      setDetailError(true);
    }
  }
  async function download() {
    try {
      const response = await fetch("/data/observations.json");
      if (!response.ok) throw new Error("Download failed");
      const dataset = await response.json();
      const ids = new Set(rows.map((r) => r.id));
      const records = dataset.filter((r: Row) => ids.has(r.id));
      const keys = Object.keys(dataset[0]);
      const lines = [keys.join(",")];
      for (const record of records) {
        lines.push(
          keys
            .map(
              (k) =>
                '"' +
                (Array.isArray(record[k])
                  ? JSON.stringify(record[k])
                  : String(record[k] ?? "")
                ).replaceAll('"', '""') +
                '"',
            )
            .join(","),
        );
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob(["\ufeff" + lines.join("\n")], {
          type: "text/csv;charset=utf-8",
        }),
      );
      a.download = `atlas-${metric}-${year}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setDetailError(true);
    }
  }
  function add(iso: string) {
    if (!selected.includes(iso) && selected.length < 6)
      setSelected([...selected, iso]);
    setFocus(iso);
  }
  const historyYears = series.length
    ? Array.from(
        {
          length:
            Math.max(...series.map((r) => r.year)) -
            Math.min(...series.map((r) => r.year)) +
            1,
        },
        (_, i) => Math.min(...series.map((r) => r.year)) + i,
      )
    : [];
  const options = useMemo(
    () => ({
      color: colors,
      animation: false,
      aria: { enabled: true },
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#56635f" } },
      grid: { left: 50, right: 24, top: 28, bottom: 62 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: historyYears,
      },
      yAxis: {
        type: "value",
        name: t(m.unitpl, m.uniten),
        nameTextStyle: { fontSize: 10 },
        splitLine: { lineStyle: { color: "#e9eeea" } },
      },
      series: selected.map((country) => ({
        name: name(country),
        type: "line",
        symbolSize: 5,
        connectNulls: false,
        lineStyle: { width: 2.5 },
        data: historyYears.map(
          (y) =>
            series.find(
              (r) =>
                r.country === country &&
                r.year === y &&
                (!metric.startsWith("government_") ||
                  r.scope === "general_government"),
            )?.value ?? null,
        ),
      })),
    }),
    [series, selected, lang, metric],
  );
  const filtered = catalog.countries
    .filter((c) =>
      name(c.iso3)
        .toLocaleLowerCase(lang)
        .includes(query.toLocaleLowerCase(lang)),
    )
    .sort((a, b) => name(a.iso3).localeCompare(name(b.iso3), lang));
  const sectorRows = all.filter(
    (r) =>
      r.country === focus &&
      r.year === year &&
      r.indicator === "compensation_gdp" &&
      r.sector !== "TOTAL",
  );
  const observationDate = new Date(
    (catalog.sources as any)[
      metric === "compensation_gdp" ? "eurostat" : isSurvey ? "wwbi" : "oecd"
    ].retrieved_at,
  ).toLocaleDateString(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <>
      <section className="intro wrap">
        <div className="eyebrow">
          <span className="live-dot" />
          {t("OTWARTE DANE. ŚWIADOMA DEBATA.", "OPEN DATA. INFORMED DEBATE.")}
        </div>
        <div className="intro-grid">
          <div>
            <h1>
              {t("Zrozum skalę", "Understand the scale")}
              <br />
              <em>{t("sektora publicznego.", "of the public sector.")}</em>
            </h1>
            <p className="intro-copy">
              {t(
                "Ile osób pracuje dla państwa? Ile kosztują ich wynagrodzenia? Odkrywaj dane, porównuj kraje i sprawdzaj źródła.",
                "How many people work for government? What does their compensation cost? Explore the data, compare countries, and follow the sources.",
              )}
            </p>
          </div>
          <div className="intro-aside">
            <div className="atlas-mark">
              <Globe2 size={45} strokeWidth={0.8} />
            </div>
            <p>
              {t("Liczby potrzebują kontekstu.", "Numbers need context.")}
              <br />
              <strong>
                {t(
                  "Każda definicja ma znaczenie.",
                  "Every definition matters.",
                )}
              </strong>
            </p>
            <a href={`/${lang}/methodology/`}>
              {t("Jak porównujemy dane", "How we compare data")}{" "}
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
        <div className="source-strip">
          <span>{t("DANE ŹRÓDŁOWE", "DATA SOURCES")}</span>
          <b>World Bank</b>
          <i>·</i>
          <b>OECD</b>
          <i>·</i>
          <b>Eurostat</b>
          <span className="source-end">
            <Check size={14} />
            {t("Źródło przy każdej wartości", "A source behind every value")}
          </span>
        </div>
      </section>
      <main className="wrap" id="explore">
        <div className="section-line">
          <div>
            <span className="index-number">01 /</span>
            <h2>{t("Odkrywaj dane", "Explore the data")}</h2>
          </div>
          <a href={`/${lang}/data/`}>
            <Database size={15} />
            {t("Repozytorium danych", "Data repository")}
            <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="explorer">
          <div className="controls">
            <label className="metric-control">
              <span>{t("WSKAŹNIK", "INDICATOR")}</span>
              <select
                value={metric}
                onChange={(e) => switchMetric(e.target.value as Metric)}
              >
                {Object.entries(metrics).map(([key, v]) => (
                  <option key={key} value={key}>
                    {t(v.shortpl, v.shorten)}
                  </option>
                ))}
              </select>
            </label>
            <label className="year-control">
              <span>{t("ROK PORÓWNANIA", "COMPARISON YEAR")}</span>
              <select
                aria-label={t("Rok porównania", "Comparison year")}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {[...new Set([year, ...years])]
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
            </label>
            <div className="control-note">
              <span className="live-dot" />
              {t(
                "Ten sam rok dla wszystkich krajów",
                "The same year for every country",
              )}
            </div>
            <button
              className="download-button"
              onClick={download}
              disabled={loading}
            >
              <Download size={17} />
              <span>CSV</span>
            </button>
          </div>
          <div className="chart-heading">
            <div>
              <h3>{t(m.pl, m.en)}</h3>
              <p>
                {t(m.unitpl, m.uniten)} <span>·</span> {year} <span>·</span>{" "}
                {m.source}
              </p>
            </div>
            <div
              className="view-tabs"
              aria-label={t("Widok danych", "Data view")}
            >
              {[
                ["map", MapIcon, t("Mapa", "Map")],
                ["ranking", BarChart3, t("Tabela", "Table")],
                ["trend", ChartNoAxesCombined, t("Historia", "History")],
              ].map(([key, Icon, label]: any) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={tab === key ? "active" : ""}
                  aria-pressed={tab === key}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          {(focus === "JPN" || selected.includes("JPN")) &&
            metric.startsWith("government_") && (
              <div className="notice warning">
                <Info size={17} />
                {t(
                  "Japonia: dane nie obejmują funduszy zabezpieczenia społecznego. Wyłączona z mapy porównawczej, rankingu, mediany i wspólnego wykresu.",
                  "Japan: data excludes social security funds. Excluded from the comparison map, ranking, median and joint chart.",
                )}
              </div>
            )}
          {isSurvey && (
            <div className="notice warning">
              <Info size={17} />
              <span>
                {t(
                  "WWBI: zakres zależy od badania, może obejmować spółki publiczne lub prywatnych usługodawców. Widok opisowy, bez rankingu i bez łączenia z OECD.",
                  "WWBI: survey scope varies and may include public corporations or private providers. Descriptive view; no ranking or merging with OECD.",
                )}
              </span>
            </div>
          )}
          {loading ? (
            <div className="loading">
              {t(
                "Wczytywanie zweryfikowanych danych…",
                "Loading validated observations…",
              )}
            </div>
          ) : failed ? (
            <div role="alert" className="loading">
              {t(
                "Nie udało się wczytać danych. Odśwież stronę lub pobierz plik JSON.",
                "Data could not be loaded. Reload the page or download the JSON file.",
              )}{" "}
              <a href="/data/atlas.json">JSON</a>
            </div>
          ) : (
            <>
              <div className="visual-grid">
                <div className="visual-main">
                  {tab === "map" ? (
                    <WorldMap
                      rows={rows.filter(
                        (r) =>
                          !metric.startsWith("government_") ||
                          r.scope === "general_government",
                      )}
                      selected={focus}
                      onSelect={(iso) => {
                        if (countries.has(iso)) setFocus(iso);
                      }}
                      name={name}
                      empty={t("Brak danych", "No data")}
                    />
                  ) : tab === "trend" ? (
                    <Chart
                      option={options}
                      label={t(
                        "Historyczne porównanie wybranych państw. Dane dostępne w tabeli i CSV.",
                        "Historical comparison of selected countries. Data available in the table and CSV.",
                      )}
                    />
                  ) : (
                    <div className="ranking-list">
                      {ranked.length ? (
                        ranked.map((r) => (
                          <button
                            className={
                              focus === r.country
                                ? "rank-row current"
                                : "rank-row"
                            }
                            key={r.id}
                            onClick={() => setFocus(r.country)}
                          >
                            <span>
                              {isSurvey
                                ? "—"
                                : String(
                                    ranked.filter(
                                      (x) => (x.value ?? 0) > (r.value ?? 0),
                                    ).length + 1,
                                  ).padStart(2, "0")}
                            </span>
                            <strong>{name(r.country)}</strong>
                            <div>
                              <i
                                style={{
                                  width: `${((r.value ?? 0) / Math.max(...values, 1)) * 100}%`,
                                }}
                              />
                            </div>
                            <b>{format(r.value)}</b>
                          </button>
                        ))
                      ) : (
                        <p className="empty">
                          {t(
                            "Brak obserwacji dla tego roku. Wybierz inny rok.",
                            "No observations for this year. Choose another year.",
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="map-legend">
                    <span>0</span>
                    <div className="gradient" />
                    <span>{format(Math.max(...values, 0))}</span>
                    <i className="no-data-key" />
                    <span>{t("Brak danych", "No data")}</span>
                    <span className="map-hint">
                      {t(
                        "Kliknij kraj, aby sprawdzić szczegóły",
                        "Select a country to explore",
                      )}
                    </span>
                  </div>
                </div>
                <aside className="country-panel">
                  <div className="panel-top">
                    <span>{t("WYBRANY KRAJ", "SELECTED COUNTRY")}</span>
                    <span className="iso">{focus}</span>
                  </div>
                  <select
                    className="country-select"
                    aria-label={t("Wybrany kraj", "Selected country")}
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                  >
                    {[...catalog.countries]
                      .sort((a, b) =>
                        name(a.iso3).localeCompare(name(b.iso3), lang),
                      )
                      .map((c) => (
                        <option key={c.iso3} value={c.iso3}>
                          {name(c.iso3)}
                        </option>
                      ))}
                  </select>
                  <div className="big-value">
                    {format(active?.value ?? null)}
                    <small>
                      {metric === "government_per_1000" ? " / 1000" : " %"}
                    </small>
                  </div>
                  <p className="value-caption">
                    {active?.value == null
                      ? t(
                          "Brak danych dla wybranego roku",
                          "No data for the selected year",
                        )
                      : t(m.unitpl, m.uniten)}{" "}
                    · {year}
                  </p>
                  <div className="panel-divider" />
                  <dl>
                    <div>
                      <dt>
                        {t(
                          "Pozycja w dostępnych danych",
                          "Rank among available countries",
                        )}
                      </dt>
                      <dd>
                        {!isSurvey && focusRank
                          ? `${focusRank} / ${ranked.length}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {t(
                          "Mediana dostępnych państw",
                          "Median of available countries",
                        )}
                      </dt>
                      <dd>{isSurvey ? "—" : format(median)}</dd>
                    </div>
                    <div>
                      <dt>
                        {t("Zakres instytucjonalny", "Institutional coverage")}
                      </dt>
                      <dd>{isSurvey ? "WWBI" : "S.13"}</dd>
                    </div>
                  </dl>
                  <p className="small-note">
                    {t(
                      "Mediana nieważona. Dostępne państwa nie reprezentują całego świata.",
                      "Unweighted median. Available countries do not represent the whole world.",
                    )}
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => add(focus)}
                    disabled={selected.includes(focus) || selected.length >= 6}
                  >
                    {selected.includes(focus) ? (
                      <Check size={16} />
                    ) : (
                      <Plus size={16} />
                    )}{" "}
                    {selected.includes(focus)
                      ? t("W porównaniu", "Added to comparison")
                      : t("Dodaj do porównania", "Add to comparison")}
                  </button>
                  {active && (
                    <button
                      className="source-button"
                      onClick={() => inspect(active)}
                    >
                      <ExternalLink size={14} />
                      {t(
                        "Źródło i metodologia wartości",
                        "Source and methodology",
                      )}
                    </button>
                  )}
                </aside>
              </div>
              <div className="explorer-footer">
                <span>
                  <span className="live-dot" />
                  {ranked.length}{" "}
                  {t("państw z danymi w", "countries with data in")} {year}
                </span>
                <span>
                  {t("Aktualizacja zbioru", "Snapshot retrieved")}:{" "}
                  {observationDate}
                </span>
                <a href={`/${lang}/methodology/`}>
                  {t("Uwagi do porównywalności", "Comparability notes")}{" "}
                  <ArrowUpRight size={13} />
                </a>
              </div>
            </>
          )}
        </div>
        <div className="notice">
          <Info size={19} />
          <p>
            <strong>
              {t(
                "Sektor publiczny to więcej niż administracja.",
                "The public sector is more than administration.",
              )}
            </strong>{" "}
            {t(
              "Zakres S.13 obejmuje instytucje rządowe i samorządowe, w tym część edukacji i ochrony zdrowia. Wyłącza przedsiębiorstwa publiczne. Nie jest bezpośrednim pomiarem wszystkich etatów finansowanych z podatków.",
              "S.13 covers government institutions, including parts of education and healthcare. It excludes public corporations. It is not a direct count of all tax-financed jobs.",
            )}
          </p>
          <a href={`/${lang}/methodology/`}>
            <ArrowRight size={19} />
          </a>
        </div>
        <section id="compare" className="comparison-section">
          <div className="section-line">
            <div>
              <span className="index-number">02 /</span>
              <h2>{t("Porównaj państwa", "Compare countries")}</h2>
            </div>
            <span className="muted">
              {t(
                "Do 6 państw · bez uzupełniania braków",
                "Up to 6 countries · no gap filling",
              )}
            </span>
          </div>
          <div className="comparison-grid">
            <div className="comparison-card">
              <div className="chips">
                {selected.map((c, i) => (
                  <button
                    key={c}
                    onClick={() =>
                      selected.length > 1 &&
                      setSelected(selected.filter((x) => x !== c))
                    }
                    aria-label={`${t("Usuń", "Remove")} ${name(c)}`}
                  >
                    <i style={{ background: colors[i] }} />
                    {name(c)}
                    <X size={13} />
                  </button>
                ))}
              </div>
              <div className="search-box">
                <Search size={17} />
                <input
                  aria-label={t("Szukaj państwa", "Search countries")}
                  placeholder={t(
                    "Dodaj państwo do porównania…",
                    "Add a country to compare…",
                  )}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <div className="search-results">
                    {filtered.slice(0, 12).map((c) => (
                      <button
                        key={c.iso3}
                        disabled={
                          selected.includes(c.iso3) || selected.length >= 6
                        }
                        onClick={() => {
                          add(c.iso3);
                          setQuery("");
                        }}
                      >
                        {name(c.iso3)}
                        <Plus size={14} />
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <p>{t("Nie znaleziono państwa", "No country found")}</p>
                    )}
                  </div>
                )}
              </div>
              <Chart
                option={options}
                label={t(
                  "Szeregi historyczne wybranych państw",
                  "Historical series for selected countries",
                )}
              />
              <p className="small-note">
                {t(
                  "Luki oznaczają brak obserwacji. Linie nie łączą brakujących lat. Zmiany metod mogą ograniczać porównywalność w czasie.",
                  "Gaps indicate missing observations. Lines do not connect missing years. Methodological changes can limit comparability over time.",
                )}
              </p>
            </div>
            <div className="reading-card">
              <span className="eyebrow">
                {t("JAK CZYTAĆ DANE", "READING THE DATA")}
              </span>
              <h3>
                {t("Jedna liczba.", "One number.")}
                <br />
                <em>{t("Wiele definicji.", "Many definitions.")}</em>
              </h3>
              <p>
                {t(
                  "Niski udział zatrudnienia publicznego nie musi oznaczać mniejszego zakresu usług. Państwa różnie organizują szkoły, szpitale i usługi zlecane na zewnątrz.",
                  "A lower public employment share does not necessarily mean fewer services. Countries organise schools, hospitals and outsourced services differently.",
                )}
              </p>
              <a href={`/${lang}/methodology/`}>
                {t("Poznaj metodologię", "Read the methodology")}
                <ArrowUpRight size={17} />
              </a>
              <div className="coverage-stat">
                <strong>{coverage}</strong>
                <span>
                  {t(
                    "państw w całym szeregu wybranego wskaźnika",
                    "countries across the selected indicator’s full time series",
                  )}
                </span>
              </div>
            </div>
          </div>
        </section>
        <section className="structure-section">
          <div className="section-line">
            <div>
              <span className="index-number">03 /</span>
              <h2>
                {t(
                  "Na jakie funkcje trafiają wynagrodzenia?",
                  "Which functions receive compensation?",
                )}
              </h2>
            </div>
          </div>
          <div className="structure-grid">
            <div>
              <h3>
                {name(focus)} <span className="muted">/ {year}</span>
              </h3>
              <p className="muted">
                {t(
                  "Koszty wynagrodzeń według COFOG · % PKB · Eurostat",
                  "Compensation by COFOG function · % GDP · Eurostat",
                )}
              </p>
              <p className="small-note">
                {t(
                  "To podział kosztów, nie liczby pracowników. Nie sumujemy kategorii z pozycją „ogółem”.",
                  "This is a breakdown of costs, not employee counts. Categories are not summed with the total.",
                )}
              </p>
              <div className="coming-note">
                <Info size={16} />
                <span>
                  {t(
                    "Struktura zatrudnienia centralnego, lokalnego i skarbowego oraz relacja średnich płac: brak zweryfikowanych porównywalnych danych w tej wersji.",
                    "Central, local and tax administration staffing, and the mean wage ratio: no verified comparable data in this release.",
                  )}
                </span>
              </div>
            </div>
            <div className="sector-bars">
              {Object.entries(sectors).map(([code, labels]) => {
                const r = sectorRows.find((r) => r.sector === code);
                return (
                  <button
                    key={code}
                    onClick={() => r && inspect(r)}
                    disabled={!r}
                  >
                    <span>{labels[lang === "pl" ? 0 : 1]}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(((r?.value ?? 0) / Math.max(...sectorRows.map((x) => x.value ?? 0), 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <b>{format(r?.value ?? null)}</b>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        <details className="data-details" id="data-table">
          <summary>
            {t(
              "Dostępna tabela danych i źródeł",
              "Accessible data and source table",
            )}{" "}
            <span>
              {year} · {rows.length} {t("rekordów", "records")}
            </span>
          </summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    t("Kraj", "Country"),
                    t("Wartość", "Value"),
                    t("Jednostka", "Unit"),
                    t("Status / flagi źródła", "Status / source flags"),
                    t("Źródło", "Source"),
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) =>
                    name(a.country).localeCompare(name(b.country), lang),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <a
                          href={`/${lang}/country/${r.country.toLowerCase()}/`}
                        >
                          {name(r.country)}
                        </a>
                      </td>
                      <td>{format(r.value, 2)}</td>
                      <td>{t(m.unitpl, m.uniten)}</td>
                      <td>
                        {r.value === null
                          ? t("Brak danych", "Missing")
                          : r.status === "derived"
                            ? t("Obliczona", "Derived")
                            : t("Obserwacja", "Observed")}{" "}
                        {r.source_flags && `· ${r.source_flags}`}
                      </td>
                      <td>
                        <button onClick={() => inspect(r)}>
                          {r.source_id}
                          <ArrowUpRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
        {detailError && (
          <p role="alert">
            {t(
              "Nie udało się pobrać metadanych. Pełny JSON jest dostępny na stronie danych.",
              "Could not load metadata. Full JSON is available on the data page.",
            )}
          </p>
        )}
      </main>
      {inspector && (
        <div className="modal-backdrop" onClick={() => setInspector(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
            className="source-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label={t("Zamknij", "Close")}
              onClick={() => setInspector(null)}
              autoFocus
            >
              <X />
            </button>
            <h2 id="source-title">{t("Ślad źródłowy", "Source trail")}</h2>
            {inspector.loading ? (
              <p>{t("Wczytywanie…", "Loading…")}</p>
            ) : (
              <>
                <p className="eyebrow">
                  {name(inspector.country)} · {inspector.year} ·{" "}
                  {inspector.sector}
                </p>
                <div className="big-value">{format(inspector.value, 3)}</div>
                <p>
                  {inspector.unit} · {inspector.status}{" "}
                  {inspector.source_flags && `· ${inspector.source_flags}`}
                </p>
                <h4>{t("Definicja źródłowa", "Source definition")}</h4>
                <p>{inspector.definition}</p>
                <h4>{t("Metoda", "Method")}</h4>
                <p>{inspector.methodology}</p>
                <p className="notice">{inspector.notes}</p>
                <dl>
                  <dt>{t("Pobrano", "Retrieved")}</dt>
                  <dd>{inspector.retrieved_at}</dd>
                  <dt>SHA-256</dt>
                  <dd className="hash">{inspector.raw_sha256}</dd>
                  <dt>{t("Grupa porównywalności", "Comparability group")}</dt>
                  <dd>{inspector.comparability_group}</dd>
                </dl>
                <p className="source-links">
                  <a
                    href={inspector.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    API <ArrowUpRight size={14} />
                  </a>
                  <a
                    href={
                      (catalog.sources as any)[inspector.source_id]
                        .documentation
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Dokumentacja", "Documentation")}{" "}
                    <ArrowUpRight size={14} />
                  </a>
                </p>
                {inspector.input_ids?.length > 0 && (
                  <>
                    <h4>{t("Obserwacje wejściowe", "Input observations")}</h4>
                    <ul>
                      {inspector.input_ids.map((id: string) => (
                        <li key={id}>
                          <code>{id}</code>
                        </li>
                      ))}
                    </ul>
                    <a href="/data/observations.json">
                      {t(
                        "Pełne metadane wszystkich składników (JSON)",
                        "Full metadata of every input (JSON)",
                      )}
                    </a>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
