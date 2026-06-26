# Real-Data Migration — Outstanding Items & Decisions

> **Active tracker** for replacing the simulated `data/*.csv` with real data pulled from Grafana. Started 2026-06-25. This is the live working doc — outstanding tasks, decisions, and ETL bugs. (For the durable project history see `PROJECT_LOG.md`; for schema/lineage see `schema.md` / `metric_lineage.md`.)
>
> **Quick status — what's blocking a working dashboard on real data:**
> 1. 🟢 Rebuild `dim_models.csv` — DONE (staging): `RAW_DATA/dim_models_rebuilt.csv`, **26 rows, cluster_id auto-filled from DCGM** (§K, §L). Only 2 TODO rows (qwen3-coder-next, phoenix-1-0-small — not in snapshot) + admin to set real costs.
> 2. ⬜ Rebuild `dim_applications.csv` + `dim_organizations.csv` from real teams; simulate org mapping (§I)
> 3. 🟢 ETL blockers RESOLVED (§N update): pandas in `.venv`; tz fixed (localize SGT, browser=Malaysia UTC+8); both aggregation bugs fixed; dim joins repointed to real `dim_models_rebuilt`; workload capacity → 236. **All 4 scripts now run.**
> 4. 🟡 Scripts run + output to `RAW_DATA/*_real.csv` (staging). Remaining: `fact_token_usage_monthly` empty until `dim_applications` rebuilt (§I); workload query needs `modelName` filter; gptoss dual-cluster duplication; input tokens not pulled.
> 5. 🟢 Build `fact_card_snapshot` — DONE (staging): `RAW_DATA/fact_card_snapshot_real.csv`, 236 cards, Option A (untracked=`other@cluster`=loaded). Fleet 127/236 = 54% loaded (§M).
> 6. ⬜ Swap staging dims/facts into `data/` once all real data is ready (don't overwrite live `data/*.csv` mid-migration — breaks coherence). Includes: real `dim_clusters` (216/20), `other` pseudo-model, rollup.js/index.html for 236 cards + MIG hover.
> 7. ⬜ Deferred schema/lineage doc updates once validated (§E)
>
> **Done so far:** ETL script filename + regex bugs fixed (§F); duty-cycle source decision (§A); real model list captured (§C); `dim_models` rebuilt w/ DCGM cluster auto-fill (§J,§L); curated pod→model map (§K); `fact_card_snapshot` parser built, Option A (§M).

---

## A. Decision: switch duty cycle source from vLLM → LiteLLM

**Decision:** Use `litellm_requests_metric_total` (not `vllm:num_requests_running`) for `fact_duty_daily`.

**Why:** CI jobs hit the vLLM endpoints directly (bypassing LiteLLM proxy), inflating `num_requests_running`. LiteLLM proxy metrics see only real user traffic — CI is naturally absent.

**Metric to use:**
```promql
litellm_requests_metric_total{
  model!="unknown",
  team_alias!="litellm-internal-health-check"
}
```

**Filters explained:**
- `model!="unknown"` — drops requests where LiteLLM could not attribute a model
- `team_alias!="litellm-internal-health-check"` — drops LiteLLM's own internal health-check probes

**Semantic shift (important):**

| | Old (vLLM gauge) | New (LiteLLM counter) |
|---|---|---|
| Measures | GPU actively computing at scrape instant | At least one real user request completed in this 5-min window |
| CI pollution | Yes — CI hits vLLM directly | No — CI bypasses proxy |
| Health check noise | No | Yes — filtered by `team_alias` |
| Better for dashboard? | No | Yes — counts real user activity only |

**What to update in schema.md / metric_lineage.md:** §3 Source B (duty cycle source), §9.2 (duty cycle PromQL), metric_lineage.md §2 (Quick layer reference duty row) and §3 (Viz 1 + KPI lineage rows). — **NOT YET DONE. Defer until real data is validated.**

---

## B. Confirmed available LiteLLM metrics in Grafana

| Metric | Visible in Grafana | Use |
|---|---|---|
| `litellm_requests_metric_total` | ✅ | **Duty cycle** (per-model, real user traffic) |
| `litellm_deployment_total_requests_total` | ✅ | Backend health / per-deployment routing (not used for duty cycle — deployment label `litellm_model_name` may differ from user-facing `dim_models.name`; also includes retries/fallbacks) |
| `litellm_proxy_total_requests_metric` | ❌ not present | Older LiteLLM version metric — skip |
| `litellm_in_flight_requests` | not checked | Gauge equivalent at proxy level — but **no model label**, unusable for per-model duty |

`litellm_requests_metric_total` uses label `model` (routed model name) — same join key as `litellm_output_tokens_metric`. Confirmed consistent.

---

## C. Real model names from Grafana (2026-06-25)

Discovered via:
```promql
count by (model) (
  litellm_requests_metric_total{
    model!="unknown",
    team_alias!="litellm-internal-health-check"
  }
)
```

**Full list as of 2026-06-25:**

| Model name | Notes |
|---|---|
| `glm5-2` | Chat inference ✅ (simulated used `glm5-1` — needs update) |
| `gptoss-120b` | Chat inference ✅ exact match |
| `deepseek-v4-pro` | Chat inference ✅ (simulated used `deepseek-v4-flash`) |
| `llama4-scout` | Chat inference ✅ (simulated used `llama4-scout-17b`) |
| `qwen3-instruct` | Chat inference ✅ |
| `qwen3-vl-235b-a22b-thinking` | Vision-language, large ✅ |
| `qwen2-vl-72b` | Vision-language ✅ |
| `qwen2-5-vl-3b-instruct-awq` | Vision-language, small |
| `llama-3-3-70b-instruct` | Chat inference ✅ (simulated used `llama3.3-70b`) |
| `spsllm-1-0-72b-20260115-confidential` | Custom/fine-tuned ✅ |
| `spfllm-1-0-123b-20260420-confidential` | Custom/fine-tuned ✅ |
| `phoenix-1-5-small-20260306-open` | Custom/fine-tuned |
| `sps-crms-test-20260520` | Test/staging — probably exclude |
| `bge-m3-embed` | Embedding — **exclude from duty cycle** |
| `outline-embedding` | Embedding — **exclude** |
| `qwen3-embedding-4b` | Embedding — **exclude** |
| `qwen3-reranker-0-6b` | Reranker — **exclude** |
| `qwen3guard-gen-8b` | Guardrail — **exclude** |
| `deepseek-ocr` | OCR specialist — **exclude** |

**Key finding:** the simulated `dim_models.csv` model names are placeholders and do not match real production names. `dim_models.csv` must be re-populated with real names before the ETL pipeline works.

---

## D. dim_models.csv is manually maintained — by design

**Columns and why:**

| Column | Source | Rationale |
|---|---|---|
| `name` | Admin decision | Decides WHICH models belong on the dashboard (not all LiteLLM models — embeddings/rerankers/guardrails are excluded by the admin's choice) |
| `cluster_id` | Admin / potentially from `api_base` label in `litellm_deployment_total_requests_total` | `api_base` is cluster-specific (one URL per vLLM cluster) — could semi-automate this via an `api_base → cluster_id` mapping, but still needs a human to decide scope |
| `model_uid` | Derived (`name@cluster_id`) | Auto-computed, no human input |
| `color_hex` | Admin | Display choice, no metric source |
| `internal_cost_per_m_usd` | Admin | Governance/policy rate — intentionally not metric-derived |

**Practical implication for ETL:** the `dim_models.csv` join acts as a **whitelist** — only models in `dim_models` get a `model_uid` and appear in the dashboard. Embeddings, rerankers, OCR, guardrails, test models are all dropped at the join step automatically. No PromQL filter needed to exclude them.

**Models change infrequently** (new deployment every few weeks). Low maintenance overhead.

---

## E. Pending schema.md / metric_lineage.md updates (deferred)

These need updating once real data ETL is validated. Do not update until then (avoid docs drift from actual behaviour).

1. **schema.md §3 Source B** — change duty cycle source from `vllm:num_requests_running` to `litellm_requests_metric_total`; update §9.2 duty cycle PromQL/SQL.
2. **metric_lineage.md §2** — update duty row Key labels.
3. **metric_lineage.md §3** — update Viz 1 + KPI lineage rows to point at LiteLLM counter.
4. **schema.md §9** — Gap 3 (calendar-month vs rolling-30d for token rollup) and Gap 5 (`org_id` UUID vs readable-code join key) still unresolved — document the decision when made.
5. **dim_models.csv** — replace all 16 simulated rows with real model names + cluster_id assignments once confirmed.

---

## F. Grafana query guide — all four pullable tables (2026-06-26)

Use **"Series joined by time"** in Grafana Inspector → Data → Download CSV for all queries. This gives wide-format CSV (one column per model series) which the Python ETL scripts expect.

For the 5-day smoke test, use `[1d]` lookback and step `1d` everywhere instead of `[1w]` / step `1w`. Extend to 6 months once `dim_models.csv` is updated with real names.

### fact_duty_daily
```promql
sum by (model) (
  increase(
    litellm_requests_metric_total{
      model!="unknown",
      team_alias!="litellm-internal-health-check"
    }[5m]
  )
)
```
- Step: `5m` · Time range: last 14 days (or 5 days for smoke test)
- A 5-min bucket is active if value > 0
- Python ETL: filter to SGT Mon–Fri 09:00–17:59, bucket by 5-min, sum active/total per model per day, join dim_models → model_uid

### fact_model_token_weekly
```promql
sum by (model) (
  increase(
    litellm_output_tokens_metric{
      model!="unknown",
      team_alias!="litellm-internal-health-check"
    }[1w]
  )
) / 1e6
```
- Step: `1w` · Time range: last 6 months (use `[1d]` / step `1d` for 5-day smoke test)
- `/1e6` converts raw tokens → millions (matches `output_tokens_m` column)

### fact_token_usage_monthly
```promql
sum by (org_alias, team_alias, model) (
  increase(
    litellm_output_tokens_metric{
      model!="unknown",
      team_alias!="litellm-internal-health-check"
    }[1d]
  )
) / 1e6
```
- Step: `1d` · Time range: last 5 days (extend to 30d per month for production)
- Python ETL: join dim_models → model_uid; join dim_applications on team_alias → app_id

### fact_workload_util (inference only)
```promql
# allocated_gpu_hours (main bars):
sum(
  avg_over_time( (DCGM_FI_DEV_FB_USED > bool 1024)[1d:1m] )
) * 24

# active_gpu_hours (footnote only — optional):
sum(
  avg_over_time( DCGM_FI_DEV_GPU_UTIL[1d:1m] ) / 100
) * 24
```
- Step: `1d` · Time range: last 5 days
- Single series — no "Series joined by time" needed
- `capacity_gpu_hours = 50 × 24` (inference fleet, no query needed)
- Training/batch rows stay simulated until Slurm is ingested

---

## G. ETL script status (superseded by §N verification 2026-06-26)

| Table | Status | See |
|---|---|---|
| `fact_duty_daily` | 🟡 logic OK; blocked by pandas + simulated dim_models + tz unconfirmed | §N |
| `fact_model_token_weekly` | 🔴 **aggregation bug** (doesn't sum 5-min→weekly) + pandas + dim_models | §N |
| `fact_token_usage_monthly` | 🟡 logic OK; **dim_applications join returns empty** + pandas | §N, §I |
| `fact_workload_util` | 🔴 **aggregation bug** (1344 rows, not reduced) + pandas + capacity hardcoded | §N |
| `fact_card_snapshot` | 🟢 **built** via DCGM (`build_fact_card_snapshot.py`) | §M |
| `fact_training_gpu_hours_monthly` | ⏸ Slurm not yet ingested — keep simulated | — |

---

## H. dim_models.csv update plan (next session)

`dim_models.csv` currently has 16 **simulated** model names that do not match real production names. The ETL join fails silently for any model not in this file. Must be updated before the full pipeline works.

**Step 1 — extract real model names from the downloaded CSVs (script approach)**

The 4 Grafana CSV exports (wide format) have column headers like `{model="glm5-2"}`. A script can parse these to get the unique model name list — no manual copying needed.

```python
import pandas as pd, re, glob

model_names = set()
for f in glob.glob("grafana_*.csv"):          # all 4 downloaded CSVs
    df = pd.read_csv(f, nrows=0)              # headers only
    for col in df.columns[1:]:               # skip Time column
        m = re.search(r'model="([^"]+)"', col)
        if m:
            model_names.add(m.group(1))

print(sorted(model_names))
```

This gives the full list of unique model names across all 4 exports. Use this as the starting point for `dim_models.csv`.

**Step 2 — assign cluster_id manually (cannot be automated from these CSVs)**

The 4 CSVs do not contain cluster information. `cluster_id` (B200 or H100) must be filled manually — you need to know which vLLM cluster each model is deployed on.

Optional semi-automation: query `litellm_deployment_total_requests_total` with `sum by (litellm_model_name, api_base)` — if B200 and H100 have different `api_base` URLs, this tells you which cluster each model is on.

**Step 3 — fill remaining columns**
- `model_uid` — auto-derived: `name@cluster_id` (compute in Python, don't type manually)
- `color_hex` — pick a colour per model (reuse the existing palette in `dim_models.csv` as reference)
- `internal_cost_per_m_usd` — admin-set governance rate per model

**Step 4 — exclude non-inference models**

Do NOT add these to `dim_models.csv` (they are not GPU farm inference models for this dashboard):

| Model | Reason to exclude |
|---|---|
| `bge-m3-embed`, `outline-embedding`, `qwen3-embedding-4b` | Embedding models |
| `qwen3-reranker-0-6b` | Reranker |
| `qwen3guard-gen-8b` | Guardrail |
| `deepseek-ocr` | OCR specialist |
| `sps-crms-test-20260520` | Test/staging |

The ETL join naturally drops any model not in `dim_models.csv` — no PromQL filter needed.

---

## I. dim_applications / org attribution — findings from real data (2026-06-26)

When the real `fact_token_usage_monthly` export was inspected, three things surfaced:

### I.1 — `org_alias` is NOT emitted by LiteLLM yet
The query `sum by (org_alias, team_alias, model)` returned column headers containing **only** `model` and `team_alias` — no `org_alias`:
```
{model="bge-m3-embed", team_alias="AI Safety & Security - Cloudsine"}
```
**Cause:** org_alias is **not yet configured in LiteLLM**. Until it is, org attribution cannot come from the metric automatically. The schema's "native org attribution" (`schema.md` §7) is **not yet active in this deployment**.

### I.2 — Two team identity fields exist (use the stable one later)
| Label | What it is | Stability |
|---|---|---|
| `team` | team **ID** (UUID in real LiteLLM) | Stable — never changes |
| `team_alias` | human-readable name | **Renameable** by admins |
`dim_applications.csv` carries both `team_id` + `team_alias` by design — intent is to **join on the UUID, display the alias**. Current export only pulled `team_alias`; add `team` to the `sum by(...)` to also capture the stable ID.

### I.3 — Real team_alias values do not match the simulated dim_applications
Real teams (sample): `SPF Product Squad A - Genie`, `Digital Product Squad B - Teammate`, `CNB Product Squad A - Narconet`, `Enterprise AI Product Squad A`, `ICA Product Squad B - AI Extract`, `aip-gitlab-ci-exempt`, `code-assist-users`, `ai-platform`, `q-team`, `Infra`, `xCloud - Ren3`, `xData - AI Data Platform`, etc. (~50+ distinct teams).
The simulated `dim_applications.csv` has `spf-code-assist` etc. — **zero overlap**, so the join returns empty.

### DECISION (2026-06-26): simulate the org mapping for now
Goal: get the dashboard rendering with real token data without waiting for LiteLLM org config.

**Plan:**
1. Build `dim_applications.csv` from the **real** `team_alias` values pulled from the export (extract the distinct list with a script, same approach as model names in §H).
2. Manually assign each real team to a **simulated org** (group by name prefix — `SPF * → SPF`, `CNB * → CNB`, `SPS *`/`sps* → Prisons or SPS, `ICA * → ICA`, `Digital */Enterprise * → Enterprise`, platform teams `ai-platform`/`q-team`/`Infra`/`xData *`/`xCloud * → HTX`, etc.).
3. **Join on `team_alias`** (the only field currently emitted) until `team` UUID + `org_alias` are configured.
4. Rebuild `dim_organizations.csv` to match the simulated orgs.

**To revisit once LiteLLM org config lands:**
- Configure `org_alias` in LiteLLM so org attribution becomes native (no manual mapping).
- Add `team` (UUID) to the query and switch the join key from `team_alias` → `team_id` (rename-proof).
- Update `schema.md` §7 to note org attribution was pending in deployment (design was correct, config not yet applied).

### Remaining ETL bugs to fix (tracked separately)
- `fact_token_usage_monthly.py` — join currently fails (I.3); will work after dim_applications rebuild. Also `org_alias` extraction returns all-NaN (I.1) — handle gracefully.
- `fact_workload_util.py` — needs weekly/daily aggregation (CSV has 5-min rows, not one row per period).

---

## J. dim_models.csv rebuild (2026-06-26)

**Status:** staging file built at `RAW_DATA/dim_models_rebuilt.csv` (21 inference models). Not yet swapped into `data/dim_models.csv`.

**Extracted from RAW_DATA exports:** 31 distinct real models. Categorised:

**INCLUDED (21)** — chat + vision-language inference:
glm5-1, glm5-2, gptoss-120b, deepseek-v4-flash, kimi-k2-6, minimax-m2-7, llama-3-1-8-b, llama-3-3-70b-instruct, llama4-scout, qwen3-5-122b, qwen3-coder-next, qwen3-instruct, spfllm-1-0-123b-20260420-confidential, spsllm-1-0-72b-20260115-confidential, phoenix-1-0-small-20251130-open, phoenix-1-5-small-20260306-open, minicpm-v-4-5 (VL), phoenix-vl-1-5-medium-20260420-open (VL), qwen2-5-vl-3b-instruct-awq (VL), qwen2-vl-72b (VL), qwen3-vl-235b-a22b-thinking (VL)

**EXCLUDED (10):**
- Embedding: bge-m3-embed, mxbai-embed, outline-embedding, qwen3-embedding-4b
- Reranker: qwen3-reranker-0-6b
- Guardrail: qwen3guard-gen-8b
- OCR: deepseek-ocr, nanonets-ocr-s
- Benchmark/test: gptoss-120b-benchmark, sps-crms-test-20260520

**JUDGMENT CALLS to confirm with platform team:**
- **OCR models** (deepseek-ocr, nanonets-ocr-s) — excluded, but they DO generate output tokens and consume GPU. If management wants OCR throughput on the dashboard, move them to INCLUDE.
- **Vision-language models** — included (they generate tokens + use GPU). Confirm this is desired scope.
- **Embeddings/rerankers** — use GPU but produce no generation tokens; excluded to match the dashboard's "generation throughput" scope. If a "GPU utilization by ALL workloads" view is wanted later, these matter.

**Remaining USER steps:**
1. Fill `cluster_id` (B200/H100) for each of the 21 rows in `RAW_DATA/dim_models_rebuilt.csv`.
2. (Optional) Adjust `color_hex` (pre-filled from palette) and `internal_cost_per_m_usd` (all placeholder 0.20).
3. Run `python3 RAW_DATA/finalize_dim_models.py` → regenerates `model_uid = name@cluster_id`.
4. When all real facts are ready, copy `RAW_DATA/dim_models_rebuilt.csv` → `data/dim_models.csv`.

**Note:** the old simulated `dim_models.csv` had names like glm5-1/kimi-k2-6 that partly overlap real names (glm5-1, kimi-k2-6, gptoss-120b exist in both) — but most differ. Do not assume the simulated cluster assignments carry over.

---

## K. DCGM → cluster assignment + card snapshot (2026-06-26)

**Discovery:** DCGM exporter IS K8s-enriched — the LLM identity is present in the labels, so model→cluster can be auto-derived (no manual cluster_id needed). Confirmed from two real samples.

**Sample labels (the two clusters differ!):**
- **B200** host `nvddgxp0006` (driver 570): LLM in `exported_pod` / `exported_container` (e.g. `exported_container="gptoss-120b-sglang-sglang"`); bare `pod`/`container` = the dcgm-exporter itself.
- **H100** host (driver 535): LLM in `pod` / `container` (e.g. `container="vllm-ray-head"`, `pod="...qwen3-reranker..."`); NO `exported_*` labels. Also has MIG labels `GPU_I_ID`, `GPU_I_PROFILE="1g.22gb"`.

**Three complications:**
1. **Two label schemes** — ETL must coalesce: `workload = exported_pod or pod`, `cont = exported_container or container`. Not doable in PromQL; Python step.
2. **GPU-type + non-LLM filtering** — L40 GPUs also exist. Filter `modelName=~"NVIDIA B200|NVIDIA H100.*"`. Non-LLM pods (rerankers, embeddings, dcgm-exporter itself) dropped by matching pod/container string against the `dim_models` whitelist (same trick as token tables — no hand-maintained pod filter).
3. **MIG on H100** — H100 NVL is sliced (`1g.22gb` etc.). Breaks "1 card = 1 model."

**modelName → cluster mapping:**
| DCGM modelName | cluster | display |
|---|---|---|
| `NVIDIA B200` | B200 | SUPERPOD |
| `NVIDIA H100 NVL` | H100 | PROD |
| `NVIDIA L40*` | (exclude) | — |

**DECISION (2026-06-26) — MIG counting = Option B (physical card).**
- A B200 card = whole card. An H100 card = whole physical H100; it is "loaded" if **ANY** MIG slice on it has an LLM.
- Rationale: uniform "card" unit for a senior-management dashboard; keeps the 50-card / 44-loaded story simple. MIG detail (multiple models per H100) goes in a tooltip/footnote, not the headline.
- Rejected Option A (count by slice) — more technically honest but mixes units (192GB B200 cell vs 22GB slice cell) and shifts the inventory numbers.
- Implication for ETL: for H100, dedupe to physical card via `(Hostname, gpu)` (ignore `GPU_I_ID`); a physical card is loaded if any of its slices maps to a known LLM. Pick one representative model_uid per card for the map (e.g. the largest/first LLM on it) — TBD how to display multi-model H100 cards.

**Query to pull (latest snapshot, Table view, labels — NOT "series joined by time"):**
```promql
DCGM_FI_DEV_FB_USED{modelName=~"NVIDIA B200|NVIDIA H100.*"}
```
Per physical card gives: GPU type (→cluster), pod/container (→model), Hostname+gpu (→slot), FB_USED (→loaded/idle).

**What this unblocks:**
- `dim_models.cluster_id` — auto-fill (no manual TODO) by joining each model's pod to its modelName→cluster.
- `fact_card_snapshot.csv` — rebuild from real placement (donut + card map).

**Open for next session:** how to represent an H100 physical card that hosts multiple LLMs across slices in the single-model_uid card map (Option B picks one representative — decide which).

---

## L. DCGM snapshot analysis — real fleet inventory (2026-06-26)

Parsed `RAW_DATA/b200_gpu_model_info.csv` + `h100_gpu_model_info.csv` (instant DCGM `FB_USED` snapshot, dedup by physical GPU UUID, workload pod coalesced `exported_pod or pod`, idle = FB ≤ 1 GiB). **Zero detection misses** (every high-FB GPU had a resolvable workload pod), so the idle count is real.

### The real fleet is ~5× the simulated model, and ~46% idle
| | Simulated (old dashboard) | **Real (DCGM 2026-06-26)** |
|---|---|---|
| B200 cards | 32 | **216** (27 DGX nodes × 8) |
| H100 cards | 18 | **20** |
| Total fleet | 50 | **236** |
| Loaded | 44 (88%) | **127 (~54%)** |
| Idle | 6 | **109 (~46%)** |

**DECISION (2026-06-26): report inventory as-is** (use the real ~236, don't keep the simulated 50). The ~46% idle is the dashboard's actual story (validates the Batch Inference Service lever). Idle B200s come in whole 8-GPU nodes (nvddgxp0005/0019/0020/0023/0027/0029/0031…).
**OPEN:** confirm whether ~46% idle is representative or a quiet-moment snapshot (the card snapshot is point-in-time — see idle-source note below).

### Model → cluster (loaded GPU count), auto-derived from DCGM
B200: glm5-1 (24), glm5-2 (16), gptoss-120b (12), phoenix-vl-1-5-medium (12), deepseek-v4-pro (8), kimi-k2-6 (8), xiaomi-mimo (4), deepseek-v4-flash (4), qwen3-5-122b (4), minimax-m2-7 (2), llama4-scout (2), llama-3-1-8-b (2), qwen2-vl-72b (2), qwen3-vl-235b (2), qwen3-instruct (2), qwen3-4b (2), spfllm-1-0-123b (2), spsllm-1-0-72b (2).
H100: llama-3-3-70b (2), gptoss-120b (1), minicpm-v-4-5 (1), phoenix-1-5-small (1), qwen2-5-0-5b (1), qwen2-5-vl-3b (1) + excluded utility models (embeddings/rerankers/OCR/guardrail/moderation).

### Key findings
- **`gptoss-120b` runs on BOTH clusters** (B200×12, H100×1) → two rows `gptoss-120b@B200` + `gptoss-120b@H100`. Validates the composite-key `(name, cluster_id)` design.
- **B200 = big chat/vision models; H100 = small + utility models** (embeddings, rerankers, OCR, guardrail, moderation — all excluded from dashboard).
- **New models discovered (not in original 21):** `deepseek-v4-pro`, `xiaomi-mimo`, `qwen3-4b` (B200), `qwen2-5-0-5b` (H100). **Added to dim_models.**
- **Two models from the 21 not seen in this snapshot:** `qwen3-coder-next`, `phoenix-1-0-small` → cluster_id left `TODO` (may just be undeployed at snapshot time; confirm).
- **Disaggregated serving** (`dgdr`, prefill/decode pods) and **truncated pod names** (`phoenix-vl-1-5-mediu`) mean pod→model needs a **curated map**, not string logic → saved as `RAW_DATA/pod_model_map.py` (reused by the future card-snapshot parser).

### Artifacts produced
- `RAW_DATA/dim_models_rebuilt.csv` — **regenerated, 26 rows**, cluster_id **auto-filled from DCGM** (18 B200 + 6 H100 + 2 TODO). Includes gptoss dual-cluster rows + 4 new models. (No longer needs manual cluster_id except the 2 TODO.)
- `RAW_DATA/pod_model_map.py` — curated `CORE_MAP` (pod core → canonical model + include flag), `MODELNAME_TO_CLUSTER`, `clean_pod()`, `pod_to_model()`. The reusable heart of the card-snapshot parser.

### Decisions confirmed this session
- **dim_models = source of truth** for which models are on the dashboard. ✅
- **Viz 1 "GPU Utilization — Top 5 Models" stays top-5** — adding more models to dim_models doesn't change it; top-5 is computed by ranking (duty), the rest still count toward the fleet-weighted average.
- **H100 MIG cards** — on hover, show the **list of model names** sharing that physical card (instead of one representative). → `fact_card_snapshot` must carry **multiple model_uids per H100 physical card** (or a separate per-card model list field). Schema change needed when building the real card snapshot.

### Still OPEN
- Confirm `qwen3-coder-next` / `phoenix-1-0-small` clusters (the 2 TODO rows).
- Confirm exclusion of `mistral-moderation`, `polyglot`, `triton-custom` (unclear / utility).
- `internal_cost_per_m_usd` still placeholder 0.20 for all — admin to set real rates.
- Idle %: decide whether the point-in-time snapshot is the right basis, or average over a window (see idle-source note).

### Idle — how it's computed / its data source
Idle is **not a separate metric**. It's derived from the same DCGM `DCGM_FI_DEV_FB_USED` card snapshot: a physical GPU is **idle if FB_USED ≤ 1 GiB** (no model weights resident), **loaded otherwise**. `idle = total_cards − loaded_cards`. So it's a **point-in-time** state (the instant the snapshot query ran), exactly like `fact_card_snapshot`. If a smoother number is wanted, average the loaded-fraction over a window (the `avg_over_time((FB_USED>bool 1024)[1d:1m])` approach used for `fact_workload_util`).

---

## M. fact_card_snapshot parser — built (2026-06-26)

`RAW_DATA/build_fact_card_snapshot.py` → `RAW_DATA/fact_card_snapshot_real.csv` (236 cards). Uses `pod_model_map.py` (curated). Dedup to physical GPU by UUID; H100 MIG collapsed to physical card (Option B); workload pod coalesced.

**DECISION (2026-06-26): untracked utility cards count as LOADED (Option A).**
Cards running embeddings/rerankers/OCR/guardrail/moderation (not dashboard chat/vision models) are physically utilised → counted as loaded under a synthetic **`other@<cluster>`** pseudo-model. The card map shows them as an "Other workloads" bucket (grey), hover lists the real models via `models_on_card`.

**Final real loaded %:** B200 111/216 (51%), H100 16/20 (80%), **FLEET 127/236 (54%)**. (vs simulated 44/50 = 88%.)

**Output columns:** `cluster_id, card_slot, model_uid, workload_type, models_on_card, state`
- `model_uid`: tracked model `name@cluster` | `other@<cluster>` (untracked utility) | blank (idle)
- `models_on_card`: pipe-separated bare model names on that physical card (for MIG hover)
- `state`: idle | loaded_tracked | loaded_untracked (forward-use/analysis)

**Pending dashboard-wiring (the "swap into data/" stage — NOT done yet):**
- `dim_models` needs an `other` pseudo-row (grey) per cluster, OR `rollup.js` special-cases `other@*`.
- `dim_clusters.csv` → real inventory (B200 216 / H100 20), not simulated 32/18.
- `rollup.js` + `index.html` (Viz 3 donut + card map) handle 236 cards, the `other` bucket, and the MIG `models_on_card` hover list (schema change: multiple models per card).
- All coherence invariants (44/50, 28/32, etc.) get recomputed against real numbers.

---

## N. ETL script verification (2026-06-26) — what's actually resolved vs outstanding

Re-checked all 4 ETL scripts against the real `RAW_DATA/*.csv` inputs.

### Resolved (verified) ✅
- **Filenames** — all 4 read the correct `RAW_DATA/*.csv` (no more `grafana_*.csv`).
- **Wide→long parse** — `fact_duty_daily.py` + `fact_model_token_weekly.py` correctly use the bare model-name column headers and drop the trailing `model` / `Value NN` artifact columns.
- **`fact_token_usage_monthly.py` regex** — its CSV genuinely uses `{model="...", team_alias="..."}` headers, so its extraction works (was never the bug).
- **Aggregation** — `fact_duty_daily.py` (groupby model×day) and `fact_token_usage_monthly.py` (groupby month×app×model) aggregate correctly.

### Outstanding 🔴/🟡 (blocks running on real data)

**Cross-cutting (affects all 4):**
1. 🔴 **pandas is NOT installed** — every ETL script `import pandas as pd` and crashes immediately (`ModuleNotFoundError`). Options: `pip3 install pandas`, or rewrite in stdlib `csv` (like `build_fact_card_snapshot.py`, which runs fine). **No ETL script has actually been run yet.**
2. 🟡 **Join target is the SIMULATED `data/dim_models.csv`** (still glm5-1/kimi/llama4-scout-17b…), not the real `RAW_DATA/dim_models_rebuilt.csv`. Inner-join drops most real models. Repoint the scripts to the rebuilt dim, or swap it into `data/` first.
3. 🟡 **Timestamp timezone unconfirmed** — raw timestamps look like `2026-06-15 08:05:00` with no tz. `fact_duty_daily.py` assumes UTC (`utc=True`) then converts to SGT (+8). If Grafana exported in SGT already, the business-hours filter (Mon–Fri 09–18 SGT) is shifted 8h wrong. **Confirm Grafana's export tz before trusting duty numbers.**

**Per-script:**
- `fact_duty_daily.py` — 🟡 logic correct; blocked only by #1, #2, #3 above.
- `fact_model_token_weekly.py` — 🔴 **aggregation bug (newly found):** the raw file is 5-min increments (1344 rows, `08:05…23:59` over 5 days, values ~1e-5 M = tens of tokens), but the script labels each 5-min row by day and writes them all — it does **not** `groupby` + sum to weekly. Needs a `groupby([week,model_uid]).sum()`. Also note: 5 days ≠ a week, so the weekly bucketing for the smoke test needs a decision (sum to one period, or relabel daily).
- `fact_token_usage_monthly.py` — 🟡 aggregation OK, but 🔴 the **`dim_applications` join returns empty** (real `team_alias` like "SPF Product Squad A - Genie" don't match the simulated `spf-code-assist`). Also `org_alias` is absent from the export (not configured in LiteLLM) so it's extracted-but-unused. Blocked on the §I dim_applications rebuild.
- `fact_workload_util.py` — 🔴 **aggregation bug (still open):** 1344 five-minute rows are written as-is with a per-day `week_start` label — not reduced to one value per period. Needs avg/sum aggregation. Also 🟡 `capacity_gpu_hours` hardcoded to `50*24` — should use the **real inventory** (236 cards, or per-cluster B200 216 / H100 20). `active_gpu_hours` left blank (second `GPU_UTIL` query not pulled).

### Direct answer — "are the 4 scripts resolved?"
| Script | Resolved? |
|---|---|
| `fact_duty_daily.py` | **Almost** — logic done; needs pandas + real dim_models + tz confirm to run |
| `fact_model_token_weekly.py` | **No** — aggregation bug (5-min→weekly) + pandas + dim_models |
| `fact_token_usage_monthly.py` | **No** — dim_applications join empty + pandas (logic otherwise OK) |
| `fact_workload_util.py` | **No** — aggregation bug + capacity hardcode + pandas |

### Suggested order to finish them
1. Decide pandas vs stdlib (install pandas = fastest; all 4 scripts then runnable).
2. Repoint scripts' dim joins to `RAW_DATA/dim_models_rebuilt.csv` (or swap into `data/`).
3. Confirm Grafana export timezone (one question) → fixes duty filter.
4. Fix the two aggregation bugs (`fact_model_token_weekly`, `fact_workload_util`).
5. Rebuild `dim_applications` from real teams (§I) → unblocks `fact_token_usage_monthly`.
6. Fix `fact_workload_util` capacity to real inventory.

---

## N-update. ETL scripts fixed & run (2026-06-26, later)

All 4 ETL scripts now **execute successfully** (`.venv/bin/python RAW_DATA/<script>.py` from repo root) and write staging `RAW_DATA/*_real.csv`.

**Fixes applied:**
- **pandas** installed in `.venv` (gitignored). pandas 3.0.3.
- **Timezone** — confirmed Grafana exports in browser local = **Malaysia UTC+08 (= SGT)**. Duty script now `tz_localize('Asia/Singapore')` (was wrongly `utc=True` + convert). Verified: ~108 business-hour buckets/day (9h×12) → filter correct.
- **Paths** — all scripts read `RAW_DATA/<in>.csv`, join `RAW_DATA/dim_models_rebuilt.csv` (real, TODO rows dropped), write `RAW_DATA/<name>_real.csv` (staging — does NOT touch live `data/`).
- **Aggregation bugs fixed** — `fact_model_token_weekly` now sums 5-min increments → weekly per model; `fact_workload_util` aggregates 1343 samples → weekly card-hours (mean daily ×7), capacity = 236×168.

**Run results (5-day smoke test, Jun 15–19):**
- `fact_duty_daily_real.csv` — 22 models, ~108 buckets/day. ✅
- `fact_model_token_weekly_real.csv` — 22 models, fleet ≈ 35,525 M tokens/period (glm5-1 dominates @ 21,620 M). ✅
- `fact_workload_util_real.csv` — 1 weekly row, allocated 7,282 / capacity 39,648 → **18.4% util** (see caveat). ✅
- `fact_token_usage_monthly_real.csv` — **empty**: 128,833 rows after model join, but 0 after app join (35 real teams, none match simulated `dim_applications`). Confirms §I blocker. ✅ (runs, no crash)

**Remaining caveats (not script bugs):**
1. **`fact_token_usage_monthly` empty** — blocked on `dim_applications` rebuild from real teams (§I). 35 distinct real team_alias captured.
2. **gptoss-120b dual-cluster duplication** — the LiteLLM duty/token metric has `model="gptoss-120b"` with no cluster label, so the inner join to the 2 dim rows (@B200, @H100) **duplicates** its duty/tokens onto both. Need a split rule (attribute to primary cluster, or split by card share 12:1). Affects only models running on both clusters (currently just gptoss).
3. **`fact_workload_util` accuracy** — the raw query had **no `modelName` filter** (sums ALL DCGM GPUs incl. L40) and uses a rolling `[1d:1m]` window, so early samples undercount → avg 43 cards loaded vs 127 in the snapshot. Re-pull with `modelName=~"NVIDIA B200|NVIDIA H100.*"` and a clean window for an accurate number.
4. **input_tokens_m** blank everywhere — only output token queries were pulled.
5. Outputs are **staging** (`_real.csv`); the swap into `data/` (with real `dim_clusters`, `other` pseudo-model, rollup.js/index.html changes) is still the separate later stage (status #6).

**To run the ETL:**  `.venv/bin/python RAW_DATA/fact_duty_daily.py`  (and the other 3).
