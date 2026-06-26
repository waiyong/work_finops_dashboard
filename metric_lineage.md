# Metric Lineage — Source → Intermediate → Final

> **Purpose.** Prove that **every number shown in the dashboard can be traced to an actual source metric** (or is an explicit admin input / simulated value). This is the *visualisation-first* companion to [`schema.md`](schema.md) (which is *table-first*). Read this when you ask "where does this figure on screen actually come from?"

---

## 1. The three layers

```
  RAW (source metrics)            INTERMEDIATE (contract)        FINAL (render)
  Prometheus scrapes              data/*.csv                     rollup.js globals → index.html
  LiteLLM · vLLM · DCGM · Slurm   (the ERD tables)               (the on-screen numbers)

  ──── external ETL pipelines ────►  ──── this dashboard (rollup.js, in-browser) ────►
        (raw → intermediate)               (intermediate → final)
```

| Layer | What it is | Where | Owner |
|---|---|---|---|
| **Raw** | Source Prometheus metrics (counters/gauges) | `litellm_prometheus_metrics.md`, `vllm_metrics.md`, `DCGM_metrics.md`, `Slurm_metrics.md` | **External ETL** (custom pipelines, outside this repo) |
| **Intermediate** | Normalised CSV contract (the ERD) | `data/*.csv` | External ETL **writes**, dashboard **reads** |
| **Final** | `window.*` globals → rendered figures | `rollup.js` → `index.html` | **This dashboard** (in-browser rollup) |

**Division of labour:** the heavy *raw → intermediate* work (reset-aware counter diffs, business-hours bucketing, GPU-hour integration, org/team attribution) happens **upstream** in the external ETL. The dashboard only does the light *intermediate → final* aggregation. Swap in real `data/*.csv` (same columns) and nothing in `rollup.js`/`index.html` changes.

### Status legend
- ✅ **Metric-traceable** — the figure derives from a named source metric.
- 🧾 **Admin input** — a governance/config value the dashboard admin sets by hand; **no metric** (by design).
- ⚠ **Simulated / no clean source yet** — no authoritative metric exists today; value is placeholder until the source lands.

---

## 2. Quick layer reference

**Raw — the source metrics that matter (exact registered names):**

| Concept | Metric | Type | Key labels / identity |
|---|---|---|---|
| Output / input tokens | `litellm_output_tokens_metric` · `litellm_input_tokens_metric` | counter | `org_id, org_alias, team, team_alias, model, requested_model, end_user, api_key_alias` |
| Request counts | `litellm_proxy_total_requests_metric` | counter | `team, team_alias, status_code, route, model_id` (+ `org_*`) |
| Duty (requests running) | `vllm:num_requests_running` | gauge | `model_name`, `ray_model_name` (**confirmed native labels** — verified in Grafana; use `model_name` as the stable ETL key; `ray_model_name` is the Ray serving alias for the same value) |
| GPU utilisation | `DCGM_FI_DEV_GPU_UTIL` | gauge | `gpu, Hostname, UUID, device, modelName, DCGM_FI_DRIVER_VERSION` (**confirmed in Grafana**); time-averaged over DCGM's ~1s sample period — not instantaneous; use `avg_over_time()` over weekly/monthly windows for Viz 2 |
| Card loaded/idle | `DCGM_FI_DEV_FB_USED` (>~1 GiB ⇒ loaded) | gauge | `gpu, Hostname` + K8s placement for the model |
| Training GPU alloc | `slurm_account_jobs_gpus_alloc` (per-account); `slurm_user_jobs_gpus_alloc` (fallback) | gauge | `account` (→ org) / `username` |
| Training capacity | `slurm_node_gpus` · `slurm_node_gpus_alloc` · `slurm_partition_gpus` | gauge | `node, partition` |

> Counters surface as `…_total` in the raw `/metrics` exposition; the names above are the registered names. `org_id`/`org_alias` are appended dynamically by LiteLLM for token/request metrics (see `litellm_team_hierarchy.md`). `vllm:num_requests_running` carries `model_name` natively (confirmed) — the earlier assumption that model identity required the per-pod scrape target is a fallback only; use `model_name` label directly in the ETL.

**Intermediate — the contract CSVs** (see `schema.md` §8 for full column dictionary): `dim_clusters`, `dim_models`, `dim_organizations`, `dim_applications`, `dim_gpu_pricing`, `fact_card_snapshot`, `fact_duty_daily`, `fact_token_usage_monthly`, `fact_model_token_weekly`, `fact_workload_util`, `fact_training_gpu_hours_monthly`, `fact_model_pricing`.

**Final — policy constants** (in `rollup.js`, not from data): `DUTY_TARGET=80`, `LOADED_TARGET=90`, `KPI_MARGIN=5`, `UTIL_TARGET=85` — all 🧾 admin policy.

