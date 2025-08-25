import { useEffect, useMemo, useState } from "react";
import "./App.css";

/* --------- persistence --------- */
const KEY = "wt.v1";
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
};
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

// Win-pr badge
function PRBadge() {
  return <span className="badge pr">NEW PR</span>;
}

// very small inline SVG sparkline (last N points)
function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const W = 280, H = 48, P = 6;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (W - P * 2) + P);
  const min = Math.min(...points), max = Math.max(...points);
  const ys = points.map(v => {
    if (max === min) return H / 2;
    return H - P - ((v - min) / (max - min)) * (H - P * 2);
  });
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
  const [tab, setTab] = useState("log");

  // log form
  const [date, setDate] = useState(fmtDate(new Date()));
  const [prefill, setPrefill] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [sets, setSets] = useState([]);
  const [notes, setNotes] = useState("");

  useEffect(() => { save({ unit, exercises, templates, workouts }); }, [unit, exercises, templates, workouts]);

  // SW register (for install/offline)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
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
    const blob = new Blob([JSON.stringify({ unit, exercises, templates, workouts }, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href:url, download:"workouts.json" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const importJson = async (file) => {
    const text = await file.text(); const obj = JSON.parse(text);
    if (!obj) return;
    setUnit(obj.unit || "lb"); setExercises(obj.exercises || []);
    setTemplates(obj.templates || []); setWorkouts(obj.workouts || []);
  };
  const resetAll = () => {
    if (!confirm("Erase all local data?")) return;
    setExercises(["Bench Press","Squat","Deadlift","Overhead Press","Barbell Row"]);
    setTemplates([]); setWorkouts([]); setUnit("lb");
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
    setUnit(to);
  }

  return (
    <div className="app">
      {/* Header */}
      <h1>Workout Tracker</h1>

      {/* Top actions */}
      <div className="actions">
        <select value={unit} onChange={(e)=>onUnitChange(e.target.value)} aria-label="Units">
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>

        <button onClick={exportJson}>Export</button>

        <label style={{position:"relative"}}>
          <input type="file" accept="application/json"
                 onChange={(e)=> e.target.files?.[0] && importJson(e.target.files[0])}
                 style={{position:"absolute", inset:0, opacity:0, cursor:"pointer"}} />
          <span className="tab" aria-pressed="false">Import</span>
        </label>

        <button onClick={resetAll}>Reset</button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {["log","templates","exercises","history"].map(t => (
          <button key={t} className="tab" aria-pressed={tab===t} onClick={()=>setTab(t)}>
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "log" && (
        <div className="main">
          {/* Log Form */}
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

            {/* Sets */}
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
              <button onClick={addSet}>Add Set</button>
            </div>

            <div className="stack">
              <label>Notes</label>
              <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="How did it feel?" />
            </div>

            <div className="saveBar">
              <button className="primary" onClick={saveWorkout}>Save Workout</button>
            </div>
          </div>

          {/* Recent */}
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

      {tab === "exercises" && (
        <div className="card stack">
          <h3>Exercises</h3>
          {exercises.map((name,i)=>(
            <div key={i} className="row">
              <input value={name} onChange={(e)=>setExercises(arr=>arr.map((v,idx)=>idx===i?e.target.value:v))}/>
              <button onClick={()=>setExercises(arr=>arr.filter((_,idx)=>idx!==i))}>Delete</button>
            </div>
          ))}
          <button onClick={()=>{
            const n = prompt("New exercise name?");
            if (n) setExercises(arr=>[...arr, n]);
          }}>Add Exercise</button>
        </div>
      )}

      {tab === "templates" && (
        <div className="card stack">
          <h3>Templates</h3>
          <button onClick={()=>{
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
                  <button onClick={()=>setTemplates(arr=>arr.filter(x=>x.id!==t.id))}>Delete</button>
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

      {tab === "history" && (
        <div className="card stack">
          <h3>History</h3>
          {workouts.length===0 ? (
            <div className="muted">No workouts logged yet.</div>
          ) : (
            workouts.map(w=>{
              // Make a tiny sparkline of total session 1RM sum (gives a sense of load)
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
    </div>
  );
}
