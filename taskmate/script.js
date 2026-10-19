/* =====================================================
   TaskMate – shared helpers + page logic
   ===================================================== */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const CATS = ["Study", "Exam", "Project", "Personal"];
const PRIORITIES = ["High", "Medium", "Low"];

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

/* ---------- Theme (dark / light) ---------- */
function setTheme(t, persist) {
  root.dataset.theme = t;
  if (persist) { try { localStorage.setItem("theme", t); } catch (e) {} }
  const b = $("themeBtn"); if (b) b.textContent = t === "dark" ? "☀️" : "🌙";
}
setTheme(root.dataset.theme || "light", false);
if ($("themeBtn")) $("themeBtn").onclick = () => setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
if ($("menuBtn")) $("menuBtn").onclick = () => $("nav").classList.toggle("open");

/* ---------- Toast notifications (with optional action button) ---------- */
function toast(msg, actionLabel, action) {
  const box = $("toasts"); if (!box) return;
  const t = document.createElement("div"); t.className = "toast";
  const s = document.createElement("span"); s.textContent = msg; t.appendChild(s);
  if (actionLabel) {
    const b = document.createElement("button"); b.textContent = actionLabel;
    b.onclick = () => { action(); t.remove(); };
    t.appendChild(b);
  }
  box.appendChild(t);
  setTimeout(() => t.remove(), actionLabel ? 5000 : 2500);
}

/* ---------- Scroll reveal + animated counters ---------- */
function countUp(el, to) {
  const start = performance.now(), dur = 800;
  (function step(now) {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(to * p) + (el.dataset.suffix || "");
    if (p < 1) requestAnimationFrame(step);
  })(start);
}
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add("show");
      if (e.target.dataset.count) countUp(e.target, +e.target.dataset.count);
      io.unobserve(e.target);
    }
  }), { threshold: 0.2 });
  document.querySelectorAll(".fade, [data-count]").forEach(el => io.observe(el));
} else {
  document.querySelectorAll(".fade").forEach(el => el.classList.add("show"));
}

