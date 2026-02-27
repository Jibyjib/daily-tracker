/*
  To-Do + Habit Tracker + Timed Activities (Pomodoro + minutes)
  - File-backed via File System Access API (Chrome/Edge)
  - Falls back to localStorage
*/

const LS_KEY = "todo_habit_tracker_v1";
const LS_FILE_HINT_KEY = "todo_habit_tracker_file_hint_v1";

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatNiceDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isoCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function dateAddDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoRangeEndInclusive(endISO, daysBack) {
  const start = dateAddDays(endISO, -(daysBack - 1));
  return { start, end: endISO };
}

/* ---------- State ---------- */

const DEFAULT_STATE = () => ({
  habits: [
    { id: uid(), name: "Exercise", history: {} },
    { id: uid(), name: "Read", history: {} },
    { id: uid(), name: "Drink Water", history: {} },
  ],
  tasks: [],
  taskFilter: "all",
  activities: [
    // { id, name, targetPomos, workMin, breakMin, log: { "YYYY-MM-DD": { pomos, minutes, cardio: [] } } }
  ],
});

const hasFSA = !!window.showOpenFilePicker;
let fileHandle = null;
let state = null;

const TODAY = todayISO();

/* ---------- Storage Layer ---------- */

function loadLocalStorageState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    const seed = DEFAULT_STATE();
    localStorage.setItem(LS_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed = JSON.parse(raw);
    parsed.habits ??= [];
    parsed.tasks ??= [];
    parsed.taskFilter ??= "all";
    parsed.activities ??= [];
    return parsed;
  } catch {
    localStorage.removeItem(LS_KEY);
    const seed = DEFAULT_STATE();
    localStorage.setItem(LS_KEY, JSON.stringify(seed));
    return seed;
  }
}

function saveLocalStorageState(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

async function readStateFromFile(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== "object") throw new Error("Bad JSON");
  if (!Array.isArray(parsed.habits) || !Array.isArray(parsed.tasks)) {
    throw new Error("Missing habits/tasks arrays");
  }

  parsed.taskFilter ??= "all";
  parsed.activities ??= [];
  return parsed;
}

async function writeStateToFile(handle, s) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(s, null, 2));
  await writable.close();
}

function setStatus(msg) { elFileStatus.textContent = msg; }

async function persist() {
  saveLocalStorageState(state);

  if (fileHandle) {
    try {
      await writeStateToFile(fileHandle, state);
      setStatus(`Connected: ${localStorage.getItem(LS_FILE_HINT_KEY) || "tracker-data.json"} • autosaved`);
    } catch {
      setStatus("Connected, but save failed (permission?) • falling back to localStorage");
    }
  } else {
    setStatus(hasFSA ? "Not connected • using localStorage" : "File API not available • using localStorage");
  }
}

async function connectFile() {
  if (!hasFSA) {
    alert("File System Access API not available in this browser.\nUse Chrome/Edge.");
    return;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "tracker-data.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
    });

    const perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") throw new Error("Permission not granted");

    fileHandle = handle;
    localStorage.setItem(LS_FILE_HINT_KEY, handle.name || "tracker-data.json");

    let loaded = null;
    try { loaded = await readStateFromFile(handle); } catch { loaded = null; }

    if (loaded) {
      state = loaded;
      await persist();
      renderAll();
      alert("Connected + loaded file.");
    } else {
      await persist();
      alert("Connected.\nWriting current data to file.");
    }
  } catch {
    setStatus("Not connected • using localStorage");
  }
}

/* ---------- UI refs ---------- */

const elTodayStr = document.getElementById("todayStr");
const elHabitForm = document.getElementById("habitForm");
const elHabitName = document.getElementById("habitName");
const elHabitList = document.getElementById("habitList");
const elHabitSummary = document.getElementById("habitSummary");
const elResetTodayBtn = document.getElementById("resetTodayBtn");

const elTaskForm = document.getElementById("taskForm");
const elTaskName = document.getElementById("taskName");
const elTaskDue = document.getElementById("taskDue");
const elTaskCat = document.getElementById("taskCat");
const elTaskList = document.getElementById("taskList");
const elTaskSummary = document.getElementById("taskSummary");
const elTaskFilters = document.getElementById("taskFilters");
const elClearDoneTasksBtn = document.getElementById("clearDoneTasksBtn");

const elStat7 = document.getElementById("stat7");
const elStat30 = document.getElementById("stat30");
const elStat90 = document.getElementById("stat90");
const elStatAll = document.getElementById("statAll");