---

## 3. Per-visualisation lineage

Each row: **on-screen figure → Final (global.field) → Intermediate (csv.column) → Raw (metric) → raw→intermediate derivation**.

### KPI row (`renderKPIs`)

| Figure | Final | Intermediate | Raw | Derivation | |
|---|---|---|---|---|---|
| **GPU Utilization %** | `KPI[env].duty` = `Σ(duty×cards)/Σcards` | `fact_duty_daily.{active_buckets,total_buckets}` + `fact_card_snapshot.model_uid` | `vllm:num_requests_running` | per-model duty = active÷total biz-hour 5-min buckets; card-weighted across the env | ✅ |
| GPU Utilization sub "target 80%" | `DUTY_TARGET` | — | — | policy constant | 🧾 |
| **GPUs Loaded %** | `KPI[env].loaded` = `csum/total` | `fact_card_snapshot.model_uid` (loaded count) ÷ `dim_clusters.total_cards` | `DCGM_FI_DEV_FB_USED` + K8s placement | count cards with a model resident ÷ cluster total | ✅ (count) · 🧾 (total) |
| Loaded sub "44 / 50 · target 90%" | `csum`,`total`,`LOADED_TARGET` | `fact_card_snapshot`, `dim_clusters.total_cards` | (as above) | — | 🧾 (target) |
| **Monthly Tokens (output)** | `OUTPUT_FLEET[last]` | `fact_token_usage_monthly.output_tokens_m` | `litellm_output_tokens_metric` | Σ output tokens over the latest month | ✅ |
| MoM % + "vs N M <month>" | `OUTPUT_FLEET[last]`,`[last-1]` | `fact_token_usage_monthly.{month,output_tokens_m}` | `litellm_output_tokens_metric` | month-over-month delta | ✅ |

### Viz 1 — GPU Utilization, Top-5 Models (`renderDuty`)

| Figure | Final | Intermediate | Raw | Derivation | |
|---|---|---|---|---|---|
| **Bars: per-model duty %** | `MODELS[].duty` (top-5 by duty) | `fact_duty_daily.{active_buckets,total_buckets}` | `vllm:num_requests_running` | active÷total biz-hour buckets per model (model = scrape target) | ✅ |
| Bar labels (model names) | `MODELS[].name` | `dim_models.name` | — | reference | 🧾 |
| **Fleet GPU-weighted avg** | `Σ(duty×cards)/Σcards` | `fact_duty_daily` + `fact_card_snapshot` | `vllm:num_requests_running` (+card counts) | card-weighted mean across all models | ✅ |
| 80% target line; amber if <80 | `DUTY_TARGET` | — | — | policy | 🧾 |

### Viz 3a — GPUs with Models Loaded: donut + cluster rows (`renderDonut`)

| Figure | Final | Intermediate | Raw | Derivation | |
|---|---|---|---|---|---|
| **Donut: loaded per cluster** | `Σ MODELS.cards` by cluster | `fact_card_snapshot.{cluster_id,model_uid}` | `DCGM_FI_DEV_FB_USED` + K8s placement | count cards with a model resident, per cluster | ✅ |
| Donut: idle segment | `total − loaded` | `dim_clusters.total_cards` − loaded | (as above) | remainder of the cluster | ✅ / 🧾 (total) |
| Centre % + "44 / 50 loaded" | loaded ÷ total | `fact_card_snapshot`, `dim_clusters.total_cards` | (as above) | ratio | ✅ |
| Cluster rows (28/32, 16/18) | per-cluster loaded ÷ total; amber if `<LOADED_TARGET` | same | (as above) | per-cluster ratio | ✅ |

### Bridge caption (`renderNarrative`)

| Figure | Final | Intermediate | Raw | | |
|---|---|---|---|---|---|
| "**X%** loaded but only **Y%** serving" | loaded% (cards/total) · duty% (`Σ(duty×cards)/Σcards`) | `fact_card_snapshot` + `dim_clusters` · `fact_duty_daily` | `DCGM_FI_DEV_FB_USED` · `vllm:num_requests_running` | reuses the two figures above | ✅ |

### Viz 3b — GPU Card Allocation Map (`buildGrid`, `buildLegend`)

