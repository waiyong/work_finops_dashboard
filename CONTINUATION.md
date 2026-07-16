# CONTINUATION — start-here prompt for a fresh session

> Paste this into a new session (or just read it) to pick up the GPU Farm Utilization Dashboard with full context. It tells you **what this project is, what state it's in, and exactly which files to read in what order.**

---

## TL;DR (read this first)

This is a **single-page HTML dashboard** reporting **GPU farm utilization & efficiency** to senior management (AI Platform team). No build step, no framework, no backend — "serve over HTTP and open it works."

There are **two views, one codebase:**
- **`index.html`** → the tracked **simulated mock** (50 cards, 88%/60%) — the shareable baseline.
- **`index.html?data=real`** → the **real dashboard** — reads gitignored **`data_real/`** (real Grafana/DCGM/LiteLLM data, **never committed**).

**The real view is scoped to 8 B200 nodes.** Management asked to see only the 8 most-loaded B200 nodes, not the whole 28-node cluster. So the real fleet is **84 cards = 64 B200 (8 nodes × 8) + 20 H100**, of which **77 are loaded (91.7%)**. The 8 hostnames are pinned in `RAW_DATA/build_fact_card_snapshot.py` (`KEEP_B200_HOSTS`). If you see "236 cards" anywhere, that doc is stale.

**If you read only one file, read [`project-log/REAL_DATA_MIGRATION.md`](project-log/REAL_DATA_MIGRATION.md).** It is the single source of truth for state, decisions, and the patch registry.

---

## ⚠️ Security constraint — read before touching anything

**NEVER commit `RAW_DATA/` or `data_real/`.** Both are gitignored. They contain real hostnames, internal IPs, GPU UUIDs, real agency team names, and **confidential model names** (some carry a `-confidential` suffix). Only tracked files (`index.html`, `rollup.js`, `data/*.csv`, the `.md` docs) may be committed.

Corollary that is easy to get wrong: **`index.html` is a tracked, publicly-shareable file.** Never put a real hostname, a confidential model name, or a real-view-specific hardcoded number into it — the mock must render correctly from it too. Everything on screen is computed from the CSVs.

---

## Read these files, in this order

| # | File | Why / what you get |
|---|---|---|
| 1 | **`CLAUDE.md`** | Working rules (golden rules), how to run/verify, status pointer. Short; auto-loaded each session. |
| 2 | **`project-log/REAL_DATA_MIGRATION.md`** | 👈 **The main context file.** Full A→D journey, every decision, the **§O outstanding checklist**, and the **§T patch registry** (every workaround + its production drop-trigger). |
| 3 | **`README.md`** | Dashboard design, narrative, the visuals table, design language, the data-replacement contract. Describes the **mock** (the default view). |
| 4 | **`schema.md`** | Normalized schema (ERD), the CSV↔ERD contract, source-metric mapping, PromQL/SQL rollup reference (§9). Read when touching data shapes or ETL. |
| 5 | **`metric_lineage.md`** | Visualisation-first lineage: every on-screen figure traced raw → intermediate (CSV) → final (global), tagged metric-backed / benchmark-measured / admin-input / simulated. |
| 6 | **`project-log/PROJECT_LOG.md`** | Durable cross-session decision/action history. Background, not current-state. |

**Local-only (gitignored — not in a fresh clone):**
- **`RAW_DATA/`** — real Grafana/DCGM/LiteLLM exports + the ETL scripts (`fact_*.py`, `build_fact_card_snapshot.py`, `pod_model_map.py`, `build_token_from_spendlogs.py`) + staging CSVs. Refresh guides: `DATA_REFRESH.md`, `SPENDLOGS_REFRESH.md`.
- **`RAW_DATA/system_throughput/`** — the serving-benchmark curves + `build_fact_serving_curve.py` + **`METHODOLOGY.md`**. 👉 **Read `METHODOLOGY.md` before touching the Model Throughput band** — it has the full derivation, the assumptions, and a revision note explaining why an earlier version was scrapped.
- **`data_real/`** — the contract CSVs the real dashboard reads (built from `RAW_DATA/`).
- **`.venv/`** — Python venv (pandas) for the ETL.

---

## How to run

