# Prompt: GPU Farm ROI Dashboard Mockup

Build a standalone HTML dashboard mockup using simulated data. This is a **senior management briefing tool** — the audience is directors and C-suite who need a 5–10 minute ROI narrative for the GPU Farm. The dashboard must be self-contained (single HTML file with embedded CSS/JS, or a small set of files). Use Chart.js or similar for charts.

---

## Business Context

We operate a GPU Farm with two environments:
- **SUPERPOD**: 8 inference nodes with NVIDIA B200 GPUs (192GB each)
- **PROD**: H100 GPUs (80GB each)
- **2 Training nodes** (separate, currently not monitored in the pipeline)

The farm serves multiple Home Team Departments (HTDs) — Police, SCDF, ICA, MHA, etc. — running LLM inference models (GPT-OSS, Qwen, Llama, GLM, etc.) via a LiteLLM proxy.

The dashboard answers: **"Are we over-provisioned?"** with five key visualizations.

---

## Visualization 1: GPU Duty Cycle — Top 5 Models

**Purpose**: Show which models are actually being used vs sitting idle.

**Definition of duty cycle**: The percentage of time over the last X days that a model had at least 1 running request. Formula: `100 × count(running > 0) / count(all non-null samples)`. This is a binary active/idle classification — a model is either serving a request or it isn't.

**Display**:
- A **horizontal bar chart** showing Top 5 models by duty cycle percentage
- Each bar shows the model name and its duty cycle %
- **Business-hours filter only** (Mon-Fri 09:00–18:00 SGT) — this is the default view. Do NOT show 24h all-hours duty cycle
- Include a **76% target line** (vertical dashed line) — this is the management benchmark for working-hours utilization
- Below the chart, show a single **fleet-level GPU-weighted average duty cycle** number: `SUM(duty_cycle_pct × gpu_count) / SUM(gpu_count)` across all models, not just top 5
- The 80% fleet-level target should be shown next to the actual

**Simulated data guidance**: Models should range from ~30% to ~85% duty cycle during business hours. The fleet average should be around 55–65%. Example model names: `gptoss-120b`, `qwen3-coder-next`, `llama4-scout-17b`, `glm-4.7-flash`, `deepseek-r1-70b`.

---

## Visualization 2: Training vs Inference Split

**Purpose**: Show the proportion of GPU resources allocated to training vs inference, month-on-month.

**Display**:
- A **stacked bar chart** (or stacked area chart) showing GPU allocation split over the last 6 months
- Y-axis: GPU count (or GPU-node equivalents)
- X-axis: Months (Jan 2026 – Jun 2026)
- Two segments: **Inference** (bottom, blue) and **Training** (top, orange)
- Current physical allocation: 8 inference nodes, 2 training nodes (80/20 split)
- Show annotation: "Kai Scheduler exploration underway" — indicating this split may become dynamic

**Simulated data guidance**: Start with 8 inference / 2 training in Jan, gradually shift to 7/3 by Jun as training workload increases. Total = 10 nodes always.

**Note**: Real data for this is NOT yet available. Checking with Wei Wen on piping Slurm node metrics in. DCGM Exporter has model and GPU ID information. Interns are building logic to extract model serving metrics from Kubernetes API. This visualization is aspirational — show it with simulated data and a "Data Source: Pending" badge.

---

## Visualization 3: % GPUs with Models Loaded

**Purpose**: Show how many of the physical GPUs in the farm actually have a model serving on them vs sitting idle.

**Definition**: `Count(distinct GPUs with non-empty model_name) / Total GPUs × 100`. A GPU with no model loaded is an idle resource — either unallocated or between deployments.

**Display**:
- A **gauge chart** or large donut chart showing the % loaded
- Target: **90%** — show this as a threshold on the gauge
- Break down by environment: show B200 cluster and H100 cluster separately
- Below the gauge, show the raw numbers: "X of Y GPUs loaded" per cluster

**Simulated data guidance**: B200 cluster: ~28 of 32 GPUs loaded (87.5%). H100 cluster: ~16 of 18 GPUs loaded (88.9%). Combined: ~44 of 50 (88%). Just under the 90% target to create a realistic "almost there" narrative.

**Data source note**: Currently comes from DCGM Exporter (has model + GPU ID) and Kubernetes API (interns building extraction logic). Show "Source: DCGM + K8s API" in small text.

---

## Visualization 4: Token Generation by HTD Monthly

**Purpose**: Show which Home Team Departments are consuming GPU resources, broken down by department, team, and model over months.

**Display**:
- A **stacked bar chart** showing total tokens generated per month for the last 6 months
- Each segment = one department (HTD)
- X-axis: Months (Jan 2026 – Jun 2026)
- Y-axis: Token count (in millions or billions — use appropriate units)
- On hover or click, drill down from department → team → model
- Show a **total tokens** KPI card at the top for the latest month