| Figure | Final | Intermediate | Raw | Derivation | |
|---|---|---|---|---|---|
| **Each card cell → model** | `MODELS[].cards` per model | `fact_card_snapshot.{cluster_id,card_slot,model_uid}` | `DCGM_FI_DEV_FB_USED` + K8s pod→GPU placement | one row per physical card; model = the pod on that GPU | ✅ |
| Cell colour | `MODELS[].color` | `dim_models.color_hex` | — | reference | 🧾 |
| Idle cells (4 B200, 2 H100) | `total − loaded` | `dim_clusters.total_cards` − loaded | `FB_USED` below baseline | unoccupied slots | ✅ |
| Hover: memory 192/80 GB | — | `dim_clusters.card_memory_gb` | — | reference | 🧾 |
| Model→GPU **identity** join | — | `fact_card_snapshot` | K8s API ⨝ DCGM on `(Hostname, gpu)` | ⚠ requires the K8s↔DCGM join; not a single metric | ⚠ |

### Viz 2 — Utilization by Workload (`renderSplit`)

| Figure | Final | Intermediate | Raw | Derivation | |
|---|---|---|---|---|---|
| **Inference % / GPU-hrs** | `SPLIT.inference[]`, `SPLIT_HOURS.inference[]` | `fact_workload_util.{allocated_gpu_hours,capacity_gpu_hours}` (workload=inference) | `DCGM_FI_DEV_FB_USED` + K8s ns/label tag | Σ(loaded card-fraction)×hours ÷ capacity | ✅ |
| **Training % / GPU-hrs** | `SPLIT.training[]` | `fact_workload_util` (workload=training) | `slurm_account_jobs_gpus_alloc` | ∫ allocation gauge × hours ÷ capacity | ✅ |
| **Batch % / GPU-hrs** | `SPLIT.batch[]` | `fact_workload_util` (workload=batch) | — | no batch/workload-type metric in vLLM yet | ⚠ |
| Idle band | `SPLIT.idle[]` | `capacity − Σ allocated` | (as above) | remainder of capacity | ✅ |
| Capacity (denominator) | `SPLIT_HOURS.capacity[]` | `fact_workload_util.capacity_gpu_hours` | `slurm_node_gpus` + `dim_clusters.total_cards` | total cards × 168 h/week | ✅ / 🧾 |
| **Farm-util headline (now/start %)** | `FARM_UTIL.now`,`.start` | `fact_workload_util.allocated_gpu_hours` | DCGM + Slurm (above) | Σ allocations ÷ capacity, latest vs first week | ✅ (batch part ⚠) |
| Target 85% line | `FARM_UTIL.target` = `UTIL_TARGET` | — | — | policy | 🧾 |
| **DCGM intensity footnote (~%)** | `FARM_UTIL.intensity` = active÷allocated | `fact_workload_util.active_gpu_hours` ÷ `allocated_gpu_hours` | `DCGM_FI_DEV_GPU_UTIL` | active = ∫(GPU_UTIL/100)dt | ✅ |

### Viz 6 — Token Output by Model (`renderModelTokens`)

| Figure | Final | Intermediate | Raw | Derivation | |
|---|---|---|---|---|---|
| **Per-model weekly area** | `MODEL_TOKENS[name][]` | `fact_model_token_weekly.{week_start,model_uid,output_tokens_m}` | `litellm_output_tokens_metric` | Σ output tokens per model per ISO week | ✅ |
| Series colour | `MODELS[].color` | `dim_models.color_hex` | — | reference | 🧾 |
| Week labels | `WEEKS[]` | `fact_model_token_weekly.week_start` | — | distinct weeks | ✅ |
| Tooltip fleet total | Σ over models | (as above) | `litellm_output_tokens_metric` | per-week sum | ✅ |

### Viz 4 — Compute Usage & Cost by Organisation (`renderComputeEntry` / `renderInferenceTable` / `renderTrainingByOrg`)

| Figure | Final | Intermediate | Raw | Derivation | |
|---|---|---|---|---|---|
| **Entry: Inference GPU-hrs** | `COMPUTE_SPLIT.inferenceHours` | `fact_workload_util.allocated_gpu_hours` (latest-month inference weeks) | `DCGM_FI_DEV_FB_USED` + K8s | Σ inference allocation | ✅ |
| **Entry: Training GPU-hrs** | `COMPUTE_SPLIT.trainingHours` | `fact_training_gpu_hours_monthly.gpu_hours` | `slurm_account_jobs_gpus_alloc` | Σ training GPU-hours | ✅ |
| **Inference drill — tokens** (org→app→model) | `INFERENCE_TREE[...].tokens` | `fact_token_usage_monthly.{app_id,model_uid,output_tokens_m}` (latest month) | `litellm_output_tokens_metric` | group by `org_alias→team_alias→model`; roll up | ✅ |
| Inference drill — **cost** | `INFERENCE_TREE[...].cost` = tokens × rate | `fact_token_usage_monthly.output_tokens_m` × `dim_models.internal_cost_per_m_usd` | `litellm_output_tokens_metric` (tokens only) | tokens metric × **admin rate** | ✅ tokens · 🧾 rate |
| Org / app names | `.org` / `.apps[].name` | `dim_organizations.org_name` / `dim_applications.app_name` | `org_alias` / `team_alias` labels | reference; LiteLLM labels confirm identity | 🧾 / ✅ |
| **Training drill — GPU-hrs by org** | `TRAINING_BY_ORG[].gpuHours` | `fact_training_gpu_hours_monthly.{org_id,gpu_hours}` | `slurm_account_jobs_gpus_alloc` | ∫ alloc by `account→org` | ✅ |
| Training drill — **cost** | `TRAINING_BY_ORG[].cost` = hrs × rate | `gpu_hours` × `dim_gpu_pricing.usd_per_gpu_hour` | Slurm (hrs only) | GPU-hrs × **admin rate** | ✅ hrs · 🧾 rate |

