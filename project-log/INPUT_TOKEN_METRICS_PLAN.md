# Plan — Input-Token Metrics (KPI + Viz 4), sourced from the LiteLLM DB

> **Created:** 2026-07-08 · **Status:** ✅ **IMPLEMENTED (2026-07-09)** — June live on `?data=real`.
> Prompted by feedback from the **first management demo** of `index.html?data=real`.
> Local-only real data stays gitignored (`data_real/`, `RAW_DATA/`); this plan doc is safe to track.
>
> **Shipped:** SpendLogs June (`RAW_DATA/cache-report-2026-06-prd.csv`) → `RAW_DATA/build_token_from_spendlogs.py`
> → `data_real/fact_token_usage_monthly.csv` (now carries `input_tokens_m` + `input_cached_tokens_m`).
> Tokens (input) KPI = **39.3B, 81% cached, 7.5B uncached**; Viz 4 = Org→App→Model **Input | Cache-hit | Output**
> (cost column dropped); output also re-sourced from SpendLogs so input/output reconcile. Token surfaces are a
> **1-month (June) view**; Viz 6 stays the weekly Prometheus trend. **Monthly refresh runbook:
> `RAW_DATA/SPENDLOGS_REFRESH.md`.** Branch A confirmed (cached split available in the export).

---

## 1. What management asked for

After the first cut was presented to upper management, two changes were requested:

1. **Viz 4 "Compute Usage & Cost by Organisation"** — **drop the "Cost (internal)" column**; instead show **input (uncached) tokens** and **output tokens**, broken down by Organisation → Application → Model.
2. **KPI row** — keep the existing **"Tokens (output)"** card as one number; add a new **"Tokens (input)"** card showing **two numbers**: **Total input** and **Uncached input**.

Management specified the data should come **from the LiteLLM DB tables**.

---

## 2. Current-state findings (from a code + docs investigation)

- **Today both elements use only** `litellm_output_tokens_metric` (LiteLLM Prometheus → Grafana CSV → rollup):
  - **Tokens (output) KPI** ← `OUTPUT_FLEET` (rollup.js) ← `data_real/fact_token_usage_monthly.csv` column `output_tokens_m`.
  - **Viz 4** ← `INFERENCE_TREE` (rollup.js) ← same file. Its **"Cost (internal)"** is **not a metric** — it is `output_tokens_m × dim_models.internal_cost_per_m_usd` (an admin-set governance rate).
- **`input_tokens_m` already exists** as a column in `fact_token_usage_monthly.csv` and `fact_model_token_weekly.csv`, but it is **100% blank and never read** by `rollup.js`. It was left as a schema placeholder; input tokens were deliberately dropped earlier ("B4" in `REAL_DATA_MIGRATION.md`) **because no visual rendered them** — this request reverses that.
- **Prometheus can already do this** (`litellm_input_tokens_metric`, `litellm_input_cached_tokens_metric`), but **~10-day retention** limits history. The **LiteLLM DB (SpendLogs)** holds a longer window → chosen source.

---

## 3. Locked decisions

| # | Decision |
|---|---|
| D1 | **Source = LiteLLM DB (`LiteLLM_SpendLogs`)** — a **new SQL-based ETL**, separate from the existing Grafana CSV pipeline. Needs DB read credentials; output stays gitignored (`data_real/`); gets its own refresh doc. Chosen over Prometheus for history depth (retention). |
| D2 | **Tokens (input) KPI shows 2 numbers: Total input + Uncached input.** Output KPI stays 1 number. KPI row grows **3 → 4 cards**. |
| D3 | **Viz 4: remove "Cost (internal)"**; add **input + output token** columns. |

---

## 4. ⛔ Phase 0 — DB VERIFICATION (blocking; must complete before any build)

The whole ETL design branches on **what SpendLogs actually stores**. Run against the LiteLLM DB (table is usually `LiteLLM_SpendLogs`; adjust name if the deployment differs):