const elExportBtn = document.getElementById("exportBtn");
const elImportBtn = document.getElementById("importBtn");
const elImportFile = document.getElementById("importFile");
const elWipeBtn = document.getElementById("wipeBtn");
const elConnectFileBtn = document.getElementById("connectFileBtn");
const elFileStatus = document.getElementById("fileStatus");

/* Timed activities */
const elActivityForm = document.getElementById("activityForm");
const elActivityName = document.getElementById("activityName");
const elActivityTarget = document.getElementById("activityTarget");
const elActivityWork = document.getElementById("activityWork");
const elActivityBreak = document.getElementById("activityBreak");
const elActivityList = document.getElementById("activityList");
const elActivitySummary = document.getElementById("activitySummary");

const elTimerTitle = document.getElementById("timerTitle");
const elTimerMode = document.getElementById("timerMode");
const elTimerRemaining = document.getElementById("timerRemaining");
const elTimerStartPauseBtn = document.getElementById("timerStartPauseBtn");
const elTimerSkipBtn = document.getElementById("timerSkipBtn");
const elTimerStopBtn = document.getElementById("timerStopBtn");

/* ---------- Init ---------- */

elTodayStr.textContent = formatNiceDate(TODAY);
state = loadLocalStorageState();
state.activities ??= [];

setStatus(hasFSA ? "Not connected • using localStorage" : "File API not available • using localStorage");

/* ---------- Habits ---------- */

function habitCheckedToday(habit) {
  return habit.history?.[TODAY] === true;
}

function currentStreak(h) {
  const hist = h.history ?? {};
  let streak = 0;
  let cur = TODAY;
  while (hist[cur] === true) {
    streak += 1;
    cur = dateAddDays(cur, -1);
    if (streak > 10000) break;
  }
  return streak;
}

function habitMeta(h) {
  const hist = h.history ?? {};
  const dates = Object.keys(hist).sort();
  if (dates.length === 0) return "No history yet";
  const totalDays = dates.length;
  const hits = dates.filter(d => hist[d] === true).length;
  const pct = totalDays ? Math.round((hits / totalDays) * 100) : 0;
  const streak = currentStreak(h);
  return streak > 0 ? `${pct}% overall • ${streak} day streak` : `${pct}% overall • no streak`;
}

