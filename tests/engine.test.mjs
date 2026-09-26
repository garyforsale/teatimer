import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  startSession,
  pauseSession,
  syncSession,
  resetInfusion,
  selectInfusion,
  adjustDuration,
  nextInfusion,
  restoreSession,
} from "../engine.mjs";

const tea = () => ({
  id: "green",
  name: "Zelený čaj",
  temp: "75–80 °C",
  ratio: 4,
  infusions: [30, 40, 50],
  desc: "Jemný čaj",
  color: "#7a9e7e",
});
const brew = () => createSession(tea(), 1000);
const clone = (value) => JSON.parse(JSON.stringify(value));

test("snapshots a recipe so duration changes cannot corrupt the catalog", () => {
  const recipe = tea();
  const session = createSession(recipe, 1000);
  recipe.infusions[0] = 100;
  recipe.name = "Changed";
  adjustDuration(session, 5, 1000);
  assert.equal(session.tea.name, "Zelený čaj");
  assert.equal(session.tea.infusions[0], 30);
  assert.equal(session.durations[0], 35);
  assert.equal(session.remainingMs, 35000);
});

test("deadline catches up after throttling without ticking once per second", () => {
  const session = startSession(brew(), 2000);
  syncSession(session, 29999);
  assert.equal(session.remainingMs, 2001);
  syncSession(session, 64000);
  assert.equal(session.remainingMs, 0);
  assert.equal(session.status, "done");
  assert.equal(session.deadline, null);
  assert.equal(session.index, 0);
  assert.deepEqual(session.completed, [0]);
  syncSession(session, 900000);
  assert.equal(session.index, 0, "completion never automatically advances");
  assert.deepEqual(
    session.completed,
    [0],
    "repeated sync does not duplicate completion",
  );
});

test("pause and resume preserve sub-second time across a long pause", () => {
  const session = startSession(brew(), 1000);
  pauseSession(session, 5432);
  assert.equal(session.status, "paused");
  assert.equal(session.remainingMs, 25568);
  syncSession(session, 200000);
  assert.equal(session.remainingMs, 25568);
  startSession(session, 300000);
  assert.equal(session.deadline, 325568);
  syncSession(session, 325567);
  assert.equal(session.status, "running");
  assert.equal(session.remainingMs, 1);
  syncSession(session, 325568);
  assert.equal(session.status, "done");
});

test("pausing after the deadline finishes instead of creating a zero-time pause", () => {
  const session = startSession(brew(), 1000);
  pauseSession(session, 31000);
  assert.equal(session.status, "done");
  assert.deepEqual(session.completed, [0]);
});

test("running selection, next and time edits cannot interrupt the brew", () => {
  const session = startSession(brew(), 1000);
  selectInfusion(session, 2, 2000);
  nextInfusion(session, 3000);
  adjustDuration(session, 5, 4000);
  assert.equal(session.index, 0);
  assert.equal(session.status, "running");
  assert.equal(session.deadline, 31000);
  assert.equal(session.durations[0], 30);
  assert.deepEqual(session.completed, []);
});

test("skipping and selecting do not fabricate completed infusions", () => {
  const session = brew();
  nextInfusion(session, 2000);
  assert.equal(session.index, 1);
  selectInfusion(session, 2, 3000);
  assert.equal(session.index, 2);
  assert.deepEqual(session.completed, []);
  startSession(session, 3000);
  syncSession(session, 53000);
  assert.deepEqual(session.completed, [2]);
  nextInfusion(session, 54000);
  assert.equal(session.index, 2);
  assert.equal(session.status, "done", "last infusion stays completed");
});

test("manual next after completion prepares the next infusion without starting", () => {
  const session = startSession(brew(), 1000);
  nextInfusion(session, 32000);
  assert.equal(session.index, 1);
  assert.equal(session.status, "ready");
  assert.equal(session.remainingMs, 40000);
  assert.deepEqual(session.completed, [0]);
});

test("reset cancels the current attempt and clears its completion only", () => {
  const session = startSession(brew(), 1000);
  syncSession(session, 31000);
  nextInfusion(session, 32000);
  startSession(session, 32000);
  pauseSession(session, 38000);
  resetInfusion(session, 39000);
  assert.equal(session.status, "ready");
  assert.equal(session.remainingMs, 40000);
  assert.deepEqual(session.completed, [0]);
  startSession(session, 40000);
  syncSession(session, 80000);
  resetInfusion(session, 81000);
  assert.deepEqual(session.completed, [0]);
});

test("starting a done infusion repeats the selected one and awaits real completion", () => {
  const session = startSession(brew(), 1000);
  syncSession(session, 31000);
  startSession(session, 40000);
  assert.equal(session.index, 0);
  assert.equal(session.deadline, 70000);
  assert.equal(session.remainingMs, 30000);
  assert.deepEqual(session.completed, []);
  syncSession(session, 70000);
  assert.deepEqual(session.completed, [0]);
});

test("duration edits clamp to bounds, ignore invalid values and keep paused progress", () => {
  const session = brew();
  adjustDuration(session, -1000, 1000);
  assert.equal(session.durations[0], 1);
  adjustDuration(session, 10000, 1000);
  assert.equal(session.durations[0], 3600);
  for (const delta of [NaN, Infinity, -Infinity, 0.2, "5"])
    adjustDuration(session, delta, 1000);
  assert.equal(session.durations[0], 3600);
  startSession(session, 1000);
  pauseSession(session, 2000);
  adjustDuration(session, -5, 3000);
  assert.equal(session.remainingMs, 3599000);
  assert.equal(session.durations[0], 3600);
});

