import { useEffect, useMemo, useState } from "react";
import "./App.css";

/* --------- persistence --------- */
const KEY = "wt.v2"; // bump to migrate old caches
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));

/* --------- utils --------- */
const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);
const est1RM = (w, r) => (r ? Math.round(w * (36 / (37 - r))) : w || 0);
const lbToKg = (lb) => Math.round((lb / 2.20462) * 10) / 10;
const kgToLb = (kg) => Math.round(kg * 2.20462 * 10) / 10;

/* --------- tiny components --------- */
function NumberInput({ value, onChange, step = 1, ...props }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={value === "" ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      {...props}
    />
  );
}
function PRBadge() { return <span className="badge pr">NEW PR</span>; }
function Chip({ children }) { return <span className="chip">{children}</span>; }

// very small inline SVG sparkline
function Sparkline({ points, height = 48 }) {
  if (!points || points.length < 2) return null;
  const W = 300, H = height, P = 6;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (W - P * 2) + P);
  const min = Math.min(...points), max = Math.max(...points);
  const ys = points.map(v => max === min ? H / 2 : H - P - ((v - min) / (max - min)) * (H - P * 2));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line className="grid" x1={P} y1={H-P} x2={W-P} y2={H-P} />
      <path className="line" d={d} />
    </svg>
  );
}

