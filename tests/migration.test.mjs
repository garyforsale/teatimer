import test from "node:test";
import assert from "node:assert/strict";
import { migrateLegacy, normalizeSettings } from "../migration.mjs";
const preset = {
  id: "oolong_light",
  name: "Oolong",
  temp: "90–95°C",
  ratio: 5,
  infusions: [20, 15],
  rinse: true,
};
const oldTea = { ...preset, temp: [90, 95] };
const fixtures = {
  "gft.settings": {
    sound: false,
    ticks: false,
    vibrate: false,
    rinse: true,
    theme: "dark",
    vessel: 30,
    autoNext: true,
  },
  "gft.custom": [{ ...oldTea, id: "c123", name: "Vlastní", color: "#123456" }],
  "gft.overrides": {
    oolong_light: { ...oldTea, name: "Upravený", infusions: [10, 15] },
  },
  "gft.journal": [
    {
      id: "j123",
      date: 1000,
      tea: { name: "Starší čaj" },
      infusions: 4,
      steepMs: 120000,
      durationMs: 180000,
      rating: 5,
      note: "Poznámka",
    },
  ],
  "gft.session": {
    tea: oldTea,
    steps: [{ sec: 5, rinse: true }, { sec: 20 }, { sec: 15 }],
    idx: 1,
    done: [true, false, false],
    phase: "running",
    remaining: 15000,
    endAt: 30000,
    startedAt: 1000,
    updatedAt: 15000,
  },
};
const read = (key) => (key in fixtures ? JSON.stringify(fixtures[key]) : null);
test("imports exact legacy storage schemas without writing or changing source", () => {
  const before = JSON.stringify(fixtures);
  const result = migrateLegacy(read, null, [preset], 20000);
  assert.equal(result.volume, 30);
  assert.equal(result.settings.theme, "dark");
  assert.equal(result.soundEnabled, false);
  assert.equal(result.customTeas[0].id, "custom_legacy_c123");
  assert.deepEqual(result.customTeas[0].infusions, [20, 15]);
  assert.equal(result.overrides.oolong_light.name, "Upravený");
  assert.equal(result.archivedHistory[0].rating, 5);
  assert.equal(result.session.status, "running");
  assert.equal(result.session.remainingMs, 10000);
  assert.equal(result.session.rinse, true);
  assert.equal(JSON.stringify(fixtures), before);
});
test("merges both collections once while preserving current settings/session/overrides", () => {
  const current = {
    session: { id: "current" },
    volume: 160,
    settings: { theme: "light" },
    soundEnabled: true,
    history: [{ id: "history" }],
    customTeas: [{ id: "custom_new" }],
    overrides: { oolong_light: { name: "Current" } },
  };
  const result = migrateLegacy(read, current, [preset], 20000);
  assert.equal(result.session, current.session);
  assert.equal(result.settings, current.settings);
  assert.equal(result.volume, 160);
  assert.equal(result.history, current.history);
  assert.equal(result.customTeas.length, 2);
  assert.equal(result.overrides.oolong_light.name, "Current");
  assert.equal(result.archivedHistory.length, 1);
  assert.equal(result.legacyImported, true);
  result.customTeas = [];
  result.archivedHistory = [];
  assert.equal(
    migrateLegacy(read, result, [preset], 30000),
    result,
    "removed legacy items must not reappear",
  );
});
test("deadline expiration imports a completed infusion instead of restarting", () => {
  const result = migrateLegacy(read, null, [preset], 50000);
  assert.equal(result.session.status, "done");
  assert.deepEqual(result.session.completed, [0, 1]);
  assert.equal(result.session.remainingMs, 0);
});
test("malformed legacy values are isolated and rejected safely", () => {
  const result = migrateLegacy(
    (key) =>
      key === "gft.custom"
        ? '[{"id":"x","temp":null}]'
        : key === "gft.journal"
          ? '[null,{"id":"j"}]'
          : "{broken",
    null,
    [preset],
    1000,
  );
  assert.deepEqual(result.customTeas, []);
  assert.deepEqual(result.archivedHistory, []);
  assert.equal(result.session, undefined);
  assert.deepEqual(
    normalizeSettings({ theme: "url(evil)", sound: "false", wake: false }),
    {
      sound: true,
      ticks: true,
      vibrate: true,
      wake: false,
      notify: false,
      autoNext: false,
      rinse: true,
      theme: "auto",
    },
  );
});
test("existing legacy IDs are deduplicated during the one-time merge", () => {
  const initial = migrateLegacy(read, null, [preset], 20000);
  initial.legacyImported = false;
  const result = migrateLegacy(read, initial, [preset], 20000);
  assert.equal(result.customTeas.length, 1);
  assert.equal(result.archivedHistory.length, 1);
});

test("expired running data saved after its deadline imports completion", () => {
  const source = { ...fixtures["gft.session"], updatedAt: 40000 };
  const result = migrateLegacy(
    (key) => (key === "gft.session" ? JSON.stringify(source) : read(key)),
    null,
    [preset],
    50000,
  );
  assert.equal(result.session.status, "done");
  assert.deepEqual(result.session.completed, [0, 1]);
});
test("malformed current custom entries cannot block valid legacy import", () => {
  const result = migrateLegacy(
    read,
    { customTeas: [null, 42, { id: "custom_current" }] },
    [preset],
    20000,
  );
  assert.equal(result.customTeas.length, 2);
});
