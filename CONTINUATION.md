# CONTINUATION — start-here prompt for a fresh session

> Paste this into a new session (or just read it) to pick up the GPU Farm Utilization Dashboard with full context. It tells you **what this project is, what state it's in, and exactly which files to read in what order.**

---

## TL;DR (read this first)

This is a **single-page HTML dashboard** reporting **GPU farm utilization & efficiency** to senior management (AI Platform team). No build step, no framework, no backend — "serve over HTTP and open it works."

There are **two views, one codebase:**
- **`index.html`** → the tracked **simulated mock** (50 cards, 88%/60%) — the shareable baseline.
- **`index.html?data=real`** → the **real dashboard** (236 cards, ~54% loaded) — reads gitignored **`data_real/`** (real Grafana/DCGM/LiteLLM data, **never committed**).

A **real-data migration** (Grafana → CSV → dashboard) is largely done through **Phase D**. The current short-term workarounds (5-day / point-in-time data) are all logged with drop triggers for production.

**If you read only one file, read [`project-log/REAL_DATA_MIGRATION.md`](project-log/REAL_DATA_MIGRATION.md).** It is the single source of truth for the migration's state, decisions, and patches.

---

## Read these files, in this order

| # | File | Why / what you get |
|---|---|---|
| 1 | **`CLAUDE.md`** | Working rules (golden rules), how to run/verify, and the status pointer. Short; auto-loaded each session. |
| 2 | **`project-log/REAL_DATA_MIGRATION.md`** | 👈 **The main context file.** Full A→D journey, every decision, the **§O outstanding checklist** (what's left), and the **§T patch registry** (every short-term workaround + its production drop-trigger). Start at the top quick-status, then §O and §T. |
| 3 | **`README.md`** | Dashboard design, narrative, the six visuals, intent, design language, the data-replacement contract. Describes the **mock** (the default view). |
| 4 | **`schema.md`** | Normalized DB schema (ERD), the CSV↔ERD contract, source-metric mapping, and the PromQL/SQL rollup reference (§9). Read when touching data shapes or ETL. |
| 5 | **`metric_lineage.md`** | Visualisation-first lineage: every on-screen figure traced raw → intermediate (CSV) → final (global), tagged metric-backed / admin-input / simulated. |
| 6 | **`project-log/PROJECT_LOG.md`** | Durable cross-session decision/action history (the mock's build). Background, not current-state. |

**Local-only (gitignored — exist on the maintainer's machine, not in a fresh clone):**
- **`RAW_DATA/`** — real Grafana/DCGM/LiteLLM exports, the ETL scripts (`fact_*.py`, `build_fact_card_snapshot.py`, `pod_model_map.py`), and the staging `*_real.csv` / `*_rebuilt.csv`. Real hostnames/IPs/agency-team/confidential-model names live here.
- **`data_real/`** — the contract CSVs the real dashboard reads (built from `RAW_DATA/`).
- **`.venv/`** — Python venv (pandas) for running the ETL.

---

## How to run

```bash
python3 -m http.server 8000        # from repo root
# Mock (default, in any clone):   http://127.0.0.1:8000/index.html
# Real (needs local data_real/):  http://127.0.0.1:8000/index.html?data=real
```
A `favicon.ico` 404 is expected/harmless. Verify at 1920×1080 and 1366×768. Playwright MCP is available for headless checks.

---

## Where the project stands (2026-06-26)

- **Mock (`data/*.csv`)** — unchanged, the tracked baseline. Coherence numbers: 44/50 loaded, 88%/60%, 240M tokens, −72% cost.
- **Real view (`?data=real`)** — Phase D done. **Real now:** 236-card map, donut 127/236 (53.8%), duty from LiteLLM, real Org→App→Model tokens (Viz 4), real token trend (Viz 6, 5 daily points), Viz 2 utilisation (54%, from the card snapshot).
- **Adaptive, not fabricated** — trend visuals show only the real ~5-day window and auto-fill as history accumulates (no simulated history). Token-KPI MoM is hidden until ≥2 periods exist.
- **Still mock/placeholder on the real view** — Viz 4 **training** GPU-hrs (Slurm not ingested), **cost rates** ($0.20 placeholder; admin to supply real $/1M), Viz 2 is a single snapshot point.

## What's outstanding (see §O + §T in the tracker)
- **A3** — pull `team_id` (UUID) as the rename-proof join key.
- **C2 / P7, P12** — real `$/1M` cost rates (Viz 4 cost + Viz 5).
- **E1 / P12** — ingest the Slurm exporter → real training GPU-hrs.
- **P4/P5/P6** — LiteLLM config (cluster label, `org_alias`, `team` UUID) → retire the gptoss-primary-cluster, manual org-map, and team_alias-join patches.
- **P1/P2/P3/P11** — production data + persistence store → real trends auto-fill; rebuild `data_real/` from an automated pipeline; delete smoke CSVs.
- **§E / F1** — update `schema.md` / `metric_lineage.md` to the now-real pipeline.

> **Golden rule for any real-data work:** the renderers are shared between the mock and `?data=real`. Keep every change **backward-compatible with both**, and **never commit `RAW_DATA/` or `data_real/`**.