/* ============================================================
   App
============================================================ */
export default function App() {
  const saved = load();
  const [unit, setUnit] = useState(saved?.unit || "lb");
  const [exercises, setExercises] = useState(saved?.exercises || ["Bench Press","Squat","Deadlift","Overhead Press","Barbell Row"]);
  const [templates, setTemplates] = useState(saved?.templates || []);
  const [workouts, setWorkouts] = useState(saved?.workouts || []);
  // NEW: body weight & goals
  const [body, setBody] = useState(saved?.body || []); // [{date, weight}]
  const [goals, setGoals] = useState(saved?.goals || { bodyTarget: "", lifts: {} });
  const [tab, setTab] = useState("log");

  // log form
  const [date, setDate] = useState(fmtDate(new Date()));
  const [prefill, setPrefill] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [sets, setSets] = useState([]);
  const [notes, setNotes] = useState("");

  // NEW: body log form
  const [bwDate, setBwDate] = useState(fmtDate(new Date()));
  const [bw, setBw] = useState("");

  useEffect(() => { save({ unit, exercises, templates, workouts, body, goals }); }, [unit, exercises, templates, workouts, body, goals]);

  // SW only in production
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      const url = (import.meta.env.BASE_URL || "/") + "sw.js";
      navigator.serviceWorker.register(url).catch(() => {});
    }
  }, []);

  // latest numbers by exercise (for prefill + PRs)
  const latestByExercise = useMemo(() => {
    const map = {};
    [...workouts].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(w => {
      w.sets.forEach(s => {
        const cur = map[s.exercise];
        const oneRM = est1RM(s.weight, s.reps);
        if (!cur || oneRM > cur.oneRM) map[s.exercise] = { weight:s.weight, reps:s.reps, oneRM };
      });
    });
    return map;
  }, [workouts]);

  // prefill from template
  useEffect(() => {
    if (!templateId) return;
    const t = templates.find(t => t.id === templateId);
    if (!t) return;
    setSets(t.items.map(it => {
      const last = latestByExercise[it.exercise];
      const base = prefill && last ? last.weight : (it.weight ?? 0);
      return {
        exercise: it.exercise,
        reps: it.reps ?? 8,
        weight: unit === "kg" ? (base === "" ? "" : lbToKg(base)) : base
      };
    }));
  }, [templateId, prefill, templates, latestByExercise, unit]);

  // actions
  const addSet = () => setSets(s => [...s, { exercise: exercises[0]||"Exercise", reps:8, weight:0 }]);
  const removeSet = (i) => setSets(s => s.filter((_,idx)=>idx!==i));
  const updateSet = (i, patch) => setSets(s => s.map((row,idx)=>idx===i?{...row,...patch}:row));
  const saveWorkout = () => {
    if (!sets.length) return alert("Add at least one set.");
    const entry = { id: crypto.randomUUID(), date, notes, sets: sets.map(s=>({...s})) };
    setWorkouts(w => [entry, ...w]);
    setSets([]); setNotes("");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ unit, exercises, templates, workouts, body, goals }, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href:url, download:"workouts.json" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const importJson = async (file) => {
    const text = await file.text(); const obj = JSON.parse(text);
    if (!obj) return;
    setUnit(obj.unit || "lb"); setExercises(obj.exercises || []);
    setTemplates(obj.templates || []); setWorkouts(obj.workouts || []);
    setBody(obj.body || []); setGoals(obj.goals || { bodyTarget:"", lifts:{} });
  };
  const resetAll = () => {
    if (!confirm("Erase all local data?")) return;
    setExercises(["Bench Press","Squat","Deadlift","Overhead Press","Barbell Row"]);
    setTemplates([]); setWorkouts([]); setUnit("lb");
    setBody([]); setGoals({ bodyTarget:"", lifts:{} });
    setDate(fmtDate(new Date())); setTemplateId(""); setSets([]); setNotes("");
  };

  // computed
  const recent = useMemo(() => workouts.slice(0,5), [workouts]);

  // PR detector for a workout against historical bests
  const workoutPRs = (w) => {
    const prs = [];
    w.sets.forEach(s => {
      const prev = latestByExercise[s.exercise]?.oneRM ?? 0;
      const cur = est1RM(s.weight, s.reps);
      if (cur > prev) prs.push({ exercise:s.exercise, oneRM:cur });
    });
    return prs;
  };

  // UX: convert visible set weights when switching units
  function onUnitChange(to){
    if (to === unit) return;
    setSets(rows => rows.map(r => ({
      ...r,
      weight: r.weight === "" ? "" : (to === "kg" ? lbToKg(r.weight) : kgToLb(r.weight))
    })));
    // convert stored body weights too
    setBody(list => list.map(b => ({ ...b, weight: b.weight === "" ? "" : (to === "kg" ? lbToKg(b.weight) : kgToLb(b.weight)) })));
    setUnit(to);
  }

  // ===== Stats helpers =====
  // Per-exercise time series: one entry per workout date = best 1RM that day
  function seriesForExercise(name){
    const byDate = new Map();
    workouts.forEach(w=>{
      const best = w.sets.filter(s=>s.exercise===name)
        .reduce((m,s)=>Math.max(m, est1RM(s.weight,s.reps)), 0);
      if (best>0) byDate.set(w.date, Math.round(best));
    });
    const rows = [...byDate.entries()].sort((a,b)=>new Date(a[0])-new Date(b[0]));
    return rows.map(r=>r[1]);
  }

  const bodySorted = useMemo(()=>[...body].sort((a,b)=>new Date(a.date)-new Date(b.date)),[body]);
  const bodyPoints = bodySorted.map(b=>b.weight);

  // simple progress % helper
  const pct = (cur, goal, dir="up") => {
    if (!goal || !cur) return 0;
    if (dir==="down") return Math.max(0, Math.min(100, Math.round(((cur - goal) * -100) / (goal || 1))));
    return Math.max(0, Math.min(100, Math.round((cur / goal) * 100)));
  };

  // for Stats tab exercise selector
  const [statEx, setStatEx] = useState(exercises[0] || "");

  return (
    <div className="app">
      {/* Header */}
      <h1>Workout Tracker</h1>

      {/* Top actions */}
      <div className="actions">
        <select className="pill" value={unit} onChange={(e)=>onUnitChange(e.target.value)} aria-label="Units">
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>

        <button className="btn" onClick={exportJson}>Export</button>

        <label style={{position:"relative"}}>
          <input type="file" accept="application/json"
                 onChange={(e)=> e.target.files?.[0] && importJson(e.target.files[0])}
                 style={{position:"absolute", inset:0, opacity:0, cursor:"pointer"}} />
          <span className="btn">Import</span>
        </label>

        <button className="btn" onClick={resetAll}>Reset</button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          ["log","Log"],
          ["body","Body"],
          ["stats","Stats"],
          ["templates","Templates"],
          ["exercises","Exercises"],
          ["history","History"],
          ["goals","Goals"]
        ].map(([key,label]) => (
          <button key={key} className="tab" aria-pressed={tab===key} onClick={()=>setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* LOG */}
      {tab === "log" && (
        <div className="main">
          <div className="card stack">
            <div className="row">
              <div style={{flex:1}}>
                <label>Date</label>
                <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
              </div>
              <div style={{flex:1}}>
                <label>Template</label>
                <select value={templateId} onChange={(e)=>setTemplateId(e.target.value)}>
                  <option value="">Blank</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <label className="inline">
              <input type="checkbox" checked={prefill} onChange={(e)=>setPrefill(e.target.checked)} />
              Prefill last weights
            </label>

            <div className="stack">
              {sets.map((s, i) => (
                <div key={i} className="setRow">
                  <select value={s.exercise} onChange={(e)=>updateSet(i,{exercise:e.target.value})}>
                    {exercises.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <NumberInput value={s.reps} step={1} onChange={(v)=>updateSet(i,{reps: v === "" ? "" : Math.max(0,v)})} />
                  <NumberInput value={s.weight} step={unit==="kg"?0.5:1}
                               onChange={(v)=>updateSet(i,{weight: v === "" ? "" : Math.max(0,v)})}
                               placeholder={`Weight (${unit})`} />
                  <button className="kill" onClick={()=>removeSet(i)} aria-label="Remove set">✕</button>
                </div>
              ))}
              <button className="btn" onClick={addSet}>Add Set</button>
            </div>

            <div className="stack">
              <label>Notes</label>
              <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="How did it feel?" />
            </div>

            <div className="saveBar">
              <button className="btn-primary" onClick={saveWorkout}>Save Workout</button>
            </div>
          </div>

          <div className="card">
            <h3>Recent</h3>
            {recent.length === 0 ? (
              <div className="muted">No workouts yet</div>
            ) : (
              <div className="stack">
                {recent.map(w => {
                  const prs = workoutPRs(w);
                  return (
                    <div key={w.id} className="stack" style={{borderBottom:"1px solid var(--border)", paddingBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontWeight:700}}>{new Date(w.date).toDateString()}</div>
                        {prs.length>0 && <PRBadge/>}
                      </div>
                      {w.sets.slice(0,3).map((s,idx)=>(
                        <div key={idx} className="muted" style={{fontSize:14}}>
                          {s.exercise}: {s.weight}{unit} × {s.reps} (1RM≈{est1RM(s.weight,s.reps)}{unit})
                        </div>
                      ))}
                      {w.sets.length>3 && <div className="muted" style={{fontSize:12}}>+{w.sets.length-3} more…</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BODY WEIGHT */}
      {tab === "body" && (
        <div className="card stack">
          <h3>Body Weight</h3>
          <div className="row">
            <div style={{flex:1}}>
              <label>Date</label>
              <input type="date" value={bwDate} onChange={(e)=>setBwDate(e.target.value)} />
            </div>
            <div style={{flex:1}}>
              <label>Weight ({unit})</label>
              <NumberInput value={bw} step={unit==="kg"?0.2:0.5} onChange={setBw} />
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={()=>{
              if (bw==="" || Number.isNaN(Number(bw))) return;
              setBody(list => {
                const id = crypto.randomUUID();
                const next = [...list, { id, date:bwDate, weight:bw }];
                return next;
              });
              setBw("");
            }}>Add</button>
            <Chip>{body.length} entries</Chip>
          </div>

          <div className="stack">
            <div className="muted">Trend</div>
            <Sparkline points={bodyPoints} />
            {bodySorted.length>0 && (
              <div className="muted" style={{fontSize:14}}>
                Last: {bodySorted[bodySorted.length-1].weight}{unit}
                {goals.bodyTarget && <> • Target: {goals.bodyTarget}{unit}</>}
              </div>
            )}
          </div>

          <div className="stack">
            <h3>Recent</h3>
            {bodySorted.slice(-7).reverse().map(b=>(
              <div key={b.id} className="row" style={{justifyContent:"space-between"}}>
                <div>{new Date(b.date).toDateString()}</div>
                <div className="muted">{b.weight}{unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STATS */}
      {tab === "stats" && (
        <div className="stack">
          <div className="card stack">
            <h3>Exercise Trend</h3>
            <div className="row">
              <select value={statEx} onChange={(e)=>setStatEx(e.target.value)} style={{flex:1}}>
                {exercises.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              <Chip>1RM (per workout)</Chip>
            </div>
            <Sparkline points={seriesForExercise(statEx)} height={64} />
            <div className="muted" style={{fontSize:14}}>
              Data point = best estimated 1RM for that exercise each workout.
            </div>
          </div>

          <div className="card stack">
            <h3>Body Weight</h3>
            <Sparkline points={bodyPoints} />
            {bodySorted.length>0 && (
              <div className="muted" style={{fontSize:14}}>
                {bodySorted.length} entries • Avg: {
                  Math.round((bodyPoints.reduce((a,b)=>a+b,0)/(bodyPoints.length||1))*10)/10
                }{unit}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXERCISES */}
      {tab === "exercises" && (
        <div className="card stack">
          <h3>Exercises</h3>
          {exercises.map((name,i)=>(
            <div key={i} className="row">
              <input value={name} onChange={(e)=>setExercises(arr=>arr.map((v,idx)=>idx===i?e.target.value:v))}/>
              <button className="btn" onClick={()=>setExercises(arr=>arr.filter((_,idx)=>idx!==i))}>Delete</button>
            </div>
          ))}
          <button className="btn" onClick={()=>{
            const n = prompt("New exercise name?");
            if (n) setExercises(arr=>[...arr, n]);
          }}>Add Exercise</button>
        </div>
      )}

      {/* TEMPLATES */}
      {tab === "templates" && (
        <div className="card stack">
          <h3>Templates</h3>
          <button className="btn" onClick={()=>{
            const name = prompt("Template name?");
            if (!name) return;
            const items = [];
            while (true){
              const ex = prompt("Exercise (blank to finish):", exercises[0]||"");
              if (!ex) break;
              const reps = Number(prompt("Reps:", "8") || "8");
              const weight = Number(prompt(`Weight (${unit}):`, "0") || "0");
              items.push({ exercise: ex, reps, weight });
            }
            setTemplates(t=>[{ id: crypto.randomUUID(), name, items }, ...t]);
          }}>New Template</button>

          {templates.length===0 && <div className="muted">No templates yet.</div>}
          <div className="stack">
            {templates.map(t=>(
              <div key={t.id} className="card" style={{padding:12}}>
                <div className="row" style={{alignItems:"center"}}>
                  <div style={{fontWeight:700, flex:1}}>{t.name}</div>
                  <button className="btn" onClick={()=>setTemplates(arr=>arr.filter(x=>x.id!==t.id))}>Delete</button>
                </div>
                {t.items.map((it,i)=>(
                  <div key={i} className="muted" style={{fontSize:14}}>
                    {it.exercise}: {it.weight}{unit} × {it.reps}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === "history" && (
        <div className="card stack">
          <h3>History</h3>
          {workouts.length===0 ? (
            <div className="muted">No workouts logged yet.</div>
          ) : (
            workouts.map(w=>{
              const totals = w.sets.map(s=>est1RM(s.weight,s.reps));
              const total = totals.reduce((a,b)=>a+b,0);
              return (
                <div key={w.id} className="card" style={{padding:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontWeight:700}}>{new Date(w.date).toDateString()}</div>
                  </div>
                  {w.sets.map((s,i)=>(
                    <div key={i} className="muted" style={{fontSize:14}}>
                      {s.exercise}: {s.weight}{unit} × {s.reps} (1RM≈{est1RM(s.weight,s.reps)}{unit})
                    </div>
                  ))}
                  <div className="muted" style={{marginTop:6,fontSize:13}}>Session load (sum est. 1RM): {total}{unit}</div>
                  <Sparkline points={totals.slice(-10)} />
                  {w.notes && <div style={{marginTop:6}}>{w.notes}</div>}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* GOALS */}
      {tab === "goals" && (
        <div className="card stack">
          <h3>Goals</h3>

          <div className="card" style={{padding:12}}>
            <div className="row" style={{alignItems:"end"}}>
              <div style={{flex:1}}>
                <label>Body Weight Target ({unit})</label>
                <NumberInput value={goals.bodyTarget || ""} step={unit==="kg"?0.2:0.5}
                             onChange={(v)=>setGoals(g=>({...g, bodyTarget:v}))} />
              </div>
              <button className="btn" onClick={()=>setGoals(g=>({...g, bodyTarget:""}))}>Clear</button>
            </div>
            {bodySorted.length>0 && goals.bodyTarget && (
              <>
                <div className="muted" style={{marginTop:8}}>
                  Current: {bodySorted[bodySorted.length-1].weight}{unit}
                </div>
                <Progress value={pct(bodySorted[bodySorted.length-1].weight, goals.bodyTarget, goals.bodyTarget < bodySorted[bodySorted.length-1].weight ? "down":"up")} />
              </>
            )}
          </div>

          <div className="stack">
            <h3>Lift Targets (1RM)</h3>
            {exercises.map(name=>{
              const cur = latestByExercise[name]?.oneRM || 0;
              const target = goals.lifts?.[name] || "";
              const progress = pct(cur, target || 0, "up");
              return (
                <div key={name} className="card" style={{padding:12}}>
                  <div className="row" style={{alignItems:"end"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700}}>{name}</div>
                      <div className="muted" style={{fontSize:13}}>Current best: {cur}{unit}</div>
                    </div>
                    <div>
                      <label>Target ({unit})</label>
                      <NumberInput value={target} step={1}
                                   onChange={(v)=>setGoals(g=>({...g, lifts:{...g.lifts, [name]:v}}))} />
                    </div>
                    <button className="btn" onClick={()=>setGoals(g=>{ const { [name]:_, ...rest } = g.lifts||{}; return {...g, lifts:rest}; })}>Clear</button>
                  </div>
                  {target && <Progress value={progress} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* simple progress bar */
function Progress({ value }) {
  const v = Math.max(0, Math.min(100, Math.round(value||0)));
  return (
    <div className="progress">
      <div className="progressFill" style={{width:`${v}%`}} />
      <div className="progressLabel">{v}%</div>
    </div>
  );
}
