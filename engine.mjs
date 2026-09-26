/**
 * Browser-independent brewing state. Durations are seconds; clock values are ms.
 * Every action mutates and returns the session. Pass `now` to use a test clock.
 * Only an elapsed running deadline records a completed infusion.
 */
export const MIN_DURATION = 1;
export const MAX_DURATION = 3600;
const MAX_INFUSIONS = 50;
const MAX_TIMESTAMP = Number.MAX_SAFE_INTEGER - MAX_DURATION * 1000;
const STATUSES = new Set(["ready", "running", "paused", "done"]);

function isRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function isText(value, limit) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= limit
  );
}

function isDuration(value) {
  return (
    Number.isInteger(value) && value >= MIN_DURATION && value <= MAX_DURATION
  );
}

function isTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;
}

function time(now) {
  if (!isTimestamp(now))
    throw new RangeError(
      "The clock must be a non-negative millisecond timestamp.",
    );
  return now;
}

function snapshotTea(tea) {
  if (
    !isRecord(tea) ||
    !isText(tea.id, 80) ||
    !/^[a-zA-Z0-9_-]+$/.test(tea.id) ||
    !isText(tea.name, 100) ||
    !isText(tea.temp, 60) ||
    typeof tea.ratio !== "number" ||
    !Number.isFinite(tea.ratio) ||
    tea.ratio <= 0 ||
    tea.ratio > 100 ||
    !Array.isArray(tea.infusions) ||
    tea.infusions.length < 1 ||
    tea.infusions.length > MAX_INFUSIONS ||
    !Array.from(tea.infusions).every(isDuration)
  ) {
    throw new TypeError(
      "A tea needs an id, name, temperature, positive ratio and 1–50 valid infusion durations.",
    );
  }
  const copy = {
    id: tea.id,
    name: tea.name,
    temp: tea.temp,
    ratio: tea.ratio,
    infusions: [...tea.infusions],
  };
  for (const [key, limit] of [
    ["desc", 500],
    ["emoji", 32],
  ]) {
    if (tea[key] !== undefined) {
      if (typeof tea[key] !== "string" || tea[key].length > limit)
        throw new TypeError(`Invalid tea ${key}.`);
      copy[key] = tea[key];
    }
  }
  if (tea.color !== undefined) {
    if (
      typeof tea.color !== "string" ||
      !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(tea.color)
    ) {
      throw new TypeError("Tea color must be a hexadecimal color.");
    }
    copy.color = tea.color;
  }
  copy.rinse = tea.rinse === true;
  return copy;
}

function currentTime(session, now) {
  // A small backwards wall-clock correction must not put elapsed time back.
  return Math.max(time(now), session.updatedAt);
}

function clearCurrentCompletion(session) {
  session.completed = session.completed.filter(
    (index) => index !== session.index,
  );
}

function ready(session, now) {
  session.status = "ready";
  session.remainingMs = session.durations[session.index] * 1000;
  session.deadline = null;
  session.updatedAt = now;
  return session;
}

export function createSession(tea, now = Date.now(), includeRinse = false) {
  const timestamp = time(now);
  const snapshot = snapshotTea(tea);
  const rinse = includeRinse && snapshot.rinse;
  const durations = rinse
    ? [5, ...snapshot.infusions]
    : [...snapshot.infusions];
  return {
    rinse,
    id:
      globalThis.crypto?.randomUUID?.() ??
      `brew-${timestamp.toString(36)}-${Math.random().toString(36).slice(2)}`,
    tea: snapshot,
    index: 0,
    durations,
    completed: [],
    status: "ready",
    remainingMs: durations[0] * 1000,
    deadline: null,
    updatedAt: timestamp,
  };
}

/** Reconcile against the deadline, including after backgrounding or a reload. */
export function syncSession(session, now = Date.now()) {
  const timestamp = currentTime(session, now);
  if (session.status !== "running") return session;
  session.remainingMs = Math.max(0, session.deadline - timestamp);
  session.updatedAt = timestamp;
  if (session.remainingMs === 0) {
    session.status = "done";
    session.deadline = null;
    if (!session.completed.includes(session.index)) {
      session.completed.push(session.index);
      session.completed.sort((a, b) => a - b);
    }
  }
  return session;
}

/** Resume a pause, or begin a fresh attempt when the selected infusion is done. */
export function startSession(session, now = Date.now()) {
  const timestamp = currentTime(session, now);
  if (session.status === "running") return syncSession(session, timestamp);
  if (session.status === "done") resetInfusion(session, timestamp);
  clearCurrentCompletion(session);
  session.status = "running";
  session.deadline = timestamp + session.remainingMs;
  session.updatedAt = timestamp;
  return session;
}

export function pauseSession(session, now = Date.now()) {
  const timestamp = currentTime(session, now);
  syncSession(session, timestamp);
  if (session.status === "running") {
    session.status = "paused";
    session.deadline = null;
    session.updatedAt = timestamp;
  }
  return session;
}