/* ---------- Task data helpers (shared by Home + Tasks) ---------- */
function loadTasks() {
  return store.get("tasks", []).map((t, i) => ({
    id: t.id || Date.now() + i,
    text: String(t.text || ""),
    priority: PRIORITIES.includes(t.priority) ? t.priority : "Medium",
    category: CATS.includes(t.category) ? t.category : "Study",
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : "",
    done: !!t.done,
    created: t.created || t.id || Date.now()
  }));
}
function calc(tasks) {
  const total = tasks.length, done = tasks.filter(t => t.done).length;
  const overdue = tasks.filter(t => !t.done && t.due && t.due < todayStr()).length;
  return { total, done, pending: total - done, overdue, pct: total ? Math.round(done / total * 100) : 0 };
}
function paintRing(ringEl, pctEl, pct) {
  ringEl.style.background = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--ring) 0deg)`;
  pctEl.textContent = pct + "%";
}

/* =====================================================
   HOME PAGE (index.html)
   ===================================================== */
if ($("homeRing")) {
  const tasks = loadTasks(), s = calc(tasks);
  $("homeTotal").textContent = s.total;
  $("homePending").textContent = s.pending;
  $("homeDone").textContent = s.done;
  paintRing($("homeRing"), $("homePct"), s.pct);

  // Show the user's real tasks in the hero preview card
  if (tasks.length && $("mockList")) {
    $("mockList").innerHTML = "";
    tasks.slice(0, 4).forEach(t => {
      const d = document.createElement("div");
      if (t.done) d.className = "done";
      d.textContent = (t.done ? "✔ " : "☐ ") + t.text;
      $("mockList").appendChild(d);
    });
  }

  // Quote of the day (changes daily)
  const quotes = [
    ["Small progress each day adds up to big results.", "TaskMate"],
    ["Don't watch the clock; do what it does. Keep going.", "Sam Levenson"],
    ["The secret of getting ahead is getting started.", "Mark Twain"],
    ["Discipline is the bridge between goals and accomplishment.", "Jim Rohn"],
    ["It always seems impossible until it's done.", "Nelson Mandela"],
    ["Focus on being productive instead of busy.", "Tim Ferriss"],
    ["Well begun is half done.", "Aristotle"]
  ];
  const q = quotes[Math.floor(Date.now() / 86400000) % quotes.length];
  $("quoteText").textContent = "“" + q[0] + "”";
  $("quoteBy").textContent = "— " + q[1];
}

/* =====================================================
   TASKS PAGE (tasks.html)
   ===================================================== */
const list = $("taskList");
if (list) {
  let tasks = loadTasks();
  let filter = "all", catFilter = "all", query = "", sort = "manual";
  let editing = null, dragId = null;

  const save = () => store.set("tasks", tasks);

  function visible() {
    const a = tasks.filter(t =>
      (filter === "all" || (filter === "done" ? t.done : !t.done)) &&
      (catFilter === "all" || t.category === catFilter) &&
      t.text.toLowerCase().includes(query));
    const pr = { High: 0, Medium: 1, Low: 2 };
    if (sort === "due") a.sort((x, y) => (x.due || "9999") > (y.due || "9999") ? 1 : -1);
    else if (sort === "priority") a.sort((x, y) => pr[x.priority] - pr[y.priority]);
    else if (sort === "az") a.sort((x, y) => x.text.localeCompare(y.text));
    else if (sort === "new") a.sort((x, y) => y.created - x.created);
    return a;
  }

  function chip(text, cls) {
    const c = document.createElement("span");
    c.className = "chip " + (cls || ""); c.textContent = text; return c;
  }
  function option(sel, values, current) {
    values.forEach(v => { const o = document.createElement("option"); o.value = o.textContent = v; if (v === current) o.selected = true; sel.appendChild(o); });
  }
  function fmtDate(s) { return new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

  function item(t) {
    const li = document.createElement("li");
    li.className = "task " + t.priority + (t.done ? " done" : "");
    li.dataset.id = t.id;
    li.draggable = sort === "manual" && editing !== t.id;

    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = t.done;
    cb.onchange = () => { t.done = cb.checked; save(); render(); if (t.done) toast("Task completed 🎉"); };
    li.appendChild(cb);

    const body = document.createElement("div"); body.className = "body";
    if (editing === t.id) {
      const row = document.createElement("div"); row.className = "edit-row";
      const ti = document.createElement("input"); ti.type = "text"; ti.value = t.text; ti.maxLength = 100;
      const pi = document.createElement("select"); option(pi, PRIORITIES, t.priority);
      const di = document.createElement("input"); di.type = "date"; di.value = t.due;
      row.append(ti, pi, di); body.appendChild(row);
      const commit = () => {
        const v = ti.value.trim();
        if (!v) { toast("Task cannot be empty"); return; }
        t.text = v; t.priority = pi.value; t.due = di.value; editing = null;
        save(); render(); toast("Task updated ✏️");
      };
      ti.onkeydown = e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { editing = null; render(); } };
      li.appendChild(body);
      const sv = document.createElement("button"); sv.className = "save"; sv.textContent = "Save"; sv.onclick = commit;
      li.appendChild(sv);
      setTimeout(() => ti.focus(), 0);
      return li;
    }

    const title = document.createElement("span"); title.className = "title"; title.textContent = t.text;
    title.ondblclick = () => { editing = t.id; render(); };
    body.appendChild(title);
    const meta = document.createElement("div"); meta.className = "meta";
    meta.append(chip(t.priority, t.priority), chip(t.category));
    if (t.due) {
      if (!t.done && t.due < todayStr()) meta.appendChild(chip("⚠ Overdue · " + fmtDate(t.due), "overdue"));
      else if (!t.done && t.due === todayStr()) meta.appendChild(chip("📅 Due today", "today"));
      else meta.appendChild(chip("📅 " + fmtDate(t.due)));
    }
    body.appendChild(meta); li.appendChild(body);

    const ed = document.createElement("button"); ed.className = "edit"; ed.textContent = "Edit";
    ed.onclick = () => { editing = t.id; render(); };
    const del = document.createElement("button"); del.className = "del"; del.textContent = "Delete";
    del.onclick = () => {
      const idx = tasks.indexOf(t);
      tasks.splice(idx, 1); save(); render();
      toast("Task deleted", "Undo", () => { tasks.splice(idx, 0, t); save(); render(); });
    };
    li.append(ed, del);

    /* drag & drop reordering (manual sort mode) */
    li.ondragstart = e => { dragId = t.id; li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(t.id)); } catch (err) {} };
    li.ondragend = () => { dragId = null; li.classList.remove("dragging"); document.querySelectorAll("li.over").forEach(x => x.classList.remove("over")); };
    li.ondragover = e => { if (dragId !== null) { e.preventDefault(); li.classList.add("over"); } };
    li.ondragleave = () => li.classList.remove("over");
    li.ondrop = e => {
      e.preventDefault(); li.classList.remove("over");
      if (dragId === null || dragId === t.id) return;
      const from = tasks.findIndex(x => x.id === dragId);
      const moved = tasks.splice(from, 1)[0];
      tasks.splice(tasks.findIndex(x => x.id === t.id), 0, moved);
      save(); render();
    };
    return li;
  }

  function render() {
    list.innerHTML = "";
    const items = visible();
    items.forEach(t => list.appendChild(item(t)));
    $("empty").hidden = items.length > 0;
    $("empty").textContent = tasks.length ? "🔍 No matching tasks found." : "🎉 No tasks yet. Add your first task above!";
    const s = calc(tasks);
    $("total").textContent = s.total;
    $("pending").textContent = s.pending;
    $("completed").textContent = s.done;
    $("overdue").textContent = s.overdue;
    $("barFill").style.width = s.pct + "%";
    paintRing($("ring"), $("pct"), s.pct);
  }

  /* ----- add task ----- */
  function addTask() {
    const input = $("taskInput"), msg = $("msg");
    const text = input.value.trim();
    if (!text) { msg.textContent = "Please enter a task before adding."; input.focus(); return; }
    if (tasks.some(t => t.text.toLowerCase() === text.toLowerCase() && !t.done)) { msg.textContent = "This task is already in your pending list."; return; }
    msg.textContent = "";
    tasks.push({ id: Date.now(), text, priority: $("priority").value, category: $("category").value, due: $("dueDate").value, done: false, created: Date.now() });
    input.value = ""; $("dueDate").value = "";
    save(); render(); toast("Task added ✅");
  }
  $("addBtn").onclick = addTask;
  $("taskInput").onkeydown = e => { if (e.key === "Enter") addTask(); };

  /* ----- search / sort / filters ----- */
  $("search").oninput = e => { query = e.target.value.trim().toLowerCase(); render(); };
  $("sort").onchange = e => { sort = e.target.value; render(); };
  $("catFilter").onchange = e => { catFilter = e.target.value; render(); };
  document.querySelectorAll(".filters button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".filters button").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); filter = b.dataset.f; render();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("search").focus(); }
  });

  /* ----- clear completed / export / import ----- */
  $("clearDone").onclick = () => {
    const n = tasks.filter(t => t.done).length;
    if (!n) { toast("No completed tasks to clear"); return; }
    if (!confirm("Delete " + n + " completed task(s)?")) return;
    tasks = tasks.filter(t => !t.done); save(); render(); toast("Completed tasks cleared");
  };
  $("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "taskmate-" + todayStr() + ".json"; a.click();
    URL.revokeObjectURL(a.href); toast("Tasks exported ⬇");
  };
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!Array.isArray(data)) throw new Error("bad");
        if (!confirm("Replace your current tasks with " + data.length + " imported task(s)?")) return;
        store.set("tasks", data); tasks = loadTasks(); save(); render(); toast("Tasks imported ⬆");
      } catch (err) { toast("Invalid file. Please choose a TaskMate .json export."); }
      e.target.value = "";
    };
    r.readAsText(file);
  };

  /* ----- Pomodoro focus timer ----- */
  const pomo = { len: 1500, secs: 1500, t: null };
  const showPomo = () => { $("pomoTime").textContent = pad(Math.floor(pomo.secs / 60)) + ":" + pad(pomo.secs % 60); };
  const stopPomo = () => { clearInterval(pomo.t); pomo.t = null; $("pomoStart").textContent = "Start"; };
  $("pomoStart").onclick = () => {
    if (pomo.t) { stopPomo(); return; }
    $("pomoStart").textContent = "Pause";
    pomo.t = setInterval(() => {
      pomo.secs--; showPomo();
      if (pomo.secs <= 0) { stopPomo(); toast("⏰ Time's up! Take a short break."); pomo.secs = pomo.len; showPomo(); }
    }, 1000);
  };
  $("pomoReset").onclick = () => { stopPomo(); pomo.secs = pomo.len; showPomo(); };
  document.querySelectorAll(".modes button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".modes button").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); stopPomo(); pomo.len = pomo.secs = +b.dataset.m * 60; showPomo();
  });

  render(); showPomo();
}

/* =====================================================
   CONTACT PAGE (contact.html)
   ===================================================== */
const form = $("contactForm");
if (form) {
  const fields = {
    cname: v => v.length < 3 ? "Name must be at least 3 characters." : "",
    cemail: v => !v ? "Email is required." : !/^\S+@\S+\.\S+$/.test(v) ? "Enter a valid email address." : "",
    cphone: v => v && !/^[6-9]\d{9}$/.test(v) ? "Enter a valid 10-digit mobile number." : "",
    cmsg: v => v.length < 10 ? "Message must be at least 10 characters." : ""
  };
  const check = id => {
    const el = $(id), err = $("e_" + id), m = fields[id](el.value.trim());
    err.textContent = m; el.classList.toggle("invalid", !!m); return !m;
  };
  Object.keys(fields).forEach(id => $(id).addEventListener("input", () => { if ($(id).classList.contains("invalid")) check(id); }));
  $("cmsg").addEventListener("input", () => { $("count").textContent = $("cmsg").value.length + " / 300"; });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const ok = Object.keys(fields).map(check).every(Boolean);
    const status = $("cerr");
    if (!ok) { status.className = "err"; status.textContent = "Please fix the highlighted fields."; return; }
    const msgs = store.get("messages", []);
    msgs.push({ name: $("cname").value.trim(), email: $("cemail").value.trim(), subject: $("csubject").value, message: $("cmsg").value.trim(), at: new Date().toISOString() });
    store.set("messages", msgs);
    status.className = "err ok"; status.textContent = "Thank you! Your message has been sent.";
    toast("Message sent ✉");
    form.reset(); $("count").textContent = "0 / 300";
  });
}


/* ---------- Calendar page ---------- */
if ($("calendarGrid")) {
  let view = new Date(); view.setDate(1);
  let selected = todayStr();
  const grid = $("calendarGrid");
  const monthName = d => d.toLocaleDateString("en-IN", {month:"long", year:"numeric"});
  function dateKey(y,m,d){return y+"-"+pad(m+1)+"-"+pad(d)}
  function renderCalendar(){
    const all=loadTasks(), y=view.getFullYear(), m=view.getMonth();
    $("monthLabel").textContent=monthName(view); grid.innerHTML="";
    const offset=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate(), prevDays=new Date(y,m,0).getDate();
    for(let i=0;i<42;i++){
      let day, key, other=false;
      if(i<offset){day=prevDays-offset+i+1;key=dateKey(y,m-1,day);other=true}
      else if(i>=offset+days){day=i-offset-days+1;key=dateKey(y,m+1,day);other=true}
      else {day=i-offset+1;key=dateKey(y,m,day)}
      const tasks=all.filter(t=>t.due===key);
      const b=document.createElement("button"); b.className="calendar-day"+(other?" muted":"")+(key===todayStr()?" today":"")+(key===selected?" selected":"");
      const num=document.createElement("span");num.className="day-number";num.textContent=day;b.appendChild(num);
      if(tasks.length){const dots=document.createElement("div");dots.className="day-dots";tasks.slice(0,5).forEach(t=>{const dot=document.createElement("i");dot.className="day-dot"+(t.priority==="High"?" high":"");dots.appendChild(dot)});b.appendChild(dots)}
      b.title=tasks.length+" task(s)";b.onclick=()=>{selected=key;renderCalendar()};grid.appendChild(b);
    }
    const parsed=new Date(selected+"T00:00:00");$("selectedDateTitle").textContent=parsed.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});
    const agenda=$("agendaList");agenda.innerHTML="";const matches=all.filter(t=>t.due===selected).sort((a,b)=>({High:0,Medium:1,Low:2}[a.priority]-{High:0,Medium:1,Low:2}[b.priority]));
    if(!matches.length){agenda.innerHTML='<div class="agenda-empty">No deadlines for this date.<br>Enjoy the breathing room, or add a task with this due date.</div>'}
    else matches.forEach(t=>{const d=document.createElement("div");d.className="agenda-item";const b=document.createElement("b");b.textContent=(t.done?"✓ ":"")+t.text;const sm=document.createElement("small");sm.textContent=t.category+" · "+t.priority+" priority · "+(t.done?"Completed":"Pending");d.append(b,sm);agenda.appendChild(d)});
  }
  $("prevMonth").onclick=()=>{view.setMonth(view.getMonth()-1);renderCalendar()};$("nextMonth").onclick=()=>{view.setMonth(view.getMonth()+1);renderCalendar()};$("todayMonth").onclick=()=>{view=new Date();view.setDate(1);selected=todayStr();renderCalendar()};renderCalendar();
}

/* ---------- Insights page ---------- */
if ($("categoryChart")) {
  const tasks=loadTasks(), s=calc(tasks);$("insCompletion").textContent=s.pct+"%";$("insPending").textContent=s.pending;$("insOverdue").textContent=s.overdue;$("insHigh").textContent=tasks.filter(t=>!t.done&&t.priority==="High").length;
  const cats=["Study","Exam","Project","Personal"], chart=$("categoryChart");chart.innerHTML="";
  cats.forEach(c=>{const count=tasks.filter(t=>t.category===c).length;const row=document.createElement("div");row.className="chart-row";const label=document.createElement("span");label.textContent=c;const track=document.createElement("div");track.className="chart-track";const fill=document.createElement("div");fill.className="chart-fill";fill.style.width=(tasks.length?count/tasks.length*100:0)+"%";track.appendChild(fill);const val=document.createElement("b");val.textContent=count;row.append(label,track,val);chart.appendChild(row)});
  const prios=[{name:"High",cls:"",color:"#ef4444"},{name:"Medium",cls:"medium",color:"#f59e0b"},{name:"Low",cls:"low",color:"#10b981"}], pc=$("priorityChart");pc.innerHTML="";
  prios.forEach(p=>{const count=tasks.filter(t=>!t.done&&t.priority===p.name).length;const row=document.createElement("div");row.className="priority-line";const label=document.createElement("span");const dot=document.createElement("i");dot.className="priority-mark "+p.cls;const txt=document.createElement("span");txt.textContent=p.name;label.append(dot,txt);const n=document.createElement("b");n.textContent=count;row.append(label,n);pc.appendChild(row)});
  const tip=$("insightTip");if(!tasks.length)tip.textContent="Add tasks with categories and due dates to unlock useful insights.";else if(s.overdue)tip.textContent="You have "+s.overdue+" overdue task(s). Start with the most important one, then update any deadline that has changed.";else if(s.pending&&tasks.some(t=>!t.done&&t.priority==="High"))tip.textContent="You have high-priority work waiting. Try one 25-minute focus session on your most important task.";else if(s.pct===100)tip.textContent="Excellent work — every saved task is complete. Add your next goal when you are ready.";else tip.textContent="You have completed "+s.done+" of "+s.total+" task(s). Choose one small next action to keep momentum going.";
  const upcoming=$("upcomingList");upcoming.innerHTML="";const next=tasks.filter(t=>!t.done&&t.due>=todayStr()).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6);if(!next.length)upcoming.innerHTML='<div class="agenda-empty">No upcoming deadlines. Add due dates on the My Tasks page to plan ahead.</div>';else next.forEach(t=>{const d=document.createElement("div");d.className="upcoming-item";const b=document.createElement("b");b.textContent=t.text;const sm=document.createElement("small");sm.textContent=new Date(t.due+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})+" · "+t.priority+" priority";d.append(b,sm);upcoming.appendChild(d)});
}
