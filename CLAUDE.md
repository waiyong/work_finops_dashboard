# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repo. Keep this file short and current — it is loaded into context every session. For full design/narrative context, read **`README.md`** first.

## What this is
A single-page, self-contained HTML dashboard reporting **GPU farm utilization & efficiency** to senior management (AI Platform team). Mockup with **simulated data**. No build system, no framework, no backend.

- `index.html` — layout (HTML), styling (CSS), and all chart logic (vanilla JS + Chart.js served locally from `lib/`). Renderers read globals; init is async (awaits `DATA_READY`). Fully offline — no external/CDN calls.
- `data/*.csv` — **the entire dataset**, normalized (dimensions + facts). All numbers live here.
- `rollup.js` — fetches `data/*.csv`, aggregates into the render globals (`MODELS`, `KPI`, `OUTPUT`, `MODEL_TOKENS`, `SPLIT`, `COSTS`, …), resolves `DATA_READY`. Holds policy constants (DUTY_TARGET 80, LOADED_TARGET 90, KPI_MARGIN 5).
- `schema.md` — the normalized schema (ERD), the CSV↔ERD contract, and the upstream ETL design.
- `metric_lineage.md` — visualisation-first lineage: every on-screen figure traced raw → intermediate (CSV) → final (global), tagged metric-backed / admin-input / simulated.
- `README.md` — design, narrative, intent, the six visuals, and the data-replacement guide.
- `START_PROMPT.md` — the original brief. `project-log/PROJECT_LOG.md` — cross-session decision/action log. `project-log/REAL_DATA_MIGRATION.md` — **active real-data migration tracker** (Grafana→CSV); read it before touching real data.

## Golden rules
1. **Data and presentation are separated. Keep them separated.** Numbers live in `data/*.csv`; the rollup that turns them into globals lives in `rollup.js`; rendering lives in `index.html`. **Never hardcode data values into `index.html`** — everything is computed (KPIs, the bridge 88%/60%, the cost 72%, cluster rows all derive from the CSVs). To change a number, edit a CSV; to change a model colour/target, edit `dim_models.csv` / `rollup.js` config.
2. **Preserve the coherence invariants** (top of `schema.md` §5 and README). The dashboard's value is that figures tie together across charts. Examples: `SUM(model.cards) = loaded cards` (44); per-cluster `loaded + idle = CLUSTER_TOTAL` (28+4=32, 16+2=18); Viz 2 latest-month inference = inference fleet (50). The fleet duty cycle is **computed** `Σ(duty×cards)/Σcards` — don't "fix" it by hand.
3. **Apple Keynote Minimal** is the design language: light theme, oversized hero numbers, whitespace, one primary accent (Apple blue `#0071E3`), amber (`#D98A2B`) **only** for below-target. Not Grafana, not dark. Match the existing CSS custom properties in `:root`.
4. **Scope of the metrics:** this dashboard measures utilization/throughput, **not** output usefulness (that's the consuming teams' concern). Don't add "quality of answer" style metrics.

## How to run & verify
```bash
python3 -m http.server 8000        # serve from repo root
# open http://127.0.0.1:8000/index.html
```
**Serving over HTTP is now mandatory** — `rollup.js` uses `fetch` to load `data/*.csv`, which `file://` blocks (double-clicking `index.html` will show the data-load error banner). After any change, verify in a real browser:
- No console errors (a `favicon.ico` 404 is expected and harmless).
- Renders cleanly at **1920×1080** and **1366×768**.
- Token In/Out/Total toggle and the click-to-drill-down both work; donut-click focuses the card map.
- Cross-check coherence after CSV edits: donut 44/50, card map 28/32 + 16/18, KPI fleet duty 60% = Viz 1 fleet avg.
- **Data-driven proof:** edit a value in `data/*.csv`, reload → the dashboard reflects it with no code change.

Playwright MCP is available for headless verification + screenshots. Stop any `http.server` you start when done.

## Conventions
- Plain ES5/ES6 JS, no modules/bundler. Chart.js v4 + `chartjs-plugin-annotation` (registered globally) + `chartjs-plugin-datalabels` (passed per-chart, not global).
- One `render*` function per chart; charts that respond to filters are rebuilt/`.update()`d, not recreated.
- Keep everything in these few files — do **not** introduce a framework, package.json, or build step. "Serve over HTTP and it works" is a hard requirement (CSV fetch needs HTTP).
- Colors for models live in `dim_models.csv` (`color_hex`) and drive the card-map blocks (color dot + card squares) in Viz 3b; dept colours in `dim_departments.csv`.

## When extending
- New visual → add its data to a `data/*.csv` (+ rollup logic in `rollup.js` to expose a new global), a `render*` fn + a `.panel` in `index.html`, and a row in the README's visuals table.
- Changing inventory/counts → re-check every coherence invariant before considering it done.
- Real-data integration → replace the `data/*.csv` files (same columns) per `schema.md` §5; `rollup.js` and `index.html` should not need to change.

## Status / open items
**The live dashboard is still the simulated mock** (50 cards, 88% loaded, etc.). A **real-data migration** (Grafana → CSV) is in progress — tracked in **`project-log/REAL_DATA_MIGRATION.md`** (the §O checklist is the to-do list). Real Grafana/DCGM/LiteLLM extracts + staging real CSVs live in **`RAW_DATA/` (gitignored** — real hostnames/IPs/agency team & confidential model names); ETL runs in a local **`.venv`**. Nothing is swapped into `data/` yet, so the mock is unchanged.

Key real-pipeline findings (pending integration, see tracker): real inference fleet ≈ **236 cards** (216 B200 + 20 H100), not 50; duty source moved to **LiteLLM `litellm_requests_metric`** (CI bypasses vLLM, polluting `num_requests_running`); **`org_alias` is NOT yet configured** in LiteLLM, so org/app attribution uses a **manual `team_alias`→org map** for now (native labels are the design target, not current reality).

Still valid for the mock: internal cost is an **admin-provided rate** (`dim_models` / `dim_gpu_pricing`), not metric-derived; the per-cluster **token split is model-driven** (B200 ≈ 84% / H100 ≈ 16%). See `metric_lineage.md` for the full source→figure trace and `project-log/PROJECT_LOG.md` for history.
