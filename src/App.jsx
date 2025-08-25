import React, { useEffect, useMemo, useState } from "react";

/* =========================
   Helpers and data store
   ========================= */

const KEY = "lf-workout-tracker-v1";
const uid = () => Math.random().toString(36).slice(2);
const epley1RM = (w, r) => (w && r ? Math.round(w * (1 + r / 30)) : 0);
const todayISO = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const formatDate = iso => (iso ? new Date(iso).toLocaleDateString() : "");

const defaultData = {
  units: "lb",
  exercises: [
    { id: uid(), name: "Chest Press (machine)", group: "chest" },
    { id: uid(), name: "Lat Pulldown", group: "back" },
    { id: uid(), name: "Seated Row", group: "back" },
    { id: uid(), name: "Shoulder Press (machine)", group: "shoulders" },
    { id: uid(), name: "Leg Press", group: "legs" },
    { id: uid(), name: "Leg Curl", group: "legs" },
    { id: uid(), name: "Bicep Curl (DB)", group: "arms" },
    { id: uid(), name: "Triceps Pushdown (cable)", group: "arms" },
  ],
  workouts: [],
  templates: [ { id: uid(), name: "Full Body A", items: [] } ],
};

function load(){
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultData, ...JSON.parse(raw) } : defaultData;
  } catch {
    return defaultData;
  }
}
function save(store){ localStorage.setItem(KEY, JSON.stringify(store)); }
function useStore(){
  const [store, setStore] = useState(load());
  useEffect(()=>save(store), [store]);
  return [store, setStore];
}

/* =========================
   App shell
   ========================= */

export default function App(){
  const [store, setStore] = useStore();
  const [tab, setTab] = useState("log");

  // Register service worker for PWA (works on GitHub Pages base path)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(()=>{});
    }
  }, []);

  return (
    <div style={{minHeight:"100vh",background:"#0b0b0b",color:"#eaeaea",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"}}>
      <div style={{maxWidth:980, margin:"0 auto", padding:"24px"}}>
        <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontSize:28, margin:0}}>Workout Tracker</h1>
          <div style={{display:"flex",gap:8}}>
            <Units value={store.units} onChange={u=>setStore(s=>({...s, units:u}))} />
            <Backup store={store} onRestore={s=>setStore(s)} />
            <button onClick={()=>{ if(confirm("Reset all data?")) setStore(defaultData); }} title="Reset" style={btn("ghost")}>Reset</button>
          </div>
        </header>

        <nav style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8, marginBottom:16}}>
          {tabBtn("log","Log",tab,setTab)}
          {tabBtn("templates","Templates",tab,setTab)}
          {tabBtn("exercises","Exercises",tab,setTab)}
          {tabBtn("history","History",tab,setTab)}
        </nav>

        {tab==="log" && <LogTab store={store} setStore={setStore} />}
        {tab==="templates" && <TemplatesTab store={store} setStore={setStore} />}
        {tab==="exercises" && <ExercisesTab store={store} setStore={setStore} />}
        {tab==="history" && <HistoryTab store={store} />}
      </div>
    </div>
  );
}

/* =========================
   Small UI primitives
   ========================= */

function tabBtn(id,label,tab,setTab){
  const active = tab===id;
  return <button onClick={()=>setTab(id)} style={{...btn(active?"solid":"outline"), width:"100%"}}>{label}</button>;
}

function btn(variant){
  const base = {padding:"8px 12px", borderRadius:10, border:"1px solid #333", background:"#171717", color:"#eaeaea", cursor:"pointer"};
  if (variant==="outline") return {...base, background:"transparent"};
  if (variant==="ghost") return {...base, background:"transparent", border:"1px solid transparent"};
  return base;
}

function Input(props){ return <input {...props} style={{padding:"8px 10px", borderRadius:8, border:"1px solid #333", background:"#111", color:"#eaeaea", width:"100%"}}/> }
function Select(props){ return <select {...props} style={{padding:"8px 10px", borderRadius:8, border:"1px solid #333", background:"#111", color:"#eaeaea", width:"100%"}}/> }
function Textarea(props){ return <textarea {...props} style={{padding:"8px 10px", borderRadius:8, border:"1px solid #333", background:"#111", color:"#eaeaea", width:"100%", minHeight:90}}/> }

function Section({title, children}){
  return (
    <section style={{border:"1px solid #242424", borderRadius:12, padding:16, marginBottom:16}}>
      <div style={{fontWeight:600, marginBottom:8}}>{title}</div>
      {children}
    </section>
  );
}

function Row({children, gap=8}){ return <div style={{display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap}}>{children}</div>; }
function Col({span, children}){ return <div style={{gridColumn:`span ${span}`}}>{children}</div>; }

