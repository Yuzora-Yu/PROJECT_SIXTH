import { shareButtons } from "./sharing.js";
import { trialComment } from "../shared/profiles.js";
import { researcherNote } from "./profile-ui.js";
import { config } from "../shared/config.js";
import {
  newSeed,
  randomInt,
  emptySenses,
  patternQuestions,
  scorePattern,
  iso,
} from "../shared/core.js";
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
  const label = {
    card: "★カード感応試験",
    particle: "粒子総合観測試験",
    pattern: "潜在法則予測試験",
  }[test];
  if (test === "particle") {
    modal(
      label,
      `<p class="trial-instructions">60秒間、通常の動きから外れた粒子をタップしてください。逸脱・予兆・突発出現・不同調・異質の5種類、計16イベントを観測します。</p><p class="small muted">100個の粒子が動きます。スマホでは横向きも利用できます。画面を離れる、または低FPSが続く場合は無効になり、再挑戦できます。</p><div class="actions"><button id="particle-begin" class="primary">性能確認して開始</button>${button("閉じる", "close", "secondary")}</div>`,
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
  else patternTest(daily, mutate, started);
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
function patternTest(daily, mutate, started) {
  const seed = newSeed(),
    questions = daily ? started.questions : patternQuestions(seed),
    answers = [];
  let index = 0,
    timer = null,
    stopped = false;
  function next() {
    const q = questions[index];
    modal(
      `潜在法則を観測する　${index + 1} / 5`,
      `<p class="trial-instructions">記号の順番を観測して、次の記号を選んでください。</p><div class="pattern-sequence">${q.sequence.map((s, i) => `<span class="pattern-symbol" id="symbol-${i}" aria-label="観測 ${i + 1}">·</span>`).join("")}</div><p id="pattern-prompt" class="muted">観測中…</p><div class="pattern-choices">${symbols.map((s, i) => `<button data-choice="${i}" aria-label="${s}を選択" disabled>${s}</button>`).join("")}</div><label class="self-report">選んだ感覚（任意）<select id="self-report"><option value="unsure">どちらともいえない</option><option value="intuition">勘だった</option><option value="reasoned">法則が分かった</option></select></label><div id="pattern-save"></div>`,
      daily ? "DAILY / HIDDEN PATTERN" : "TRAINING / HIDDEN PATTERN",
    );
    stopped = false;
    let observed = 0,
      shownAt = 0;
    timer = setInterval(() => {
      if (stopped) return;
      document
        .querySelectorAll(".pattern-symbol")
        .forEach((e) => e.classList.remove("active"));
      if (observed < 8) {
        const el = document.querySelector(`#symbol-${observed}`);
        el.textContent = symbols[q.sequence[observed]];
        el.classList.add("active");
        observed++;
      } else {
        clearInterval(timer);
        shownAt = performance.now();
        document.querySelector("#pattern-prompt").textContent =
          "次に現れる記号は？";
        document
          .querySelectorAll("[data-choice]")
          .forEach((b) => (b.disabled = false));
      }
    }, 650);
    setCleanup(() => {
      stopped = true;
      clearInterval(timer);
    });
    document.querySelectorAll("[data-choice]").forEach(
      (b) =>
        (b.onclick = async () => {
          document
            .querySelectorAll("[data-choice]")
            .forEach((b) => (b.disabled = true));
          answers.push({
            selectedIndex: Number(b.dataset.choice),
            reactionMs: Math.round(performance.now() - shownAt),
            selfReport: document.querySelector("#self-report").value,
          });
          if (++index < 5) {
            next();
            return;
          }
          const save = async () => {
            try {
              const result = daily
                ? (
                    await mutate("/api/daily/pattern/finish", {
                      attemptId: started.attemptId,
                      answers,
                    })
                  ).result
                : scorePattern(patternQuestions(seed), answers);
              if (!daily) recordTraining("pattern", result);
              modal(
                "潜在法則の観測結果",
                `<div class="result-metrics"><div class="metric"><b>${result.correct} / 5</b><span>正解数</span></div><div class="metric"><b>${(answers.reduce((s, a) => s + a.reactionMs, 0) / 5000).toFixed(2)}秒</b><span>平均回答時間</span></div></div>${reward(result, daily)}${resultExtras("pattern", result, daily)}<table class="data-table"><thead><tr><th>問</th><th>結果</th><th>潜んでいた法則</th></tr></thead><tbody>${result.details.map((d, i) => `<tr><td>${i + 1}</td><td>${d.correct ? "✓ 正解" : "—"} ${symbols[d.answer]}</td><td>${d.rule}</td></tr>`).join("")}</tbody></table><div class="actions" style="margin-top:20px">${button("閉じる", "close")}${button("訓練でもう一度", "training-pattern", "secondary")}</div>`,
              );
            } catch (e) {
              toast(e.message);
              const el = document.querySelector("#pattern-save");
              if (el) {
                el.innerHTML =
                  '<button id="pattern-retry" class="primary">結果の保存を再試行</button>';
                document.querySelector("#pattern-retry").onclick = save;
              }
            }
          };
          await save();
        }),
    );
  }
  next();
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
function prepareScene(seed) {
  const s = particleScene(seed);
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
    '<div class="trial-toolbar"><span id="particle-status">3秒間の性能確認中…</span><b class="timer" id="particle-timer">60.0</b></div><canvas id="particle-canvas" class="particle-canvas" width="960" height="540" aria-label="異常を見つけた粒子をタップする観測エリア"></canvas><p class="trial-note">異常を感じた粒子をタップ。入力間隔は0.5秒です。画面を離れると無効になります。</p>',
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
    scene = prepareScene(seed);
  }
  if (stopped) {
    if (daily && started)
      void mutate("/api/daily/particle/cancel", {
        attemptId: started.attemptId,
      }).catch(() => {});
    return;
  }
  active = true;
  start = performance.now();
  last = start;
  document.querySelector("#particle-status").textContent =
    "観測中 · 100 PARTICLES";
  canvas.addEventListener("pointerdown", (e) => {
    if (!active) return;
    const ms = performance.now() - start;
    if (ms - lastTap < 500 || ms > 60000) return;
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
    drawScene(ctx, scene, Math.min(elapsed, 60000));
    document.querySelector("#particle-timer").textContent = (
      Math.max(0, 60000 - elapsed) / 1000
    ).toFixed(1);
    if (elapsed >= 60000) {
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
  modal(
    "観測の答え合わせ",
    `<p class="small muted">オレンジのリングが、その時点で発生していた異常です。</p><canvas id="replay-canvas" class="particle-canvas" width="960" height="540" aria-label="異常粒子のリプレイ"></canvas><div class="replay-controls"><button id="replay-play" class="secondary">再生</button><input id="replay-time" type="range" min="0" max="60000" value="6000" step="100" aria-label="再生位置"><span id="replay-value">6.0秒</span></div><p class="small muted">発見 ${result.found} / 16 · 同じシードから観測を再現しています。</p>`,
    "PARTICLE REPLAY",
  );
  const scene = prepareScene(seed),
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
      slider.value = (Number(slider.value) + 100) % 60001;
      draw();
    }, 100);
  };
  setCleanup(() => clearInterval(timer));
  draw();
}

function resultExtras(test, result, daily) {
  const title =
    (daily ? "Daily" : "訓練") +
    " / " +
    { card: "★カード感応", particle: "粒子観測", pattern: "潜在法則" }[test];
  const summary =
    test === "card"
      ? result.correct
        ? "★を発見"
        : "今回は不的中"
      : test === "particle"
        ? `${result.found} / 16 発見・誤検知 ${result.falsePositives}`
        : `${result.correct} / 5 正解`;
  const comment = trialComment(test, result);
  return (
    researcherNote(comment) +
    shareButtons({
      title,
      summary,
      comment,
      note: daily
        ? "Dailyの測定記録。能力の科学的な証明ではありません。"
        : "トレーニングの記録。恒久XP・RCへの反映はありません。",
    })
  );
}