```bash
python3 -m http.server 8000        # from repo root
# Mock (default, in any clone):   http://127.0.0.1:8000/index.html
# Real (needs local data_real/):  http://127.0.0.1:8000/index.html?data=real
```
A `favicon.ico` 404 is expected/harmless. Verify at 1920×1080 **and** 1366×768. Playwright MCP is available for headless checks. After changing a CSV or `rollup.js`, bump the cache-busters (`.csv?v=N` in `rollup.js`, `rollup.js?v=N` in `index.html` — separate counters).

---

## The visuals (top to bottom)

| Panel | What it says |
|---|---|
| **KPI row** (4 cards, one row) | Time in Use · GPUs Loaded · Tokens (output) · Tokens (input + cache-hit %) |
| **Model Throughput band** (hero, tinted) | **New.** Benchmark-**measured** output capacity at 60 tok/s/user: tok/s per GPU and **M tokens per GPU-hour**, per model. See below. |
| Viz 1 Time in Use · Viz 3a Loaded donut | The "loaded ≠ utilized" crux |
| Viz 3b GPU Card Allocation Map | Where the slack physically sits |
| Viz 2 Utilization by Workload | Active GPU compute (DCGM `GPU_UTIL`), 24×7 |
| Viz 6 Token Output by Model | Who produces the tokens |
| Viz 4 Compute Usage & Cost by Organisation | Who consumes them (input/uncached/cache-hit/output) |

*Viz 5 (Cost per Million Tokens vs Cloud) was **deleted** (2026-07-12).* A **Training** toggle in the header shows/hides training in Viz 2 + Viz 4.

---

## Model Throughput band — the one part with unusual rules

Answers: *"for the models we have **benchmark data** for, how many tokens could they produce if saturated at 60 tok/s per user — and what is that per GPU-hour?"* Source: `fact_serving_curve.csv` (NVIDIA serving benchmarks, ISL/OSL 8K/1K — **off-fleet data**). `rollup.js` fits `1/interactivity = a + b·CU`, solves at the SLA, joins to the card snapshot.

**MEASURED ONLY — do not "complete" it with estimates.** A v1 that proxied un-benchmarked models from similar ones, median-estimated an unknown model, and modelled an "all fp4" scenario was **rejected by management (2026-07-13) as too assumption-heavy**. The rule now:

> A model counts **only if it was benchmarked AND is loaded**, and **the denominator is the GPUs those models occupy — not the cluster.**

Real view today: **4 models on 32 of the 60 loaded B200 GPUs → 24,223 tok/s = 2.73 M tokens/GPU-hour, ~100× headroom (1.00% used).** The other 28 loaded GPUs are **excluded and named in the caption**, never zero-filled (zero-filling would drag the per-GPU average down and understate the models we *did* measure). **The way to widen the scope is to benchmark more models — not to reintroduce proxies.**

---

## Where the project stands (2026-07-13)

- **Mock (`data/*.csv`)** — the tracked baseline. Coherence: 44/50 loaded, 88%/60%.
- **Real view (`?data=real`)** — 8-node scope. **84 cards, 77 loaded (91.7%)**; B200 60/64, H100 17/20. Time in Use 66%. Viz 2 active GPU util ~3.6%. June tokens: 1.0 B output, 39.3 B input (81% cache-hit).
- **Adaptive, not fabricated** — trend visuals show the real rolling window; token-KPI MoM hidden until ≥2 periods.
- **Still placeholder on the real view** — Viz 4 **training** GPU-hrs (Slurm not ingested) and **cost rates** ($0.20 placeholder).

## What's outstanding

- **Benchmark the 4 un-benchmarked deployed models** (glm5-2, deepseek-v4-pro, qwen3-5-122b, and the in-house fine-tune — named in `METHODOLOGY.md` §8) → takes the Throughput band from 32 to all 60 loaded B200 GPUs with **zero** added assumptions. *(Skip Qwen3-VL — it's benchmarked but not deployed.)*
- **Confirm deployed precision** against the serving configs — the only assumption left in the band; a wrong label is a 2–4× error on that model.
- **A3** — pull `team_id` (UUID) as the rename-proof join key.
- **C2 / P7, P12** — real `$/1M` cost rates.
- **E1 / P12** — ingest the Slurm exporter → real training GPU-hrs.
- **P4/P5/P6** — LiteLLM config (cluster label, `org_alias`, `team` UUID).
- **P11** — an automated ETL to rebuild `data_real/` (it is currently hand-built).

> **Golden rule for any real-data work:** the renderers are shared between the mock and `?data=real`. Keep every change **backward-compatible with both**, and **never commit `RAW_DATA/` or `data_real/`**.
