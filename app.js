/* To-Do + Habit Tracker (File-backed via File System Access API)
   - Works best in Chrome/Edge
   - User clicks "Connect file" once, chooses tracker-data.json
   - After that, autosaves to that file on every change
   - Falls back to localStorage if API unavailable / not connected
*/

const LS_KEY = "todo_habit_tracker_v1";
const LS_FILE_HINT_KEY = "todo_habit_tracker_file_hint_v1"; // just for UI label; cannot restore handle reliably
const DEFAULT_STATE = () => ({
  habits: [
    { id: uid(), name: "Exercise", history: {} },
    { id: uid(), name: "Read", history: {} },
    { id: uid(), name: "Drink Water", history: {} },
  ],
  tasks: [],
  taskFilter: "all",
});

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
  return dt.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isoCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

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

/* ---------- Storage Layer ---------- */

const hasFSA = !!window.showOpenFilePicker; // basic check
let fileHandle = null; // not persisted across sessions
let state = null;

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
  if (!Array.isArray(parsed.habits) || !Array.isArray(parsed.tasks)) throw new Error("Missing habits/tasks arrays");
  parsed.taskFilter ??= "all";
  return parsed;
}

async function writeStateToFile(handle, s) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(s, null, 2));
  await writable.close();
}

function setStatus(msg) {
  elFileStatus.textContent = msg;
}

async function persist() {
  // Always keep localStorage as a fallback mirror
  saveLocalStorageState(state);

  if (fileHandle) {
    try {
      await writeStateToFile(fileHandle, state);
      setStatus(`Connected: ${localStorage.getItem(LS_FILE_HINT_KEY) || "tracker-data.json"} • autosaved`);
    } catch (e) {
      setStatus(`Connected, but save failed (permission?) • falling back to localStorage`);
      // keep fileHandle but user may need to reconnect
    }
  } else {
    setStatus(hasFSA ? "Not connected • using localStorage" : "File API not available • using localStorage");
  }
}

async function connectFile() {
  if (!hasFSA) {
    alert("File System Access API not available in this browser. Use Chrome/Edge.");
    return;
  }
  try {
    // Allow selecting existing or creating new via Save File Picker
    const handle = await window.showSaveFilePicker({
      suggestedName: "tracker-data.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
    });

    // Request permission
    const perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") throw new Error("Permission not granted");

    fileHandle = handle;
    // UI hint (cannot restore handle after reload, but helps user remember filename)
    localStorage.setItem(LS_FILE_HINT_KEY, handle.name || "tracker-data.json");

    // If file has content, try loading it; otherwise write current state into it
    let loaded = null;
    try {
      loaded = await readStateFromFile(handle);
    } catch {
      loaded = null;
    }
    if (loaded) {
      state = loaded;
      await persist();
      renderAll();
      alert("Connected + loaded file.");
    } else {
      await persist();
      alert("Connected. Writing current data to file.");
    }
  } catch (e) {
    // user canceled is fine
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

/* ---------- App init ---------- */

const TODAY = todayISO();
elTodayStr.textContent = formatNiceDate(TODAY);

state = loadLocalStorageState();
setStatus(hasFSA ? "Not connected • using localStorage" : "File API not available • using localStorage");

/* ---------- Rendering helpers ---------- */

function checkIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

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
    check.innerHTML = checkIcon();
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
      <div class="meta">${habitMeta(h)}</div>
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
  const cats = Array.from(new Set(state.tasks.map(t => (t.cat || "").trim()).filter(Boolean)))
    .sort((a,b)=>a.localeCompare(b));

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
    check.innerHTML = checkIcon();
    check.title = "Toggle";
    check.addEventListener("click", async () => {
      t.done = !t.done;
      await persist();
      renderAll();
    });

    const title = document.createElement("div");
    title.className = "item-title";

    const metaBits = [];
    if (t.cat) metaBits.push(`<span class="pill">${escapeHtml(t.cat)}</span>`);
    if (t.due) {
      const dueNice = formatNiceDate(t.due);
      const tag = taskIsOverdue(t)
        ? `<span class="pill" style="border-color:rgba(251,113,133,.4);color:var(--text)">Overdue • ${escapeHtml(dueNice)}</span>`
        : `<span class="pill">Due ${escapeHtml(dueNice)}</span>`;
      metaBits.push(tag);
    }

    title.innerHTML = `
      <div class="name" style="${t.done ? "text-decoration:line-through;opacity:.75" : ""}">
        ${escapeHtml(t.name)}
      </div>
      <div class="meta">${metaBits.join(" ") || "<span class='muted'>—</span>"}</div>
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

/* ---------- Stats ---------- */

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

  elStat7.textContent   = s7.pct  == null ? "—" : `${s7.pct}% (${s7.hits}/${s7.possible})`;
  elStat30.textContent  = s30.pct == null ? "—" : `${s30.pct}% (${s30.hits}/${s30.possible})`;
  elStat90.textContent  = s90.pct == null ? "—" : `${s90.pct}% (${s90.hits}/${s90.possible})`;
  elStatAll.textContent = sall.pct== null ? "—" : `${sall.pct}% (${sall.hits}/${sall.possible})`;
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
  if (!confirm("Wipe ALL data (habits, tasks, history) from this browser?")) return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_FILE_HINT_KEY);
  fileHandle = null;
  state = DEFAULT_STATE();
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

/* ---------- Render ---------- */

function renderAll() {
  renderHabits();
  renderTasks();
  renderStats();
}

persist();
renderAll();