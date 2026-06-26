# Project Log — MHA GPU Farm Utilization Dashboard

> **Purpose of this file:** a durable, cross-session record of *what this project is*, *every significant decision and why*, and *what was built*. Read this first when resuming in a new session. For the live design/narrative reference, also see `README.md`; for AI working rules, `CLAUDE.md`; for the data schema, `schema.md`.
>
> Last updated: **2026-06-23**.

---

## 1. What this is (one paragraph)
A single-page, self-contained **HTML dashboard** that reports **GPU farm utilization & efficiency** to **senior management** (the AI Platform team's mandate). It answers *"How well — and how efficiently — are the GPU cards being used?"* It is a **mockup with simulated data**, no backend, no build step — "serve over HTTP and open it works." Design language is **Apple Keynote Minimal** (light, oversized hero numbers, one blue accent `#0071E3`, amber `#D98A2B` only for below-target). As of 2026-06-19 the data layer was migrated from a hand-authored `data.js` to **normalized CSVs + an in-browser rollup (`rollup.js`)**.

## 2. The infrastructure being reported (domain facts)
- **SUPERPOD = B200 cluster** — 32 cards (192 GB each). **PROD = H100 cluster** — 18 cards (80 GB each). **Inference fleet = 50 cards.**
- Of the 50, **44 are loaded / 6 idle** (B200 28 loaded + 4 idle = 32; H100 16 loaded + 2 idle = 18).
- **16 models** served via a **LiteLLM proxy** to **Home Team Departments (HTDs)**: Police, SCDF, ICA, MHA HQ, ILS / Other.
- **2 training nodes** (Slurm, ~8 cards) — separate hardware, not yet monitored.
- **Forward lever:** a planned **Batch Inference Service** (after-hours, soaks up idle cards) — still in pipeline.
- **Scope boundary:** measures **utilization & throughput**, NOT whether output is *useful* (that's the consuming HTD teams' concern). Don't add answer-quality metrics.

## 3. Headline narrative numbers (must stay coherent across all visuals)
- **GPU duty cycle (fleet) = 60%** (target 80%). Per cluster: B200 = 70%, H100 = 43%. **Computed**, GPU-weighted: `Σ(duty×cards)/Σcards`.
- **GPUs loaded = 88%** = 44/50. Per cluster: B200 87.5% (28/32), H100 88.9% (16/18).
- **Monthly output tokens = 240M** (June), growing 150M→240M over Jan–Jun.
- **Cost = −72%** vs public cloud (token-weighted average of per-model savings).
- **Top-5 duty order:** glm5-1 84 > gptoss-120b 78 > deepseek-v4-flash 71 > kimi-k2-6 63 > minimax-m2-7 52.

## 4. The six visualizations
| # | Title | Type | Key number |
|---|---|---|---|
| 1 | GPU Utilization — Top 5 Models | Horizontal bar + 80% target line | fleet 60% |
| 3a | GPUs with Models Loaded | 3-segment donut (SUPERPOD/PROD/Idle), click to focus map | 44/50 = 88% |
| 3b | GPU Card Allocation Map | Model-grouped card blocks (B200 + H100), idle = dashed | 28/32 + 16/18 |
| 2 | Utilization by Workload | **Stacked area, weekly** — GPU **card-hours** as % of farm capacity (inference/training/batch + **idle** band); 85% target line; DCGM compute-intensity footnote | farm util **46% → 75%** (target 85%) |
| 6 | Token Output by Model | **Stacked area, weekly** (24 weeks, 4/month), 16 models | ~35→60M/wk · ties to 240M KPI |
| 4 | Compute Usage & Cost by Organisation | GPU-hours Inference vs Training entry → click Inference = expandable Org→App→Model tokens+cost (rolls up); click Training = GPU-hrs+cost by org | inference 16.7k vs training 5k GPU-hrs |
| 5 | Cost per Million Tokens vs Open-Model Hosts | **HTML table** (user-filled): top-5 models × internal + 3 hosts (output $/1M); cheapest cell highlighted | token-weighted savings headline |

Layout top→bottom: header + env toggle → KPI row → Row1 (Viz1 | Viz3a donut) → bridge caption → Row2 (Viz3b card map, full) → Viz2 (full) → Viz6 (full) → Viz4 (full) → Viz5 (full).

## 5. File inventory
| File / folder | Role |
|---|---|
| `index.html` | Layout + CSS + all chart logic (vanilla JS + Chart.js served locally from `lib/`). Renderers read globals; init is async (awaits `DATA_READY`). |
| `lib/*.js` | Local copies of Chart.js 4.4.1 + annotation 3.0.1 + datalabels 2.2.0 — served locally so the dashboard runs **fully offline** (no CDN). |
| `rollup.js` | **Loads `data/*.csv`, aggregates, exposes the render globals + `DATA_READY` promise.** Replaced `data.js`. Holds policy constants (DUTY_TARGET 80, LOADED_TARGET 90, KPI_MARGIN 5). |
| `data/*.csv` | **The entire normalized dataset** (dimensions + facts). Edit these to change numbers / plug in real data. |
| `schema.md` | Target normalized DB schema + ETL design (Mermaid ERD, real metric names, moderate-grain contract). |
| `README.md` | Design, narrative, intent, visuals table, data-replacement guide. |
| `CLAUDE.md` | AI working rules / golden rules (loaded into context each session). |
| `RUN_DASHBOARD.md` | Non-technical run guide for management. |
| `START_PROMPT.md` | Original brief. |
| `litellm_prometheus_metrics.md`, `vllm_metrics.md`, `DCGM_metrics.md` | Real source-metric catalogs (drive the ERD). |
| `project-log/PROJECT_LOG.md` | **This file.** |
| `data.js` | **DEPRECATED** — superseded by `rollup.js` + CSVs (scheduled for removal). |
| `gen_data.js` | One-off generator that authored the large fact CSVs. NOT needed at runtime (scheduled for removal). |

## 6. Data architecture (post-migration, 2026-06-19)
```
data/*.csv  (normalized, moderate grain — the integration contract)
     │  fetch + parse + aggregate  (rollup.js, in the browser)
     ▼
window globals: MODELS, CLUSTER_TOTAL, KPI, MONTHS, DEPTS, DEPT_COLOR,
  OUTPUT, INPUT, IN_FACTOR, DETAIL, SPLIT, COSTS, COST_SAVINGS,
  WEEKS, MODEL_TOKENS   + DATA_READY (promise)
     ▼
index.html renderers (unchanged in shape) draw the 6 visuals
```
**CSV files & what they feed:**
- `dim_clusters.csv` → CLUSTER_TOTAL · `dim_models.csv` (name, cluster, model_uid, color, costs) → MODELS colors + COSTS · `dim_organizations.csv` → ORGS, ORG_COLOR · `dim_applications.csv` (app_id, app_name, org_id) → Viz4 Org→App hierarchy · `dim_gpu_pricing.csv` (gpu_type → $/GPU-hr) → training cost.
- `fact_card_snapshot.csv` (one row/card) → MODELS.cards, donut, card map, idle counts.
- `fact_duty_daily.csv` (model×day, active/total buckets) → duty% = ΣactiveΣtotal → MODELS.duty + KPI duty.
- `fact_token_usage_monthly.csv` (month×app_id×model) → INFERENCE_TREE (Org→App→Model tokens+cost, Viz 4), token KPI.
- `fact_training_gpu_hours_monthly.csv` (month×org×gpu_type) → TRAINING_BY_ORG (GPU-hrs + cost, Viz 4).
- `fact_model_token_weekly.csv` (week×model) → MODEL_TOKENS, WEEKS, cost token-weights.
- `fact_workload_util.csv` (week×workload_type, GPU-hours: allocated/active/capacity) → SPLIT (% of farm capacity + idle), SPLIT_HOURS, FARM_UTIL headline.
- `fact_model_pricing.csv` (model×provider, output_usd_per_m) → COSTS, PRICING_PROVIDERS, COST_SAVINGS (Viz 5 cost table). **User-maintained** price sheet.

**Everything is computed — zero hand-typed dashboard numbers.** The KPI tiles, fleet duty, donut, cluster rows, the bridge "88%/60%", and the cost "72%" all derive from the CSVs via `rollup.js`/`renderNarrative()`.

## 7. Coherence invariants (do not break)
1. `Σ MODELS.cards = 44` loaded (28 B200 + 16 H100). Idle cards are not models.
2. Per cluster `loaded + idle = total` (28+4=32, 16+2=18).
3. Fleet duty is **computed** `Σ(duty×cards)/Σcards` = 60 — never typed.
4. Donut/card-map loaded counts = 28/32, 16/18, 44/50.
5. Viz 4 latest-month fleet output = 240M; cluster split is **model-driven** (B200≈202M / H100≈38M — see decision D7).
6. Cost fleet savings = token-weighted avg of per-model savings = 72%.

## 8. Decision log (chronological, with rationale)
**D1 — Design language: Apple Keynote Minimal.** Chosen over Grafana/dark because the audience is executives, not operators. Light canvas, hero numbers, single blue accent, amber only for below-target.

**D2 — Narrative reframed** from "Are we over-provisioned?" to "How well are GPU cards being used?" (platform-team mandate). Inventory standardized to **GPU cards** across all visuals.

**D3 — Env toggle simplified.** Top-right shows **All / L1 / L2 / L3** (L1 = combined; L2/L3 disabled "not yet available"). SUPERPOD/PROD breakdown still appears inside the donut + card map. Removed all "Source: …" data-origin badges (kept "Pending / In Progress / Preliminary" maturity badges).

**D4 — KPI color coding.** Green ≥ target, amber within 5 pts, red below (`kpiStatus()`).

**D5 — Viz 6 "Token Output by Model" added** (2026-06-19). Stacked area, **weekly** (25 points), all 16 models, placed below Viz 2. Shows fleet throughput growing ~35→60M/week with dynamic week-to-week peaks. Deterministic generator (no Math.random → stable across reloads).

**D6 — ERD / schema designed** (`schema.md`). Three real source catalogs drive it: **LiteLLM** (tokens, team attribution), **vLLM** (`num_requests_running` → duty cycle), **DCGM** (`GPU_UTIL`/`FB_USED`/`POWER_USAGE` → utilization, loaded/idle, cost), **K8s API** (model→card placement). ERD revisions agreed:
  - Model PK = **composite `(name, cluster_id)`** + surrogate `model_uid = "{name}@{cluster_id}"` (same model can run on both clusters; survives redeploys; LiteLLM `model_id` demoted to attribute).
  - Duty cycle = store **raw timestamped** vLLM samples; filter to **SGT business hours in the rollup** (not at scrape); score by **fixed time-buckets** (active if `num_requests_running>0`). Sampling-rate independent; window can change without re-scraping.
  - **Workload tagging** (inference/training/batch) by **K8s namespace/label**.

**D7 — Data migration: CSV + in-browser rollup** (2026-06-19). Locked decisions:
  - **Architecture A — in-browser JS `rollup.js`** (NOT Python). Rationale: the app has *no backend* (python http.server is a dumb static server); Option A keeps the exact stack and honors the "no build step / open it works" golden rule. Python offline-generation was rejected because it adds a build step.
  - **Moderate-grain CSVs** (small, hand-editable). Raw scrape-level would be 17k–170k+ rows. The heavy **raw→moderate** bucketing/diffing stays **upstream** (documented in `schema.md`); this repo does only the light final aggregation. **The CSVs are the integration contract** — the in-repo rollup won't change when real data lands at the same grain.
  - **Repo scope = CSVs + rollup.js only** (no Python stubs in repo).
  - **Compute everything** — no hand-typed dashboard numbers remain.
  - **Consequence:** the per-cluster *token* split is now **model-driven (B200≈202M / H100≈38M ≈ 84/16)**, replacing the old 70/30 *assumption* (which was a documented placeholder). The tokens KPI tile shows fleet 240M regardless of env (it was always computed from OUTPUT; the per-env token split was never displayed).

## 9. How to run & verify
```bash
python3 -m http.server 8000 --directory /Users/waiyong/Documents/Upper_Management_Report
# open http://127.0.0.1:8000/index.html
pkill -f "http.server"   # stop when done
```
**Must serve over HTTP** — `rollup.js` uses `fetch` for the CSVs, which `file://` blocks. Verify: 0 console errors (favicon 404 is fine); all 6 visuals render; KPIs 60%/88%/240M; cluster rows 28/32, 16/18, 44/50; cost 72%; token toggle + Viz 4 drilldown work. **Data-driven proof:** edit a value in any `data/*.csv` and reload — the dashboard updates with no code change.

## 10. Open items / pending (confirm against real pipeline)
- ~~`team_alias → dept_name` mapping blocker~~ **RESOLVED (2026-06-23)** — LiteLLM emits `org_id`/`org_alias`/`team`/`team_alias` natively (see §12); no external lookup. One config dependency: each Application must be its own LiteLLM Team (1 app = 1 team).
- ~~Training (Slurm) not in scrape~~ **RESOLVED in schema (2026-06-23)** — training now sourced from the **Slurm Prometheus exporter** (`slurm_account_jobs_gpus_alloc` integrated; capacity from `slurm_node_gpus`); see §12. Config dependency: are Slurm **accounts** named per org? (else username→org fallback).
- ~~Internal cost model preliminary~~ **RESOLVED by decision (2026-06-23)** — internal cost (token `$/1M` in `dim_models`, training `$/GPU-hr` in `dim_gpu_pricing`) is an **admin-provided governance input**, not metric-derived; DCGM power/energy reframed to idle/efficiency only. See §13.
- **Batch** workload still unsourced (Batch Inference Service in pipeline) — only the batch row of `SPLIT` stays simulated.
- **Date keys** — `month="Jun"` / `week_start="Jan 6"` have no year; ordered by `rollup.js` arrays. Breaks on multi-year live data — move to ISO when real data lands.
- **Training inventory** — capacity uses 58 cards (50 inference + 8 training); with the Slurm exporter, `slurm_node_gpus` makes this measured, not asserted (consider a `dim_compute_pool`).
- Inference workload tagging still needs a documented K8s namespace/label convention.

## 12. Done in this session (2026-06-23 — schema audit + LiteLLM/Slurm grounding + hygiene)
- **DW-engineer audit of the ERD/schema** against the actual CSVs: referential integrity clean (0 orphan FKs), invariants hold (44 loaded = 28+16, 32/18, June = 240M). Findings logged: (1) `team_alias` bridge, (2) dead `dim_models` columns, (3) ERD mixes built-vs-future, (4) no date keys, (5) training capacity unmodeled.
- **Consumer hierarchy grounded in LiteLLM source** (`schema.prisma`, `litellm/types/integrations/prometheus.py`, captured in `litellm_team_hierarchy.md`): native hierarchy is **Organization → Team → User/Key**, and the token/request counters emit **`org_id`, `org_alias`, `team`, `team_alias`** directly (`_org_label_metrics`). ⇒ Finding #1 dissolves — **org/app attribution is native, no `team_alias→dept` lookup**. **Application = LiteLLM Team.** Added `team_id` + `team_alias` to `data/dim_applications.csv` (additive; `rollup.js` parses by header, non-breaking). Updated `schema.md`: ERD `APPLICATIONS`/`ORGANIZATIONS` provenance, a new "consumer hierarchy" note (level→entity→label→key table), §3 Source A labels, §7 blocker downgrade, §8.1 dictionary, §9.3/§9.6 queries (`sum by (org_alias, team_alias, model)`). Open config Q: 1 app = 1 LiteLLM Team.
- **Training side re-grounded on the Slurm exporter** (`Slurm_metrics.md`) — decided **exporter over `sacct`** (uniform Prometheus pipeline; gives capacity for free; precise enough since training jobs are long-running). Training GPU-hours = `∫ slurm_account_jobs_gpus_alloc dt`; `account` = Slurm's native org/cost-center label (training analog of LiteLLM org). Updated `schema.md`: replaced `SLURM_JOB_ACCOUNTING` entity with `SLURM_ACCOUNT_GPU_SAMPLE` + `SLURM_NODE_GPU`; added §3 Source E; rewrote §9.1(a)/§9.6 from `sacct` bash → PromQL integral; updated §4/§6/§8.3 rows; downgraded §7. Contract CSV (`fact_training_gpu_hours_monthly.csv`) unchanged → dashboard unaffected. Open config Q: are Slurm accounts org-named? + a `partition→gpu_type` map for the rate.
- **Pricing source review** — confirmed Viz 5 reads `dim_models.csv` (rows + Internal col + top-5 ranking) + `fact_model_pricing.csv` (external) + `fact_model_token_weekly.csv` (ranking). No duplication. User chose to **keep normalized** (internal in `dim_models`, external in `fact_model_pricing`) — no change.
- **Hygiene #1 — dropped dead columns:** removed `public_api_equiv` + `public_cost_per_m_usd` from `data/dim_models.csv` (unused since Viz 5 became the table) and from the ERD + §8.1 dictionary. Verified: 5 cols × 16 models, no remaining refs, dashboard 0 console errors.
- **Hygiene #2 — ERD zoning:** added a render-safe **legend above the §2 ERD** marking ✅ built-today (11 entities w/ CSVs) vs ⬜ upstream/future (6 raw/derived), with the rule-of-thumb and a `%%` source comment. (Avoided Mermaid entity-styling — breaks older viewers.)
- Verified live after each change (Playwright, 0 console errors bar favicon 404); cleaned `.playwright-mcp/`.

## 13. Done in this session (2026-06-23 — metric lineage doc + schema accuracy audit)
- **New `metric_lineage.md`** — visualisation-first traceability proving every on-screen figure maps **raw (source metric) → intermediate (`data/*.csv`) → final (`rollup.js` global)**. Built from a 3-agent audit of `index.html` (figures), `rollup.js` (global↔CSV formulas + constants), and the four metric catalogs. Covers KPI row + Viz 1–6 + Viz 4 drills + Viz 5; plus a **🧾 admin-input** table (internal `$/1M`, `$/GPU-hr`, external prices, inventory, targets) and a **⚠ simulated/no-source** list (batch workload, model→GPU K8s join, per-model duty via per-pod scrape, training pending Slurm wiring). Status legend ✅/🧾/⚠.
- **Cost-model reframe completed** — internal cost is **admin-provided** (not DCGM-energy-derived). `schema.md`: §3 DCGM table/note → idle/efficiency only; §7 → admin-input (resolved); §8 dict (`dim_models.internal_cost_per_m_usd`, `dim_gpu_pricing.usd_per_gpu_hour`) → "admin-set governance rate"; §9.5 → deleted the energy-derivation formula. Same in README/CLAUDE.
- **Schema accuracy fixes (from the audit):** (1) LiteLLM metric names standardised to **registered** form `litellm_output_tokens_metric` (dropped `_total`), with an exposition note + corrected label set; (2) **vLLM `num_requests_running` is engine-wide, no `model` label** — per-model duty = the per-pod **scrape target** (§3 Source B + §9.2); (3) noted **carried-but-unused** contract columns (`input_tokens_m` ×2, `fact_card_snapshot.workload_type`, `fact_duty_daily.date`) in §8.2.
- **Docs:** linked `metric_lineage.md` from `README.md` (files list + data section) and `CLAUDE.md` (file list); refreshed README roadmap + data-replacement rows (native LiteLLM attribution, admin cost, Slurm exporter). DOCS ONLY — no `data/*.csv`, `rollup.js`, or `index.html` change; dashboard renders identically.
- **ERD split for legibility** — the single §2 ERD rendered ~6648px wide (17 entities + long comments), illegible when a previewer scales it to fit. Diagnosed by actually rendering with `npx @mermaid-js/mermaid-cli` (network + node available). The diagram was valid Mermaid all along; the user's "only see source" was VS Code's **built-in** preview not supporting Mermaid (needs `bierner.markdown-mermaid` or view on GitHub). Fix: split §2 into **§2a Contract schema** (11 built-today entities, ~2015px) + **§2b Upstream lineage** (6 raw/rollup entities → contract facts, ~2433px), attribute prose trimmed to keys/relationships (detail stays in §8). Both render-verified.

## 11. Done in this session (2026-06-19, post-migration)
- Migrated data layer to `data/*.csv` + `rollup.js` (Architecture A, in-browser). Verified: 0 console errors, all narrative numbers match.
- Removed `data.js` (deprecated) and `gen_data.js` (one-off generator).
- Updated docs: `schema.md` (ERD touch-ups — `DEPARTMENTS` dim, `MODEL_DUTY_DAILY` intermediate; new "moderate-grain contract" §5; rewritten layer diagram §1; upstream-vs-in-repo ETL §6), `CLAUDE.md` (golden rules + file list), `README.md` (files table, data-replacement table, roadmap).
- Cleaned up all screenshot/stock-image artifacts; removed `.playwright-mcp/`.
- Wrote this log (`project-log/PROJECT_LOG.md`).
- **Wired Chart.js + plugins locally from `lib/`** (was CDN) → dashboard runs fully offline; no external http refs.
- **Viz 6 polish:** straightened the area boundaries (tension 0, not curved); added hover dots (radius 4); tooltip now follows the cursor offset to its right (custom `cursorRight` positioner) instead of overlapping/centering.
- **Viz 4 reworked → "Compute Usage & Cost by Organisation":** replaced the monthly HTD stacked bar with a **GPU-hours Inference-vs-Training entry** (two clickable segments) that branches: **Inference** → an **expandable Org → App → Model table** of output tokens + **internal cost** (rolls up at each level; collapse-to-org default); **Training** → **GPU-hours + cost by org**. Re-modeled the consumer taxonomy from HTDs to a real **Organization → Application → Model** hierarchy (HTX/SPF/SCDF/CNB/Prisons/MHQ/Enterprise). New CSVs: `dim_organizations`, `dim_applications`, `dim_gpu_pricing`, `fact_training_gpu_hours_monthly`; `fact_token_usage_monthly` re-keyed `team_alias→app_id`; removed `dim_departments`/`dim_team_dept`. Token cost = tokens × `dim_models.internal_cost_per_m_usd`; training cost = GPU-hrs × `dim_gpu_pricing` rate (B200 $4 / H100 $2.50, from web research). KPI 240M preserved. New rollup globals: ORGS, ORG_COLOR, INFERENCE_TREE, TRAINING_BY_ORG, COMPUTE_SPLIT, OUTPUT_FLEET (replaced OUTPUT/DEPTS/DETAIL/IN_FACTOR). Schema/ERD updated (ORGANIZATIONS, APPLICATIONS, GPU_PRICING, TRAINING_GPU_HOURS_MONTHLY, TOKEN_USAGE_MONTHLY; Slurm owner→org note + §9.6 queries). Note: token cost is marginal serve-cost (small $); $/GPU-hr & internal $/1M editable.
- **Viz 5 reworked to a price TABLE:** replaced the grouped bar with an HTML table (top-5 models × Internal + 3 external open-model hosts, output $/1M; cheapest cell highlighted, token-weighted savings headline). Prices live in a new **user-maintained** `data/fact_model_pricing.csv` (`model, provider, output_usd_per_m`; a provider named `Internal …` = self-hosted baseline) — externals seeded **blank** for the user to fill. Web pricing sources (OpenRouter/llm-pricing/aicostcheck) were tested and found unreliable/incomplete for these models, hence user-filled. `dim_models` internal/public cost columns now unused by Viz 5.
- **Token reconciliation:** regenerated `fact_model_token_weekly.csv` to **24 weeks (4/month)** so each month's weekly fleet total = the monthly total (Jan 150M → Jun 240M). The weekly chart now ties **exactly** to the monthly KPI (June's 4 weeks sum to 240M). Per-cluster/per-model relative shares preserved; cost ranking unchanged.
- **Viz 2 reworked to GPU-hours (weekly):** "Utilization by Workload" now measures **GPU card-hours as % of farm capacity** (50 inference + 8 training = 58 cards × 24h × 7d = 9,744 card-hrs/week), weekly, with an explicit **idle band** to 100% and a **headline (46% → 75%, target 85%)**. Key correctness point established with the user: **DCGM has NO GPU-hours metric** — GPU-hours is *derived* (allocated = K8s/Slurm card-time = cost basis; active = `∫ DCGM_FI_DEV_GPU_UTIL dt` = efficiency footnote, shown as "~58% compute intensity"). Schema/ERD updated: `WORKLOAD_GPU_HOURS_WEEKLY` (allocated/active/capacity) + `SLURM_JOB_ACCOUNTING` source; new CSV columns `allocated_gpu_hours, active_gpu_hours, capacity_gpu_hours`. New rollup globals: `SPLIT` (now incl. `idle`), `SPLIT_HOURS`, `SPLIT_ACTIVE`, `WORKLOAD_WEEKS`, `FARM_UTIL`; config `UTIL_TARGET=85`.