function renderHabits() {
  const total = state.habits.length;
  const done = state.habits.filter(h => habitCheckedToday(h)).length;
  elHabitSummary.textContent = total === 0 ? "No habits yet." : `${done}/${total} done today`;

  elHabitList.innerHTML = "";
  if (total === 0) {
    elHabitList.innerHTML = `<div class="muted">Add a habit above. It’ll show up here with a daily checkbox.</div>`;
    return;
  }

  for (const h of state.habits) {
    const on = habitCheckedToday(h);

    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.className = "item-left";

    const check = document.createElement("button");
    check.className = "check" + (on ? " on" : "");
    check.type = "button";
    check.title = "Toggle for today";
    check.addEventListener("click", async () => {
      h.history ??= {};
      h.history[TODAY] = !habitCheckedToday(h);
      await persist();
      renderAll();
    });

    const title = document.createElement("div");
    title.className = "item-title";
    title.innerHTML = `
      <div class="name">${escapeHtml(h.name)}</div>
      <div class="meta">${escapeHtml(habitMeta(h))}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const btnDel = document.createElement("button");
    btnDel.className = "btn ghost";
    btnDel.type = "button";
    btnDel.textContent = "Delete";
    btnDel.addEventListener("click", async () => {
      if (!confirm(`Delete habit "${h.name}"? This also removes its history.`)) return;
      state.habits = state.habits.filter(x => x.id !== h.id);
      await persist();
      renderAll();
    });

    left.appendChild(check);
    left.appendChild(title);
    actions.appendChild(btnDel);

    row.appendChild(left);
    row.appendChild(actions);
    elHabitList.appendChild(row);
  }
}

/* ---------- Tasks ---------- */

function taskIsOverdue(t) {
  if (!t.due) return false;
  return !t.done && isoCompare(t.due, TODAY) < 0;
}

function renderTaskFilters() {
  const cats = Array.from(new Set(
    state.tasks.map(t => (t.cat || "").trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const filters = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "done", label: "Done" },
    ...cats.map(c => ({ key: `cat:${c}`, label: c })),
  ];

  elTaskFilters.innerHTML = "";
  for (const f of filters) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (state.taskFilter === f.key ? " active" : "");
    b.textContent = f.label;
    b.addEventListener("click", async () => {
      state.taskFilter = f.key;
      await persist();
      renderAll();
    });
    elTaskFilters.appendChild(b);
  }
}

function filteredTasks() {
  const f = state.taskFilter;
  if (f === "all") return state.tasks;
  if (f === "open") return state.tasks.filter(t => !t.done);
  if (f === "done") return state.tasks.filter(t => t.done);
  if (f.startsWith("cat:")) {
    const c = f.slice(4);
    return state.tasks.filter(t => (t.cat || "").trim() === c);
  }
  return state.tasks;
}

function renderTasks() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done).length;
  elTaskSummary.textContent = total === 0 ? "No tasks yet." : `${done}/${total} completed`;

  renderTaskFilters();

  const tasks = filteredTasks();
  elTaskList.innerHTML = "";
  if (tasks.length === 0) {
    elTaskList.innerHTML = `<div class="muted">No tasks in this view.</div>`;
    return;
  }

  for (const t of tasks) {
    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.className = "item-left";

    const check = document.createElement("button");
    check.className = "check" + (t.done ? " on" : "");
    check.type = "button";
    check.title = "Toggle";
    check.addEventListener("click", async () => {
      t.done = !t.done;
      await persist();
      renderAll();
    });

    const title = document.createElement("div");
    title.className = "item-title";

    const metaBits = [];
    if (t.cat) metaBits.push(`${escapeHtml(t.cat)}`);
    if (t.due) {
      const dueNice = formatNiceDate(t.due);
      const tag = taskIsOverdue(t) ? `Overdue • ${escapeHtml(dueNice)}` : `Due ${escapeHtml(dueNice)}`;
      metaBits.push(tag);
    }

    title.innerHTML = `
      <div class="name">${escapeHtml(t.name)}</div>
      <div class="meta">${metaBits.join(" • ") || "—"}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const btnDel = document.createElement("button");
    btnDel.className = "btn ghost";
    btnDel.type = "button";
    btnDel.textContent = "Delete";
    btnDel.addEventListener("click", async () => {
      if (!confirm(`Delete task "${t.name}"?`)) return;
      state.tasks = state.tasks.filter(x => x.id !== t.id);
      await persist();
      renderAll();
    });

    left.appendChild(check);
    left.appendChild(title);
    actions.appendChild(btnDel);

    row.appendChild(left);
    row.appendChild(actions);
    elTaskList.appendChild(row);
  }
}

/* ---------- Habit stats ---------- */

function computeHabitStats(daysBackOrNull) {
  const habits = state.habits;
  if (habits.length === 0) return { hits: 0, possible: 0, pct: null };

  let start = null, end = null;
  if (daysBackOrNull != null) ({ start, end } = isoRangeEndInclusive(TODAY, daysBackOrNull));

  let hits = 0;
  let possible = 0;

  for (const h of habits) {
    const hist = h.history ?? {};
    if (start && end) {
      let cur = start;
      while (true) {
        possible += 1;
        if (hist[cur] === true) hits += 1;
        if (cur === end) break;
        cur = dateAddDays(cur, 1);
      }
    } else {
      const keys = Object.keys(hist);
      possible += keys.length;
      hits += keys.filter(k => hist[k] === true).length;
    }
  }

  const pct = possible > 0 ? Math.round((hits / possible) * 100) : null;
  return { hits, possible, pct };
}

function renderStats() {
  const s7 = computeHabitStats(7);
  const s30 = computeHabitStats(30);
  const s90 = computeHabitStats(90);
  const sall = computeHabitStats(null);

  elStat7.textContent = s7.pct == null ? "—" : `${s7.pct}% (${s7.hits}/${s7.possible})`;
  elStat30.textContent = s30.pct == null ? "—" : `${s30.pct}% (${s30.hits}/${s30.possible})`;
  elStat90.textContent = s90.pct == null ? "—" : `${s90.pct}% (${s90.hits}/${s90.possible})`;
  elStatAll.textContent = sall.pct == null ? "—" : `${sall.pct}% (${sall.hits}/${sall.possible})`;
}

/* ---------- Timed Activities ---------- */

function ensureTodayLog(a) {
  a.log ??= {};
  a.log[TODAY] ??= { pomos: 0, minutes: 0, cardio: [] };
  a.log[TODAY].pomos ??= 0;
  a.log[TODAY].minutes ??= 0;
  a.log[TODAY].cardio ??= [];
  return a.log[TODAY];
}