### Viz 5 — Cost per Million Tokens vs Open-Model Hosts (`renderCost`)

| Figure | Final | Intermediate | Raw | | |
|---|---|---|---|---|---|
| **Internal column ($/1M)** | `COSTS[].prices['Internal (self-hosted)']` | `dim_models.internal_cost_per_m_usd` | — | admin governance rate | 🧾 |
| **External host columns** | `COSTS[].prices[provider]` | `fact_model_pricing.output_usd_per_m` | — | admin-filled price sheet | 🧾 |
| Which 5 models (rows) | top-5 by token volume | `fact_model_token_weekly.output_tokens_m` | `litellm_output_tokens_metric` | rank by total tokens | ✅ |
| Cheapest-cell highlight | `min(prices)` per row | (above) | — | computed | 🧾 |
| **Savings headline %** | `COST_SAVINGS` (token-weighted) | rates above × token weights | `litellm_output_tokens_metric` (weights) | Σ((ext−int)/ext × tok)/Σtok | 🧾 rates · ✅ weights |

---

## 4. Non-metric inputs (🧾 admin-provided — by design)

These figures are **deliberately not derived from any metric**; the dashboard admin maintains them. They are real inputs, just governance/config rather than observability.

| Input | Intermediate (where the admin edits) | Drives |
|---|---|---|
| Internal token cost $/1M | `dim_models.internal_cost_per_m_usd` | Viz 4 inference cost, Viz 5 Internal column |
| Internal training rate $/GPU-hr | `dim_gpu_pricing.usd_per_gpu_hour` | Viz 4 training cost |
| External host prices | `fact_model_pricing.output_usd_per_m` | Viz 5 external columns + savings |
| Cluster inventory & memory | `dim_clusters.{total_cards,card_memory_gb}` | Loaded %, donut/idle, card-map memory |
| Model / org / app names & colours | `dim_models.color_hex`, `dim_organizations.*`, `dim_applications.*` | labels & colours throughout |
| Policy targets | `rollup.js`: `DUTY_TARGET 80`, `LOADED_TARGET 90`, `UTIL_TARGET 85`, `KPI_MARGIN 5` | target lines, amber thresholds |

> The org/app **identity** (not the display name) *is* metric-backed — `dim_organizations.org_id`/`dim_applications.team_id` mirror the `org_id`/`team` labels LiteLLM emits (see `schema.md` §2 + `litellm_team_hierarchy.md`). The CSV supplies the human-readable label & colour only.

---

## 5. Simulated / no clean source yet (⚠)

Honest gaps — figures that **cannot yet be traced to an authoritative metric**:

| Concept | Why no source today | What unblocks it |
|---|---|---|
| **Batch workload** (Viz 2 batch row) | vLLM has no per-batch / workload-type dimension; Batch Inference Service not shipped | the Batch service emitting a `workload=batch` tag on its pods |
| **Model→GPU identity** (Viz 3b) | DCGM is GPU-level, vLLM is engine-level — neither carries the other's key | the K8s API join (`kube_pod_info` ⨝ DCGM on `Hostname, gpu`) in the ETL |
| **Training rows** (Viz 2 training, Viz 4 training) | depends on the Slurm exporter being scraped into `fact_workload_util` / `fact_training_gpu_hours_monthly` | wiring the Slurm exporter (design done — `schema.md` §3 Source E) + confirming `account`→org naming |
| **`input_tokens_m`** (carried, unused) | the Input/Output toggle was removed; only output is rendered | a future visual that consumes input tokens |

---

## 6. See also

- **`schema.md`** — the table-first view: ERD (§2), source-metric catalog (§3), the moderate-grain contract (§5), full column dictionary (§8), and the PromQL/SQL rollup reference (§9).
- **Source catalogs** — `litellm_prometheus_metrics.md`, `vllm_metrics.md`, `DCGM_metrics.md`, `Slurm_metrics.md`.
- **`litellm_team_hierarchy.md`** — proof that org/team attribution is native to LiteLLM labels.