```sql
-- (a) guaranteed columns present + populated?  (expect yes)
SELECT prompt_tokens, completion_tokens, total_tokens, "startTime", team_id, model
FROM "LiteLLM_SpendLogs" LIMIT 5;

-- (b) are cached-input tokens captured anywhere (dedicated col OR inside metadata JSON)?
SELECT metadata FROM "LiteLLM_SpendLogs"
WHERE metadata::text ILIKE '%cache%token%' OR metadata::text ILIKE '%prompt_tokens_details%'
LIMIT 5;
```
(psql alternative to inspect columns: `\d "LiteLLM_SpendLogs"`.)

**Branches decided by check (b):**
- **Branch A — cached tokens available** → build **Total input + Uncached** (`uncached = prompt_tokens − cached_tokens`).
- **Branch B — cached tokens absent** → build **Total input + output only**; "uncached" would equal total input → likely drop the split, or label it honestly.

**Caveats to remember:**
- Even if a cached column exists, **self-hosted vLLM/sglang models may write 0** there → uncached ≈ total input anyway.
- **Ignore the `cache_hit` column** — that is LiteLLM's *response* cache (whole answer served from cache), **not** the provider prompt-cache token count we want.
- `prompt_tokens` = total input; `completion_tokens` = output. These are reliably present in every LiteLLM version.

---

## 5. Build design (finalize after Phase 0 results)

1. **New ETL** (gitignored `RAW_DATA/`, e.g. `fact_token_usage_from_db.py`): SQL against SpendLogs, aggregate to `(month, team_alias/team_id, model)`; populate `input_tokens_m` (+ a new `input_uncached_tokens_m` column if Branch A) in `data_real/fact_token_usage_monthly.csv`. **Reuse** the existing `team_alias → app → org` map (`dim_applications.csv` / `dim_organizations.csv`) — do not rebuild org attribution.
2. **`rollup.js`:** read `input_tokens_m` (+ uncached); expose input globals (e.g. `INPUT_FLEET`, `INPUT_UNCACHED_FLEET`); extend `INFERENCE_TREE` leaves with input tokens; stop rendering cost in the Viz 4 tree (can keep computing it or remove).
3. **`index.html`:**
   - `renderInferenceTable` (~L694): header → drop **"Cost (internal)"**, add **"Input tokens"** + **"Output tokens"**; roll up input the same way tokens roll up today.
   - `renderKPIs` (~L381): add a **"Tokens (input)"** card rendering **two** numbers (Total + Uncached).
4. **Cache-busters:** bump `rollup.js` CSV fetch (`?v=12`) and `index.html`'s `rollup.js?v=15`.
5. **New refresh doc** for the SQL pull, analogous to `RAW_DATA/DATA_REFRESH.md` (so weekly/periodic refresh is repeatable).

---

## 6. Verification (after build)

- Playwright on `?data=real`: Viz 4 shows **Input + Output** columns and **no Cost**; KPI row shows **Tokens (input)** with **Total + Uncached**; the numbers **tie to the SpendLogs SQL aggregate**; 0 console errors (favicon 404 ok).
- `git status`: **no real data committed** — `data_real/` and the new ETL stay gitignored.

---

## 7. Open questions / to confirm

- **Phase 0 result** (Branch A vs B) — the single biggest unknown.
- **Window:** what history depth does management want (the reason for choosing the DB)? Monthly? Trailing N months? Affects the SQL date filter.
- **Viz 4 granularity:** show *uncached* input in the table, or *total* input? (KPI shows both; the table may only have room for one input column alongside output.)
- **DB access:** connection string / credentials / network path from the maintainer's machine — the ETL needs read access to the LiteLLM Postgres.

---

*Cross-refs: `REAL_DATA_MIGRATION.md` (B4 input-tokens drop decision, §T patch registry), `RAW_DATA/DATA_REFRESH.md` (existing Grafana pull runbook this will parallel), `schema.md` (contract columns incl. the blank `input_tokens_m`).*
