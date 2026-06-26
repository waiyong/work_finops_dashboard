/* =============================================================================
 * rollup.js — loads the normalized CSV dataset from data/ and rolls it up into
 * the globals index.html renders. REPLACES the old hand-authored data.js.
 * =============================================================================
 *
 * Pipeline shape (see schema.md):
 *   data/*.csv  (normalized, moderate-grain — the integration contract)
 *        │  fetch + parse + aggregate, here, in the browser
 *        ▼
 *   window globals: MODELS, CLUSTER_TOTAL, KPI, MONTHS, OUTPUT_FLEET,
 *   ORGS, ORG_COLOR, INFERENCE_TREE, TRAINING_BY_ORG, COMPUTE_SPLIT,
 *   SPLIT (+idle), SPLIT_HOURS, SPLIT_ACTIVE, WORKLOAD_WEEKS, FARM_UTIL,
 *   COSTS, PRICING_PROVIDERS, COST_SAVINGS, WEEKS, MODEL_TOKENS   + DATA_READY
 *
 * To swap in real data: replace the CSVs in data/ (same columns) — no code change.
 * The heavy raw→moderate work (bucketing duty, diffing token counters) happens
 * UPSTREAM; this file only does the light final aggregation.
 *
 * Nothing is hand-typed: every dashboard number is computed from these CSVs.
 * Must be served over HTTP (fetch can't read file://) — see RUN_DASHBOARD.md.
 * ============================================================================ */

/* Policy thresholds — config, not pipeline facts. */
const DUTY_TARGET   = 80;   // %
const LOADED_TARGET = 90;   // %
const KPI_MARGIN    = 5;    // percentage points counted as "slightly below"
const UTIL_TARGET   = 85;   // % farm GPU-hour utilization target (Viz 2 headline)