/** Explicitly discard this attempt; preserve other infusions and duration edits. */
export function resetInfusion(session, now = Date.now()) {
  const timestamp = currentTime(session, now);
  clearCurrentCompletion(session);
  return ready(session, timestamp);
}

/** Navigation never claims an infusion was brewed, and cannot interrupt one. */
export function selectInfusion(session, index, now = Date.now()) {
  const timestamp = currentTime(session, now);
  syncSession(session, timestamp);
  if (
    session.status === "running" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= session.durations.length ||
    index === session.index
  )
    return session;
  session.index = index;
  return ready(session, timestamp);
}

/** Preserve elapsed time when editing an active or paused infusion. */
export function adjustDuration(session, deltaSeconds, now = Date.now()) {
  const timestamp = currentTime(session, now);
  syncSession(session, timestamp);
  if (!Number.isInteger(deltaSeconds)) return session;
  const oldDuration = session.durations[session.index];
  const duration = Math.min(
    MAX_DURATION,
    Math.max(MIN_DURATION, oldDuration + deltaSeconds),
  );
  const delta = (duration - oldDuration) * 1000;
  if (!delta) return session;
  session.durations[session.index] = duration;
  if (session.status === "running" || session.status === "paused") {
    session.remainingMs = Math.max(0, session.remainingMs + delta);
    session.updatedAt = timestamp;
    if (session.remainingMs === 0) {
      session.status = "done";
      session.deadline = null;
      if (!session.completed.includes(session.index))
        session.completed.push(session.index);
    } else if (session.status === "running")
      session.deadline = timestamp + session.remainingMs;
    return session;
  }
  return resetInfusion(session, timestamp);
}

/** Add another infusion without changing the recipe or interrupting a running one. */
export function addInfusion(session, now = Date.now()) {
  const timestamp = currentTime(session, now);
  syncSession(session, timestamp);
  if (
    session.status === "running" ||
    session.status === "paused" ||
    session.durations.length >= MAX_INFUSIONS
  )
    return session;
  session.durations.push(Math.min(MAX_DURATION, session.durations.at(-1) + 15));
  session.index = session.durations.length - 1;
  return ready(session, timestamp);
}

export function nextInfusion(session, now = Date.now()) {
  return selectInfusion(session, session.index + 1, now);
}

/**
 * Trust-boundary for localStorage. Invalid, oversized or inconsistent data is
 * rejected with null. Unknown keys are discarded; strings remain plain text and
 * must still be rendered with textContent by the UI, never interpolated as HTML.
 */
export function restoreSession(raw, now = Date.now()) {
  try {
    time(now);
    if (typeof raw === "string") {
      if (raw.length > 64000) return null;
      raw = JSON.parse(raw);
    }
    if (
      !isRecord(raw) ||
      !isText(raw.id, 100) ||
      !/^[a-zA-Z0-9:_-]+$/.test(raw.id) ||
      !STATUSES.has(raw.status) ||
      !isTimestamp(raw.updatedAt)
    )
      return null;
    const tea = snapshotTea(raw.tea);
    if (
      !Array.isArray(raw.durations) ||
      raw.durations.length < 1 ||
      raw.durations.length > MAX_INFUSIONS + (raw.rinse === true ? 1 : 0) ||
      (raw.rinse === true && raw.durations.length < 2) ||
      !Array.from(raw.durations).every(isDuration) ||
      !Number.isInteger(raw.index) ||
      raw.index < 0 ||
      raw.index >= raw.durations.length ||
      !Array.isArray(raw.completed) ||
      raw.completed.length > raw.durations.length ||
      !Array.from(raw.completed).every(
        (index) =>
          Number.isInteger(index) && index >= 0 && index < raw.durations.length,
      ) ||
      new Set(raw.completed).size !== raw.completed.length
    )
      return null;
    const totalMs = raw.durations[raw.index] * 1000;
    if (
      !Number.isInteger(raw.remainingMs) ||
      raw.remainingMs < 0 ||
      raw.remainingMs > totalMs
    )
      return null;
    if (raw.status === "running") {
      if (
        !isTimestamp(raw.deadline) ||
        raw.deadline <= raw.updatedAt ||
        raw.deadline - raw.updatedAt !== raw.remainingMs ||
        raw.completed.includes(raw.index)
      )
        return null;
    } else if (raw.deadline !== null) return null;
    if (raw.status === "ready" && raw.remainingMs !== totalMs) return null;
    if (
      raw.status === "paused" &&
      (raw.remainingMs <= 0 || raw.completed.includes(raw.index))
    )
      return null;
    if (
      raw.status === "done" &&
      (raw.remainingMs !== 0 || !raw.completed.includes(raw.index))
    )
      return null;
    const session = {
      rinse: raw.rinse === true,
      id: raw.id,
      tea,
      index: raw.index,
      durations: [...raw.durations],
      completed: [...raw.completed].sort((a, b) => a - b),
      status: raw.status,
      remainingMs: raw.remainingMs,
      deadline: raw.deadline,
      updatedAt: raw.updatedAt,
    };
    return syncSession(session, now);
  } catch {
    return null;
  }
}