test("restore running session uses the saved deadline, including elapsed completion", () => {
  const session = startSession(brew(), 1000);
  const raw = JSON.stringify(session);
  const active = restoreSession(raw, 15555);
  assert.equal(active.status, "running");
  assert.equal(active.remainingMs, 15445);
  assert.equal(active.deadline, 31000);
  const finished = restoreSession(raw, 100000);
  assert.equal(finished.status, "done");
  assert.equal(finished.index, 0);
  assert.deepEqual(finished.completed, [0]);
  assert.equal(session.status, "running", "restore does not mutate its input");
});

test("restore paused and ready sessions does not count time away", () => {
  const paused = pauseSession(startSession(brew(), 1000), 1250);
  const restored = restoreSession(JSON.stringify(paused), 9000000);
  assert.equal(restored.status, "paused");
  assert.equal(restored.remainingMs, 29750);
  assert.equal(restored.deadline, null);
  assert.equal(restoreSession(brew(), 9000000).remainingMs, 30000);
});

test("storage rejects malformed recipes, bounds and contradictory state", () => {
  const valid = brew();
  const invalid = [null, [], true, "", "{", "null", "x".repeat(64001)];
  for (const mutate of [
    (state) => {
      state.index = -1;
    },
    (state) => {
      state.index = 3;
    },
    (state) => {
      state.index = 0.1;
    },
    (state) => {
      state.status = "unknown";
    },
    (state) => {
      state.remainingMs = -1;
    },
    (state) => {
      state.remainingMs = 30001;
    },
    (state) => {
      state.remainingMs = 29999;
    },
    (state) => {
      state.durations = [];
    },
    (state) => {
      state.durations[0] = 3601;
    },
    (state) => {
      state.tea.infusions[0] = 0;
    },
    (state) => {
      state.tea.ratio = 0;
    },
    (state) => {
      state.tea.color = "url(javascript:alert(1))";
    },
    (state) => {
      state.tea.name = "x".repeat(101);
    },
    (state) => {
      state.completed = [0, 0];
    },
    (state) => {
      state.completed = [3];
    },
    (state) => {
      state.deadline = 1000;
    },
    (state) => {
      state.updatedAt = -1;
    },
    (state) => {
      state.status = "done";
      state.remainingMs = 0;
    },
    (state) => {
      state.status = "paused";
      state.remainingMs = 0;
    },
    (state) => {
      state.id = "<script>";
    },
  ]) {
    const state = clone(valid);
    mutate(state);
    invalid.push(state);
  }
  for (const raw of invalid)
    assert.equal(
      restoreSession(raw, 2000),
      null,
      JSON.stringify(raw).slice(0, 300),
    );
  const running = startSession(brew(), 1000);
  running.deadline += 1;
  assert.equal(
    restoreSession(running, 2000),
    null,
    "deadline must agree with remaining time",
  );
});

test("restore copies only approved keys without treating user text as HTML", () => {
  const raw = clone(brew());
  raw.tea.name = "<img src=x onerror=alert(1)>";
  raw.html = "<script>bad()</script>";
  raw.tea.unknown = "discard";
  const restored = restoreSession(raw, 1000);
  assert.equal(
    restored.tea.name,
    raw.tea.name,
    "UI must render the plain string as text",
  );
  assert.equal("html" in restored, false);
  assert.equal("unknown" in restored.tea, false);
  raw.durations[0] = 20;
  assert.equal(restored.durations[0], 30);
});

test("invalid navigation and repeated start are harmless", () => {
  const session = brew();
  for (const index of [-1, 3, 0.5, NaN, "1"])
    selectInfusion(session, index, 1000);
  assert.equal(session.index, 0);
  startSession(session, 1000);
  startSession(session, 2000);
  assert.equal(session.deadline, 31000);
  pauseSession(session, 3000);
  selectInfusion(session, 0, 4000);
  assert.equal(
    session.status,
    "paused",
    "tapping the current infusion retains a pause",
  );
  assert.equal(session.remainingMs, 28000);
});

test("a backwards clock does not add remaining time", () => {
  const session = startSession(brew(), 10000);
  syncSession(session, 15000);
  syncSession(session, 14000);
  assert.equal(session.remainingMs, 25000);
  assert.equal(session.updatedAt, 15000);
  assert.notEqual(restoreSession(session, 14000), null);
});

test("creation rejects unusable recipes and invalid clocks", () => {
  assert.throws(
    () => createSession({ ...tea(), infusions: [] }, 1000),
    TypeError,
  );
  assert.throws(
    () => createSession({ ...tea(), infusions: [0] }, 1000),
    TypeError,
  );
  assert.throws(
    () => createSession({ ...tea(), infusions: new Array(3) }, 1000),
    TypeError,
  );
  assert.throws(() => createSession(tea(), NaN), RangeError);
  assert.equal(restoreSession(brew(), NaN), null);
  assert.equal(
    restoreSession({ ...brew(), completed: new Array(1) }, 1000),
    null,
  );
  assert.equal(
    restoreSession({ ...brew(), durations: new Array(3) }, 1000),
    null,
  );
});