(function(){
  const FILES = ['dim_clusters','dim_models','dim_organizations','dim_applications','dim_gpu_pricing',
    'fact_card_snapshot','fact_duty_daily','fact_workload_util',
    'fact_token_usage_monthly','fact_model_token_weekly','fact_model_pricing',
    'fact_training_gpu_hours_monthly'];

  /* Data source: default = the tracked simulated mock (data/). `?data=real` loads
     the gitignored local real dataset (data_real/) — keeps real/confidential data
     out of git while reusing the exact same renderers. */
  const DATA_DIR = (new URLSearchParams(location.search).get('data') === 'real') ? 'data_real/' : 'data/';

  /* Minimal CSV parser. CSVs are kept comma/quote-free by design. */
  function parseCSV(text){
    const lines = text.replace(/\r/g,'').trim().split('\n');
    const head = lines[0].split(',');
    return lines.slice(1).map(line=>{
      const cells = line.split(',');
      const row = {};
      head.forEach((h,i)=> row[h.trim()] = (cells[i]!==undefined ? cells[i].trim() : ''));
      return row;
    });
  }

  window.DATA_READY = Promise.all(FILES.map(f =>
    fetch(DATA_DIR+f+'.csv').then(r=>{
      if(!r.ok) throw new Error('Failed to load '+DATA_DIR+f+'.csv ('+r.status+')');
      return r.text();
    }).then(parseCSV)
  )).then(parts => build.apply(null, parts));

  function build(clusters, models, orgs, apps, gpuPricing, cards, dutyDaily, workload, tokMonthly, tokWeekly, pricing, training){
    const round1 = v => Math.round(v*10)/10;

    /* ---- dimensions ---- */
    const CLUSTER_TOTAL = {}, CLUSTER_MEM = {};
    clusters.forEach(c => { CLUSTER_TOTAL[c.cluster_id] = +c.total_cards; CLUSTER_MEM[c.cluster_id] = +c.card_memory_gb; });

    const modelByUid = {};
    models.forEach(m => modelByUid[m.model_uid] = m);

    /* ---- cards per model + loaded counts (fact_card_snapshot) ---- */
    const cardsByUid = {};
    cards.forEach(r => { if(r.model_uid) cardsByUid[r.model_uid] = (cardsByUid[r.model_uid]||0) + 1; });

    /* ---- duty per model: Σactive / Σtotal over the window (fact_duty_daily) ---- */
    const dutyA = {}, dutyT = {};
    dutyDaily.forEach(r => {
      dutyA[r.model_uid] = (dutyA[r.model_uid]||0) + (+r.active_buckets);
      dutyT[r.model_uid] = (dutyT[r.model_uid]||0) + (+r.total_buckets);
    });
    const dutyByUid = {};
    Object.keys(dutyT).forEach(u => dutyByUid[u] = Math.round(100 * dutyA[u] / dutyT[u]));

    /* ---- MODELS[] (preserve dim_models order) ---- */
    const MODELS = models.map(m => ({
      name:    m.name,
      cluster: m.cluster_id,
      cards:   cardsByUid[m.model_uid] || 0,
      duty:    dutyByUid[m.model_uid] || 0,
      color:   m.color_hex,
    }));

    /* ---- weekly tokens by model → MODEL_TOKENS, WEEKS (fact_model_token_weekly) ---- */
    const WEEKS = [];
    tokWeekly.forEach(r => { if(WEEKS.indexOf(r.week_start) === -1) WEEKS.push(r.week_start); });
    const wIdx = {}; WEEKS.forEach((w,i)=> wIdx[w] = i);
    const MODEL_TOKENS = {};
    MODELS.forEach(m => MODEL_TOKENS[m.name] = new Array(WEEKS.length).fill(0));
    tokWeekly.forEach(r => {
      const m = modelByUid[r.model_uid];
      if(m) MODEL_TOKENS[m.name][wIdx[r.week_start]] += (+r.output_tokens_m);
    });
    Object.keys(MODEL_TOKENS).forEach(k => MODEL_TOKENS[k] = MODEL_TOKENS[k].map(round1));
    const modelTok = {};   // total tokens per model_uid (for cost ranking/weighting)
    MODELS.forEach(m => modelTok[m.name + '@' + m.cluster] = MODEL_TOKENS[m.name].reduce((a,b)=>a+b,0));

    /* ---- organizations → ORGS, ORG_COLOR ---- */
    const orgSorted = orgs.slice().sort((a,b)=> (+a.display_order) - (+b.display_order));
    const ORGS = orgSorted.map(o => o.org_name);
    const ORG_COLOR = {}; orgSorted.forEach(o => ORG_COLOR[o.org_name] = o.color_hex);
    const orgNameById = {}; orgSorted.forEach(o => orgNameById[o.org_id] = o.org_name);

    /* ---- applications → app_id → {name, org} ---- */
    const appInfo = {};
    apps.forEach(a => appInfo[a.app_id] = { name: a.app_name, org: orgNameById[a.org_id] });

    /* ---- lookups for cost: internal $/1M by model name, $/GPU-hr by gpu_type ---- */
    const internalByName = {};
    models.forEach(m => internalByName[m.name] = +m.internal_cost_per_m_usd);
    const gpuRate = {};
    gpuPricing.forEach(r => gpuRate[r.gpu_type] = +r.usd_per_gpu_hour);

    /* ---- monthly tokens → MONTHS + fleet output series (Tokens KPI) ---- */
    const MONTHS = [];
    tokMonthly.forEach(r => { if(MONTHS.indexOf(r.month) === -1) MONTHS.push(r.month); });
    const mIdx = {}; MONTHS.forEach((m,i)=> mIdx[m] = i);
    const OUTPUT_FLEET = new Array(MONTHS.length).fill(0);
    tokMonthly.forEach(r => { OUTPUT_FLEET[mIdx[r.month]] += (+r.output_tokens_m); });
    const OUTPUT_FLEET_R = OUTPUT_FLEET.map(v => Math.round(v));
    const last = MONTHS[MONTHS.length - 1];

    /* ---- INFERENCE_TREE: latest-month Org → App → Model with tokens + internal cost ----
     * cost ($) = output_tokens_m × internal_$/1M ; parents roll up Σ children.            */
    const tmp = {};
    tokMonthly.filter(r => r.month === last).forEach(r => {
      const ai = appInfo[r.app_id]; if(!ai) return;
      const m = modelByUid[r.model_uid]; const mn = m ? m.name : r.model_uid;
      const tok = +r.output_tokens_m, cost = tok * (internalByName[mn] || 0);
      ((tmp[ai.org] = tmp[ai.org] || {})[ai.name] = tmp[ai.org][ai.name] || {});
      const leaf = tmp[ai.org][ai.name][mn] = tmp[ai.org][ai.name][mn] || { tokens:0, cost:0 };
      leaf.tokens += tok; leaf.cost += cost;
    });
    const sum = arr => arr.reduce((a,x)=>({t:a.t+x.tokens, c:a.c+x.cost}), {t:0,c:0});
    const INFERENCE_TREE = ORGS.filter(o=>tmp[o]).map(org => {
      const appsA = Object.keys(tmp[org]).map(app => {
        const modelsA = Object.keys(tmp[org][app]).map(mn => ({
          name:mn, tokens:+tmp[org][app][mn].tokens.toFixed(1), cost:+tmp[org][app][mn].cost.toFixed(2)
        })).sort((a,b)=> b.tokens - a.tokens);
        const s = sum(modelsA);
        return { name:app, tokens:+s.t.toFixed(1), cost:+s.c.toFixed(2), models:modelsA };
      }).sort((a,b)=> b.tokens - a.tokens);
      const s = sum(appsA);
      return { org, color:ORG_COLOR[org], tokens:+s.t.toFixed(1), cost:+s.c.toFixed(2), apps:appsA };
    }).sort((a,b)=> b.tokens - a.tokens);

    /* ---- TRAINING_BY_ORG: latest-month org → GPU-hours + cost (hours × $/GPU-hr) ---- */
    const trainTmp = {};
    training.filter(r => r.month === last).forEach(r => {
      const org = orgNameById[r.org_id]; if(!org) return;
      const hrs = +r.gpu_hours, cost = hrs * (gpuRate[r.gpu_type] || 0);
      (trainTmp[org] = trainTmp[org] || { hrs:0, cost:0 });
      trainTmp[org].hrs += hrs; trainTmp[org].cost += cost;
    });
    const TRAINING_BY_ORG = ORGS.filter(o=>trainTmp[o]).map(org => ({
      org, color:ORG_COLOR[org], gpuHours:Math.round(trainTmp[org].hrs), cost:Math.round(trainTmp[org].cost)
    })).sort((a,b)=> b.gpuHours - a.gpuHours);

    /* ---- COMPUTE_SPLIT: latest-month GPU-hours, Inference vs Training (the entry) ---- */
    let infHrs = 0;
    workload.forEach(r => {
      if(r.workload_type === 'inference' && r.week_start.indexOf(last + ' ') === 0) infHrs += (+r.allocated_gpu_hours);
    });
    const trainHrs = TRAINING_BY_ORG.reduce((s,o)=> s + o.gpuHours, 0);
    const COMPUTE_SPLIT = { month:last, inferenceHours:Math.round(infHrs), trainingHours:trainHrs };

    /* ---- Workload GPU-hours → SPLIT (% of farm capacity + idle), weekly ----
     * GPU-hours are DERIVED card-time (K8s/Slurm allocation; DCGM util for the
     * 'active' efficiency view) — see schema.md §"GPU-hours is DERIVED".        */
    const WORKLOAD_WEEKS = [];
    workload.forEach(r => { if(WORKLOAD_WEEKS.indexOf(r.week_start) === -1) WORKLOAD_WEEKS.push(r.week_start); });
    const SPLIT = { inference:[], training:[], batch:[], idle:[] };          // % of capacity
    const SPLIT_HOURS = { inference:[], training:[], batch:[], capacity:[] };// allocated GPU-hrs
    const SPLIT_ACTIVE = { inference:[], training:[], batch:[] };            // active (DCGM-weighted) GPU-hrs
    WORKLOAD_WEEKS.forEach((wk, wi) => {
      let cap = 0, used = 0;
      ['inference','training','batch'].forEach(w => {
        const row = workload.find(r => r.week_start === wk && r.workload_type === w);
        const alloc = row ? +row.allocated_gpu_hours : 0;
        const active = row ? +row.active_gpu_hours : 0;
        if(row) cap = +row.capacity_gpu_hours;
        SPLIT_HOURS[w][wi] = alloc; SPLIT_ACTIVE[w][wi] = active;
        used += alloc;
      });
      ['inference','training','batch'].forEach(w => {
        SPLIT[w][wi] = cap ? Math.round(SPLIT_HOURS[w][wi] / cap * 1000) / 10 : 0;
      });
      SPLIT_HOURS.capacity[wi] = cap;
      SPLIT.idle[wi] = cap ? Math.round((cap - used) / cap * 1000) / 10 : 0;
    });
    const farmUtil = i => +(SPLIT.inference[i] + SPLIT.training[i] + SPLIT.batch[i]).toFixed(0);
    const lastW = WORKLOAD_WEEKS.length - 1;
    const actSum = SPLIT_ACTIVE.inference[lastW] + SPLIT_ACTIVE.training[lastW] + SPLIT_ACTIVE.batch[lastW];
    const allSum = SPLIT_HOURS.inference[lastW] + SPLIT_HOURS.training[lastW] + SPLIT_HOURS.batch[lastW];
    const FARM_UTIL = {
      start: farmUtil(0), now: farmUtil(lastW), target: UTIL_TARGET,
      intensity: allSum ? Math.round(actSum / allSum * 100) : 0,   // active ÷ allocated (DCGM efficiency)
    };

    /* ---- COSTS: a per-model × provider price table (Viz 5) ----
     * Internal $/1M is the SINGLE SOURCE in dim_models.internal_cost_per_m_usd
     * (same number Viz 4 uses). data/fact_model_pricing.csv holds only the
     * EXTERNAL host prices (any "Internal …" rows there are ignored). The
     * "Internal (self-hosted)" column is the savings baseline + highlighted.   */
    const tokByName = {};
    MODELS.forEach(m => tokByName[m.name] = (tokByName[m.name]||0) + (modelTok[m.name+'@'+m.cluster]||0));
    const INTERNAL_PROVIDER = 'Internal (self-hosted)';
    const isInternal = p => /internal/i.test(p);
    const externalProvs = [];
    const extPrice = {};
    pricing.forEach(r => {
      if(!r.provider || isInternal(r.provider)) return;        // internal comes from dim_models
      if(externalProvs.indexOf(r.provider) === -1) externalProvs.push(r.provider);
      (extPrice[r.model] = extPrice[r.model] || {});
      const v = r.output_usd_per_m;
      extPrice[r.model][r.provider] = (v === '' || v == null || isNaN(+v)) ? null : +v;
    });
    const PRICING_PROVIDERS = [INTERNAL_PROVIDER].concat(externalProvs);
    const COSTS = Object.keys(internalByName)                  // all models (internal from dim_models)
      .sort((a,b) => (tokByName[b]||0) - (tokByName[a]||0))
      .slice(0, 5)                                            // top-5 models by token volume
      .map(name => {
        const internal = isNaN(internalByName[name]) ? null : internalByName[name];
        const prices = { [INTERNAL_PROVIDER]: internal };
        externalProvs.forEach(p => prices[p] = ((extPrice[name]||{})[p] != null) ? extPrice[name][p] : null);
        const ext = externalProvs.map(p => prices[p]).filter(v => v != null);
        return { model:name, prices, internal,
                 cheapestExternal: ext.length ? Math.min.apply(null, ext) : null,
                 tok: tokByName[name] || 0 };
      });
    // token-weighted % that Internal is cheaper than each model's cheapest external host
    let _sn = 0, _sd = 0;
    COSTS.forEach(c => {
      if(c.internal != null && c.cheapestExternal != null && c.cheapestExternal > 0){
        _sn += ((c.cheapestExternal - c.internal) / c.cheapestExternal) * c.tok;
        _sd += c.tok;
      }
    });
    const COST_SAVINGS = _sd ? Math.round(_sn / _sd * 100) : null;   // null ⇒ headline hidden

    /* ---- KPI per environment (renderKPIs uses duty/dutySub/loaded/loadedSub) ---- */
    function pctStr(a,b){ const p = a/b*100; return (p%1===0 ? p : Math.round(p*10)/10) + '%'; }
    function envKPI(clusterFilter){
      const pool  = MODELS.filter(m => !clusterFilter || m.cluster === clusterFilter);
      // 'other' = utility workloads (embeddings/rerankers/…): count as LOADED but
      // exclude from the duty-weighted average (they carry no duty signal → would
      // drag the headline down with a fake 0%). No-op for the mock (no 'other').
      const dutyPool = pool.filter(m => m.name !== 'other');
      const wsum  = dutyPool.reduce((s,m)=> s + m.duty*m.cards, 0);
      const dcsum = dutyPool.reduce((s,m)=> s + m.cards, 0);   // duty denominator (excl. other)
      const csum  = pool.reduce((s,m)=> s + m.cards, 0);       // loaded cards (incl. other)
      const total = clusterFilter ? CLUSTER_TOTAL[clusterFilter] : (CLUSTER_TOTAL.B200 + CLUSTER_TOTAL.H100);
      return {
        duty:      (dcsum ? Math.round(wsum/dcsum) : 0) + '%',
        dutySub:   'target ' + DUTY_TARGET + '%',
        loaded:    pctStr(csum, total),
        loadedSub: csum + ' / ' + total + ' · target ' + LOADED_TARGET + '%',
      };
    }
    const KPI = { all: envKPI(null), superpod: envKPI('B200'), prod: envKPI('H100') };

    /* ---- expose globals ---- */
    window.CLUSTER_TOTAL = CLUSTER_TOTAL;
    window.CLUSTER_MEM   = CLUSTER_MEM;    // cluster_id → card_memory_gb (tooltip)
    window.MODELS        = MODELS;
    window.CARD_ROWS     = cards;          // raw per-card snapshot rows (model_uid, card_slot, models_on_card) — Viz 3b real placement + MIG hover
    window.WEEKS         = WEEKS;
    window.MODEL_TOKENS  = MODEL_TOKENS;
    window.MONTHS        = MONTHS;
    window.OUTPUT_FLEET  = OUTPUT_FLEET_R;          // monthly fleet output (M) for the Tokens KPI
    window.ORGS          = ORGS;
    window.ORG_COLOR     = ORG_COLOR;
    window.INFERENCE_TREE = INFERENCE_TREE;         // Org → App → Model (tokens + cost), latest month
    window.TRAINING_BY_ORG = TRAINING_BY_ORG;       // org → GPU-hours + cost, latest month
    window.COMPUTE_SPLIT = COMPUTE_SPLIT;           // {inferenceHours, trainingHours} entry
    window.SPLIT         = SPLIT;
    window.SPLIT_HOURS   = SPLIT_HOURS;
    window.SPLIT_ACTIVE  = SPLIT_ACTIVE;
    window.WORKLOAD_WEEKS= WORKLOAD_WEEKS;
    window.FARM_UTIL     = FARM_UTIL;
    window.COSTS         = COSTS;
    window.PRICING_PROVIDERS = PRICING_PROVIDERS;
    window.COST_SAVINGS  = COST_SAVINGS;
    window.KPI           = KPI;
  }
})();
