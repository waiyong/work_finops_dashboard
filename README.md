# GPU Farm Utilization Dashboard

A self-contained, single-page HTML dashboard that reports **how well — and how efficiently — the GPU cards in our farm are being used**. It is a **senior-management briefing tool** (directors / C-suite, 5–10 minute read) built and maintained by the **AI Platform team**.

> Status: **mockup with simulated data.** All figures are placeholder values designed to tell a coherent story. Each visual's data source is noted in the visuals table; every on-screen figure traces to a source metric (or an explicit admin input / simulated flag) in [`metric_lineage.md`](metric_lineage.md). See [Replacing the simulated data](#replacing-the-simulated-data).

---

## Quick start

No build step, but **you must serve over HTTP** (the dashboard `fetch`es its CSV data, which `file://` blocks).

**One command (recommended):**
```bash
make            # stops any old server, serves, and opens the browser (Ctrl+C to stop)
```
Other targets: `make stop`, `make help`. Or do it manually:
```bash
cd Upper_Management_Report
python3 -m http.server 8000
# then open http://127.0.0.1:8000/index.html
```

Double-clicking `index.html` (file://) will show a data-load error banner — use the HTTP server. **No internet needed**: Chart.js + its two plugins are served locally from `lib/`, so the dashboard runs fully offline (important for restricted/air-gapped briefing networks).

**Files:**
| File | Role |
|---|---|
| `index.html` | Layout, styling, and all chart-rendering logic. **No data is hardcoded here** — every number is computed from the CSVs. |
| `data/*.csv` | **The entire simulated dataset**, normalized (dimensions + facts). Edit these to change numbers or plug in real data. |
| `rollup.js` | Loads `data/*.csv`, aggregates into the render globals (`MODELS`, `KPI`, `OUTPUT`, …), resolves `DATA_READY`. The in-browser rollup. |
| `schema.md` | **Normalized DB schema + ETL design** (ERD, source-metric mapping, the CSV↔ERD contract). |
| `metric_lineage.md` | **Metric lineage** — traces every on-screen figure raw → intermediate → final (which source metric backs it, or flags admin/simulated). |
| `START_PROMPT.md` | Original brief that scoped the dashboard. |
| `project-log/PROJECT_LOG.md` | Cross-session decision & action log. |
| `project-log/REAL_DATA_MIGRATION.md` | **Active real-data migration tracker** — Grafana→CSV ETL, decisions, outstanding checklist (§O). |

---

## Background & intent

Running a GPU farm carries **high operating cost**. The AI Platform team's mandate is to keep **GPU cards highly utilized** and **token generation efficient and cost-effective**. This dashboard is how that mandate is reported upward.

**Scope boundary (important):** this dashboard measures **utilization and throughput** — *not* whether the generated output is useful. Output usefulness is the responsibility of the **consuming application / Home Team Department (HTD) teams**, not the platform team.

**The infrastructure:**
- **SUPERPOD** = the **B200** cluster — 8 inference nodes, NVIDIA B200 GPUs (192 GB each) → **32 cards**. Primary compute.
- **PROD** = the **H100** cluster — H100 GPUs (80 GB each) → **18 cards**.
- **Inference fleet = 50 cards** (32 + 18).
- **2 training nodes** (Slurm-managed, separate hardware, ~8 cards) — not yet monitored in the pipeline.
- Models (GPT-OSS, Qwen, Llama, GLM, DeepSeek, etc.) are served to HTDs (Police, SCDF, ICA, MHA HQ, ILS…) via a **LiteLLM proxy**.

**The forward lever:** a planned **Batch Inference Service** that runs **after office hours** to use up idle GPU cards for batch / non-latency-urgent jobs (still in pipeline). This is the team's answer to idle capacity and is featured in the exec summary and the duty-cycle callout.

---

## The narrative (read top-to-bottom)

The page is designed to be read like a one-page argument:

1. **Exec summary line** — states the headline: utilization has headroom, batch inference is the lever, demand is growing, and we're 72% cheaper than cloud.
2. **KPI row** — the four-metric scorecard: *utilization* (duty cycle), *allocation* (loaded %), *throughput* (tokens), *efficiency* (cost vs cloud).
3. **Viz 1 (Duty Cycle) + Viz 3a (Loaded %) + bridge caption** — the crux insight: **88% of cards are loaded, but only 60% are actively serving** in business hours. "Loaded ≠ utilized."
4. **Viz 3b (Card map)** — shows *physically where* the slack sits (idle cards + light occupancy).
5. **Viz 2 (Train/Inf)** — how the expensive fleet is split; training runs hot (~90%) while inference idles → rebalancing context (Kai Scheduler).
6. **Viz 4 (Tokens by HTD)** — the actual work produced and who consumes it; growing 60% over 6 months.
7. **Viz 5 (Cost)** — and we produce it 72% cheaper than public cloud → the spend is run efficiently.

**The throughline:** *cards are allocated, but actively utilized only ~60%; here is the physical slack and the batch-inference plan to close it, all while generating tokens 72% cheaper than cloud.*

---

## The visuals

| # | Title | Type | What it answers | Data-maturity badge |
|---|---|---|---|---|
| 1 | **GPU Duty Cycle — Top 5 Models** | Horizontal bar + 80% target line | Which models keep their cards busy? Fleet-weighted avg = 60%. | Source: vLLM `num_requests_running` |
| 3a | **% GPUs with Models Loaded** | Donut + 90% threshold | How many cards have a model loaded at all? 44/50 = 88%. | Source: DCGM + K8s API |
| 3b | **GPU Card Allocation Map** | Model-grouped card blocks | Which model sits on which physical card; where are the idle cards? Each model is a labeled block (dot · name · count) holding its card squares; idle cards form a dashed block. | Source: DCGM + K8s API |
| 2 | **Utilization by Workload** | Stacked area, weekly (GPU card-hours as % of farm capacity, + idle band) | How is the farm split across inference/training/batch, and is total utilization rising? 46% → 75%. | DCGM + K8s + Slurm (batch ⚠ pending) |
| 6 | **Token Output by Model** | Stacked area (weekly) | Which models produce the output tokens, and how is fleet throughput growing week to week? ~35M→60M/wk. | Source: LiteLLM `litellm_output_tokens_metric` |
| 4 | **Compute Usage & Cost by Organisation** | GPU-hours **Inference vs Training** entry → click to drill: inference = expandable **Org→App→Model** tokens + internal cost (rolls up); training = GPU-hours + cost by org | Who consumes compute, and what does it cost? | LiteLLM + Slurm · cost = admin-set |
| 5 | **Cost per Million Tokens vs Open-Model Cloud Host** | Comparison **table**: top-5 models × internal + 3 external hosts (output $/1M); cheapest cell highlighted | Is self-hosting cheaper than renting the same open models? | Prices **admin-set** (internal + external) |

> **Viz 6 vs Viz 4** — both measure generation throughput, from different angles: Viz 6 is **by model** (which model produces tokens), Viz 4 is **by HTD department** (who consumes them). They are independent lenses on the same reality and need not tie line-for-line, but the fleet total scale matches (~240M/month).

### Key definitions
- **Duty Cycle** — % of *time* a model had ≥1 running request (binary active/idle). It is **not** "how busy the GPU is," and it is **not** token volume — throughput can grow without moving it.
- **Business Hours** — Mon–Fri 09:00–18:00 SGT (= UTC 01:00–10:00). The duty cycle is a **single 14-day, business-hours-only** window (no 24h view by design).
- **Loaded** — a card has a non-empty model assigned. Loaded ≠ utilized.
- **gpu_count / cards** — cards a model occupies; pre-split by team share is possible in the real data, but here it's whole cards.

---

## Design language

**Apple Keynote Minimal** — chosen over a Grafana/ops look because the audience is executives, not operators.
- Light canvas (`#FBFBFD`), white panels, hairline separators, soft shadows, generous whitespace.
- Oversized hero numbers as the focal point of each KPI.
- **One primary accent** — Apple blue `#0071E3`.
- **One semantic accent** — muted amber `#D98A2B`, used *only* to flag below-target values (duty bars under 80%, the sub-90% donut).
- Single scrollable page; responsive at **1920×1080** (primary) and **1366×768** (laptop).

Layout, top to bottom: Header (+ env selector) → Exec summary → 4 KPI cards → Row 1 (Duty | Loaded donut) → bridge caption → Row 2 (Card map, full width) → Row 3 (Train/Inf | Tokens) → Row 4 (Cost, full width).

---

## Interactivity

- **Environment selector** (All / SUPERPOD / PROD) — filters **all four KPI cards** and **re-ranks the Viz 1 duty chart** for that cluster. Updates live via Chart.js `.update()`.
- **Token In/Out/Total toggle** (Viz 4) — switches the metric the stacked bars show (input ≈ 2× output).
- **Drill-down** (Viz 4) — click a department segment to expand department → team → model, showing both input and output tokens.
- **Tooltips** — every chart and every card-map cell (model · card ID · memory · duty).

---

## Replacing the simulated data

**All numbers live in [`data/`](data/) as normalized CSVs.** `rollup.js` fetches and aggregates them in the browser into the render globals; `index.html` never hardcodes data — every figure (KPIs, the 88%/60% bridge, the 72% savings, cluster rows) is computed. To plug in real data, replace the CSVs (same columns) — no code change. See [`schema.md`](schema.md) §5 for the full CSV↔ERD contract.

> **Every on-screen figure traces to a source metric (or an explicit admin input / simulated flag)** — see [`metric_lineage.md`](metric_lineage.md) for the raw → intermediate → final lineage, per visualisation.

| `data/*.csv` | Feeds | Real source (when available) |
|---|---|---|
| `dim_clusters.csv` | Donut + card-map totals (`CLUSTER_TOTAL`) | Physical inventory |
| `dim_models.csv` | Model colours, costs (`MODELS`, `COSTS`) | LiteLLM dim + **admin-set** internal cost |
| `dim_organizations.csv`, `dim_applications.csv` | Org→App hierarchy + colours (`ORGS`, Viz 4) | LiteLLM `team_alias` → **manual org map** today (`org_alias` not yet configured; native when it is) — see `litellm_team_hierarchy.md` + migration tracker §P |
| `dim_gpu_pricing.csv` (`gpu_type, usd_per_gpu_hour`) | Training cost = GPU-hrs × rate (Viz 4) | **Admin-set** internal $/GPU-hr (governance rate) |
| `fact_training_gpu_hours_monthly.csv` (`month, org_id, gpu_type, gpu_hours`) | Training GPU-hrs + cost by org (Viz 4) | Slurm exporter `slurm_account_jobs_gpus_alloc` (∫), `account`→org |
| `fact_card_snapshot.csv` | `MODELS[].cards`, donut, card map (Viz 3) | DCGM + K8s API (model→card, FB_USED) |
| `fact_duty_daily.csv` | Duty cycle (Viz 1, KPI) | LiteLLM `litellm_requests_metric` (real user traffic; CI bypasses vLLM `num_requests_running`), SGT biz-hours buckets |
| `fact_token_usage_monthly.csv` (`month, app_id, model_uid, …`) | Org→App→Model tokens + cost (Viz 4) + token KPI | LiteLLM `litellm_output_tokens_metric` (reset-aware deltas); `team_alias` → manual org map (`org_alias` pending) |
| `fact_model_token_weekly.csv` | Token output by model (Viz 6) | LiteLLM weekly deltas by model |
| `fact_workload_util.csv` (weekly GPU-hours: allocated/active/capacity) | Train/inf/batch split + idle (Viz 2, `SPLIT`) | **Derived** GPU-hours: K8s/Slurm allocation (allocated) + DCGM `GPU_UTIL` integral (active). Not a DCGM field — see [`schema.md`](schema.md). |
| `fact_model_pricing.csv` (`model, provider, output_usd_per_m`) | External-host columns of the cost table (Viz 5) | **User-maintained** — fill external host $/1M by hand. The **Internal** column comes from `dim_models.internal_cost_per_m_usd` (single source, also drives Viz 4). |

### ⚠️ Coherence invariants — do not break these
The whole point of this dashboard is that the numbers tie together across charts. When you change the CSVs, preserve:
1. `SUM(model cards)` across all models **= total loaded cards** = 44 (idle cards are not models).
2. Per cluster: `loaded + idle = CLUSTER_TOTAL`. (B200: 28+4=32, H100: 16+2=18.)
3. Fleet duty cycle is **computed** as `SUM(duty×cards)/SUM(cards)` = 60% — *not* typed; keep the duty facts realistic and the KPI follows.
4. Viz 2's latest-month `inference` cards **= the inference fleet** shown in Viz 3 (50).
5. KPI per-cluster values roll up from the model/card-level CSVs.

These are documented again in [`schema.md`](schema.md) §5 and `project-log/PROJECT_LOG.md`.

---

## Roadmap / open items (assumptions to confirm with the real pipeline)

> **Real-data migration in progress** — the live page is still the simulated mock; real Grafana data is being staged for integration. Full tracker + outstanding checklist: [`project-log/REAL_DATA_MIGRATION.md`](project-log/REAL_DATA_MIGRATION.md). **Key findings so far:** the real inference fleet is **~236 cards** (216 B200 + 20 H100), **not 50**; duty cycle sources from **LiteLLM `litellm_requests_metric`** (CI bypasses vLLM); `org_alias` is **not yet configured** in LiteLLM, so a manual team→org map bridges it for now.

- Inventory: the mock uses B200 32 / H100 18 / fleet 50; the **real DCGM snapshot shows 216 / 20 / 236** (and ~46% idle). Integration ("swap" stage) will recompute every coherence invariant.
- Training nodes modeled as **≈ 8 cards** — Slurm not yet ingested; stays simulated.
- Per-cluster token split is **model-driven** (B200 ≈ 84% / H100 ≈ 16%) in the mock.
- **Org/app attribution** — native LiteLLM labels (`org_id`/`org_alias`/`team`/`team_alias`) is the design (see `litellm_team_hierarchy.md`), but `org_alias` is **not configured in the real proxy yet** → a manual `team_alias`→org map is the current bridge (migration tracker §P). Open config: each app = its own LiteLLM Team.
- **Internal cost = admin-provided rate** (in `dim_models` / `dim_gpu_pricing`) — a governance input by design, not metric-derived. Open Slurm config: are accounts named per org?
- **Batch Inference Service** is in pipeline — once live, consider an after-hours utilization view.