**Simulated data guidance**: 5–6 departments:
| Department | Monthly Tokens (Jun 2026) |
|---|---|
| Police | 120M |
| SCDF | 45M |
| ICA | 30M |
| MHA HQ | 25M |
| ILS / Other | 20M |

Show growth trend: total ~150M in Jan → ~240M in Jun (60% growth over 6 months).

**Data source note**: Pipeline currently produces team-level tokens from `prometheus.litellm_output_tokens_total.counter` with reset-aware deltas. Department mapping (team_alias → HTD) is NOT yet implemented — currently team_alias values like `aip-gitlab-ci-exempt` are not department names. A lookup table is needed. Show "HTD Mapping: In Progress" badge.

---

## Visualization 5: Cost per Million Tokens vs Public Cloud

**Purpose**: Show that self-hosting LLM inference is cheaper than using public cloud APIs.

**Display**:
- A **grouped bar chart** comparing internal cost vs public cloud cost per million tokens, per model
- Y-axis: Cost per million tokens (USD)
- X-axis: Model name
- Two bars per model: Internal (blue) vs Public Cloud equivalent (gray)
- Show savings percentage as a label on each pair
- Below the chart, show a single **total savings** KPI: "X% cheaper than public cloud"

**Simulated data guidance**:
| Model | Internal $/M tokens | Public $/M tokens | Public Equivalent | Savings |
|---|---|---|---|---|
| gptoss-120b | $0.80 | $2.50 | GPT-4o | 68% |
| qwen3-coder | $0.30 | $1.20 | Qwen 2.5 Coder | 75% |
| llama4-scout | $0.25 | $0.80 | Llama 3.1 70B | 69% |
| glm-4.7-flash | $0.15 | $0.60 | GLM-4 | 75% |
| deepseek-r1-70b | $0.40 | $1.50 | DeepSeek API | 73% |

**Data source note**: Internal cost model NOT yet defined (needs power rate + HW depreciation). Public cloud pricing is publicly available but changes frequently. Show "Cost Model: Preliminary" badge.

---

## Dashboard Layout

**Single page, scrollable. Layout from top to bottom:**

1. **Header**: "GPU Farm ROI Dashboard" + last updated timestamp + environment selector (All / SUPERPOD / PROD)
2. **KPI Row** (4 cards across the top):
   - Fleet Duty Cycle: XX% (target: 80%)
   - GPUs Loaded: XX% (target: 90%)
   - Monthly Tokens: XXXM (trending ↑)
   - Cost Savings vs Public: XX%
3. **Row 1**: GPU Duty Cycle Top 5 (left, ~60% width) + % GPUs Loaded gauge (right, ~40% width)
4. **Row 2**: Training vs Inference Split (left, ~50%) + Token Generation by HTD (right, ~50%)
5. **Row 3**: Cost per Million Tokens vs Public Cloud (full width)

**Styling**: Clean, corporate, dark theme preferred (like Grafana). Use consistent color palette. Each chart should have a title, subtitle with the metric definition, and a small data source badge.

---

## Technical Requirements

- **Self-contained**: Single HTML file with embedded CSS and JS, or minimal file set
- **Charts**: Use Chart.js (CDN) or similar
- **Data**: Hardcoded simulated data in JS arrays/objects — no external API calls
- **Responsive**: Should look good at 1920×1080 (primary) and 1366×768 (laptop)
- **No build step**: Open the HTML file in a browser and it works
- **Tooltips**: All charts should have hover tooltips showing exact values
- **Interactivity**: Environment filter (All/SUPERPOD/PROD) should filter the KPI cards and duty cycle chart

---

## Key Terminology

| Term | Definition |
|---|---|
| **Duty Cycle** | % of time a model had ≥1 running request. Binary active/idle. NOT "how busy the GPU is" — it's "was anyone asking for this model at all?" |
| **Business Hours** | Mon-Fri 09:00–18:00 SGT (= UTC 01:00–10:00). NOT UTC. |
| **HTD** | Home Team Department — organizational units in Ministry of Home Affairs (Police, SCDF, ICA, MHA HQ, ILS, etc.) |
| **SUPERPOD** | B200 GPU cluster — 8 inference nodes, primary compute |
| **PROD** | H100 GPU cluster — separate production environment |
| **gpu_count** | Pre-split by team share. A model with 8 GPUs used by 2 teams (60%/40%) shows gpu_count=4.8 and gpu_count=3.2. SUM across teams = 8. |
| **MBU** | Memory Bandwidth Utilization — self-conditioned (idle samples filtered out before averaging). Answers "when active, how saturated is the hardware?" |
| **Kai Scheduler** | Future dynamic GPU allocation system between Prod/Non-Prod — not yet fully explored |
| **LiteLLM** | Proxy routing team requests to models — source of team/token attribution data |