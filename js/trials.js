import { trialComment } from "../shared/profiles.js";
import { researcherNote } from "./profile-ui.js";
import { config } from "../shared/config.js";
import { newSeed, randomInt, emptySenses, iso } from "../shared/core.js";
import {
  particleScene,
  particlePosition,
  scoreParticles,
} from "../shared/particles.js";
import { local, serverNow } from "./api.js";
import { modal, button, setCleanup, toast, xpHtml } from "./ui.js";
const symbols = ["○", "△", "□", "◇"];
function recordTraining(testId, result) {
  const version =
    testId === "particle" ? config.particleRuleVersion : config.testVersion;
  const best = local.get(`training-best:v${version}`, {});
  best[testId] = Math.max(
    best[testId] || 0,
    Number(result.score ?? result.correct),
  );
  local.set(`training-best:v${version}`, best);
  const all = local.get("training", []);
  const others = all.filter((r) => r.testId !== testId),
    own = all.filter((r) => r.testId === testId);
  own.push({
    ...result,
    id: crypto.randomUUID(),
    testId,
    finishedAt: iso(serverNow()),
    testVersion: version,
    score: result.score ?? result.correct,
    correct: result.correct,
  });
  if (!local.set("training", [...others, ...own.slice(-30)]))
    toast("端末への訓練記録保存ができません。");
  document.dispatchEvent(new CustomEvent("sixth:training-saved"));
}
function reward(result, daily) {
  return daily
    ? `${xpHtml(result.xp)}<p class="small muted" style="margin-top:12px">本日の研究記録を保存しました。+10 RC</p>`
    : '<p class="small muted">訓練記録を保存しました。恒久XP・RCへの反映はありません。</p>';
}
export async function launchTest(test, daily, mutate) {
  if (!["card", "particle"].includes(test))
    throw Error("試験を選んでください。");
  const label = {
    card: "★カード感応試験",
    particle: "粒子総合観測試験",
  }[test];
  if (test === "particle") {
    modal(
      label,
      `<p class="trial-instructions">30秒間、通常の動きから外れた粒子をタップしてください。逸脱・予兆・突発出現・不同調・異質の5種類、計16イベントを観測します。</p><p class="small muted">100個の粒子が動きます。スマホでは横向きも利用できます。画面を離れる、または低FPSが続く場合は無効になり、再挑戦できます。</p><div class="actions"><button id="particle-begin" class="primary">性能確認して開始</button>${button("閉じる", "close", "secondary")}</div>`,
      daily ? "DAILY / PARTICLE" : "TRAINING / PARTICLE",
    );
    document.querySelector("#particle-begin").onclick = async (e) => {
      e.target.disabled = true;
      try {
        await particleTest(daily, mutate);
      } catch (err) {
        toast(err.message);
        if (e.target.isConnected) e.target.disabled = false;
      }
    };
    return;
  }
  const started = daily
    ? (await mutate(`/api/daily/${test}/start`, {})).result
    : null;
  if (test === "card") cardTest(daily, mutate, started);
}
function cardTest(daily, mutate, started) {
  let answer = daily ? null : randomInt(5),
    done = false;
  modal(
    "★が隠れているカードは？",
    `<p class="trial-instructions">考えすぎず、気になったカードを1枚選んでください。</p><div class="choice-cards">${Array.from({ length: 5 }, (_, i) => `<button class="star-card" data-card="${i}" aria-label="カード ${i + 1}">Ⅵ<small>${String(i + 1).padStart(2, "0")}</small></button>`).join("")}</div><div id="card-result" aria-live="polite"></div><p class="small muted">明示的な手掛かりはありません。理論上の的中率は20%です。</p>`,
    daily ? "DAILY / INTUITION" : "TRAINING / INTUITION",
  );
  document.querySelectorAll("[data-card]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (done) return;
        done = true;
        document
          .querySelectorAll("[data-card]")
          .forEach((b) => (b.disabled = true));
        try {
          const selectedIndex = Number(b.dataset.card);
          let r;
          if (daily)
            r = (
              await mutate("/api/daily/card/answer", {
                attemptId: started.attemptId,
                selectedIndex,
              })
            ).result;
          else {
            r = {
              correct: selectedIndex === answer,
              selectedIndex,
              answerIndex: answer,
              xp: emptySenses(),
            };
            recordTraining("card", r);
          }
          if (!document.querySelector("#card-result")) return;
          answer = r.answerIndex;
          document.querySelectorAll("[data-card]").forEach((c) => {
            const i = Number(c.dataset.card);
            c.classList.add("revealed");
            if (i === answer) c.classList.add("correct");
            if (i === selectedIndex) c.classList.add("selected");
            c.innerHTML = `${i === answer ? "★" : "·"}<small>${i === selectedIndex ? "あなたの選択" : String(i + 1).padStart(2, "0")}</small>`;
          });
          document.querySelector("#card-result").innerHTML =
            `<div class="result-banner"><h3>${r.correct ? "感応を記録しました。" : "今回は、別のカードでした。"}</h3><p>★はカード ${answer + 1} にありました。</p>${reward(r, daily)}</div>${resultExtras("card", r, daily)}<div class="actions">${button("訓練でもう一度", "training-card", "secondary")}${button("閉じる", "close", "text-button")}</div>`;
        } catch (e) {
          done = false;
          document
            .querySelectorAll("[data-card]")
            .forEach((c) => (c.disabled = false));
          toast(e.message);
        }
      }),
  );
}
function drawScene(ctx, scene, ms, reveal = false) {
  const { width, height } = config.particle;
  ctx.fillStyle = "#060e17";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#12242f";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#294b4a";
  ctx.strokeRect(390, 10, 280, 520);
  for (const p of scene.particles) {
    const ev = scene.eventMap.get(p.id);
    const pos = particlePosition(p, ms, ev, p.renderPosition);
    if (!pos.visible) continue;
    const active = ev && ms >= ev.startMs && ms <= ev.endMs;
    ctx.fillStyle = "#b6e6e0";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
    ctx.fill();
    if (reveal && active) {
      ctx.strokeStyle = "#ffc58a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffc58a";
      ctx.font = "14px sans-serif";
      ctx.fillText(ev.type, pos.x + 18, pos.y);
    }
  }
}
function prepareScene(seed, version = config.particleRuleVersion) {
  const s = particleScene(seed, version);
  s.eventMap = new Map(s.events.map((e) => [e.particleId, e]));
  for (const p of s.particles) p.renderPosition = {};
  return s;
}
async function calibrate(canvas, scene, isStopped) {
  const ctx = canvas.getContext("2d");
  let previous = performance.now(),
    start = previous,
    frames = 0;
  return new Promise((resolve) => {
    function frame(t) {
      if (isStopped()) {
        resolve(false);
        return;
      }
      drawScene(ctx, scene, t - start);
      frames++;
      previous = t;
      if (t - start >= 3000) {
        resolve(frames / ((t - start) / 1000) >= 30);
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
async function particleTest(daily, mutate) {
  let stopped = false,
    raf = 0,
    active = false,
    started = null,
    seed = newSeed(),
    scene = prepareScene(seed),
    taps = [],
    lastTap = -500,
    start = 0,
    last = 0,
    lowTime = 0;
  modal(
    "粒子総合観測試験",
    '<div class="trial-toolbar"><span id="particle-status">3秒間の性能確認中…</span><b class="timer" id="particle-timer">30.0</b></div><canvas id="particle-canvas" class="particle-canvas" width="960" height="540" aria-label="異常を見つけた粒子をタップする観測エリア"></canvas><p class="trial-note">気になった場所を指で示してください。円の範囲で受け付けます。入力間隔は0.5秒です。</p>',
    daily ? "DAILY / PARTICLE" : "TRAINING / PARTICLE",
  );
  const canvas = document.querySelector("#particle-canvas"),
    ctx = canvas.getContext("2d");
  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onHidden);
    if (active && daily && started) {
      active = false;
      void mutate("/api/daily/particle/cancel", {
        attemptId: started.attemptId,
      }).catch(() => {});
    }
  };
  setCleanup(cleanup);
  function invalidate(message) {
    if (stopped) return;
    cleanup();
    modal(
      "観測を中断しました。",
      `<p class="muted">${message}</p><p>今回の結果は反映されません。再挑戦できます。</p>${button("再挑戦", `${daily ? "daily" : "training"}-particle`)}`,
    );
  }
  function onHidden() {
    if (document.hidden)
      invalidate("観測画面から離れたため、測定を無効にしました。");
  }
  document.addEventListener("visibilitychange", onHidden);
  const capable = await calibrate(canvas, scene, () => stopped);
  if (stopped) return;
  if (!capable) {
    invalidate(
      "この端末では30 FPSを維持できませんでした。他のアプリを閉じてお試しください。",
    );
    return;
  }
  if (daily) {
    started = (await mutate("/api/daily/particle/start", {})).result;
    seed = started.seed;
    scene = prepareScene(seed, started.testVersion);
  }
  if (stopped) {
    if (daily && started)
      void mutate("/api/daily/particle/cancel", {
        attemptId: started.attemptId,
      }).catch(() => {});
    return;
  }
  const version = started?.testVersion || config.particleRuleVersion;
  const duration = config.particle.durationByVersion[version];
  active = true;
  start = performance.now();
  last = start;
  document.querySelector("#particle-status").textContent =
    "観測中 · 100 PARTICLES";
  canvas.addEventListener("pointerdown", (e) => {
    if (!active) return;
    const ms = performance.now() - start;
    if (ms - lastTap < 500 || ms > duration) return;
    const r = canvas.getBoundingClientRect();
    taps.push({
      ms: Math.round(ms),
      x: ((e.clientX - r.left) * 960) / r.width,
      y: ((e.clientY - r.top) * 540) / r.height,
    });
    lastTap = ms;
  });
  const save = async () => {
    try {
      const r = daily
        ? (
            await mutate("/api/daily/particle/finish", {
              attemptId: started.attemptId,
              taps,
              valid: true,
            })
          ).result
        : scoreParticles(seed, taps);
      if (!daily) recordTraining("particle", { ...r, seed, taps });
      modal(
        "粒子観測の結果",
        `<div class="result-metrics"><div class="metric"><b>${r.found} / 16</b><span>発見した異常</span></div><div class="metric"><b>${r.falsePositives}</b><span>誤検知</span></div><div class="metric"><b>${r.meanReactionMs === null ? "—" : (r.meanReactionMs / 1000).toFixed(2) + "秒"}</b><span>平均発見時間</span></div></div>${reward(r, daily)}${resultExtras("particle", r, daily)}<p class="small muted">予兆発見 ${r.hits.filter((h) => h.leadMs > 0).length} / 4 · 異質発見 ${r.hits.filter((h) => h.type === "hidden-rule").length} / 2</p><div class="actions"><button class="primary" id="particle-replay">答え合わせを見る</button>${button("閉じる", "close", "secondary")}</div>`,
      );
      document.querySelector("#particle-replay").onclick = () =>
        replayParticles(seed, r);
    } catch (e) {
      modal(
        "観測結果の保存を待っています。",
        `<p class="muted">${e.message}</p><button id="particle-retry" class="primary">保存を再試行</button>`,
      );
      document.querySelector("#particle-retry").onclick = save;
    }
  };
  function frame(t) {
    if (stopped) return;
    const elapsed = t - start,
      dt = t - last;
    last = t;
    lowTime = dt > 34 ? lowTime + dt : Math.max(0, lowTime - dt);
    if (lowTime > 3000) {
      invalidate("低いフレームレートが続いたため、測定を無効にしました。");
      return;
    }
    drawScene(ctx, scene, Math.min(elapsed, duration));
    const tap = taps.at(-1);
    if (tap && elapsed - tap.ms < 350) {
      ctx.strokeStyle = "#91ead0";
      ctx.fillStyle = "#91ead012";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        tap.x,
        tap.y,
        config.particle.hitRadiusByVersion[version],
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }
    document.querySelector("#particle-timer").textContent = (
      Math.max(0, duration - elapsed) / 1000
    ).toFixed(1);
    if (elapsed >= duration) {
      active = false;
      stopped = true;
      document.removeEventListener("visibilitychange", onHidden);
      setCleanup(null);
      void save();
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}
export function replayParticles(seed, result) {
  const version = result.particleRuleVersion || result.testVersion || 1;
  const duration = config.particle.durationByVersion[version];
  modal(
    "観測の答え合わせ",
    `<p class="small muted">オレンジのリングが、その時点で発生していた異常です。</p><canvas id="replay-canvas" class="particle-canvas" width="960" height="540" aria-label="異常粒子のリプレイ"></canvas><div class="replay-controls"><button id="replay-play" class="secondary">再生</button><input id="replay-time" type="range" min="0" max="${duration}" value="6000" step="100" aria-label="再生位置"><span id="replay-value">6.0秒</span></div><p class="small muted">発見 ${result.found} / 16 · 同じシードから観測を再現しています。</p>`,
    "PARTICLE REPLAY",
  );
  const scene = prepareScene(seed, version),
    canvas = document.querySelector("#replay-canvas"),
    slider = document.querySelector("#replay-time");
  let timer = null;
  const draw = () => {
    drawScene(canvas.getContext("2d"), scene, Number(slider.value), true);
    document.querySelector("#replay-value").textContent =
      (Number(slider.value) / 1000).toFixed(1) + "秒";
  };
  slider.oninput = draw;
  document.querySelector("#replay-play").onclick = (e) => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      e.target.textContent = "再生";
      return;
    }
    e.target.textContent = "停止";
    timer = setInterval(() => {
      slider.value = (Number(slider.value) + 100) % (duration + 1);
      draw();
    }, 100);
  };
  setCleanup(() => clearInterval(timer));
  draw();
}

function resultExtras(test, result) {
  return researcherNote(trialComment(test, result));
}
