import { useEffect, useMemo, useState } from "react";
import "./App.css";

/* ---------- persistence ---------- */
const KEY = "wt.v1";
const load = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));

/* ---------- helpers ---------- */
const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);
const est1RM = (w, r) => (r ? Math.round(w * (36 / (37 - r))) : w || 0);
const lbToKg = (lb) => Math.round((lb / 2.20462) * 10) / 10;
const kgToLb = (kg) => Math.round(kg * 2.20462 * 10) / 10;

/* ---------- small inputs ---------- */
function NumberInput({ value, onChange, step = 1, ...props }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      {...props}
    />
  );
}

/* ============================================================
   App
============================================================ */
export default function App() {
  // -------- state --------
  const saved = load();
  const [unit, setUnit] = useState(saved?.unit || "lb"); // lb | kg
  const [exercises, setExercises] = useState(saved?.exercises || ["Bench Press", "Squat", "Deadlift", "OHP", "Row"]);
  const [templates, setTemplates] = useState(saved?.templates || []); // [{id,name,items:[{exercise,reps,weight}]}]
  const [workouts, setWorkouts] = useState(saved?.workouts || []); // [{id,date,sets:[{exercise,reps,weight}],notes}]
  const [tab, setTab] = useState("log"); // log | templates | exercises | history

  // -------- current log form --------
  const [date, setDate] = useState(fmtDate(new Date()));
  const [prefill, setPrefill] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [sets, setSets] = useState([]);
  const [notes, setNotes] = useState("");

  // persist
  useEffect(() => {
    save({ unit, exercises, templates, workouts });
  }, [unit, exercises, templates, workouts]);

  // register service worker (for install/offline)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const url = (import.meta.env.BASE_URL || "/") + "sw.js";
      navigator.serviceWorker.register(url).catch(() => {});
    }
  }, []);

  // prefill from template or last session
  useEffect(() => {
    if (!templateId) return;
    const t = templates.find((t) => t.id === templateId);
    if (!t) return;
    if (prefill) {
      // try to pull last weights
      const last = latestByExercise(workouts);
      setSets(
        t.items.map((it) => ({
          exercise: it.exercise,
          reps: it.reps,
          weight:
            last[it.exercise]?.weight ??
            (unit === "kg" ? lbToKg(it.weight ?? 0) : it.weight ?? 0),
        }))
      );
    } else {
      setSets(t.items.map((it) => ({ exercise: it.exercise, reps: it.reps, weight: it.weight ?? 0 })));
    }
  }, [templateId, prefill, templates, workouts, unit]);

  function latestByExercise(list) {
    const map = {};
    [...list]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach((w) =>
        w.sets.forEach((s) => {
          if (!map[s.exercise]) map[s.exercise] = { reps: s.reps, weight: s.weight };
        })
      );
    return map;
  }

  // -------- actions --------
  const addSet = () => setSets((s) => [...s, { exercise: exercises[0] || "Exercise", reps: 8, weight: 0 }]);
  const removeSet = (i) => setSets((s) => s.filter((_, idx) => idx !== i));
  const updateSet = (i, patch) =>
    setSets((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const saveWorkout = () => {
    if (!sets.length) return alert("Add at least one set.");
    const entry = {
      id: crypto.randomUUID(),
      date,
      notes,
      sets: sets.map((s) => ({ ...s })),
    };
    setWorkouts((w) => [entry, ...w]);
    // clear
    setSets([]);
    setNotes("");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ unit, exercises, templates, workouts }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "workouts.json",
    });
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  const importJson = async (file) => {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!obj) return;
    setUnit(obj.unit || "lb");
    setExercises(obj.exercises || []);
    setTemplates(obj.templates || []);
    setWorkouts(obj.workouts || []);
  };

  const resetAll = () => {
    if (!confirm("Erase all local data?")) return;
    setExercises(["Bench Press", "Squat", "Deadlift", "OHP", "Row"]);
    setTemplates([]);
    setWorkouts([]);
    setUnit("lb");
    setDate(fmtDate(new Date()));
    setTemplateId("");
    setSets([]);
    setNotes("");
  };

  // computed
  const recent = useMemo(() => workouts.slice(0, 5), [workouts]);

  /* =========================== UI =========================== */
  return (
    <div className="app">
      {/* Header */}
      <h1>Workout Tracker</h1>

      {/* Actions row */}
      <div className="actions">
        <select
          value={unit}
          onChange={(e) => {
            const to = e.target.value;
            // convert existing set weights to new unit for convenience
            setSets((rows) =>
              rows.map((r) => ({
                ...r,
                weight:
                  to === "kg" ? (r.weight === "" ? "" : lbToKg(r.weight)) : (r.weight === "" ? "" : kgToLb(r.weight)),
              }))
            );
            setUnit(to);
          }}
          aria-label="Units"
        >
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>

        <button onClick={exportJson}>Export</button>

        <label style={{ position: "relative" }}>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
          />
          <span className="tab">Import</span>
        </label>

        <button onClick={resetAll}>Reset</button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className="tab" onClick={() => setTab("log")} aria-pressed={tab === "log"}>
          Log
        </button>
        <button className="tab" onClick={() => setTab("templates")} aria-pressed={tab === "templates"}>
          Templates
        </button>
        <button className="tab" onClick={() => setTab("exercises")} aria-pressed={tab === "exercises"}>
          Exercises
        </button>
        <button className="tab" onClick={() => setTab("history")} aria-pressed={tab === "history"}>
          History
        </button>
      </div>

      {/* Content */}
      {tab === "log" && (
        <div className="main">
          {/* left column: form */}
          <div className="card stack">
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Template</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Blank</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="inline" style={{ marginTop: 2 }}>
              <input
                type="checkbox"
                checked={prefill}
                onChange={(e) => setPrefill(e.target.checked)}
              />
              Prefill last weights
            </label>

            {/* sets */}
            <div className="stack">
              {sets.map((s, i) => (
                <div key={i} className="row">
                  <select
                    style={{ flex: 1.2 }}
                    value={s.exercise}
                    onChange={(e) => updateSet(i, { exercise: e.target.value })}
                  >
                    {exercises.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <NumberInput
                    style={{ flex: 0.6 }}
                    value={s.reps}
                    onChange={(v) => updateSet(i, { reps: v === "" ? "" : Math.max(0, v) })}
                    step={1}
                    placeholder="Reps"
                  />
                  <NumberInput
                    style={{ flex: 0.8 }}
                    value={s.weight}
                    onChange={(v) => updateSet(i, { weight: v === "" ? "" : Math.max(0, v) })}
                    step={unit === "kg" ? 0.5 : 1}
                    placeholder={`Weight (${unit})`}
                  />
                  <button onClick={() => removeSet(i)}>✕</button>
                </div>
              ))}
              <button onClick={addSet}>Add Set</button>
            </div>

            <div className="stack">
              <label>Notes</label>
              <textarea
                placeholder="How did it feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button className="primary" onClick={saveWorkout}>
              Save Workout
            </button>
          </div>

          {/* right column: recent */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Recent</h3>
            {recent.length === 0 ? (
              <div className="muted">No workouts yet</div>
            ) : (
              <div className="stack">
                {recent.map((w) => (
                  <div key={w.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{new Date(w.date).toDateString()}</div>
                    {w.sets.slice(0, 3).map((s, idx) => (
                      <div key={idx} style={{ fontSize: 14, color: "var(--muted)" }}>
                        {s.exercise}: {s.weight}{unit} × {s.reps}{" "}
                        <span style={{ opacity: 0.8 }}>
                          (1RM≈{est1RM(s.weight, s.reps)}
                          {unit})
                        </span>
                      </div>
                    ))}
                    {w.sets.length > 3 && (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>+{w.sets.length - 3} more…</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "exercises" && (
        <div className="card stack">
          <h3 style={{ marginTop: 0 }}>Exercises</h3>
          <div className="stack">
            {exercises.map((name, i) => (
              <div key={i} className="row">
                <input
                  value={name}
                  onChange={(e) =>
                    setExercises((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                />
                <button onClick={() => setExercises((arr) => arr.filter((_, idx) => idx !== i))}>
                  Delete
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const n = prompt("New exercise name?");
                if (n) setExercises((arr) => [...arr, n]);
              }}
            >
              Add Exercise
            </button>
          </div>
        </div>
      )}

      {tab === "templates" && (
        <div className="card stack">
          <h3 style={{ marginTop: 0 }}>Templates</h3>
          <button
            onClick={() => {
              const name = prompt("Template name?");
              if (!name) return;
              const items = [];
              let more = true;
              while (more) {
                const ex = prompt("Exercise (blank to stop):", exercises[0] || "");
                if (!ex) break;
                const reps = Number(prompt("Reps:", "8") || "8");
                const weight = Number(prompt(`Weight (${unit}):`, "0") || "0");
                items.push({ exercise: ex, reps, weight });
                more = confirm("Add another set to this template?");
              }
              setTemplates((t) => [{ id: crypto.randomUUID(), name, items }, ...t]);
            }}
          >
            New Template
          </button>

          <div className="stack">
            {templates.length === 0 && <div className="muted">No templates yet.</div>}
            {templates.map((t) => (
              <div key={t.id} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ alignItems: "center" }}>
                  <div style={{ fontWeight: 600, flex: 1 }}>{t.name}</div>
                  <button onClick={() => setTemplates((arr) => arr.filter((x) => x.id !== t.id))}>
                    Delete
                  </button>
                </div>
                {t.items.map((it, i) => (
                  <div key={i} style={{ fontSize: 14, color: "var(--muted)" }}>
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
          <h3 style={{ marginTop: 0 }}>History</h3>
          {workouts.length === 0 ? (
            <div className="muted">No workouts logged yet.</div>
          ) : (
            workouts.map((w) => (
              <div key={w.id} className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 600 }}>{new Date(w.date).toDateString()}</div>
                {w.sets.map((s, i) => (
                  <div key={i} style={{ fontSize: 14, color: "var(--muted)" }}>
                    {s.exercise}: {s.weight}{unit} × {s.reps} (1RM≈{est1RM(s.weight, s.reps)}
                    {unit})
                  </div>
                ))}
                {w.notes && <div style={{ marginTop: 6 }}>{w.notes}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
