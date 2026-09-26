/* Decorative canvas only: the timer engine remains the source of time.
   Geometry uses a 360 × 205 artboard; drawing is capped at 30 fps / 2× DPR. */
const TAU = Math.PI * 2;
const clamp = (n) => Math.max(0, Math.min(1, n));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const color = (rgb, alpha = 1) => `rgba(${rgb.join(",")},${alpha})`;
const palettes = {
  green: [165, 172, 70],
  white: [181, 146, 57],
  yellow: [193, 154, 39],
  oolong_light: [155, 95, 19],
  oolong_dark: [109, 49, 15],
  red: [138, 48, 14],
  sheng: [175, 137, 40],
  shou: [65, 29, 14],
  dancong: [183, 109, 30],
};

export function createTeaScene(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { update() {}, setVisible() {} };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const body = new Path2D(
    "M 43,86 C 50,132 69,181 112,208 C 138,222 222,222 248,208 C 291,181 310,132 317,86 C 256,57 104,57 43,86 Z",
  );
  let state = {
    status: "ready",
    progress: 0,
    teaId: "oolong_light",
    infusion: "",
  };
  let shown = false,
    intersecting = true,
    frame = 0,
    lastFrame = 0;
  let elapsed = 0,
    transition = 3,
    strength = 0,
    width = 360,
    height = 250;
  let sizeDirty = true;

  function ellipse(x, y, rx, ry, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }
  function gradient(x1, y1, x2, y2, stops) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    stops.forEach(([at, c]) => g.addColorStop(at, c));
    return g;
  }
  function strokePath(path, paint, lineWidth = 1) {
    ctx.strokeStyle = paint;
    ctx.lineWidth = lineWidth;
    ctx.stroke(path);
  }
  function leaf(
    x,
    y,
    length,
    angle,
    openness,
    alpha,
    variant = 0,
    flatten = 1,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, flatten);
    ctx.rotate(angle);
    const w = length * (0.08 + openness * 0.16);
    const bend = (variant % 2 ? 1 : -1) * length * 0.08;
    const leafColor = variant % 3 ? [71, 83, 32] : [114, 87, 31];
    ctx.beginPath();
    ctx.moveTo(-length / 2, 0);
    ctx.bezierCurveTo(
      -length * 0.2,
      -w,
      length * 0.24,
      -w * 1.12 + bend,
      length / 2,
      bend,
    );
    ctx.bezierCurveTo(
      length * 0.08,
      w * 0.95 + bend,
      -length * 0.3,
      w * 0.65,
      -length / 2,
      0,
    );
    ctx.fillStyle = gradient(0, -w, 0, w, [
      [0, color(leafColor, alpha)],
      [1, color(mix(leafColor, [137, 125, 61], 0.4), alpha * 0.85)],
    ]);
    ctx.fill();
    // A lighter folded half, central rib and branching veins, without outlines.
    ctx.beginPath();
    ctx.moveTo(-length / 2, 0);
    ctx.quadraticCurveTo(0, bend * 0.8 - w * 0.15, length / 2, bend);
    ctx.bezierCurveTo(
      length * 0.08,
      w * 0.95 + bend,
      -length * 0.3,
      w * 0.65,
      -length / 2,
      0,
    );
    ctx.fillStyle = color([171, 163, 90], alpha * 0.3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-length / 2 - 2, -0.5);
    ctx.quadraticCurveTo(0, bend * 0.8 - w * 0.15, length / 2, bend);
    ctx.strokeStyle = color([224, 212, 144], alpha * 0.7);
    ctx.lineWidth = 0.65;
    ctx.stroke();
    if (openness > 0.12) {
      ctx.beginPath();
      for (let i = 1; i <= 4; i++) {
        const q = i / 5,
          vx = (q - 0.5) * length,
          vy = bend * q;
        const reach = Math.sin(q * Math.PI) * w * 0.7;
        ctx.moveTo(vx - length * 0.08, vy);
        ctx.quadraticCurveTo(
          vx,
          vy - reach * 0.5,
          vx + length * 0.04,
          vy - reach,
        );
        ctx.moveTo(vx - length * 0.08, vy);
        ctx.quadraticCurveTo(
          vx,
          vy + reach * 0.4,
          vx + length * 0.04,
          vy + reach * 0.68,
        );
      }
      ctx.strokeStyle = color([211, 205, 134], alpha * 0.36);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    ctx.restore();
  }
  function porcelainSprig(x, y, mirror) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(mirror, 1);
    // Tapered cobalt brushwork, with small irregularities in the painted glaze.
    const branch = new Path2D(
      "M -9,40 C 10,25 -10,8 5,-19 M -3,25 Q 12,23 18,12 M 0,9 Q -14,6 -17,-5",
    );
    strokePath(branch, "rgba(40,77,132,.55)", 1.15);
    const leaves = [
      [-5, 29, -0.6],
      [3, 19, 0.7],
      [-3, 10, -0.5],
      [1, 0, 0.65],
      [4, -9, -0.4],
      [12, 19, 0.2],
      [-11, 4, -0.8],
    ];
    leaves.forEach(([lx, ly, a], i) => {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-5, -2, -8, -8, -4, -13);
      ctx.quadraticCurveTo(3, -7, 0, 0);
      ctx.fillStyle = i % 2 ? "rgba(42,80,142,.67)" : "rgba(51,91,151,.45)";
      ctx.fill();
      ctx.restore();
    });
    ctx.translate(6, -21);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i * TAU) / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-7, -3, -5, -10, 0, -9);
      ctx.bezierCurveTo(5, -11, 7, -3, 0, 0);
      ctx.fillStyle = "rgba(48,87,145,.34)";
      ctx.fill();
      ctx.strokeStyle = "rgba(37,73,130,.65)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }
    ellipse(0, 0, 1.8, 1.8, "rgba(34,69,123,.8)");
    ctx.restore();
  }
  function draw() {
    if (sizeDirty) {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      width = box.width;
      height = box.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      sizeDirty = false;
    }
    ctx.setTransform(
      canvas.width / 360,
      0,
      0,
      canvas.height / 205,
      0,
      (-canvas.height * 30) / 205,
    );
    ctx.clearRect(0, 30, 360, 205);
    const active = state.status === "running";
    const t = motion.matches ? 0 : elapsed;
    const extract = Math.pow(clamp(strength), 0.85);
    const hex = /^#([0-9a-f]{6})$/i.exec(state.teaColor || "");
    const customColor = hex
      ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
      : null;
    const brewed =
      palettes[state.teaId] || customColor || palettes.oolong_light;
    // Clear water shows the white porcelain underneath. Pigment enters with time.
    const tea = mix([244, 246, 235], brewed, extract);
    const deep = mix([218, 227, 218], mix(brewed, [56, 37, 21], 0.22), extract);
    const surfaceY = 87 + Math.sin(t * 1.6) * (active ? 0.8 : 0);

    // Small contact shadow and the cup's raised foot; no saucer.
    ctx.save();
    ctx.translate(180, 223);
    ctx.scale(1, 0.12);
    const shadow = ctx.createRadialGradient(0, 0, 5, 0, 0, 91);
    shadow.addColorStop(0, "rgba(80,76,43,.16)");
    shadow.addColorStop(1, "rgba(80,76,43,0)");
    ellipse(0, 0, 91, 91, shadow);
    ctx.restore();
    ellipse(180, 220, 51, 7, "rgba(121,133,108,.1)");
    ellipse(
      180,
      217,
      43,
      6,
      gradient(140, 0, 222, 0, [
        [0, "#a4b6c2"],
        [0.3, "#fbfcf7"],
        [0.7, "#e6ebe5"],
        [1, "#9cabb6"],
      ]),
      "rgba(156,170,140,.5)",
    );

    // Opaque glazed porcelain. The moving tea is visible only inside the rim.
    ctx.fillStyle = gradient(43, 0, 317, 0, [
      [0, "#bdcbd0"],
      [0.09, "#e5eae3"],
      [0.27, "#fffef7"],
      [0.53, "#fcfdf7"],
      [0.8, "#eaf0e9"],
      [1, "#afc1c8"],
    ]);
    ctx.fill(body);
    ctx.save();
    ctx.clip(body);
    ctx.fillStyle = gradient(0, 108, 0, 220, [
      [0, "rgba(248,251,244,0)"],
      [0.7, "rgba(127,151,166,.03)"],
      [1, "rgba(101,129,150,.25)"],
    ]);
    ctx.fillRect(40, 85, 280, 139);
    porcelainSprig(83, 145, 1);
    porcelainSprig(276, 145, -1);
    strokePath(
      new Path2D("M 101,203 C 137,224 223,224 259,203"),
      "rgba(39,78,137,.72)",
      2.1,
    );
    strokePath(
      new Path2D("M 108,207 C 145,226 215,226 252,207"),
      "rgba(39,78,137,.33)",
      0.8,
    );
    ctx.restore();
    ellipse(
      180,
      86,
      137,
      43,
      gradient(0, 43, 0, 129, [
        [0, "#fdfdf6"],
        [0.46, "#d9e2de"],
        [1, "#fffff9"],
      ]),
      "#b8c7c9",
      0.8,
    );
    ellipse(180, 86, 133, 40, null, "rgba(39,78,137,.7)", 1.2);
    ellipse(180, 87, 127, 36.5, "#bcc5ae", "rgba(155,164,145,.6)", 1);

    // Elliptical tea surface, delicate meniscus and moving reflected light.
    ellipse(
      180,
      surfaceY,
      126,
      35,
      gradient(0, 52, 0, 123, [
        [0, color(deep, 0.95)],
        [0.42, color(tea, 0.88)],
        [0.86, color(tea, 0.91)],
        [1, color(deep, 0.96)],
      ]),
      color(deep, 0.38),
      0.8,
    );
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(180, surfaceY, 125, 34, 0, 0, TAU);
    ctx.clip();
    // Leaves at several depths: gentle circulation and gradual unfurling.
    for (let i = 0; i < 25; i++) {
      const phase = i * 2.399 + t * (0.1 + (i % 4) * 0.014);
      const depth = (Math.sin(phase) + 1) / 2;
      const radius = 24 + (i % 7) * 13;
      leaf(
        180 + Math.cos(phase) * radius,
        surfaceY + Math.sin(phase) * (6 + (i % 6) * 4.2),
        15 + (i % 5) * 4 + strength * 10,
        Math.sin(phase * 0.8) * 0.8 + i * 1.9,
        0.15 + strength * 0.85,
        (0.27 + depth * 0.33) * (1 - extract * 0.48),
        i,
        0.55 + depth * 0.25,
      );
    }
    for (let i = 0; i < 4; i++) {
      const phase = t * 0.45 + i * 1.7;
      ctx.beginPath();
      for (let x = 53; x <= 308; x += 3) {
        const y =
          surfaceY -
          24 +
          i * 14 +
          Math.sin(x * 0.035 + phase) * 2.5 +
          Math.sin(x * 0.018 - phase) * 2;
        if (x === 53) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(255,255,230,${0.09 + (i % 2) * 0.08})`;
      ctx.lineWidth = 1 + (i % 2);
      ctx.stroke();
    }
    // Expanding ripples on start and finish, continuous very faint rings while brewing.
    for (let i = 0; i < 3; i++) {
      const phase = transition * 0.56 - i * 0.19;
      const repeat = (t * 0.22 + i * 0.31) % 1;
      const q = phase >= 0 && phase <= 1 ? phase : active ? repeat : -1;
      if (q < 0) continue;
      ellipse(
        179 + Math.sin(t) * 4,
        surfaceY,
        8 + q * 124,
        2 + q * 34,
        null,
        `rgba(255,253,221,${(1 - q) * (state.status === "done" ? 0.8 : 0.38)})`,
        0.75,
      );
    }
    for (let i = 0; i < 5; i++) {
      const phase = t * (0.09 + (i % 3) * 0.018) + i * 2.4;
      leaf(
        180 + Math.cos(phase) * (38 + (i % 4) * 21),
        surfaceY + Math.sin(phase) * (14 + (i % 2) * 7),
        19 + (i % 3) * 6 + strength * 8,
        phase * 0.5 + i,
        0.2 + strength * 0.8,
        0.48,
        i,
        0.62,
      );
    }
    ctx.restore();
    ellipse(180, surfaceY, 126, 35, null, "rgba(255,253,230,.5)", 1);

    // Glaze highlights follow the curvature of the opaque porcelain.
    strokePath(
      body,
      gradient(0, 83, 0, 222, [
        [0, "rgba(117,143,157,.4)"],
        [0.45, "rgba(136,155,160,.2)"],
        [1, "rgba(99,124,148,.5)"],
      ]),
      1.25,
    );
    const left = new Path2D("M 50,94 C 57,137 81,188 113,202");
    strokePath(left, "rgba(255,255,249,.64)", 4);
    const right = new Path2D("M 307,103 C 299,140 278,183 248,201");
    strokePath(right, "rgba(255,255,249,.7)", 2.6);
    strokePath(
      new Path2D("M 72,140 C 79,160 89,176 99,185"),
      "rgba(255,255,249,.33)",
      7,
    );
    strokePath(
      new Path2D("M 130,210 C 152,218 210,217 233,209"),
      "rgba(255,252,216,.8)",
      1.6,
    );

    // Elapsed time traces the lip, independently of the decorative fluid motion.
    ellipse(180, 86, 137, 43, null, "rgba(83,109,136,.2)", 1.6);
    if (state.progress > 0) {
      ctx.beginPath();
      ctx.ellipse(
        180,
        86,
        137,
        43,
        0,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * state.progress,
      );
      ctx.strokeStyle = color(mix(tea, [94, 101, 49], 0.3), 0.85);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();
      const angle = -Math.PI / 2 + TAU * state.progress;
      ellipse(
        180 + Math.cos(angle) * 137,
        86 + Math.sin(angle) * 43,
        2.4,
        2.4,
        "#fffcdf",
        color(deep, 0.6),
        0.65,
      );
    }
    // The white front lip finishes the depth ordering.
    ctx.beginPath();
    ctx.ellipse(180, 86, 135, 41.5, 0, 0.12, Math.PI - 0.12);
    ctx.strokeStyle = "rgba(255,255,250,.84)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  function allowed() {
    return shown && intersecting && document.visibilityState !== "hidden";
  }
  function needsMotion() {
    return (
      !motion.matches &&
      (state.status === "running" ||
        (state.status === "done" && transition < 2.6))
    );
  }
  function tick(now) {
    frame = 0;
    if (!allowed()) {
      lastFrame = 0;
      return;
    }
    const dt = lastFrame ? (now - lastFrame) / 1000 : 1 / 30;
    if (lastFrame && dt < 1 / 30 - 0.002) {
      frame = requestAnimationFrame(tick);
      return;
    }
    lastFrame = now;
    const step = Math.min(dt, 0.08);
    if (needsMotion()) {
      elapsed += step;
      transition += step;
    }
    strength = motion.matches
      ? state.progress
      : strength + (state.progress - strength) * Math.min(1, step * 5);
    draw();
    if (needsMotion()) frame = requestAnimationFrame(tick);
    else lastFrame = 0;
  }
  function requestDraw() {
    if (allowed() && !frame) frame = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }
  new ResizeObserver(() => {
    sizeDirty = true;
    requestDraw();
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    if (intersecting) requestDraw();
    else stop();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stop();
    else requestDraw();
  });
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", requestDraw);
  motion.addEventListener("change", () => {
    stop();
    requestDraw();
  });
  return {
    update(next) {
      const changed =
        state.status !== next.status || state.infusion !== next.infusion;
      if (state.infusion !== next.infusion || next.status === "ready") {
        elapsed = 0;
        strength = next.progress;
      }
      if (changed)
        transition =
          next.status === "running" || next.status === "done" ? 0 : 3;
      state = { ...next, progress: clamp(next.progress) };
      // Pausing freezes the exact composition of the leaves and water.
      if (next.status === "paused") stop();
      requestDraw();
    },
    setVisible(visible) {
      shown = visible;
      if (visible) {
        sizeDirty = true;
        requestDraw();
      } else stop();
    },
  };
}
