import {
  createSession,
  startSession,
  pauseSession,
  syncSession,
  resetInfusion,
  selectInfusion,
  adjustDuration,
  nextInfusion,
  addInfusion,
  restoreSession,
} from "./engine.mjs";
import {
  migrateLegacy,
  normalizeSettings,
  cleanArchivedJournal,
} from "./migration.mjs";
import { createTeaScene } from "./tea-scene.mjs";

const $ = (id) => document.getElementById(id);
const teaScene = createTeaScene($("teaScene"));
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const svg = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  leaf: svg(
    '<path d="M19 4C8 3 3 8 6 15s14 3 13-11Z"/><path d="M4 21 15 9M9 16l-1-5m4 2 4 0"/>',
  ),
  star: svg(
    '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  ),
  cup: svg(
    '<path d="M3 9h14v4a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6ZM17 10h2a3 3 0 0 1 0 6h-2M3 22h16M7 3v2m6-2v2"/>',
  ),
  temp: svg(
    '<path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z"/><path d="M12 9v8m0 1h.01M18 6h2m-2 4h2"/>',
  ),
  play: svg('<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  reset: svg('<path d="M4 9a8 8 0 1 1-.3 6M4 3v6h6"/>'),
  next: svg('<path d="m5 5 10 7-10 7ZM19 5v14"/>'),
  check: svg('<path d="m5 12 4 4L19 6"/>'),
  close: svg('<path d="m6 6 12 12M6 18 18 6"/>'),
  help: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01"/>',
  ),
  search: svg('<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>'),
  sound: svg(
    '<path d="M4 9h4l5-5v16l-5-5H4ZM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  ),
  muted: svg('<path d="M4 9h4l5-5v16l-5-5H4Zm13 0 5 6m0-6-5 6"/>'),
};

const TEAS = [
  {
    id: "green",
    name: "Zelený čaj",
    kind: "ZELENÝ",
    color: "#718754",
    temp: "75–80°C",
    ratio: 4,
    infusions: [30, 40, 50, 60, 70, 80, 90, 100],
    desc: "Lóng Jǐng, Bì Luó Chūn",
    tip: "Pokud čaj hořkne, snižte teplotu vody nebo zkraťte louhování.",
  },
  {
    id: "white",
    name: "Bílý čaj",
    kind: "BÍLÝ",
    color: "#a69d80",
    temp: "85–90°C",
    ratio: 4.5,
    infusions: [20, 15, 20, 25, 30, 40, 50, 70, 90],
    desc: "Bái Háo Yín Zhēn, Bái Mǔ Dān",
    tip: "U vyzrálých a lisovaných bílých čajů lze použít teplejší vodu.",
  },
  {
    id: "yellow",
    name: "Žlutý čaj",
    kind: "ŽLUTÝ",
    color: "#a8934c",
    temp: "80–85°C",
    ratio: 4,
    infusions: [15, 15, 20, 25, 35, 50, 70],
    desc: "Jūn Shān Yín Zhēn",
    tip: "Použijte kratší nálevy a vodu o teplotě 80–85 °C.",
  },
  {
    id: "oolong_light",
    name: "Oolong světlý",
    kind: "SVĚTLÝ OOLONG",
    color: "#678259",
    temp: "90–95°C",
    ratio: 5,
    infusions: [20, 15, 20, 25, 30, 35, 45, 60, 80, 100],
    desc: "Tiě Guān Yīn, Āli Shān",
    tip: "Svinuté lístky se postupně rozevřou. Druhý nálev proto může být kratší než první.",
  },
  {
    id: "oolong_dark",
    name: "Oolong tmavý",
    kind: "TMAVÝ OOLONG",
    color: "#987352",
    temp: "95–100°C",
    ratio: 6,
    infusions: [10, 10, 15, 15, 20, 25, 30, 40, 60, 80],
    desc: "Dà Hóng Páo, Ròu Guì",
    tip: "Mezi nálevy nechte konvičku důkladně vykapat.",
  },
  {
    id: "red",
    name: "Červený čaj",
    kind: "ČERNÝ / HÓNG CHÁ",
    color: "#a46c53",
    temp: "90–95°C",
    ratio: 5,
    infusions: [10, 10, 15, 15, 20, 30, 40, 60],
    desc: "Diān Hóng, Jīn Jùn Méi · černý čaj",
    tip: "Červený čaj odpovídá evropskému označení černý čaj. Začněte krátkým nálevem.",
  },
  {
    id: "sheng",
    name: "Shēng Pǔ’ěr",
    kind: "NEFERMENTOVANÝ",
    color: "#78824d",
    temp: "95–100°C",
    ratio: 6,
    infusions: [10, 8, 10, 12, 15, 20, 25, 35, 50, 70, 90, 120],
    desc: "Mladý i vyzrálý shēng",
    tip: "Pokud je mladý shēng příliš silný, snižte teplotu nebo zkraťte první nálevy.",
  },
  {
    id: "shou",
    name: "Shóu Pǔ’ěr",
    kind: "FERMENTOVANÝ",
    color: "#87725b",
    temp: "100°C",
    ratio: 6,
    infusions: [10, 10, 10, 15, 15, 20, 25, 35, 50, 70, 90],
    desc: "Zralý fermentovaný Pǔ’ěr",
    tip: "Lístky můžete krátce propláchnout. Pak použijte čerstvě vroucí vodu a nálev vždy zcela slijte.",
  },
  {
    id: "dancong",
    name: "Dān Cóng",
    kind: "FÈNGHUÁNG OOLONG",
    color: "#a28b5b",
    temp: "95–100°C",
    ratio: 7,
    infusions: [5, 5, 8, 10, 15, 20, 25, 35, 50, 70],
    desc: "Fènghuáng Dān Cóng",
    tip: "Začněte nálevem dlouhým 5 sekund. Čaj ihned slijte.",
  },
];
for (const tea of TEAS)
  tea.rinse = [
    "oolong_light",
    "oolong_dark",
    "sheng",
    "shou",
    "dancong",
  ].includes(tea.id);
const KEY = "gongfu-tea-v2";
let storageAvailable = true;
const tabId = crypto.randomUUID();
let revision = 0;
let owner = tabId;
let saved = {};
try {
  const raw = localStorage.getItem(KEY);
  if (raw && raw.length < 3000000) saved = JSON.parse(raw) || {};
  saved = migrateLegacy(
    (key) => localStorage.getItem(key),
    raw === null ? null : saved,
    TEAS,
  );
} catch {
  storageAvailable = false;
}
if (typeof saved !== "object" || Array.isArray(saved)) saved = {};
revision = Number.isSafeInteger(saved.revision) ? saved.revision : 0;
owner = typeof saved.owner === "string" ? saved.owner : tabId;
const validTea = (tea) => {
  try {
    return createSession(tea).tea;
  } catch {
    return null;
  }
};
let customTeas = (Array.isArray(saved.customTeas) ? saved.customTeas : [])
  .slice(0, 500)
  .map(validTea)
  .filter((tea) => tea?.id.startsWith("custom_"));
customTeas = customTeas.filter(
  (tea, index) => customTeas.findIndex((item) => item.id === tea.id) === index,
);
let favorites = new Set(
  (Array.isArray(saved.favorites) ? saved.favorites : [])
    .filter((id) => typeof id === "string")
    .slice(0, 100),
);
let volume =
  Number.isInteger(saved.volume) && saved.volume >= 30 && saved.volume <= 1000
    ? saved.volume
    : 100;
let settings = normalizeSettings(saved.settings);
let soundEnabled = saved.soundEnabled !== false;
settings.sound = soundEnabled;
let archivedHistory = cleanArchivedJournal(saved.archivedHistory);
let legacyImported = saved.legacyImported === true;
let deletedSessions = new Set(
  Array.isArray(saved.deletedSessions)
    ? saved.deletedSessions
        .filter((id) => typeof id === "string")
        .slice(0, 1000)
    : [],
);
function cleanOverrides(raw) {
  return Object.fromEntries(
    TEAS.flatMap((tea) => {
      const custom = validTea(raw?.[tea.id]);
      return custom && custom.id === tea.id ? [[tea.id, custom]] : [];
    }),
  );
}
let overrides = cleanOverrides(saved.overrides);
const newSession = (tea) => createSession(tea, Date.now(), settings.rinse);
const completedCount = (brew) =>
  brew.completed.filter((index) => !brew.rinse || index !== 0).length;
const infusionCount = (brew) => brew.durations.length - (brew.rinse ? 1 : 0);
const infusionLabel = (brew, index = brew.index) =>
  brew.rinse && index === 0
    ? "Oplach"
    : `${index + 1 - (brew.rinse ? 1 : 0)}. nálev`;
let history = (Array.isArray(saved.history) ? saved.history : [])
  .slice(0, 500)
  .flatMap((item) => {
    const snapshot = restoreSession(item?.session);
    return snapshot &&
      Number.isSafeInteger(item.at) &&
      Number.isFinite(new Date(item.at).getTime()) &&
      item.at > 0 &&
      completedCount(snapshot)
      ? [
          {
            session: snapshot,
            at: item.at,
            volume:
              Number.isInteger(item.volume) &&
              item.volume >= 30 &&
              item.volume <= 1000
                ? item.volume
                : 100,
            note: typeof item.note === "string" ? item.note.slice(0, 2000) : "",
            rating: Number.isInteger(item.rating)
              ? Math.max(0, Math.min(5, item.rating))
              : 0,
          },
        ]
      : [];
  });
let session =
  restoreSession(saved.session) ||
  newSession(
    overrides.oolong_light || TEAS.find((tea) => tea.id === "oolong_light"),
  );
let filter = "all";
let query = "";
let view =
  session.status === "running" ||
  session.status === "paused" ||
  session.status === "done"
    ? "timer"
    : "collection";
let toastTimeout;
let pendingConfirmation = null;
let wakeLock = null;
let wakeRequestPending = false;
let lastSecond = null;

function makeAudio(src) {
  const audio = new Audio();
  audio.dataset.url = src;
  audio.preload = "auto";
  fetch(src)
    .then((response) => {
      if (!response.ok) throw new Error("Audio unavailable");
      return response.blob();
    })
    .then((blob) => {
      if (!audio.src) audio.src = URL.createObjectURL(blob);
    })
    .catch(() => {
      if (!audio.src) audio.src = src;
    });
  return audio;
}
const chime = makeAudio("./assets/chime.wav");
const tickSound = makeAudio("./assets/tick.wav");
const silence = makeAudio("./assets/silence.wav");
silence.loop = true;
silence.volume = 0.01;
let audioUnlocked = false;
let audioUnlocking = false;
chime.preload = tickSound.preload = "auto";

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("toast").classList.remove("show"), 3500);
}
function applyExternal(data) {
  if (
    !data ||
    typeof data !== "object" ||
    !Number.isSafeInteger(data.revision) ||
    data.revision <= revision
  )
    return false;
  const restored = restoreSession(data.session);
  if (!restored) return false;
  revision = data.revision;
  owner = typeof data.owner === "string" ? data.owner : "";
  session = restored;
  customTeas = (Array.isArray(data.customTeas) ? data.customTeas : [])
    .slice(0, 500)
    .map(validTea)
    .filter((tea) => tea?.id.startsWith("custom_"));
  favorites = new Set(
    (Array.isArray(data.favorites) ? data.favorites : [])
      .filter((id) => typeof id === "string")
      .slice(0, 100),
  );
  volume =
    Number.isInteger(data.volume) && data.volume >= 30 && data.volume <= 1000
      ? data.volume
      : 100;
  soundEnabled = data.soundEnabled !== false;
  settings = normalizeSettings(data.settings);
  settings.sound = soundEnabled;
  overrides = cleanOverrides(data.overrides);
  archivedHistory = cleanArchivedJournal(data.archivedHistory);
  legacyImported = data.legacyImported === true;
  deletedSessions = new Set(
    Array.isArray(data.deletedSessions)
      ? data.deletedSessions
          .filter((id) => typeof id === "string")
          .slice(0, 1000)
      : [],
  );
  applyTheme();
  history = (Array.isArray(data.history) ? data.history : [])
    .slice(0, 500)
    .flatMap((item) => {
      const snapshot = restoreSession(item?.session);
      return snapshot &&
        Number.isSafeInteger(item.at) &&
        Number.isFinite(new Date(item.at).getTime()) &&
        item.at > 0 &&
        completedCount(snapshot)
        ? [
            {
              session: snapshot,
              at: item.at,
              volume:
                Number.isInteger(item.volume) &&
                item.volume >= 30 &&
                item.volume <= 1000
                  ? item.volume
                  : 100,
              note:
                typeof item.note === "string" ? item.note.slice(0, 2000) : "",
              rating: Number.isInteger(item.rating)
                ? Math.max(0, Math.min(5, item.rating))
                : 0,
            },
          ]
        : [];
    });
  if (owner !== tabId) {
    stopSilence();
    releaseAwake();
  }
  renderSound();
  renderCollection();
  renderTimer();
  $("journalCount").textContent = history.length + archivedHistory.length;
  if ($("journalDialog").open) renderJournal();
  return true;
}
function save(releaseOwnership = false, claimOwnership = false) {
  try {
    const latest = localStorage.getItem(KEY);
    let latestData = null;
    try {
      if (latest && latest.length < 3000000) latestData = JSON.parse(latest);
    } catch {}
    if (latestData && applyExternal(latestData)) return;
    revision = Math.max(Date.now(), revision + 1);
    if (releaseOwnership) owner = "";
    else if (claimOwnership || !owner || session.status !== "running")
      owner = tabId;
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        revision,
        owner,
        customTeas,
        favorites: [...favorites],
        volume,
        soundEnabled,
        settings,
        overrides,
        archivedHistory,
        deletedSessions: [...deletedSessions].slice(-1000),
        legacyImported,
        history,
        session,
      }),
    );
    storageAvailable = true;
  } catch {
    if (storageAvailable)
      toast("Prohlížeč nedovolil uložit data. Nezavírejte rozběhnutý časovač.");
    storageAvailable = false;
  }
  $("saveIndicator").hidden = storageAvailable;
  $("saveIndicator").textContent = storageAvailable
    ? "Průběžně uloženo"
    : "Ukládání není dostupné";
}
function allTeas() {
  return [
    ...TEAS.map((tea) => ({ ...tea, ...overrides[tea.id] })),
    ...customTeas,
  ];
}
function metadata(tea) {
  return (
    TEAS.find((item) => item.id === tea.id) || {
      kind: "VLASTNÍ RECEPT",
      tip: "Čas jednotlivých nálevů lze změnit před spuštěním.",
    }
  );
}
function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs");
}
function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function secondsText(seconds) {
  return `${seconds} ${seconds === 1 ? "sekunda" : seconds >= 2 && seconds <= 4 ? "sekundy" : "sekund"}`;
}
function nl(value) {
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(
    value,
  );
}
function setView(next) {
  view = next;
  teaScene.setVisible(next === "timer");
  $("workspace").dataset.view = next;
  document.querySelector(".app-shell").dataset.view = next;
  $("showCollection").setAttribute(
    "aria-pressed",
    String(next === "collection"),
  );
  $("showTimer").setAttribute("aria-pressed", String(next === "timer"));
  if (next === "timer") requestAnimationFrame(scrollActiveInfusion);
}
function scrollToTimer() {
  window.scrollTo({ top: 0, behavior: "instant" });
  $("timerPanel").focus({ preventScroll: true });
}
function renderCollection() {
  const teas = allTeas().filter(
    (tea) =>
      (filter === "all" ||
        (filter === "favorites" && favorites.has(tea.id)) ||
        (filter === "custom" && tea.id.startsWith("custom_"))) &&
      normalize(`${tea.name} ${tea.desc || ""} ${metadata(tea).kind}`).includes(
        normalize(query),
      ),
  );
  $("teaGrid").innerHTML = "";
  teas.forEach((tea) => {
    const card = document.createElement("article");
    const selected = tea.id === session.tea.id;
    card.className = `tea-card${selected ? " selected" : ""}`;
    card.style.setProperty("--tea-color", tea.color || "#76875e");
    card.innerHTML = `<button class="tea-select" aria-label="Vybrat ${esc(tea.name)}" aria-pressed="${selected}"><span class="tea-topline"><span class="tea-mark">${icons.leaf}</span><span class="tea-kind">${esc(metadata(tea).kind)}</span></span><span class="tea-name">${esc(tea.name)}</span><span class="tea-meta"><span>${esc(tea.temp.replace("°C", " °C"))}</span><span class="dot">·</span><span>${tea.infusions.length} nálevů</span></span>${selected ? `<span class="selected-check">${icons.check}</span>` : ""}</button><button class="favorite-button" aria-label="${favorites.has(tea.id) ? "Odebrat z oblíbených:" : "Přidat k oblíbeným:"} ${esc(tea.name)}" aria-pressed="${favorites.has(tea.id)}" title="Oblíbený čaj">${icons.star}</button>`;
    card
      .querySelector(".tea-select")
      .addEventListener("click", () => requestTea(tea));
    card.querySelector(".favorite-button").addEventListener("click", () => {
      favorites.has(tea.id) ? favorites.delete(tea.id) : favorites.add(tea.id);
      save();
      renderCollection();
      const replacement = [
        ...$("teaGrid").querySelectorAll(".favorite-button"),
      ].find((button) =>
        button.getAttribute("aria-label").endsWith(`: ${tea.name}`),
      );
      replacement?.focus({ preventScroll: true });
    });
    $("teaGrid").append(card);
  });
  if (!teas.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const heading = query
      ? "Žádné výsledky"
      : filter === "favorites"
        ? "Žádné oblíbené čaje"
        : "Žádné vlastní recepty";
    const detail = query
      ? "Zkuste kratší název nebo si uložte vlastní recept."
      : filter === "favorites"
        ? "Čaj přidáte klepnutím na hvězdičku."
        : "Nový recept přidáte tlačítkem Vlastní čaj.";
    empty.innerHTML = `<h3>${heading}</h3><p>${detail}</p>`;
    $("teaGrid").append(empty);
  }
  if (
    (!query && filter !== "favorites") ||
    (!teas.length && filter !== "favorites")
  ) {
    const add = document.createElement("button");
    add.className = "add-card";
    add.innerHTML =
      '<span aria-hidden="true">+</span><strong>Vlastní čaj</strong><small>Uložit vlastní nastavení</small>';
    add.addEventListener("click", () => openCustom());
    $("teaGrid").append(add);
  }
}
function confirmAction(title, message, label, action) {
  pendingConfirmation = action;
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmAction").textContent = label;
  $("confirmDialog").showModal();
}
function requestTea(tea) {
  if (tea.id === session.tea.id) {
    setView("timer");
    scrollToTimer();
    return;
  }
  const change = () => {
    session = newSession(tea);
    lastSecond = null;
    releaseAwake();
    stopSilence();
    save();
    renderCollection();
    renderTimer();
    setView("timer");
    scrollToTimer();
  };
  if (session.status === "running" || session.status === "paused")
    confirmAction(
      "Připravit jiný čaj?",
      "Aktuální odpočet se ukončí. Hotové nálevy zůstanou v deníku.",
      "Změnit čaj",
      change,
    );
  else change();
}
function updateClock() {
  const seconds = Math.ceil(session.remainingMs / 1000);
  $("timerTime").textContent = formatTime(seconds);
  $("timerTime").setAttribute("aria-label", `Zbývá ${secondsText(seconds)}`);
  teaScene.update({
    status: session.status,
    progress:
      1 - session.remainingMs / (session.durations[session.index] * 1000),
    teaId: session.tea.id,
    teaColor: session.tea.color,
    infusion: `${session.id}:${session.index}`,
  });
  document.title =
    session.status === "running"
      ? `${formatTime(seconds)} · ${session.tea.name} — Gōng Fū Chá`
      : session.status === "done"
        ? "Čaj je hotový · Gōng Fū Chá"
        : "Gōng Fū Chá · Čajový časovač";
}
function scrollActiveInfusion() {
  const strip = $("infusionsStrip");
  const active = strip.children[session.index];
  if (!active || !strip.clientWidth) return;
  strip.scrollLeft +=
    active.getBoundingClientRect().left -
    strip.getBoundingClientRect().left -
    (strip.clientWidth - active.offsetWidth) / 2;
}
function renderPills() {
  $("infusionsStrip").innerHTML = "";
  session.durations.forEach((seconds, index) => {
    const button = document.createElement("button");
    button.className = `inf-pill${index === session.index ? " active" : ""}${session.completed.includes(index) ? " done" : ""}`;
    button.innerHTML = `<span class="inf-number">${session.completed.includes(index) ? "✓" : session.rinse && index === 0 ? "O" : index + 1 - (session.rinse ? 1 : 0)}</span><span class="inf-duration">${seconds} s</span>`;
    button.setAttribute(
      "aria-label",
      `${infusionLabel(session, index)}, ${seconds} sekund${session.completed.includes(index) ? ", hotovo" : ""}`,
    );
    button.setAttribute(
      "aria-current",
      index === session.index ? "step" : "false",
    );
    button.disabled = session.status === "running";
    button.title = `${infusionLabel(session, index)} · ${seconds} s`;
    button.addEventListener("click", () => {
      selectInfusion(session, index);
      save();
      renderTimer();
      $("infusionsStrip").children[index]?.focus({ preventScroll: true });
    });
    $("infusionsStrip").append(button);
  });
  scrollActiveInfusion();
  $("infusionsCount").textContent =
    `${completedCount(session)} / ${infusionCount(session)} hotovo`;
}
function renderTimer() {
  const { tea, status, index, durations } = session;
  const isLast = index === durations.length - 1;
  const meta = metadata(tea);
  $("timerCard").dataset.state = status;
  $("timerBadge").hidden = status !== "running";
  $("timerTeaName").textContent = tea.name;
  $("timerTeaDetail").textContent = tea.desc || "Vlastní čajový recept";
  $("timerLabel").textContent = `${infusionLabel(session, index)}`;
  $("timerStatus").textContent = {
    ready: "Připraveno",
    running: "Louhování",
    paused: "Pozastaveno",
    done: "Hotovo",
  }[status];
  $("startLabel").textContent =
    status === "done"
      ? isLast
        ? "Nová příprava"
        : "Další nálev"
      : status === "running"
        ? "Pozastavit"
        : status === "paused"
          ? "Pokračovat"
          : "Spustit";
  $("startIcon").innerHTML =
    status === "running"
      ? icons.pause
      : status === "done" && !isLast
        ? icons.next
        : icons.play;
  $("btnStart").setAttribute("aria-label", $("startLabel").textContent);
  $("timerHint").textContent =
    status === "done"
      ? "Slijte čaj."
      : "Časovač stojí. Lístky se ve vodě dál louhují.";
  $("timerHint").hidden = status !== "done" && status !== "paused";
  $("btnNext").disabled = status === "running" || isLast;
  $("lessTime").disabled = durations[index] <= 1;
  $("moreTime").disabled = durations[index] >= 3600;
  $("editRecipe").hidden = false;
  $("addInfusion").disabled =
    status === "running" || status === "paused" || durations.length >= 50;
  updateMediaSession();
  $("paramTemp").innerHTML =
    `${esc(tea.temp.replace("°C", ""))}<span>°C</span>`;
  $("paramRatio").textContent = `${nl(tea.ratio)} g / 100 ml`;
  $("paramGrams").innerHTML = `${nl((tea.ratio * volume) / 100)}<span>g</span>`;
  $("vesselVolume").value = volume;
  $("brewTip").textContent = meta.tip;
  updateClock();
  renderPills();
}
function recordBrew(at = session.updatedAt) {
  if (!completedCount(session) || deletedSessions.has(session.id)) return;
  const previous = history.find((item) => item.session.id === session.id);
  const entry = {
    session: JSON.parse(JSON.stringify(session)),
    at,
    volume,
    note: previous?.note || "",
    rating: previous?.rating || 0,
  };
  history = [
    entry,
    ...history.filter((item) => item.session.id !== session.id),
  ].slice(0, 500);
  $("journalCount").textContent = history.length + archivedHistory.length;
}
function stopSilence() {
  silence.pause();
}
function unlockAudio() {
  if (!soundEnabled) return;
  if (!silence.src) silence.src = silence.dataset.url;
  silence.play().catch(() => {});
  if (audioUnlocked || audioUnlocking) return;
  audioUnlocking = true;
  Promise.all(
    [chime, tickSound].map((audio) => {
      if (!audio.src) audio.src = audio.dataset.url;
      audio.muted = true;
      return audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          return true;
        })
        .catch(() => {
          audio.muted = false;
          return false;
        });
    }),
  ).then((results) => {
    audioUnlocked = results.every(Boolean);
    audioUnlocking = false;
  });
}
function playAudio(audio) {
  if (!soundEnabled) return;
  if (!audio.src) audio.src = audio.dataset.url;
  audio.currentTime = 0;
  audio.play().catch(() => {
    if (audio === chime) toast("Čaj je hotový. Zvuk se nepodařilo přehrát.");
  });
}
async function releaseAwake() {
  if (wakeLock) {
    const old = wakeLock;
    wakeLock = null;
    try {
      await old.release();
    } catch {}
  }
}
async function requestAwake() {
  if (
    !settings.wake ||
    !("wakeLock" in navigator) ||
    wakeLock ||
    wakeRequestPending ||
    session.status !== "running" ||
    owner !== tabId ||
    document.visibilityState !== "visible"
  )
    return;
  wakeRequestPending = true;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (session.status !== "running" || document.visibilityState !== "visible")
      await lock.release();
    else {
      wakeLock = lock;
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
      });
    }
  } catch {
  } finally {
    wakeRequestPending = false;
  }
}
function reconcile() {
  const before = session.status;
  const deadline = session.deadline;
  syncSession(session);
  if (before === "running" && session.status === "done") {
    if (owner === tabId) {
      playAudio(chime);
      recordBrew(deadline);
      save();
      if (settings.vibrate && "vibrate" in navigator)
        navigator.vibrate([150, 80, 150]);
      notifyDone();
      prepareAutoNext();
    }
    stopSilence();
    releaseAwake();
    renderTimer();
  } else if (session.status === "running") {
    const second = Math.ceil(session.remainingMs / 1000);
    if (
      settings.ticks &&
      owner === tabId &&
      second !== lastSecond &&
      second > 0 &&
      second <= 3
    )
      playAudio(tickSound);
    lastSecond = second;
    updateClock();
  }
}
function mainAction() {
  reconcile();
  if (session.status === "running") {
    pauseSession(session);
    stopSilence();
    releaseAwake();
  } else if (session.status === "done") {
    if (session.index === session.durations.length - 1)
      session = newSession(
        allTeas().find((tea) => tea.id === session.tea.id) || session.tea,
      );
    else nextInfusion(session);
  } else {
    unlockAudio();
    startSession(session);
    requestAwake();
  }
  lastSecond = Math.ceil(session.remainingMs / 1000);
  save(false, true);
  if (session.status === "running") requestAwake();
  renderTimer();
}
function openCustom(tea = null) {
  $("customForm").reset();
  $("customId").value = tea?.id || "";
  $("customDialogTitle").textContent = tea ? "Upravit recept" : "Vlastní čaj";
  const preset = TEAS.some((item) => item.id === tea?.id);
  $("deleteRecipe").hidden = !tea || (preset && !overrides[tea.id]);
  $("deleteRecipe").textContent = preset
    ? "Obnovit výchozí recept"
    : "Smazat recept";
  if (tea) {
    $("customName").value = tea.name;
    const temps = tea.temp.match(/\d+/g) || ["95"];
    $("customTemp").value = temps[0];
    $("customTempMax").value = temps[1] || temps[0];
    $("customRatio").value = tea.ratio;
    $("customDesc").value = tea.desc || "";
    $("customColor").value = tea.color || "#78845f";
    $("customRinse").checked = !!tea.rinse;
    $("customFirst").value = tea.infusions[0];
    $("customIncrement").value =
      Math.max(0, tea.infusions[1] - tea.infusions[0]) || 0;
    $("customCount").value = tea.infusions.length;
    $("customList").value = tea.infusions.join(", ");
    $("customMode").value = "list";
  }
  $("customError").textContent = "";
  renderRecipePreview();
  $("customDialog").showModal();
}
function recipeDurations() {
  if ($("customMode").value === "list") {
    const text = $("customList").value.trim();
    if (!text || !/^[\d\s,;]+$/.test(text)) return [];
    const list = text
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number);
    return list.length <= 49 &&
      list.every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 3600,
      )
      ? list
      : [];
  }
  const first = Number($("customFirst").value),
    increment = Number($("customIncrement").value),
    count = Number($("customCount").value);
  if (
    ![first, increment, count].every(Number.isInteger) ||
    first < 1 ||
    increment < 0 ||
    increment > 600 ||
    count < 1 ||
    count > 49 ||
    first + (count - 1) * increment > 3600
  )
    return [];
  return Array.from({ length: count }, (_, i) => first + i * increment);
}
function renderRecipePreview() {
  const manual = $("customMode").value === "list";
  $("listField").hidden = !manual;
  $("formulaFields").hidden = manual;
  $("customList").disabled = !manual;
  $("formulaFields")
    .querySelectorAll("input")
    .forEach((input) => (input.disabled = manual));
  const durations = recipeDurations();
  $("recipePreview").textContent = durations.length
    ? `Nálevy: ${durations
        .slice(0, 6)
        .map((value) => `${value} s`)
        .join(" → ")}${durations.length > 6 ? " → …" : ""}`
    : "Zadejte 1–49 časů v rozmezí 1–3600 sekund.";
}
function renderJournal() {
  $("journalEntries").innerHTML = "";
  const entries = [
    ...history.map((entry) => ({ entry, archived: false, date: entry.at })),
    ...archivedHistory.map((entry) => ({
      entry,
      archived: true,
      date: entry.date,
    })),
  ].sort((a, b) => b.date - a.date);
  if (!entries.length) {
    $("journalEntries").innerHTML =
      '<div class="empty-state"><h3>Zatím žádné záznamy</h3><p>Dokončené nálevy se ukládají automaticky.</p></div>';
    return;
  }
  entries.forEach(({ entry, archived, date }) => {
    const article = document.createElement("article");
    article.className = "journal-entry";
    const name = archived ? entry.tea.name : entry.session.tea.name;
    const details = archived
      ? `${entry.infusions} nálevů · ${formatTime(Math.round(entry.steepMs / 1000))} louhování`
      : `${completedCount(entry.session)} / ${infusionCount(entry.session)} nálevů · ${entry.volume} ml · ${nl((entry.session.tea.ratio * entry.volume) / 100)} g lístků`;
    article.innerHTML = `<div class="journal-entry-header"><h3>${esc(name)}</h3><time datetime="${new Date(date).toISOString()}">${esc(new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date))}</time></div><p class="journal-meta">${esc(details)}</p><label class="journal-note-label">Poznámka<input type="text" maxlength="2000" placeholder="Poznámka k přípravě" value="${esc(entry.note)}"></label><label class="form-field journal-rating">Hodnocení<select aria-label="Hodnocení ${esc(name)}">${[0, 1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${entry.rating === value ? "selected" : ""}>${value ? `${value} / 5` : "Bez hodnocení"}</option>`).join("")}</select></label>${archived ? "" : '<button class="text-button journal-again">Znovu připravit <span aria-hidden="true">↗</span></button>'}<button class="danger-button journal-delete">Smazat záznam</button>`;
    const currentEntry = () =>
      archived
        ? archivedHistory.find((item) => item.id === entry.id)
        : history.find((item) => item.session.id === entry.session.id);
    article.querySelector("input").addEventListener("input", (event) => {
      const current = currentEntry();
      if (current) current.note = event.target.value;
      save();
    });
    article.querySelector("select").addEventListener("change", (event) => {
      const current = currentEntry();
      if (current) current.rating = Number(event.target.value);
      save();
    });
    article.querySelector(".journal-delete").addEventListener("click", () => {
      confirmAction(
        "Smazat záznam?",
        `Záznam „${name}“ bude odstraněn z deníku.`,
        "Smazat",
        () => {
          if (archived)
            archivedHistory = archivedHistory.filter(
              (item) => item.id !== entry.id,
            );
          else {
            deletedSessions.add(entry.session.id);
            history = history.filter(
              (item) => item.session.id !== entry.session.id,
            );
          }
          save();
          renderJournal();
          $("journalCount").textContent =
            history.length + archivedHistory.length;
        },
      );
    });
    article.querySelector(".journal-again")?.addEventListener("click", () => {
      $("journalDialog").close();
      const again = () => {
        session = newSession(entry.session.tea);
        stopSilence();
        releaseAwake();
        save();
        renderCollection();
        renderTimer();
        setView("timer");
        scrollToTimer();
      };
      if (session.status === "running" || session.status === "paused")
        confirmAction(
          "Začít novou přípravu?",
          "Aktuální odpočet se ukončí. Hotové nálevy zůstanou v deníku.",
          "Začít novou",
          again,
        );
      else again();
    });
    $("journalEntries").append(article);
  });
}
function renderSound() {
  $("soundToggle").innerHTML = soundEnabled ? icons.sound : icons.muted;
  $("soundToggle").setAttribute("aria-pressed", String(soundEnabled));
  $("soundToggle").setAttribute(
    "aria-label",
    soundEnabled ? "Vypnout zvuk" : "Zapnout zvuk",
  );
  $("soundToggle").title = soundEnabled ? "Zvuk zapnutý" : "Zvuk vypnutý";
}
let autoNextTimeout;
function prepareAutoNext() {
  clearTimeout(autoNextTimeout);
  if (!settings.autoNext || session.index === session.durations.length - 1)
    return;
  const { id, index, updatedAt } = session;
  autoNextTimeout = setTimeout(() => {
    if (
      !settings.autoNext ||
      owner !== tabId ||
      session.id !== id ||
      session.index !== index ||
      session.updatedAt !== updatedAt ||
      session.status !== "done"
    )
      return;
    nextInfusion(session);
    save();
    renderTimer();
  }, 3500);
}
function applyTheme() {
  document.documentElement.dataset.theme =
    settings.theme === "auto"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : settings.theme;
  document.documentElement.style.colorScheme =
    document.documentElement.dataset.theme;
}
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  applyTheme,
);
async function notifyDone() {
  if (
    !settings.notify ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !document.hidden
  )
    return;
  const title = `${infusionLabel(session)} hotový · ${session.tea.name}`;
  const options = {
    body: "Slijte čaj.",
    icon: "./assets/icon-192.png",
    tag: "gongfu-timer",
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch {}
}
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    if ("MediaMetadata" in window)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: session.tea.name,
        artist: infusionLabel(session),
        album: "Gōng Fū Chá",
        artwork: [
          { src: "./assets/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
      });
    navigator.mediaSession.playbackState =
      session.status === "running" ? "playing" : "paused";
  } catch {}
}
if ("mediaSession" in navigator) {
  const handlers = {
    play: () => {
      if (session.status !== "running") mainAction();
    },
    pause: () => {
      if (session.status === "running") mainAction();
    },
    stop: () => $("btnReset").click(),
    nexttrack: () => $("btnNext").click(),
    seekforward: () => changeDuration(5),
    seekbackward: () => changeDuration(-5),
  };
  for (const [action, handler] of Object.entries(handlers))
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {}
}
$("openSettings").addEventListener("click", () => {
  document
    .querySelectorAll("[data-setting]")
    .forEach((input) => (input.checked = settings[input.dataset.setting]));
  $("settingTheme").value = settings.theme;
  $("settingsDialog").showModal();
});
document.querySelectorAll("[data-setting]").forEach((input) =>
  input.addEventListener("change", async () => {
    const key = input.dataset.setting;
    if (key === "notify" && input.checked) {
      let granted = false;
      try {
        granted =
          "Notification" in window &&
          (await Notification.requestPermission()) === "granted";
      } catch {}
      if (!granted) {
        input.checked = false;
        toast("Oznámení nejsou povolená nebo je prohlížeč nepodporuje.");
      }
    }
    settings[key] = input.checked;
    if (key === "sound") {
      soundEnabled = settings.sound;
      if (!soundEnabled) {
        stopSilence();
        chime.pause();
        tickSound.pause();
      } else if (session.status === "running") unlockAudio();
      renderSound();
    }
    if (key === "wake") {
      if (settings.wake) requestAwake();
      else releaseAwake();
    }
    save();
  }),
);
$("settingTheme").addEventListener("change", () => {
  settings.theme = $("settingTheme").value;
  applyTheme();
  save();
});
applyTheme();

$("btnStart").addEventListener("click", mainAction);
$("btnReset").addEventListener("click", () => {
  resetInfusion(session);
  stopSilence();
  releaseAwake();
  save();
  renderTimer();
});
$("btnNext").addEventListener("click", () => {
  reconcile();
  nextInfusion(session);
  save();
  renderTimer();
});
function changeDuration(delta) {
  reconcile();
  const active = session.status === "running" || session.status === "paused";
  adjustDuration(session, delta);
  if (active && session.status === "done") {
    recordBrew();
    playAudio(chime);
    notifyDone();
    if (settings.vibrate && "vibrate" in navigator)
      navigator.vibrate([150, 80, 150]);
    stopSilence();
    releaseAwake();
    prepareAutoNext();
  }
  save(false, true);
  if (session.status === "running") {
    unlockAudio();
    requestAwake();
  }
  renderTimer();
}
$("lessTime").addEventListener("click", () => changeDuration(-5));
$("moreTime").addEventListener("click", () => changeDuration(5));
$("addInfusion").addEventListener("click", () => {
  addInfusion(session);
  save();
  renderTimer();
  scrollToTimer();
});
$("showCollection").addEventListener("click", () => {
  setView("collection");
  window.scrollTo({ top: 0, behavior: "instant" });
});
$("showTimer").addEventListener("click", () => {
  setView("timer");
  scrollToTimer();
});
$("teaSearch").addEventListener("input", (event) => {
  query = event.target.value;
  renderCollection();
});
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    renderCollection();
  }),
);
$("addTea").addEventListener("click", () => openCustom());
$("editRecipe").addEventListener("click", () =>
  openCustom(allTeas().find((tea) => tea.id === session.tea.id) || session.tea),
);
$("customForm").addEventListener("input", renderRecipePreview);
$("customForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!$("customForm").reportValidity()) return;
  const name = $("customName").value.trim();
  if (!name) {
    $("customError").textContent = "Napište název čaje.";
    return;
  }
  if (!$("customId").value && customTeas.length >= 500) {
    $("customError").textContent =
      "Sbírka už obsahuje 500 receptů. Nejprve některý smažte.";
    return;
  }
  const durations = recipeDurations();
  const temperatures = [
    Number($("customTemp").value),
    Number($("customTempMax").value),
  ].sort((a, b) => a - b);
  const tea = {
    id: $("customId").value || `custom_${crypto.randomUUID()}`,
    name,
    temp: `${temperatures[0]}${temperatures[0] === temperatures[1] ? "" : `–${temperatures[1]}`}°C`,
    ratio: Number($("customRatio").value),
    infusions: durations,
    color: $("customColor").value,
    desc: $("customDesc").value.trim(),
    rinse: $("customRinse").checked,
  };
  if (!validTea(tea)) {
    $("customError").textContent = "Zkontrolujte zadané hodnoty a časy nálevů.";
    return;
  }
  const existing = customTeas.findIndex((item) => item.id === tea.id);
  if (TEAS.some((item) => item.id === tea.id)) overrides[tea.id] = tea;
  else if (existing >= 0) customTeas[existing] = tea;
  else customTeas.push(tea);
  $("customDialog").close();
  save();
  renderCollection();
  toast(existing >= 0 ? "Recept je upravený." : "Vlastní čaj je uložený.");
  if (session.status === "running" || session.status === "paused") {
    toast("Recept uložen. Probíhající nálev používá původní nastavení.");
    return;
  }
  session = newSession(tea);
  save();
  renderCollection();
  renderTimer();
  setView("timer");
  scrollToTimer();
});
$("deleteRecipe").addEventListener("click", () => {
  const id = $("customId").value;
  const preset = TEAS.find((item) => item.id === id);
  const tea = allTeas().find((item) => item.id === id);
  if (!tea) return;
  $("customDialog").close();
  confirmAction(
    preset ? "Obnovit výchozí recept?" : "Smazat vlastní recept?",
    preset
      ? `Obnoví se výchozí nastavení čaje „${preset.name}“.`
      : `Recept „${tea.name}“ zmizí ze sbírky. Záznamy v deníku zůstanou.`,
    preset ? "Obnovit" : "Smazat recept",
    () => {
      if (preset) {
        delete overrides[id];
        if (
          session.tea.id === id &&
          !["running", "paused"].includes(session.status)
        )
          session = newSession(preset);
      } else {
        customTeas = customTeas.filter((item) => item.id !== id);
        favorites.delete(id);
      }
      save();
      renderCollection();
      renderTimer();
      toast(preset ? "Výchozí recept je obnovený." : "Recept je smazaný.");
    },
  );
});
$("vesselVolume").addEventListener("change", (event) => {
  if (!event.target.checkValidity()) {
    event.target.reportValidity();
    event.target.value = volume;
    return;
  }
  volume = Number(event.target.value);
  save();
  renderTimer();
});
$("soundToggle").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  settings.sound = soundEnabled;
  if (!soundEnabled) {
    silence.pause();
    chime.pause();
    tickSound.pause();
  } else if (session.status === "running") unlockAudio();
  save();
  renderSound();
  toast(soundEnabled ? "Zvuk je zapnutý." : "Zvuk je vypnutý.");
});
$("openJournal").addEventListener("click", () => {
  renderJournal();
  $("journalDialog").showModal();
});
[$("openHelp"), $("footerHelp")].forEach((button) =>
  button.addEventListener("click", () => $("helpDialog").showModal()),
);
$("confirmAction").addEventListener("click", () => {
  const action = pendingConfirmation;
  pendingConfirmation = null;
  $("confirmDialog").close();
  action?.();
});
document.querySelectorAll(".close-dialog").forEach((button) => {
  if (button.classList.contains("icon-button")) button.innerHTML = icons.close;
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      dialog.close();
  }),
);
document.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    document.querySelector("dialog[open]") ||
    event.target.closest("input,textarea,select,button,a,[contenteditable]")
  )
    return;
  if (view !== "timer") return;
  const action = {
    Space: () => mainAction(),
    Enter: () => mainAction(),
    Escape: () => $("showCollection").click(),
    ArrowLeft: () => {
      selectInfusion(session, session.index - 1);
      save();
      renderTimer();
    },
    ArrowRight: () => $("btnNext").click(),
    KeyR: () => $("btnReset").click(),
    Equal: () => $("moreTime").click(),
    NumpadAdd: () => $("moreTime").click(),
    Minus: () => $("lessTime").click(),
    NumpadSubtract: () => $("lessTime").click(),
  }[event.code];
  if (action) {
    event.preventDefault();
    action();
  }
});
document.addEventListener("visibilitychange", () => {
  reconcile();
  if (owner === tabId) save();
  if (document.visibilityState === "visible") {
    requestAwake();
  } else releaseAwake();
});
window.addEventListener("pagehide", () => {
  reconcile();
  if (owner === tabId) save(true);
  stopSilence();
  releaseAwake();
});
window.addEventListener("storage", (event) => {
  if (event.key === KEY && event.newValue && event.newValue.length < 3000000) {
    try {
      if (
        applyExternal(JSON.parse(event.newValue)) &&
        !owner &&
        document.visibilityState === "visible"
      ) {
        if (
          session.status === "done" &&
          !history.some(
            (item) =>
              item.session.id === session.id &&
              item.session.completed.includes(session.index),
          )
        )
          recordBrew();
        save(false, true);
        requestAwake();
        if (audioUnlocked && soundEnabled && session.status === "running")
          silence.play().catch(() => {});
      }
    } catch {}
  }
});
window.addEventListener("pageshow", () => {
  reconcile();
  requestAwake();
});
$("collectionNavIcon").innerHTML = icons.leaf;
$("timerNavIcon").innerHTML = svg(
  '<circle cx="12" cy="13" r="8"/><path d="M12 9v5l3 2M9 2h6M12 2v3"/>',
);
$("journalNavIcon").innerHTML = svg(
  '<path d="M5 3h14v18H5ZM8 3v18M11 8h5M11 12h5"/>',
);
$("resetIcon").innerHTML = icons.reset;
$("nextIcon").innerHTML = icons.next;
$("openHelp").innerHTML = icons.help;
$("searchIcon").innerHTML = icons.search;

$("journalCount").textContent = history.length + archivedHistory.length;
if (
  session.status === "done" &&
  !history.some(
    (item) =>
      item.session.id === session.id &&
      item.session.completed.includes(session.index),
  )
)
  recordBrew(
    saved.session?.status === "running"
      ? saved.session.deadline
      : session.updatedAt,
  );
renderSound();
renderCollection();
renderTimer();
setView(view);
save();
if (session.status === "running") requestAwake();
setInterval(reconcile, 100);
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        $("offlineStatus").textContent = "Offline dostupné";
      })
      .catch(() => {
        $("offlineStatus").textContent = "Offline režim není dostupný";
      });
  });
}
