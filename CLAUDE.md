# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repo. Keep this file short and current — it is loaded into context every session. **New session? Read [`CONTINUATION.md`](CONTINUATION.md) first** — it lists, in order, every file to read for full context. For design/narrative, read **`README.md`**.

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
- Colors for models live in `dim_models.csv` (`color_hex`) and drive the card-map blocks (color dot + card squares) in Viz 3b; org colours in `dim_organizations.csv`.

## When extending
- New visual → add its data to a `data/*.csv` (+ rollup logic in `rollup.js` to expose a new global), a `render*` fn + a `.panel` in `index.html`, and a row in the README's visuals table.
- Changing inventory/counts → re-check every coherence invariant before considering it done.
- Real-data integration → a **same-shape** CSV swap needs no code change. The actual real dataset is wired via the **`?data=real`** switch (reads gitignored `data_real/`); Phase D added backward-compatible handling for the 236-card fleet, the `other` utility bucket, and adaptive short-window visuals — any new code must work for **both** the mock and `?data=real`.

## Status / open items
**Two views, one codebase.** `index.html` = the tracked **simulated mock** (50 cards, 88%/60%); the golden-rule numbers above describe it. **`index.html?data=real`** = the **real dashboard** (236 cards, 53.8% loaded) — reads gitignored **`data_real/`** (real Grafana/DCGM/LiteLLM data, never committed; built from gitignored `RAW_DATA/` via a local `.venv`). The renderers are shared; keep changes backward-compatible.

**For any real-data work, start at `project-log/REAL_DATA_MIGRATION.md`** — it has the full A→D journey, the **§O outstanding checklist**, and **§T patch registry** (every short-term 5-day / point-in-time workaround + its drop trigger for production).

Real-view reality (Phase D done): real fleet **236 cards**; duty from **LiteLLM `litellm_requests_metric`** (CI bypasses vLLM); **`org_alias` not configured** → manual `team_alias`→org map; trend visuals **adaptive / real-only** (the real ~5-day window, no fabricated history). Still mock/placeholder on the real view: Viz 4 **training** (Slurm pending), **cost rates** ($0.20 placeholder). Mock-only: internal cost admin-provided; token split model-driven. See `metric_lineage.md` + `project-log/PROJECT_LOG.md`.

**Model Throughput band (hero, under the KPI row) — a different kind of number.** It answers "for the models we have **benchmark data** for, how many tokens could they produce if saturated at **60 tok/s per user** — and what is that **per GPU-hour**?" `fact_serving_curve.csv` holds *serving-benchmark* curves (NVIDIA tool, ISL/OSL 8K/1K — **off-fleet data**), which `rollup.js` fits (`1/interactivity = a + b·CU`), solves at the SLA, and joins to the card snapshot.

**MEASURED ONLY — the guiding constraint (management call, 2026-07-13).** A v1 that proxied un-benchmarked models from similar ones, median-estimated an unknown model, and modelled an "all fp4" scenario was **rejected as too assumption-heavy**. The rule now: *a model counts only if it was benchmarked AND is loaded*, and **the denominator is the GPUs those models occupy — not the cluster** (real view: 32 of 60 loaded B200 GPUs). Loaded models with no curve are **excluded and named in the caption**, never zero-filled (which would understate the models we did measure). **Do not reintroduce proxies or estimates to "complete" the fleet** — the way to widen the scope is to benchmark more models. **Before touching this, read `RAW_DATA/system_throughput/METHODOLOGY.md`** (gitignored): full derivation, the two hard rules (CU ≥ 1 · TP ≤ cards), and a revision note on why v1 was scrapped.