function clampInt(x, lo, hi, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  const k = Math.floor(n);
  return Math.max(lo, Math.min(hi, k));
}

function starsHTML(done, target) {
  const full = "★★★★★";
  const frac = target <= 0 ? 0 : Math.max(0, Math.min(1, done / target));
  const pct = Math.round(frac * 100);
  return `
    <span class="stars" title="${done}/${target}">
      <span class="fill" style="width:${pct}%">${full}</span>${full}
    </span>
  `;
}

/* Timer model: single active timer */
let timer = {
  activityId: null,
  mode: "work",          // "work" | "break"
  remainingSec: 0,
  running: false,
  startedAtMs: null,     // for partial credit if stopped early
  workSec: 25 * 60,
  breakSec: 5 * 60,
};

let tickHandle = null;

function formatMMSS(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function getActivityById(id) {
  return state.activities.find(a => a.id === id) || null;
}

function selectTimerActivity(activityId) {
  const a = getActivityById(activityId);
  if (!a) return;

  timer.activityId = a.id;
  timer.workSec = clampInt(a.workMin, 1, 180, 25) * 60;
  timer.breakSec = clampInt(a.breakMin, 0, 60, 5) * 60;

  if (!timer.running) {
    timer.mode = "work";
    timer.remainingSec = timer.workSec;
    timer.startedAtMs = null;
  }
  renderTimer();
}

async function creditWorkSession(activityId, minutes, pomosInc) {
  const a = getActivityById(activityId);
  if (!a) return;

  const log = ensureTodayLog(a);
  log.minutes += minutes;
  log.pomos += pomosInc;

  await persist();
  renderAll();
}

function startTimer() {
  if (!timer.activityId) return;

  if (!timer.running) {
    timer.running = true;
    timer.startedAtMs = Date.now();
    if (!tickHandle) tickHandle = setInterval(tick, 250);
  }
  renderTimer();
}

function pauseTimer() {
  timer.running = false;
  timer.startedAtMs = null;
  renderTimer();
}

async function stopTimer({ creditPartial = false } = {}) {
  if (!timer.activityId) return;

  if (creditPartial && timer.mode === "work" && timer.running && timer.startedAtMs) {
    const elapsedMin = Math.max(0, Math.round((Date.now() - timer.startedAtMs) / 60000));
    if (elapsedMin > 0) {
      await creditWorkSession(timer.activityId, elapsedMin, 0);
    }
  }

  timer.running = false;
  timer.startedAtMs = null;
  timer.mode = "work";
  timer.remainingSec = timer.workSec;

  renderTimer();
}

async function skipTimerPhase() {
  if (!timer.activityId) return;

  // If skipping work phase, don't credit.
  timer.running = false;
  timer.startedAtMs = null;

  if (timer.mode === "work") {
    timer.mode = "break";
    timer.remainingSec = timer.breakSec;
  } else {
    timer.mode = "work";
    timer.remainingSec = timer.workSec;
  }

  renderTimer();
}

async function onWorkComplete() {
  await creditWorkSession(timer.activityId, Math.round(timer.workSec / 60), 1);
  timer.mode = "break";
  timer.remainingSec = timer.breakSec;
  timer.running = false;
  timer.startedAtMs = null;
  renderTimer();
}

function onBreakComplete() {
  timer.mode = "work";
  timer.remainingSec = timer.workSec;
  timer.running = false;
  timer.startedAtMs = null;
  renderTimer();
}

function tick() {
  if (!timer.running) return;
  timer.remainingSec -= 0.25;
  if (timer.remainingSec <= 0) {
    timer.remainingSec = 0;
    const mode = timer.mode;
    timer.running = false;
    timer.startedAtMs = null;

    if (mode === "work") {
      onWorkComplete();
    } else {
      onBreakComplete();
    }
  }
  renderTimer();
}

function renderTimer() {
  const a = timer.activityId ? getActivityById(timer.activityId) : null;

  if (!a) {
    elTimerTitle.textContent = "No timer running";
    elTimerMode.textContent = "—";
    elTimerRemaining.textContent = "—";
    elTimerStartPauseBtn.disabled = true;
    elTimerSkipBtn.disabled = true;
    elTimerStopBtn.disabled = true;
    elTimerStartPauseBtn.textContent = "Start";
    return;
  }

  elTimerTitle.textContent = a.name;
  elTimerMode.textContent = timer.mode === "work" ? "Work" : "Break";
  elTimerRemaining.textContent = formatMMSS(timer.remainingSec);

  elTimerStartPauseBtn.disabled = false;
  elTimerSkipBtn.disabled = false;
  elTimerStopBtn.disabled = false;

  elTimerStartPauseBtn.textContent = timer.running ? "Pause" : "Start";
}

function renderActivities() {
  const total = state.activities.length;
  let totalMinToday = 0;
  let totalPomosToday = 0;

  for (const a of state.activities) {
    const log = a.log?.[TODAY];
    if (log) {
      totalMinToday += Number(log.minutes || 0);
      totalPomosToday += Number(log.pomos || 0);
    }
  }

  elActivitySummary.textContent =
    total === 0
      ? "No activities yet."
      : `${totalPomosToday} pomos • ${totalMinToday} min today`;

  elActivityList.innerHTML = "";

  if (total === 0) {
    elActivityList.innerHTML = `<div class="muted">Add an activity above (Reading, Cardio, etc.).</div>`;
    return;
  }

  for (const a of state.activities) {
    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.className = "item-left";

    const title = document.createElement("div");
    title.className = "item-title";

    const log = ensureTodayLog(a);
    const target = clampInt(a.targetPomos, 1, 12, 5);

    const meta = document.createElement("div");
    meta.className = "meta kv";
    meta.innerHTML = `
      ${starsHTML(log.pomos, target)}
      <span class="pill"><strong>${log.pomos}</strong> / ${target} pomos</span>
      <span class="pill"><strong>${log.minutes}</strong> min</span>
      <span class="pill">${clampInt(a.workMin, 1, 180, 25)}m work</span>
      <span class="pill">${clampInt(a.breakMin, 0, 60, 5)}m break</span>
    `;

    title.innerHTML = `<div class="name">${escapeHtml(a.name)}</div>`;
    title.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const btnStart = document.createElement("button");
    btnStart.className = "btn";
    btnStart.type = "button";
    btnStart.textContent = (timer.activityId === a.id && timer.running) ? "Pause" : "Start";
    btnStart.addEventListener("click", () => {
      if (timer.activityId !== a.id) {
        selectTimerActivity(a.id);
      }
      if (timer.running) pauseTimer(); else startTimer();
    });

    const btnStop = document.createElement("button");
    btnStop.className = "btn ghost";
    btnStop.type = "button";
    btnStop.textContent = "Stop";
    btnStop.addEventListener("click", async () => {
      if (timer.activityId === a.id) {
        await stopTimer({ creditPartial: false });
      }
    });

    const btnPomo = document.createElement("button");
    btnPomo.className = "btn ghost";
    btnPomo.type = "button";
    btnPomo.textContent = "+1 pomo";
    btnPomo.addEventListener("click", async () => {
      await creditWorkSession(a.id, clampInt(a.workMin, 1, 180, 25), 1);
    });

    const btnMinutes = document.createElement("button");
    btnMinutes.className = "btn ghost";
    btnMinutes.type = "button";
    btnMinutes.textContent = "+minutes";
    btnMinutes.addEventListener("click", async () => {
      const raw = prompt(`Add minutes for "${a.name}" today:`, "30");
      if (raw == null) return;
      const mins = clampInt(raw, 1, 1440, 30);
      await creditWorkSession(a.id, mins, 0);
    });

    const btnCardio = document.createElement("button");
    btnCardio.className = "btn ghost";
    btnCardio.type = "button";
    btnCardio.textContent = "Cardio log";
    btnCardio.addEventListener("click", async () => {
      const dist = prompt("Distance (km), optional:", "");
      if (dist == null) return;
      const dur = prompt("Duration (minutes):", "30");
      if (dur == null) return;
      const kind = prompt("Type (run/bike/row/etc), optional:", "");
      if (kind == null) return;

      const a2 = getActivityById(a.id);
      if (!a2) return;
      const log2 = ensureTodayLog(a2);

      const entry = {
        ts: Date.now(),
        type: (kind || "").trim(),
        distance_km: dist === "" ? null : Number(dist),
        duration_min: Number(dur),
      };

      log2.cardio.push(entry);
      // Credit duration as minutes (no auto pomo unless you want)
      if (Number.isFinite(entry.duration_min) && entry.duration_min > 0) {
        log2.minutes += Math.floor(entry.duration_min);
      }

      await persist();
      renderAll();
    });

    const btnDel = document.createElement("button");
    btnDel.className = "btn danger";
    btnDel.type = "button";
    btnDel.textContent = "Delete";
    btnDel.addEventListener("click", async () => {
      if (!confirm(`Delete activity "${a.name}"? This removes all its logs.`)) return;

      // If timer is on this activity, clear it
      if (timer.activityId === a.id) {
        timer.activityId = null;
        timer.running = false;
        timer.startedAtMs = null;
        timer.mode = "work";
        timer.remainingSec = 0;
      }

      state.activities = state.activities.filter(x => x.id !== a.id);
      await persist();
      renderAll();
    });

    actions.appendChild(btnStart);
    actions.appendChild(btnStop);
    actions.appendChild(btnPomo);
    actions.appendChild(btnMinutes);
    actions.appendChild(btnCardio);
    actions.appendChild(btnDel);

    left.appendChild(title);
    row.appendChild(left);
    row.appendChild(actions);

    elActivityList.appendChild(row);
  }

  renderTimer();
}

/* ---------- Export / Import / Wipe ---------- */

elExportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `todo-habits-${TODAY}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

elImportBtn.addEventListener("click", () => elImportFile.click());

elImportFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object") throw new Error("bad json");
    if (!Array.isArray(parsed.habits) || !Array.isArray(parsed.tasks)) throw new Error("missing habits/tasks");

    parsed.taskFilter ??= "all";
    parsed.activities ??= [];
    state = parsed;

    await persist();
    renderAll();
    alert("Imported.");
  } catch (err) {
    alert("Import failed: " + (err?.message || String(err)));
  } finally {
    elImportFile.value = "";
  }
});

elWipeBtn.addEventListener("click", async () => {
  if (!confirm("Wipe ALL data (habits, tasks, activities, history) from this browser?")) return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_FILE_HINT_KEY);
  fileHandle = null;
  state = DEFAULT_STATE();

  timer.activityId = null;
  timer.running = false;
  timer.startedAtMs = null;
  timer.mode = "work";
  timer.remainingSec = 0;

  await persist();
  renderAll();
});

/* ---------- Events ---------- */

elHabitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = elHabitName.value.trim();
  if (!name) return;

  state.habits.push({ id: uid(), name, history: {} });
  elHabitName.value = "";

  await persist();
  renderAll();
});

elResetTodayBtn.addEventListener("click", async () => {
  for (const h of state.habits) {
    if (h.history?.[TODAY]) h.history[TODAY] = false;
  }
  // NOTE: intentionally does not reset activities
  await persist();
  renderAll();
});

elTaskForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = elTaskName.value.trim();
  if (!name) return;

  const due = elTaskDue.value || "";
  const cat = (elTaskCat.value || "").trim();

  state.tasks.unshift({
    id: uid(),
    name,
    due,
    cat,
    done: false,
    created: Date.now(),
  });

  elTaskName.value = "";
  elTaskDue.value = "";
  elTaskCat.value = "";

  await persist();
  renderAll();
});

elClearDoneTasksBtn.addEventListener("click", async () => {
  state.tasks = state.tasks.filter(t => !t.done);
  await persist();
  renderAll();
});

elConnectFileBtn.addEventListener("click", connectFile);

/* activity form */
elActivityForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = elActivityName.value.trim();
  if (!name) return;

  const targetPomos = clampInt(elActivityTarget.value, 1, 12, 5);
  const workMin = clampInt(elActivityWork.value, 1, 180, 25);
  const breakMin = clampInt(elActivityBreak.value, 0, 60, 5);

  state.activities.push({
    id: uid(),
    name,
    targetPomos,
    workMin,
    breakMin,
    log: {},
  });

  elActivityName.value = "";
  elActivityTarget.value = String(targetPomos);
  elActivityWork.value = String(workMin);
  elActivityBreak.value = String(breakMin);

  await persist();
  renderAll();
});

/* timer controls */
elTimerStartPauseBtn.addEventListener("click", () => {
  if (!timer.activityId) return;
  if (timer.running) pauseTimer(); else startTimer();
});
elTimerSkipBtn.addEventListener("click", skipTimerPhase);
elTimerStopBtn.addEventListener("click", () => stopTimer({ creditPartial: false }));

/* ---------- Render ---------- */

function renderAll() {
  renderActivities();
  renderHabits();
  renderTasks();
  renderStats();
}

persist();
renderAll();