/* =========================
   Header controls
   ========================= */

function Units({ value, onChange }){
  return (
    <Select value={value} onChange={e=>onChange(e.target.value)}>
      <option value="lb">lb</option>
      <option value="kg">kg</option>
    </Select>
  );
}

function Backup({ store, onRestore }){
  const doExport = () => {
    const blob = new Blob([JSON.stringify(store,null,2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`workouts-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const onFile = e => {
    const f = e.target.files?.[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { onRestore(JSON.parse(String(reader.result))); alert("Imported backup"); }
      catch { alert("Invalid file"); }
    };
    reader.readAsText(f);
  };
  return (
    <div style={{display:"flex", gap:8}}>
      <button style={btn("outline")} onClick={doExport}>Export</button>
      <label style={{...btn("outline"), display:"inline-block"}}>
        Import
        <input type="file" accept="application/json" onChange={onFile} style={{display:"none"}}/>
      </label>
    </div>
  );
}

/* =========================
   Exercises
   ========================= */

function ExercisesTab({ store, setStore }){
  const [name, setName] = useState("");
  const [group, setGroup] = useState("chest");
  const groups = ["chest","back","legs","shoulders","arms","core","other"];

  const add = () => {
    if(!name.trim()) return;
    const ex = { id: uid(), name: name.trim(), group };
    setStore(s=>({...s, exercises:[...s.exercises, ex]}));
    setName("");
  };
  const remove = id =>
    setStore(s=>({
      ...s,
      exercises: s.exercises.filter(e=>e.id!==id),
      templates: s.templates.map(t=>({...t, items: t.items.filter(i=>i.exerciseId!==id)}))
    }));

  return (
    <>
      <Section title="Add Exercise">
        <Row>
          <Col span={6}><Input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g., Chest Press (machine)"/></Col>
          <Col span={3}>
            <Select value={group} onChange={e=>setGroup(e.target.value)}>
              {groups.map(g=><option key={g} value={g}>{g}</option>)}
            </Select>
          </Col>
          <Col span={3}><button style={btn("solid")} onClick={add}>Add</button></Col>
        </Row>
      </Section>

      <Section title="Your Exercises">
        {store.exercises.map(ex => (
          <div key={ex.id} style={{display:"flex", justifyContent:"space-between", border:"1px solid #242424", borderRadius:10, padding:8, marginBottom:8}}>
            <div>
              <div style={{fontWeight:600}}>{ex.name}</div>
              <div style={{fontSize:12, color:"#9aa"}}>{ex.group}</div>
            </div>
            <button style={btn("ghost")} onClick={()=>remove(ex.id)}>Delete</button>
          </div>
        ))}
      </Section>
    </>
  );
}

/* =========================
   Templates
   ========================= */

function TemplatesTab({ store, setStore }){
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);

  const add = () => {
    if(!name.trim()) return;
    const t = { id: uid(), name: name.trim(), items: [] };
    setStore(s=>({...s, templates:[...s.templates, t]}));
    setName("");
    setEditing(t.id);
  };
  const remove = id => setStore(s=>({...s, templates: s.templates.filter(t=>t.id!==id)}));

  return (
    <>
      <Section title="Create Template">
        <Row>
          <Col span={9}><Input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g., Push Day"/></Col>
          <Col span={3}><button style={btn("solid")} onClick={add}>Create</button></Col>
        </Row>
      </Section>

      <Section title="Your Templates">
        {store.templates.map(t => (
          <div key={t.id} style={{border:"1px solid #242424", borderRadius:10, padding:8, marginBottom:8}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div style={{fontWeight:600}}>{t.name}</div>
              <div style={{display:"flex", gap:8}}>
                <button style={btn("outline")} onClick={()=>setEditing(t.id)}>Edit</button>
                <button style={btn("ghost")} onClick={()=>remove(t.id)}>Delete</button>
              </div>
            </div>
            <div style={{fontSize:12, color:"#9aa", marginTop:4}}>{t.items.length} exercises</div>
          </div>
        ))}
      </Section>

      <TemplateEditor templateId={editing} store={store} setStore={setStore} onClose={()=>setEditing(null)} />
    </>
  );
}

function TemplateEditor({ templateId, store, setStore, onClose }){
  const t = store.templates.find(x=>x.id===templateId) || null;
  const [exerciseId, setExerciseId] = useState("");
  const [targetSets, setTargetSets] = useState(3);
  const [targetReps, setTargetReps] = useState("8-12");
  if (!t) return null;

  const addItem = () => {
    if(!exerciseId) return;
    const item = { id: uid(), exerciseId, targetSets, targetReps };
    setStore(s=>({...s, templates: s.templates.map(tmp => tmp.id===t.id ? { ...tmp, items: [...tmp.items, item] } : tmp)}));
    setExerciseId("");
  };
  const remove = id =>
    setStore(s=>({...s, templates: s.templates.map(tmp => tmp.id===t.id ? { ...tmp, items: tmp.items.filter(i=>i.id!==id) } : tmp)}));

  return (
    <Section title={`Edit Template - ${t.name}`}>
      <Row gap={8}>
        <Col span={5}>
          <Select value={exerciseId} onChange={e=>setExerciseId(e.target.value)}>
            <option value="" disabled>Select exercise</option>
            {store.exercises.map(e=> <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Col>
        <Col span={2}><Input type="number" value={targetSets} onChange={e=>setTargetSets(Number(e.target.value))} placeholder="Sets"/></Col>
        <Col span={3}><Input value={targetReps} onChange={e=>setTargetReps(e.target.value)} placeholder="Reps (e.g., 8-12)"/></Col>
        <Col span={2}><button style={btn("solid")} onClick={addItem}>Add</button></Col>
      </Row>

      <div style={{maxHeight:220, overflowY:"auto", marginTop:8}}>
        {t.items.map(item => (
          <div key={item.id} style={{display:"flex", justifyContent:"space-between", border:"1px solid #242424", borderRadius:10, padding:8, marginBottom:8}}>
            <div>
              <div style={{fontWeight:600}}>{store.exercises.find(e=>e.id===item.exerciseId)?.name}</div>
              <div style={{fontSize:12, color:"#9aa"}}>{item.targetSets} x {item.targetReps}</div>
            </div>
            <button style={btn("ghost")} onClick={()=>remove(item.id)}>Delete</button>
          </div>
        ))}
      </div>

      <div style={{textAlign:"right"}}>
        <button style={btn("outline")} onClick={onClose}>Close</button>
      </div>
    </Section>
  );
}

/* =========================
   Log workouts
   ========================= */

function LogTab({ store, setStore }){
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [copyLast, setCopyLast] = useState(true);

  // Prefill sets when choosing a template
  useEffect(()=>{
    if (!selectedTemplate) return;
    const t = store.templates.find(t=>t.id===selectedTemplate);
    if (!t) return;

    const lastByExercise = {};
    for (let i = store.workouts.length - 1; i >= 0; i--) {
      for (const s of store.workouts[i].sets) {
        if (!lastByExercise[s.exerciseId]) lastByExercise[s.exerciseId] = { weight: s.weight, reps: s.reps };
      }
    }

    const initial = [];
    for (const item of t.items) {
      for (let i=0;i<item.targetSets;i++) {
        const prev = lastByExercise[item.exerciseId];
        initial.push({ id: uid(), exerciseId: item.exerciseId, weight: copyLast && prev ? prev.weight : 0, reps: copyLast && prev ? prev.reps : 0, rpe: null });
      }
    }
    setSets(initial);
  }, [selectedTemplate, store.workouts, copyLast]);

  const addSet = () => setSets(s=>[...s, { id: uid(), exerciseId: store.exercises[0]?.id ?? "", weight: 0, reps: 0, rpe: null }]);
  const removeSet = id => setSets(s=>s.filter(x=>x.id!==id));
  const update = (id, patch) => setSets(s=>s.map(x=>x.id===id? { ...x, ...patch } : x));

  const saveWorkout = () => {
    const valid = sets.filter(s => s.exerciseId && s.reps>0 && s.weight>=0);
    if (valid.length === 0) { alert("Add at least one set"); return; }
    const w = { id: uid(), date, notes: notes.trim() || undefined, sets: valid };
    setStore(s=> ({ ...s, workouts: [...s.workouts, w] }));
    setNotes(""); setSets([]); alert("Workout saved");
  };

  return (
    <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:16}}>
      <div>
        <Section title="Log Workout">
          <Row>
            <Col span={4}>
              <div style={{fontSize:12, marginBottom:4}}>Date</div>
              <Input type="date" value={new Date(date).toISOString().slice(0,10)} onChange={e=>setDate(new Date(e.target.value).toISOString())}/>
            </Col>
            <Col span={4}>
              <div style={{fontSize:12, marginBottom:4}}>Template</div>
              <Select value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)}>
                <option value="">Blank</option>
                {store.templates.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Col>
            <Col span={4}>
              <label style={{display:"flex", alignItems:"center", gap:8, marginTop:20}}>
                <input type="checkbox" checked={copyLast} onChange={e=>setCopyLast(e.target.checked)} /> Prefill last weights
              </label>
            </Col>
          </Row>

          {sets.map(s => (
            <div key={s.id} style={{display:"grid", gridTemplateColumns:"4fr 3fr 2fr 2fr 1fr", gap:8, border:"1px solid #242424", borderRadius:10, padding:8, marginTop:8}}>
              <Select value={s.exerciseId} onChange={e=>update(s.id,{exerciseId:e.target.value})}>
                {store.exercises.map(e=> <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
              <Input type="number" value={s.weight} onChange={e=>update(s.id,{weight:Number(e.target.value)})} placeholder={`Weight (${store.units})`}/>
              <Input type="number" value={s.reps} onChange={e=>update(s.id,{reps:Number(e.target.value)})} placeholder="Reps"/>
              <Input type="number" value={s.rpe ?? ""} onChange={e=>update(s.id,{rpe:e.target.value===""? null : Number(e.target.value)})} placeholder="RPE (opt)"/>
              <button style={btn("ghost")} onClick={()=>removeSet(s.id)}>X</button>
            </div>
          ))}
          <div style={{marginTop:8}}><button style={btn("outline")} onClick={addSet}>Add Set</button></div>

          <div style={{marginTop:12}}>
            <div style={{fontSize:12, marginBottom:4}}>Notes</div>
            <Textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="How did it feel?"/>
          </div>

          <div style={{display:"flex", justifyContent:"flex-end", marginTop:12}}>
            <button style={btn("solid")} onClick={saveWorkout}>Save Workout</button>
          </div>
        </Section>
      </div>

      <div>
        <Recent store={store} />
      </div>
    </div>
  );
}

function Recent({ store }){
  const last = [...store.workouts].slice(-5).reverse();
  const nameById = id => store.exercises.find(e=>e.id===id)?.name || "?";
  return (
    <Section title="Recent">
      {last.length===0 && <div style={{color:"#9aa"}}>No workouts yet</div>}
      {last.map(w => (
        <div key={w.id} style={{border:"1px solid #242424", borderRadius:10, padding:8, marginBottom:8}}>
          <div style={{fontWeight:600}}>{formatDate(w.date)}</div>
          {w.sets.slice(0,8).map(s => (
            <div key={s.id} style={{display:"flex", justifyContent:"space-between", fontSize:14}}>
              <span>{nameById(s.exerciseId)}</span>
              <span>{s.weight} {store.units} x {s.reps}</span>
            </div>
          ))}
          {w.sets.length>8 && <div style={{fontSize:12, color:"#9aa"}}>+{w.sets.length-8} more</div>}
        </div>
      ))}
    </Section>
  );
}

/* =========================
   History view
   ========================= */

function HistoryTab({ store }){
  const [exerciseId, setExerciseId] = useState(store.exercises[0]?.id ?? "");
  const rows = useMemo(()=>{
    if(!exerciseId) return [];
    const list = [];
    for (const w of store.workouts)
      for (const s of w.sets)
        if (s.exerciseId===exerciseId) list.push({date:w.date, weight:s.weight, reps:s.reps, est1rm:epley1RM(s.weight,s.reps)});
    return list.sort((a,b)=> new Date(a.date)-new Date(b.date));
  }, [exerciseId, store.workouts]);
  const best = rows.reduce((m,r)=> Math.max(m,r.est1rm), 0);
  const exName = store.exercises.find(e=>e.id===exerciseId)?.name || "";

  return (
    <>
      <Section title="Progress">
        <Row>
          <Col span={6}>
            <Select value={exerciseId} onChange={e=>setExerciseId(e.target.value)}>
              {store.exercises.map(e=> <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Col>
        </Row>

        <div style={{marginTop:12, overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse"}}>
            <thead>
              <tr>
                <th style={th()}>Date</th>
                <th style={th()}>Weight</th>
                <th style={th()}>Reps</th>
                <th style={th()}>Est. 1RM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=> (
                <tr key={i}>
                  <td style={td()}>{formatDate(r.date)}</td>
                  <td style={td()}>{r.weight} {store.units}</td>
                  <td style={td()}>{r.reps}</td>
                  <td style={td()}>{r.est1rm} {store.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{marginTop:8, fontSize:14, color:"#9aa"}}>
          Exercise: <span style={{color:"#eaeaea"}}>{exName}</span><br/>
          Entries: <span style={{color:"#eaeaea"}}>{rows.length}</span><br/>
          Best est. 1RM: <span style={{color:"#eaeaea"}}>{best} {store.units}</span>
        </div>
      </Section>
    </>
  );
}

function th(){ return {textAlign:"left", borderBottom:"1px solid #242424", padding:"8px"}; }
function td(){ return {borderBottom:"1px solid #191919", padding:"8px", fontSize:14}; }
