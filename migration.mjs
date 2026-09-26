import { createSession, restoreSession } from "./engine.mjs";

export function normalizeSettings(raw = {}) {
  const result = {
    sound: true,
    ticks: true,
    vibrate: true,
    wake: true,
    notify: false,
    autoNext: false,
    rinse: true,
    theme: "auto",
  };
  if (!raw || typeof raw !== "object") return result;
  for (const key of Object.keys(result))
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  result.theme = ["auto", "light", "dark"].includes(raw.theme)
    ? raw.theme
    : "auto";
  return result;
}
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const safeId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const temp = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((v) => Number.isFinite(v) && v >= 30 && v <= 100)
    ? `${value[0]}${value[0] === value[1] ? "" : `–${value[1]}`}°C`
    : value;
function convertTea(raw, id, durations) {
  if (!record(raw) || !safeId(id)) return null;
  try {
    return createSession({
      ...raw,
      id,
      temp: temp(raw.temp),
      infusions: durations || raw.infusions,
    }).tea;
  } catch {
    return null;
  }
}
export function cleanArchivedJournal(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 500).flatMap((item) => {
    if (
      !record(item) ||
      !safeId(item.id) ||
      !record(item.tea) ||
      typeof item.tea.name !== "string" ||
      !Number.isSafeInteger(item.date) ||
      item.date <= 0 ||
      !Number.isFinite(new Date(item.date).getTime())
    )
      return [];
    return [
      {
        id: item.id,
        date: item.date,
        tea: { name: item.tea.name.slice(0, 100) },
        infusions: Number.isInteger(item.infusions)
          ? Math.max(0, Math.min(50, item.infusions))
          : 0,
        rating: Number.isInteger(item.rating)
          ? Math.max(0, Math.min(5, item.rating))
          : 0,
        note: typeof item.note === "string" ? item.note.slice(0, 2000) : "",
        steepMs: Number.isFinite(item.steepMs) ? Math.max(0, item.steepMs) : 0,
        durationMs: Number.isFinite(item.durationMs)
          ? Math.max(0, item.durationMs)
          : 0,
      },
    ];
  });
}

/** One-time import. Keep source keys intact; existing state wins conflicts. */
export function migrateLegacy(read, current, presets, now = Date.now()) {
  if (record(current) && current.legacyImported === true) return current;
  const get = (key) => {
    try {
      const raw = read(`gft.${key}`);
      return raw && raw.length < 3000000 ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const settings = get("settings");
  const custom = get("custom");
  const overrides = get("overrides");
  const journal = get("journal");
  const source = get("session");
  if (![settings, custom, overrides, journal, source].some(Boolean))
    return current || {};
  const idFor = (id) =>
    presets.some((tea) => tea.id === id)
      ? id
      : safeId(id)
        ? `custom_legacy_${id}`
        : null;
  const result = {
    settings: normalizeSettings(settings),
    soundEnabled: settings?.sound !== false,
    volume:
      Number.isInteger(settings?.vessel) &&
      settings.vessel >= 30 &&
      settings.vessel <= 1000
        ? settings.vessel
        : 100,
    customTeas: [],
    overrides: {},
    archivedHistory: cleanArchivedJournal(journal),
    legacyImported: true,
  };
  result.customTeas = (Array.isArray(custom) ? custom : [])
    .slice(0, 500)
    .map((tea) => convertTea(tea, idFor(tea?.id)))
    .filter(Boolean)
    .filter(
      (tea, index, all) =>
        all.findIndex((item) => item.id === tea.id) === index,
    );
  for (const preset of presets)
    if (record(overrides?.[preset.id])) {
      const tea = convertTea({ ...preset, ...overrides[preset.id] }, preset.id);
      if (tea) result.overrides[preset.id] = tea;
    }
  if (
    record(source) &&
    Array.isArray(source.steps) &&
    source.steps.length > 0 &&
    source.steps.length <= 50
  ) {
    const durations = source.steps.map((step) => step?.sec);
    const rinse = source.steps[0]?.rinse === true;
    const tea = convertTea(
      source.tea,
      idFor(source.tea?.id),
      rinse ? durations.slice(1) : durations,
    );
    if (
      tea &&
      Number.isInteger(source.idx) &&
      source.idx >= 0 &&
      source.idx < durations.length
    ) {
      let phase = {
        idle: "ready",
        running: "running",
        paused: "paused",
        done: "done",
      }[source.phase];
      if (
        phase === "running" &&
        Number.isSafeInteger(source.endAt) &&
        Number.isSafeInteger(source.updatedAt) &&
        source.endAt <= source.updatedAt
      )
        phase = "done";
      const total = durations[source.idx] * 1000;
      const remaining =
        phase === "ready"
          ? total
          : phase === "done"
            ? 0
            : phase === "running"
              ? Math.max(0, source.endAt - source.updatedAt)
              : source.remaining;
      const raw = {
        id: `legacy-${Number.isSafeInteger(source.startedAt) ? source.startedAt : now}`,
        tea,
        rinse,
        durations,
        index: source.idx,
        completed: durations.flatMap((_, i) =>
          source.done?.[i] === true || (phase === "done" && i === source.idx)
            ? [i]
            : [],
        ),
        status: phase,
        remainingMs: remaining,
        deadline: phase === "running" ? source.endAt : null,
        updatedAt: Number.isSafeInteger(source.updatedAt)
          ? source.updatedAt
          : now,
      };
      result.session = restoreSession(raw, now);
    }
  }
  if (record(current)) {
    const existingCustom = Array.isArray(current.customTeas)
      ? current.customTeas.filter(
          (item) => record(item) && typeof item.id === "string",
        )
      : [];
    const existingArchived = cleanArchivedJournal(current.archivedHistory);
    return {
      ...result,
      ...current,
      customTeas: [
        ...existingCustom,
        ...result.customTeas.filter(
          (tea) => !existingCustom.some((item) => item.id === tea.id),
        ),
      ],
      overrides: {
        ...result.overrides,
        ...(record(current.overrides) ? current.overrides : {}),
      },
      archivedHistory: [
        ...existingArchived,
        ...result.archivedHistory.filter(
          (item) => !existingArchived.some((old) => old.id === item.id),
        ),
      ],
      legacyImported: true,
    };
  }
  return result;
}
