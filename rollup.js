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

/* Average GPU throughput — REPORTING PLACEHOLDER (estimated offline in Excel, admin-provided
   2026-07-15). Shown as a KPI card for now; swap for a telemetry-computed value when the
   methodology is finalized. This is the only place the figure lives — index.html reads the global. */
const AVG_GPU_THROUGHPUT_PCT = 1.1;   // %

/* Model-throughput band (hero). The interactivity SLA is the per-user output speed we promise;
   the ceiling is "every benchmarked model saturated while still holding this speed".
   60 tok/s is deliberate: it is the only target every benchmarked model can actually meet
   (phoenix at fp16 has a hard single-user ceiling near 80 tok/s/user). Raising it would drop
   models out entirely. See RAW_DATA/system_throughput/METHODOLOGY.md. */
const INTERACTIVITY_SLA = 60;                                  // tok/s per user

(function(){
  const FILES = ['dim_clusters','dim_models','dim_organizations','dim_applications','dim_gpu_pricing',
    'fact_card_snapshot','fact_duty_daily','fact_workload_util',
    'fact_token_usage_monthly','fact_model_token_weekly','fact_model_pricing',
    'fact_training_gpu_hours_monthly','fact_serving_curve'];

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
    fetch(DATA_DIR+f+'.csv?v=25').then(r=>{
      if(!r.ok) throw new Error('Failed to load '+DATA_DIR+f+'.csv ('+r.status+')');
      return r.text();
    }).then(parseCSV)
  )).then(parts => build.apply(null, parts));

  function build(clusters, models, orgs, apps, gpuPricing, cards, dutyDaily, workload, tokMonthly, tokWeekly, pricing, training, servingCurve){
    const round1 = v => Math.round(v*10)/10;
    /* Real adaptive view: the token facts are a short rolling window that may straddle
       two partial calendar months, so "latest month" is meaningless. Report the WHOLE
       window for the Tokens KPI + Viz 4 instead. Mock (data/) keeps its 6 full months. */
    const IS_REAL = DATA_DIR === 'data_real/';

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

    /* ---- DATA_WINDOW: the reporting period, computed from the duty dates (YYYY-MM-DD).
       Single source of truth for the header window + the snapshot "as of" tags.
       Adaptive: reflects whatever data exists (5 days now, more as history accrues). ---- */
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dDates = Array.from(new Set(dutyDaily.map(r => r.date).filter(Boolean))).sort();
    let DATA_WINDOW = null;
    if(dDates.length){
      const parse = s => { const [y,m,d] = s.split('-').map(Number); return {y, m, d}; };
      const a = parse(dDates[0]), b = parse(dDates[dDates.length-1]);
      const dayMon = p => p.d + ' ' + MON[p.m-1];                 // "15 Jun"
      const full   = p => dayMon(p) + ' ' + p.y;                   // "15 Jun 2026"
      let range;
      if(dDates.length === 1)              range = full(b);                          // single day
      else if(a.y === b.y && a.m === b.m)  range = a.d + '–' + dayMon(b) + ' ' + b.y; // "15–19 Jun 2026"
      else if(a.y === b.y)                 range = dayMon(a) + ' – ' + full(b);        // "29 Jun – 3 Jul 2026"
      else                                 range = full(a) + ' – ' + full(b);         // cross-year
      DATA_WINDOW = { range, days: dDates.length, asOf: full(b) };
    }

    /* ---- MODELS[] (preserve dim_models order) ---- */
    const MODELS = models.map(m => ({
      name:    m.name,
      cluster: m.cluster_id,
      cards:   cardsByUid[m.model_uid] || 0,
      duty:    dutyByUid[m.model_uid] || 0,
      color:   m.color_hex,
    }));

    /* ---- Guardrail: warn on any loaded card whose model_uid isn't in dim_models.
       Such cards silently vanish from MODELS (donut/KPI/duty) while still counting
       in the raw CARD_ROWS the card map reads → the two disagree. This is exactly
       the xiaomi-mimo vs xiaomi-mimo-v2-5 name-mismatch class of bug. Loud > silent. */
    (function(){
      const known = new Set(models.map(m => m.model_uid));
      const orphans = Object.keys(cardsByUid).filter(uid => !known.has(uid));
      if(orphans.length){
        const n = orphans.reduce((s,uid)=> s + cardsByUid[uid], 0);
        console.warn('[rollup] '+n+' loaded card(s) have a model_uid not in dim_models — '
          + 'dropped from MODELS/donut/KPI but counted in the card map (counts will disagree). '
          + 'Fix the name in dim_models or the snapshot ETL. Orphan uids: '
          + orphans.map(u => u+' ('+cardsByUid[u]+')').join(', '));
      }
    })();

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

    /* =========================================================================
     * MODEL THROUGHPUT (hero band) — fact_serving_curve → THROUGHPUT, THROUGHPUT_CEILING
     *
     * "For the models we have BENCHMARK DATA for, and on the GPUs those models actually
     *  occupy: how many output tokens/second could they emit if fully saturated, while
     *  each user still gets INTERACTIVITY_SLA tok/s?"
     *
     * MEASURED ONLY — no proxies, no estimates, no scenarios (2026-07-13 management call).
     * An earlier version proxied un-benchmarked models from similar ones and modelled an
     * "all fp4" scenario, so it could quote a whole-fleet figure. Rejected as too
     * assumption-heavy. The rule now:
     *
     *     a model counts ONLY if it was benchmarked AND is loaded.
     *     the DENOMINATOR is the cards those models occupy — not the whole cluster.
     *
     * So this is an exact statement about a well-defined subset, not a guess about the
     * fleet. Loaded models with no curve are OUT OF SCOPE (counted in `outOfScopeGpus`
     * and named in the caption) — never silently folded in at zero, which would drag the
     * per-GPU average down and understate the models we did measure.
     *
     * Decode is memory-bandwidth-bound, so per-user latency is LINEAR in concurrency:
     *     1/interactivity = a + b·CU     a = weight-read time   b = KV-read time per user
     * Fit (a,b) per (model, TP) by least squares on the measured points, solve CU at the
     * SLA, then  tok/s per GPU = CU × SLA ÷ TP  and  total = Σ (tok/s per GPU × cards).
     *
     * TWO HARD RULES:
     *   1. CU ≥ 1     cannot serve fewer than one user. If even one user can't get the SLA,
     *                 the model cannot meet it and contributes 0 (loudly). Never extrapolate
     *                 past this physical floor.
     *   2. TP ≤ cards cannot shard a model across more GPUs than it holds. (This is why
     *                 phoenix's TP8 curve is unusable — it only holds 4 cards.)
     * ======================================================================== */
    const curveByUid = {}, curvePrec = {}, curveSrc = {};
    (servingCurve||[]).forEach(r => {
      if(!r.model_uid) return;
      const tp = +r.tp, cu = +r.cu, i = +r.interactivity_tps_user;
      if(!(tp > 0) || !(cu > 0) || !(i > 0)) return;
      (curveByUid[r.model_uid] = curveByUid[r.model_uid] || {});
      (curveByUid[r.model_uid][tp] = curveByUid[r.model_uid][tp] || []).push({cu:cu, i:i});
      curvePrec[r.model_uid] = r.precision;
      curveSrc[r.model_uid]  = r.source;
    });

    /* least squares on (CU, 1/interactivity) → {a,b}. Needs ≥2 measured points. */
    function fitCurve(pts){
      const n = pts.length;
      if(n < 2) return null;
      let sx=0, sy=0, sxx=0, sxy=0;
      pts.forEach(p => { const y = 1/p.i; sx += p.cu; sy += y; sxx += p.cu*p.cu; sxy += p.cu*y; });
      const den = n*sxx - sx*sx;
      if(!den) return null;
      const b = (n*sxy - sx*sy)/den;
      const a = (sy - b*sx)/n;
      return (b > 0) ? {a:a, b:b} : null;      // b≤0 is unphysical (throughput must fall as load rises)
    }

    /* Best tok/s/GPU for one model at the SLA. null if it cannot meet the SLA on any usable TP. */
    function rateFor(uid, maxTp){
      const byTp = curveByUid[uid];
      if(!byTp) return null;
      let best = null;
      Object.keys(byTp).forEach(tpKey => {
        const tp = +tpKey;
        if(tp > maxTp) return;                                   // RULE 2
        const pts = byTp[tpKey];
        const f = fitCurve(pts);
        if(!f) return;                                           // single point → not enough to solve
        const cu = (1/INTERACTIVITY_SLA - f.a) / f.b;
        if(cu < 1) return;                                       // RULE 1
        const lo = Math.min.apply(null, pts.map(p=>p.cu)), hi = Math.max.apply(null, pts.map(p=>p.cu));
        const rate = cu * INTERACTIVITY_SLA / tp;
        if(!best || rate > best.tokpsPerGpu)
          best = {tokpsPerGpu: rate, tp: tp, cu: cu,
                  how: (cu >= lo && cu <= hi) ? 'interpolated' : 'extrapolated'};
      });
      return best;
    }

    /* ---- roll up over BENCHMARKED + LOADED models only ---- */
    const thRows = [], thCantMeet = [];
    Object.keys(cardsByUid).forEach(uid => {
      if(!curveByUid[uid]) return;                    // not benchmarked → out of scope entirely
      const n = cardsByUid[uid];
      if(!n) return;                                  // benchmarked but not loaded (e.g. qwen3-vl) → skip
      const r = rateFor(uid, n);
      const m = modelByUid[uid];
      if(!r) thCantMeet.push(uid);
      thRows.push({
        uid: uid, name: m ? m.name : uid, color: m ? m.color_hex : '#8E8E93',
        cards: n, precision: curvePrec[uid] || '—', source: curveSrc[uid] || '—',
        tp: r ? r.tp : 0, cu: r ? Math.round(r.cu*10)/10 : 0,
        how: r ? r.how : 'cannot meet SLA',
        tokpsPerGpu: r ? r.tokpsPerGpu : 0,
        fleetTokps:  (r ? r.tokpsPerGpu : 0) * n,
        perGpuHour:  (r ? r.tokpsPerGpu : 0) * 3600,
      });
    });
    thRows.sort((a,b)=> b.fleetTokps - a.fleetTokps);

    const thCards  = thRows.reduce((s,r)=> s + r.cards, 0);          // THE denominator: measured cards only
    const thTokps  = thRows.reduce((s,r)=> s + r.fleetTokps, 0);
    const thPerGpu = thCards ? thTokps/thCards : 0;

    /* actual output, for exactly these models over the observed window */
    const thUids = {}; thRows.forEach(r => thUids[r.uid] = true);
    let thActM = 0; const thDays = {};
    tokWeekly.forEach(r => {
      if(!thUids[r.model_uid]) return;
      thActM += (+r.output_tokens_m || 0);
      thDays[r.week_start] = true;
    });
    const thNDays = Object.keys(thDays).length;
    const thActual = thNDays ? (thActM * 1e6)/(thNDays * 86400) : 0;
    thRows.forEach(r => {
      let m = 0;
      tokWeekly.forEach(t => { if(t.model_uid === r.uid) m += (+t.output_tokens_m || 0); });
      r.actualTokps = thNDays ? (m*1e6)/(thNDays*86400) : 0;
      r.usedPct     = r.fleetTokps ? (100*r.actualTokps/r.fleetTokps) : 0;
    });

    /* Loaded GPUs we are NOT describing — the honest scope caveat, computed not typed. */
    const thClusters = {}; thRows.forEach(r => thClusters[(r.uid.split('@')[1]||'')] = true);
    let thOutGpus = 0; const thOutModels = [];
    Object.keys(cardsByUid).forEach(uid => {
      const cl = uid.split('@')[1] || '';
      if(!thClusters[cl] || curveByUid[uid]) return;
      thOutGpus += cardsByUid[uid];
      thOutModels.push((modelByUid[uid] ? modelByUid[uid].name : uid) + ' (' + cardsByUid[uid] + ')');
    });
    const thClusterGpus = Object.keys(thClusters).reduce((s,c)=> s + (CLUSTER_TOTAL[c]||0), 0);

    const THROUGHPUT = thRows;
    const THROUGHPUT_CEILING = {
      fleetTokps:       thTokps,
      tokensPerDay:     thTokps * 86400,
      users:            thTokps / INTERACTIVITY_SLA,     // each user consumes exactly the SLA
      gpus:             thCards,                          // the denominator — measured models' cards
      clusterGpus:      thClusterGpus,                    // the whole cluster, for the caption only
      outOfScopeGpus:   thOutGpus,                        // loaded, but no benchmark data
      outOfScopeModels: thOutModels,
      models:           thRows.length,
      perGpu:           thPerGpu,
      perGpuHour:       thPerGpu * 3600,
      perGpuDay:        thPerGpu * 86400,
      actualTokps:      thActual,
      actualPerGpuHour: thCards ? (thActual/thCards)*3600 : 0,
      headroom:         thActual ? thTokps/thActual : 0,
      utilPct:          thTokps ? (100*thActual/thTokps) : 0,
      observedDays:     thNDays,
    };

    /* ---- Guardrails: never let a 0 be silent. ---- */
    (function(){
      if(!Object.keys(curveByUid).length) return;                 // fact absent → band hides itself
      const known = new Set(models.map(m => m.model_uid));
      const unknown = Object.keys(curveByUid).filter(u => !known.has(u));
      if(unknown.length) console.warn('[rollup] fact_serving_curve has model_uid(s) not in dim_models '
        + '(they will never match a card and are silently inert): ' + unknown.join(', '));
      if(thOutGpus) console.info('[rollup] token-capacity band covers ' + thCards + ' of '
        + thClusterGpus + ' cluster GPUs. ' + thOutGpus + ' loaded GPU(s) run models with NO benchmark '
        + 'data and are OUT OF SCOPE (not estimated): ' + thOutModels.join(', '));
      if(thCantMeet.length) console.warn('[rollup] model(s) CANNOT meet the ' + INTERACTIVITY_SLA
        + ' tok/s/user SLA even at CU=1 → counted as 0: ' + thCantMeet.join(', '));
    })();

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

    /* ---- INFERENCE_TREE: Org → App → Model with input (+cached) & output tokens ----
     * Real view = June from LiteLLM SpendLogs (input_tokens_m, input_cached_tokens_m,
     * output_tokens_m). tokens=output; inp=total input; cch=cached input; unc=input−cached;
     * cachePct=cached/input. Parents roll up Σ children; sorted by input (the headline). */
    const tmp = {};
    (IS_REAL ? tokMonthly : tokMonthly.filter(r => r.month === last)).forEach(r => {
      const ai = appInfo[r.app_id]; if(!ai) return;
      const m = modelByUid[r.model_uid]; const mn = m ? m.name : r.model_uid;
      const tok = +r.output_tokens_m, cost = tok * (internalByName[mn] || 0);
      const inp = +(r.input_tokens_m||0), cch = +(r.input_cached_tokens_m||0);
      ((tmp[ai.org] = tmp[ai.org] || {})[ai.name] = tmp[ai.org][ai.name] || {});
      const leaf = tmp[ai.org][ai.name][mn] = tmp[ai.org][ai.name][mn] || { tokens:0, cost:0, inp:0, cch:0 };
      leaf.tokens += tok; leaf.cost += cost; leaf.inp += inp; leaf.cch += cch;
    });
    const sum = arr => arr.reduce((a,x)=>({t:a.t+x.tokens, c:a.c+x.cost, i:a.i+x.inp, h:a.h+x.cch}), {t:0,c:0,i:0,h:0});
    const node = (s, extra) => Object.assign({
      tokens:+s.t.toFixed(1), cost:+s.c.toFixed(2), inp:+s.i.toFixed(1), cch:+s.h.toFixed(1),
      unc:+(s.i-s.h).toFixed(1), cachePct: s.i ? Math.round(s.h/s.i*100) : 0 }, extra);
    const INFERENCE_TREE = ORGS.filter(o=>tmp[o]).map(org => {
      const appsA = Object.keys(tmp[org]).map(app => {
        const modelsA = Object.keys(tmp[org][app]).map(mn => {
          const L = tmp[org][app][mn];
          return node({t:L.tokens, c:L.cost, i:L.inp, h:L.cch}, { name:mn });
        }).sort((a,b)=> b.inp - a.inp);
        return node(sum(modelsA), { name:app, models:modelsA });
      }).sort((a,b)=> b.inp - a.inp);
      return node(sum(appsA), { org, color:ORG_COLOR[org], apps:appsA });
    }).sort((a,b)=> b.inp - a.inp);
    /* fleet input totals for the Tokens (input) KPI */
    let inFleet = 0, cchFleet = 0;
    (IS_REAL ? tokMonthly : tokMonthly.filter(r => r.month === last)).forEach(r => {
      inFleet += +(r.input_tokens_m||0); cchFleet += +(r.input_cached_tokens_m||0);
    });
    const INPUT_FLEET = { total:Math.round(inFleet), cached:Math.round(cchFleet),
      uncached:Math.round(inFleet-cchFleet), cachePct: inFleet ? Math.round(cchFleet/inFleet*100) : 0 };

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
    const wlDays = [];
    workload.forEach(r => {
      if(r.workload_type === 'inference' && (IS_REAL || r.week_start.indexOf(last + ' ') === 0)) {
        infHrs += (+r.allocated_gpu_hours); wlDays.push(r.week_start);
      }
    });
    const trainHrs = TRAINING_BY_ORG.reduce((s,o)=> s + o.gpuHours, 0);
    // label the entry with the ACTUAL workload window (the days that make up the GPU-hrs),
    // NOT the token range — the two facts have different date vintages.
    const splitPeriod = IS_REAL
      ? (wlDays.length ? (wlDays[0] + ' – ' + wlDays[wlDays.length-1]) : 'window')
      : last;
    const COMPUTE_SPLIT = { month:splitPeriod, inferenceHours:Math.round(infHrs), trainingHours:trainHrs };

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
    const INTERNAL_PLACEHOLDER = 0.20;   // un-measured models still carry this seed — exclude from any savings claim
    const pricedModels = new Set(pricing.map(r => r.model));   // models listed in fact_model_pricing.csv
    const COSTS = Object.keys(internalByName)
      .filter(name => pricedModels.has(name))                 // Viz 5 is a comparison table → only models we have external prices for
      .sort((a,b) => (tokByName[b]||0) - (tokByName[a]||0))
      .slice(0, 5)                                            // top-5 (by token volume) among the priced models
      .map(name => {
        const internal = isNaN(internalByName[name]) ? null : internalByName[name];
        const prices = { [INTERNAL_PROVIDER]: internal };
        externalProvs.forEach(p => prices[p] = ((extPrice[name]||{})[p] != null) ? extPrice[name][p] : null);
        const ext = externalProvs.map(p => prices[p]).filter(v => v != null);
        return { model:name, prices, internal,
                 measured: (internal != null && internal !== INTERNAL_PLACEHOLDER),   // real measured cost vs the 0.20 placeholder
                 cheapestExternal: ext.length ? Math.min.apply(null, ext) : null,
                 tok: tokByName[name] || 0 };
      });
    // token-weighted Δ (internal vs cheapest external) over MEASURED models only — NOT the placeholders.
    // Positive ⇒ self-host cheaper; negative ⇒ self-host costlier (the real data so far is negative).
    let _sn = 0, _sd = 0;
    COSTS.forEach(c => {
      if(c.measured && c.cheapestExternal != null && c.cheapestExternal > 0){
        _sn += ((c.cheapestExternal - c.internal) / c.cheapestExternal) * c.tok;
        _sd += c.tok;
      }
    });
    const COST_SAVINGS = _sd ? Math.round(_sn / _sd * 100) : null;   // null ⇒ no measured model ⇒ headline hidden

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
    window.DATA_WINDOW   = DATA_WINDOW;    // {range, days, asOf} — header window + snapshot "as of" tags
    window.CLUSTER_TOTAL = CLUSTER_TOTAL;
    window.CLUSTER_MEM   = CLUSTER_MEM;    // cluster_id → card_memory_gb (tooltip)
    window.MODELS        = MODELS;
    window.CARD_ROWS     = cards;          // raw per-card snapshot rows (model_uid, card_slot, models_on_card) — Viz 3b real placement + MIG hover
    window.WEEKS         = WEEKS;
    window.MODEL_TOKENS  = MODEL_TOKENS;
    window.IS_REAL       = IS_REAL;                 // real adaptive view → whole-window token reporting
    window.MONTHS        = MONTHS;
    window.OUTPUT_FLEET  = OUTPUT_FLEET_R;          // monthly fleet output (M) for the Tokens KPI
    window.ORGS          = ORGS;
    window.ORG_COLOR     = ORG_COLOR;
    window.INFERENCE_TREE = INFERENCE_TREE;         // Org → App → Model (input/cached/output tokens)
    window.INPUT_FLEET    = INPUT_FLEET;            // {total,cached,uncached,cachePct} — Tokens (input) KPI
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
    window.THROUGHPUT         = THROUGHPUT;          // [per-model rows] — benchmarked + loaded models only
    window.THROUGHPUT_CEILING = THROUGHPUT_CEILING;  // totals over THOSE models' cards (not the whole cluster)
    window.INTERACTIVITY_SLA  = INTERACTIVITY_SLA;   // tok/s/user the ceiling is quoted at
    window.AVG_GPU_THROUGHPUT_PCT = AVG_GPU_THROUGHPUT_PCT;  // reporting placeholder → KPI card
  }
})();
