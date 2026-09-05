import {
  profilePanels,
  renderBirthProfile,
  renderMbti,
  observedPanel,
  researcherNote,
  savedProfile,
} from "./profile-ui.js";
import { planetaryProfile, mbtiNotes } from "../shared/profiles.js";

import { config } from "../shared/config.js";
import { dateLabel, astrology, dayKey } from "../shared/core.js";
import { monsters } from "../data/prisma/catalog.js";
import { characters, isAvailableCharacter } from "../shared/roster.js";
import { api, local, serverNow } from "./api.js";
import {
  radar,
  button,
  escape,
  modal,
  closeModal,
  toast,
  showAccessBonus,
  setCleanup,
} from "./ui.js";
import { launchTest, replayParticles } from "./trials.js";
let player = null,
  online = false,
  route = "home",
  busy = false,
  battleCharacter = 101;
let observedDay = null,
  predictionData = null,
  predictionRefreshTimer = null;
let pendingAccessBonus = null,
  accessBonusUiReady = false;
const terminalEntryDurationMs = 1150;
const labs = [
  {
    id: "card",
    icon: "✦",
    name: "★カード感応試験",
    sub: "STAR CARD",
    desc: "5枚のカード。その中に隠れた、ひとつの星を感じ取る。",
    sense: "感応",
    time: "約10秒",
  },
  {
    id: "particle",
    icon: "⠿",
    name: "粒子総合観測試験",
    sub: "PARTICLE OBSERVATION",
    desc: "100個の粒子の中から、いつもと違う動きを見つける。",
    sense: "察知・予見・洞察・共鳴",
    time: "30秒",
  },
];
const starterIds = [101, 107, 301, 108, 110, 202];
const navs = [
  ["home", "⌂", "ホーム", "HOME", "ホーム"],
  ["daily", "◈", "デイリーテスト", "DAILY TEST", "デイリー"],
  ["training", "⠿", "トレーニング", "TRAINING", "訓練"],
  ["prediction", "◷", "現実予測", "PREDICTION", "予測"],
  ["battle", "⚔", "戦闘実験", "BATTLE", "戦闘"],
  ["characters", "♙", "キャラクター", "CHARACTER", "仲間"],
  ["analyze", "⌁", "被験結果解析", "ANALYZE", "解析"],
  ["archive", "▦", "観測記録", "ARCHIVE", "記録"],
];
const char = (id) =>
  characters.find((c) => c.id === Number(id)) || characters[0];
const ownedCount = () =>
  Object.keys(player?.characters || {}).filter(isAvailableCharacter).length;
function intro(eyebrow, title, desc) {
  return `<div class="screen-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${desc}</p></div>`;
}
function renderNav() {
  document.querySelector("#navigation").innerHTML = navs
    .map(
      ([id, symbol, label, , shortLabel]) =>
        `<a href="#${id}" class="nav-link ${route === id ? "active" : ""} ${["characters", "archive"].includes(id) ? "mobile-hide" : ""}" ${route === id ? 'aria-current="page"' : ""}><span class="nav-symbol" aria-hidden="true">${symbol}</span><span class="nav-label">${label}</span><span class="nav-label-short">${shortLabel}</span></a>`,
    )
    .join("");
}
function render() {
  renderNav();
  document.querySelector("#breadcrumb").textContent =
    navs.find((n) => n[0] === route)?.[3] || "HOME";
  document.querySelector("#account").innerHTML = player
    ? `<span class="coin">◉ ${player.rc.toLocaleString()} <small>RC</small></span><button data-action="characters" aria-label="キャラクターを表示"><img src="${char(player.profileIconCharacterId).face}" alt=""><span class="subject-id">${escape(player.displayName || "SUBJECT " + player.id.slice(0, 4).toUpperCase())}</span></button>`
    : "";
  const pages = {
    home,
    daily: () => labPage(false),
    training: () => labPage(true),
    prediction: future,
    battle: battlePage,
    characters: charactersPage,
    analyze: analyzePage,
    archive: archivePage,
  };
  const main = document.querySelector("#main");
  main.innerHTML =
    (!online
      ? `<div class="notice">保存サーバーに接続できません。トレーニングをプレイできます。 ${button("再接続", "reconnect", "text-button")}</div>`
      : "") + (pages[route] || home)();
  main.classList.remove("reveal");
  void main.offsetWidth;
  main.classList.add("reveal");
  if (route === "analyze") {
    renderAstrology();
    renderMbti();
  }
}
function home() {
  const completed = Object.values(player?.dailyStatus || {}).filter(
      (x) => x === "complete",
    ).length,
    c = char(player?.profileIconCharacterId),
    stats = player?.senseStats;
  return `<div class="page-intro"><div><span class="eyebrow">OBSERVATION LOBBY</span><h1>ようこそ、被験者。</h1><p>今日の「なんとなく」を、観測しよう。</p></div><div class="date-chip">${dateLabel(serverNow())}</div></div>
  ${player && !player.starterChosen ? starterPrompt() : ""}<div class="dashboard-grid"><div class="left-column"><section class="panel hero"><div class="signal-orbit" aria-hidden="true"><div class="signal-cross"></div><span>Ⅵ</span></div><span class="eyebrow">DAILY EXPERIMENT / ${String(completed).padStart(2, "0")} OF 02</span><h2>その直感に、<br>まだ知らない可能性。</h2><p>2つの実験で、第六感を記録する。<br>本日の観測を開始します。</p>${button(completed === 2 ? "本日の結果を見る　↗" : "今日のテストへ　→", completed === 2 ? "analyze" : "daily")}</section>
  <div class="section-heading"><h2>本日の実験</h2><small>${completed} / 2 完了</small></div><div class="test-grid">${labs.map((l, i) => `<button class="test-card" data-action="daily-${l.id}"><span class="number">0${i + 1}</span><span class="test-icon" aria-hidden="true">${l.icon}</span><h3>${["★カード感応", "粒子総合観測"][i]}</h3><p>${l.time} · ${l.id === "particle" ? "4つの第六感" : l.sense}</p><div class="test-bottom"><span class="status ${player?.dailyStatus[l.id] === "complete" ? "done" : ""}">${player?.dailyStatus[l.id] === "complete" ? "本日完了" : "未実施"}</span><span class="card-arrow">↗</span></div></button>`).join("")}</div>
  <div class="wide-links"><button class="feature-link" data-action="training"><span class="feature-icon">⠿</span><span><h3>トレーニング</h3><p>気が済むまで、観測しよう。</p></span><span class="arrow">↗</span></button><button class="feature-link" data-action="battle"><span class="feature-icon">⚔</span><span><h3>戦闘実験</h3><p>本日 残り ${player?.battleRemaining ?? "—"} / 5 回</p></span><span class="arrow">↗</span></button></div></div>
  <div class="right-column"><section class="panel chart-panel"><div class="chart-heading"><h2>第六感プロファイル</h2><small>SUBJECT DATA</small></div>${stats ? radar(stats) : '<p class="muted">研究値は接続後に表示されます。</p>'}<div class="stat-strip">${config.senses.map((k) => `<span>${config.labels[k]}<b>${stats?.[k] ?? "—"}</b></span>`).join("")}</div><div class="condition"><span><span class="live-dot"></span>本日のコンディション</span><b>+${Math.round(player?.condition || 0)}</b></div>${button("被験結果を解析する　↗", "analyze", "text-button")}</section>
  <section class="panel character-panel"><img src="${c.image}" alt="${c.name}"><div class="character-copy"><span class="eyebrow">YOUR PARTNER</span><h2>${c.name}</h2><p>${c.job} / LV.${1 + Math.floor((player?.characters[c.id]?.exp || 0) / 60)}<br>得意な第六感：${config.labels[c.primarySense]}</p>${button("キャラクターへ　↗", "characters", "secondary")}</div></section></div></div>
  <div class="future-strip"><span>◷　REAL PREDICTION <small>現実世界で、直感を記録する。</small></span>${button("予測を見る　→", "prediction", "secondary")}</div>`;
}
function labPage(training) {
  const list = local.get("training", []);
  return (
    intro(
      training ? "TRAINING LAB" : "DAILY TEST",
      training ? "何度でも、観測しよう。" : "本日の適性実験",
      training
        ? "恒久ステータス・RCは増えません。自己ベストと直近30回を記録します。"
        : "各試験は1日1回。04:00 JSTに受験権が更新されます。",
    ) +
    `<div class="lab-list">${labs
      .map((l, i) => {
        const done = player?.dailyStatus[l.id] === "complete";
        const version =
          l.id === "particle" ? config.particleRuleVersion : config.testVersion;
        const records = list.filter(
          (r) => r.testId === l.id && r.testVersion === version,
        );
        return `<section class="panel lab-row"><span class="test-icon" aria-hidden="true">${l.icon}</span><div><span class="eyebrow">LAB 0${i + 1} / ${l.sub}</span><h2>${l.name}</h2><p>${l.desc}</p><div class="lab-meta"><span>${l.time}</span><span>${l.sense}</span><span>${training ? `記録 ${records.length} 回` : done ? "✓ 本日完了" : `+${config.economy.dailyTestRC[l.id]} RC`}</span></div>${training && records.length ? `<small class="muted">自己ベスト ${Math.max(local.get(`training-best:v${version}`, {})[l.id] || 0, ...records.map((r) => r.score ?? Number(r.correct)))} / 直近平均 ${(records.reduce((s, r) => s + (r.score ?? Number(r.correct)), 0) / records.length).toFixed(1)}<br>直近の記録：${new Intl.DateTimeFormat("ja-JP", { timeZone: config.timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(Date.parse(records.at(-1).finishedAt))} JST / ${records.at(-1).score ?? Number(records.at(-1).correct)}</small>` : ""}</div>${button(training ? "訓練を始める　→" : done ? "結果を見る" : "試験を始める　→", `${training ? "training" : "daily"}-${l.id}`, done ? "secondary" : "primary")}</section>`;
      })
      .join("")}</div>`
  );
}
function future() {
  const data = predictionData;
  if (!data)
    return (
      intro(
        "FIELD TEST",
        "現実予測",
        "結果が確定していない出来事に、いまの直感で答える実地試験です。",
      ) +
      `<section class="empty-state"><span class="symbol">◷</span><h2>予測データを取得できませんでした。</h2><p class="muted">通信状態を確認して、もう一度接続してください。</p>${button("再接続", "reconnect", "secondary")}</section>`
    );
  const open = data.items.filter((item) => item.state === "open").length;
  const statusTitle = open
    ? `${open}件を受付中`
    : data.items.length
      ? "現在は結果待ちです"
      : data.nextChangeAt
        ? `${formatJst(data.nextChangeAt)}に受付開始`
        : "現在受付中の予測はありません";
  return (
    intro(
      "FIELD TEST",
      "現実予測",
      "結果が確定していない出来事に、いまの直感で答える実地試験です。",
    ) +
    `<section class="panel prediction-overview"><div><span class="eyebrow">OBSERVATION STATUS</span><h2>${statusTitle}</h2><p>選択は締切まで変更できます。結果が確定すると、ここで記録と照合します。</p></div><div class="prediction-stats"><span>記録済み<b>${data.stats.recorded}</b></span><span>照合済み<b>${data.stats.settled}</b></span><span>的中<b>${data.stats.settled ? `${data.stats.correct}/${data.stats.settled}` : "—"}</b></span></div></section>` +
    `<div class="prediction-list">${data.items.map(predictionCard).join("")}</div>`
  );
}

const predictionStatus = {
  upcoming: "受付前",
  open: "受付中",
  closed: "結果待ち",
  settled: "結果確定",
};
const jstDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: config.timezone,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const formatJst = (value) => `${jstDateTime.format(Date.parse(value))} JST`;

function predictionCard(item) {
  const selected = item.selection?.optionId;
  const selectedChoice = item.choices.find((choice) => choice.id === selected);
  const resultChoice = item.choices.find(
    (choice) => choice.id === item.result?.optionId,
  );
  const stateNote =
    item.state === "upcoming"
      ? `${formatJst(item.publishAt)}から受け付けます。`
      : item.state === "open"
        ? selectedChoice
          ? `「${escape(selectedChoice.label)}」で記録済みです。締切までは変更できます。`
          : "直感に近いものを、ひとつ選んでください。"
        : item.state === "settled"
          ? selectedChoice
            ? `あなたの記録：${escape(selectedChoice.label)} ／ 結果：${escape(resultChoice?.label || "確認中")}`
            : `結果：${escape(resultChoice?.label || "確認中")}`
          : selectedChoice
            ? `あなたの記録：${escape(selectedChoice.label)}`
            : "受付は終了しました。";
  const sourceUrl = /^https:\/\//.test(item.source?.url || "")
    ? escape(item.source.url)
    : "";
  return `<section class="panel prediction-card ${item.state}"><div class="prediction-card-head"><span class="prediction-category">${escape(item.categoryLabel)}</span><span class="prediction-state">${predictionStatus[item.state]}</span></div><h2>${escape(item.question)}</h2><div class="prediction-deadline"><span>受付締切</span><b>${formatJst(item.closeAt)}</b></div><div class="prediction-choices">${item.choices
    .map(
      (choice) =>
        `<button class="prediction-choice ${selected === choice.id ? "selected" : ""}" data-action="prediction-vote-${item.id}-v${item.version}-${choice.id}" aria-pressed="${selected === choice.id}" ${item.state === "open" ? "" : "disabled"}><span>${choice.id}</span><b>${escape(choice.label)}</b>${selected === choice.id ? "<small>記録済み</small>" : ""}</button>`,
    )
    .join(
      "",
    )}</div><p class="prediction-note ${item.correct === true ? "correct" : item.correct === false ? "incorrect" : ""}">${stateNote}</p><details class="prediction-rule"><summary>判定方法と情報源</summary><p>${escape(item.resolutionRule)}</p>${sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${escape(item.source.name)}　↗</a>` : ""}<p class="small muted">結果確認予定：${formatJst(item.resultDueAt)}</p></details></section>`;
}
function charactersPage() {
  return (
    intro(
      "SUBJECT FILE",
      "共鳴する、仲間たち。",
      `キャラクターごとに異なる第六感の適性。収集 ${ownedCount()} / ${characters.length}`,
    ) +
    `${player && !player.starterChosen ? starterPrompt() : ""}<section class="panel summon-bar"><div><h2>共鳴召喚</h2><p>全${characters.length}名・各1/${characters.length}（約${(100 / characters.length).toFixed(2)}%）。重複は欠片10個に変換。<br>RCはプレイで獲得する無料・換金不能の通貨です。</p></div><div class="actions">${button("1回 · 100 RC", "draw-1")}${button("10連 · 900 RC", "draw-10", "secondary")}</div></section><div class="character-grid">${characters
      .map((c) => {
        const o = player?.characters[c.id];
        return `<button class="character-tile ${o ? "" : "unowned"}" data-action="character-${c.id}" aria-label="${c.name} ${o ? "所持" : "未取得"}"><span class="owned-badge">${o ? (player.profileIconCharacterId === c.id ? "PROFILE" : "OWNED") : "未取得"}</span><img src="${c.image}" alt="" loading="lazy"><div class="tile-caption"><h3>${c.name}</h3><small>${o ? `LV.${1 + Math.floor(o.exp / 60)} · ` : ""}${c.job}</small></div></button>`;
      })
      .join("")}</div>`
  );
}
function characterDetail(id) {
  if (!isAvailableCharacter(id)) return;
  const c = char(id),
    o = player?.characters[id];
  modal(
    c.name,
    `<div class="character-detail"><div><img class="character-art ${o ? "" : "unowned-art"}" src="${c.image}" alt="${c.name}"><p>${c.job}</p><p>誕生日：${c.birthday.replace("-", "月")}日</p></div><div><span class="eyebrow">CHARACTER AFFINITY</span>${radar(c.senseAffinity, "キャラクター固有適性")}<p class="small muted">得意な第六感：${config.labels[c.primarySense]}</p>${o ? `<p>LV.${1 + Math.floor(o.exp / 60)} · EXP ${o.exp % 60}/60<br>育成の欠片 ${o.shards}個</p><div class="actions">${button("プロフィールに設定", `icon-${id}`)}${button("欠片10個で育成", `awaken-${id}`, "secondary", o.shards < 10 ? "disabled" : "")}</div>` : '<p class="muted">共鳴召喚で仲間になります。</p>'}</div></div>`,
    "SUBJECT FILE",
  );
}
function battlePage() {
  if (
    player &&
    (!player.characters[battleCharacter] ||
      !isAvailableCharacter(battleCharacter))
  )
    battleCharacter = player.profileIconCharacterId;
  const c = char(battleCharacter);
  return (
    intro(
      "ABILITY VERIFICATION",
      "能力実証試験",
      "育てた第六感を、小さな戦闘補正へ。1日5回のオートバトル。",
    ) +
    `<section class="panel"><div class="section-heading"><h2>実験に参加するキャラクター</h2><small>残り ${player?.battleRemaining ?? "—"} / 5 回</small></div><div class="battle-pick">${characters
      .filter((c) => player?.characters[c.id])
      .map(
        (c) =>
          `<button data-action="battle-pick-${c.id}" class="${c.id === battleCharacter ? "active" : ""}"><img src="${c.face}" alt="">${c.name}</button>`,
      )
      .join(
        "",
      )}</div><div class="battle-stage"><div class="combatant"><img src="${c.image}" alt="${c.name}"><h3>${c.name}</h3><small class="muted">${config.labels[c.primarySense]} 適性 ${c.senseAffinity[c.primarySense]}</small></div><div class="vs">VS</div><div class="combatant enemy"><img src="${monsters[0].image}" alt="実験対象のモンスター"><h3>観測領域のモンスター</h3><small class="muted">3種の対象から選出</small></div></div><p class="small muted">完了：${config.battle.completionRC} RC / 勝利：${config.battle.winEXP} EXP / 敗北：${config.battle.loseEXP} EXP。開始時に回数を消費します。</p>${button(player?.pendingBattle ? "進行中の戦闘へ戻る" : "戦闘実験を開始　→", "battle-start")}</section><div class="future-strip"><span>WEEKEND RAID <small>週末共同レイド</small></span>${button("開発中", "coming", "secondary", 'aria-disabled="true"')}</div>`
  );
}
async function runBattle() {
  const data = await mutate("/api/battle/start", {
      characterId: battleCharacter,
    }),
    b = data.result,
    r = b.result,
    c = char(r.characterId),
    m = monsters.find((m) => m.id === r.enemyId);
  modal(
    "能力実証試験",
    `<div class="battle-stage"><div class="combatant"><img src="${c.image}" alt="${c.name}"><h3>${c.name}</h3><div class="hp-track"><div id="hero-hp" class="hp-fill"></div></div><small id="hero-value">${r.maxHp} / ${r.maxHp} HP</small></div><div class="vs">VS</div><div class="combatant enemy"><img src="${m.image}" alt="${m.name}"><h3>${m.name}</h3><div class="hp-track"><div id="enemy-hp" class="hp-fill"></div></div><small id="enemy-value">${r.enemyMaxHp} / ${r.enemyMaxHp} HP</small></div></div><div id="battle-log" class="battle-log" role="log" aria-live="polite"></div><div id="battle-finish" class="actions"></div>`,
    "BATTLE EXPERIMENT",
  );
  let i = 0;
  const interval = setInterval(
    () => {
      const t = r.turns[i++];
      if (t) {
        document.querySelector("#hero-hp").style.width =
          `${(t.hp / r.maxHp) * 100}%`;
        document.querySelector("#enemy-hp").style.width =
          `${(t.enemyHp / r.enemyMaxHp) * 100}%`;
        document.querySelector("#hero-value").textContent =
          `${t.hp} / ${r.maxHp} HP`;
        document.querySelector("#enemy-value").textContent =
          `${t.enemyHp} / ${r.enemyMaxHp} HP`;
        const log = document.querySelector("#battle-log");
        log.insertAdjacentHTML(
          "beforeend",
          `<p>${t.who === "hero" ? c.name : m.name}：${t.evade ? "回避！" : `${t.damage} ダメージ${t.crit ? "・クリティカル" : ""}`}</p>`,
        );
        log.scrollTop = log.scrollHeight;
      }
      if (i >= r.turns.length) {
        clearInterval(interval);
        document.querySelector("#battle-finish").innerHTML =
          `<div class="result-banner"><h3>${r.win ? "実証成功" : "実験終了"}</h3><p>${r.rc} RC / ${r.exp} EXP</p>${button("結果を保存する", `battle-finish-${b.id}`)}</div>`;
      }
    },
    matchMedia("(prefers-reduced-motion: reduce)").matches ? 100 : 420,
  );
  setCleanup(() => clearInterval(interval));
}
function xpTrend(history) {
  return (
    "<h3>直近30試験の獲得XP</h3>" +
    (history.length
      ? `<div class="trend" role="img" aria-label="直近30試験の獲得XP">${history
          .slice(-30)
          .map((h) => {
            const xp = Object.values(h.xp || {}).reduce((a, b) => a + b, 0);
            return `<div class="bar" style="height:${Math.min(100, xp * 3)}%" title="${escape(h.dateJst)}: ${xp} XP"></div>`;
          })
          .join("")}</div>`
      : '<p class="muted small">Daily試験を受けると、ここに記録が蓄積されます。</p>')
  );
}
function analyzePage() {
  const history = player?.history || [],
    training = local.get("training", []).filter((r) => r.testId !== "pattern"),
    cards = history.filter((h) => h.testId === "card"),
    hits = cards.filter((h) => h.correct).length,
    particles = history.filter((h) => h.testId === "particle");
  return (
    intro(
      "ANALYZE",
      "被験結果解析",
      "研究値、実際の成績、自己申告のプロフィールを、それぞれの記録として読む。",
    ) +
    `<div class="two-columns"><section class="panel"><span class="eyebrow">OBSERVED PROFILE</span><h2>ゲーム内研究値</h2>${player ? radar(player.senseStats) + observedPanel(player) : "<p>記録は接続後に表示されます。</p>"}</section><section class="panel"><span class="eyebrow">DAILY RECORD</span><h2>Dailyの測定成績</h2><table class="data-table"><thead><tr><th>試験</th><th>試行数</th><th>実測結果</th></tr></thead><tbody><tr><td>★カード</td><td>${cards.length}</td><td>${cards.length ? ((hits / cards.length) * 100).toFixed(1) + "% 的中" : "—"}</td></tr><tr><td>粒子観測</td><td>${particles.length}</td><td>${particles.length ? (particles.reduce((s, h) => s + h.found, 0) / particles.length).toFixed(1) + " / 16 発見" : "—"}</td></tr></tbody></table><p class="small muted">★カードの理論的中率は20%。少ない試行数では大きく変動します。</p>${xpTrend(history)}<h3>訓練の記録</h3><p class="small muted">直近保存 ${training.length} 回。訓練はDaily成績・研究値へ加算しません。</p><div class="actions">${button("過去の記録を見る", "archive", "secondary")}${button("トレーニングへ", "training", "text-button")}</div></section></div>` +
    namePanel() +
    profilePanels(player)
  );
}
function renderAstrology() {
  try {
    renderBirthProfile();
  } catch (error) {
    const target = document.querySelector("#astrology-result");
    if (target) target.textContent = error.message;
  }
}
function archivePage() {
  const daily = (player?.history || []).map((r) => ({ ...r, mode: "Daily" })),
    training = local.get("training", []).map((r) => ({ ...r, mode: "訓練" }));
  const records = [...daily, ...training]
    .filter((r) => r.testId !== "pattern")
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    .slice(0, 90);
  return (
    intro(
      "OBSERVATION LOG",
      "観測記録",
      "Dailyと訓練の記録。終了した試行は、その場でここへ反映されます。",
    ) +
    (records.length
      ? `<div class="record-list">${records
          .map((r) => {
            const name = labs.find((l) => l.id === r.testId)?.name || "観測";
            const summary =
              r.testId === "card"
                ? r.correct
                  ? "★を発見"
                  : "今回は不的中"
                : r.testId === "particle"
                  ? `${r.found ?? r.score / 10} / 16 発見`
                  : `${r.correct ?? r.score} / 5 正解`;
            const date = new Intl.DateTimeFormat("ja-JP", {
              timeZone: config.timezone,
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(Date.parse(r.finishedAt));
            return `<section class="record-row"><div><span class="history-mode">${r.mode}</span><small> · ${date} JST · v${r.testVersion}</small><br><b>${name}</b><p class="small muted">${summary}</p></div><div>${r.mode === "Daily" ? `<small>${Object.values(r.xp || {}).reduce((a, b) => a + b, 0)} XP / +${r.rc} RC</small>` : '<small class="muted">恒久XP・RCへの反映なし</small>'}${r.testId === "particle" && r.seed !== undefined ? button("再生", `replay-record-${r.attemptId || r.id}`, "text-button") : ""}</div></section>`;
          })
          .join("")}</div>`
      : '<div class="empty-state"><h2>まだ観測記録がありません。</h2><p class="muted">最初の試験から始めましょう。</p></div>') +
    predictionArchive()
  );
}
function predictionArchive() {
  const saved = (predictionData?.items || []).filter((item) => item.selection);
  if (!predictionData)
    return `<section class="panel prediction-log"><div><span class="eyebrow">FIELD TEST LOG</span><h2>現実予測の記録</h2><p class="muted">接続すると記録を確認できます。</p></div>${button("再接続", "reconnect", "secondary")}</section>`;
  return `<section class="panel prediction-log"><div><span class="eyebrow">FIELD TEST LOG</span><h2>現実予測の記録</h2>${
    saved.length
      ? `<div class="prediction-log-list">${saved
          .map((item) => {
            const choice = item.choices.find(
              (candidate) => candidate.id === item.selection.optionId,
            );
            return `<p><span>${escape(item.categoryLabel)}</span><b>${escape(choice?.label || "記録あり")}</b><small>${escape(item.question)}</small></p>`;
          })
          .join("")}</div>`
      : '<p class="muted">記録はまだありません。</p>'
  }</div>${button("現実予測へ　→", "prediction", "secondary")}</section>`;
}
async function mutate(path, body) {
  if (!online) throw new Error("保存サーバーへの再接続が必要です。");
  const data = await api(path, body);
  if (data.player) player = data.player;
  if (data.predictions) setPredictionData(data.predictions);
  render();
  return data;
}
function settings() {
  modal(
    "設定・この計画について",
    `<p>第六感強化計画-PROJECT SIXTH-</p><label class="toggle-row">文字を大きくする<input id="large-text" type="checkbox" ${local.get("large-text", false) ? "checked" : ""}></label><label class="toggle-row">高コントラスト<input id="contrast" type="checkbox" ${local.get("contrast", false) ? "checked" : ""}></label><p class="small muted" style="margin-top:20px">本作は娯楽を目的としたゲームです。第六感・占術・直感に関する表示は科学的・医学的能力を保証するものではありません。</p><p class="small muted">匿名セッションで進行を保存します。ブラウザのCookieを削除すると、この端末から記録にアクセスできなくなります。複数端末への引き継ぎは未対応です。</p><div class="actions">${button("プレイ記録を保存", "export", "secondary")}${button("はじめての方へ", "welcome", "text-button")}</div>`,
  );
}
function namePanel() {
  return `<section class="panel profile-section"><span class="eyebrow">SUBJECT NAME</span><h2>研究に残す名前</h2><label class="form-field">被験者名（任意・24文字まで）<input id="subject-name" maxlength="24" value="${escape(player?.displayName || "")}" placeholder="好きな名前で参加できます"></label><p class="small muted">共有画像にもこの名前を表示します。</p><button class="secondary" data-action="name-save">名前を保存</button></section>`;
}
function starterPrompt() {
  return (
    '<section class="panel starter-prompt"><div><h2>最初の仲間を選ぼう。</h2><p>6人の中から、同行する1人を選べます。</p></div>' +
    button("仲間を選ぶ", "welcome") +
    "</section>"
  );
}
function welcome() {
  modal(
    "第六感強化計画へようこそ。",
    `<p>最初の仲間を1人選んでください。</p><div class="starter-grid">${starterIds
      .map((id) => {
        const c = char(id);
        return `<button data-action="starter-${id}" class="starter-choice" ${player?.starterChosen ? "disabled" : ""}><img src="${c.face}" alt=""><b>${c.name}</b><small>${c.job}</small></button>`;
      })
      .join(
        "",
      )}</div><p class="small muted">名前と星のプロフィールは、被験結果解析で登録できます。</p><div class="actions">${button("研究所ロビーへ", "close", "secondary")}</div>`,
    "SUBJECT REGISTRATION",
  );
  local.set("welcomed", true);
}
async function action(name) {
  const predictionVote = name.match(
    /^prediction-vote-(PRED-\d{8}-\d{3})-v(\d+)-([A-D])$/,
  );
  if (predictionVote) {
    const item = predictionData?.items.find(
      (candidate) =>
        candidate.id === predictionVote[1] &&
        candidate.version === Number(predictionVote[2]),
    );
    if (!item) throw new Error("予測問題を確認できませんでした。");
    await mutate(`/api/predictions/${item.id}/vote`, {
      version: item.version,
      optionId: predictionVote[3],
    });
    toast("予測を記録しました。");
    return;
  }
  if (name === "name-save") {
    await mutate("/api/profile/name", {
      name: document.querySelector("#subject-name").value,
    });
    toast("被験者名を保存しました。");
    return;
  }
  if (name === "profile-apply") {
    const p = savedProfile();
    if (!p) throw Error("生年月日を入力してください。");
    await mutate("/api/profile/baseline", { features: p.features });
    toast("初期値へ反映しました。");
    return;
  }
  if (name === "profile-reset") {
    await mutate("/api/profile/baseline", { features: null });
    return;
  }
  if (name.startsWith("starter-")) {
    const id = Number(name.slice(8));
    await mutate("/api/character/starter", { characterId: id });
    battleCharacter = id;
    closeModal();
    toast(char(id).name + "が仲間になりました。");
    return;
  }

  if (name.startsWith("replay-record-")) {
    const id = name.slice(14);
    const h = [...(player?.history || []), ...local.get("training", [])].find(
      (r) => (r.attemptId || r.id) === id,
    );
    if (h) replayParticles(h.seed, h);
    return;
  }
  if (name === "mbti-save") {
    const value = document.querySelector("#mbti-type").value;
    if (value && !mbtiNotes[value]) throw Error("タイプを確認してください。");
    local.set("mbti", value || null);
    renderMbti();
    renderAstrology();
    return;
  }
  if (name === "mbti-clear") {
    local.set("mbti", null);
    document.querySelector("#mbti-type").value = "";
    renderMbti();
    return;
  }
  if (navs.some((n) => n[0] === name)) {
    location.hash = name;
    return;
  }
  if (name === "close") {
    closeModal();
    return;
  }
  if (name === "coming") {
    modal(
      "開発中",
      '<p class="muted">今後のアップデートで解放予定です。</p>' +
        button("閉じる", "close", "secondary"),
    );
    return;
  }
  if (name === "settings") {
    settings();
    return;
  }
  if (name === "welcome") {
    welcome();
    return;
  }
  if (name === "reconnect") {
    await connect();
    return;
  }
  if (name.startsWith("training-") || name.startsWith("daily-")) {
    const [mode, test] = name.split("-");
    if (mode === "daily" && player?.dailyStatus[test] === "complete") {
      const r = player.history.findLast(
        (h) => h.testId === test && h.dateJst === dayKey(serverNow()),
      );
      modal(
        "本日の試験は完了しました。",
        `<p>${labs.find((l) => l.id === test).name}</p><p class="mint">獲得 ${Object.values(r?.xp || {}).reduce((a, b) => a + b, 0)} XP / ${r?.rc ?? config.economy.dailyTestRC[test]} RC</p><p class="muted">次回は04:00 JSTから受験できます。</p>${button("訓練モードで遊ぶ", `training-${test}`)}`,
      );
      return;
    }
    await launchTest(test, mode === "daily", mutate);
    return;
  }
  if (name.startsWith("character-")) {
    characterDetail(Number(name.split("-")[1]));
    return;
  }
  if (name.startsWith("icon-")) {
    await mutate("/api/character/icon", {
      characterId: Number(name.split("-")[1]),
    });
    closeModal();
    toast("プロフィールを更新しました。");
    return;
  }
  if (name.startsWith("awaken-")) {
    const id = Number(name.split("-")[1]);
    await mutate("/api/character/awaken", { characterId: id });
    characterDetail(id);
    toast("キャラクターに30 EXPを付与しました。");
    return;
  }
  if (name.startsWith("draw-")) {
    const count = Number(name.split("-")[1]);
    modal(
      "共鳴召喚",
      `<p>${count === 10 ? "900" : "100"} RCを使い、${count}回召喚します。</p><p class="small muted">全${characters.length}名から均等に抽選。重複は欠片10個になります。</p>${button("召喚する", `summon-${count}`)}`,
    );
    return;
  }
  if (name.startsWith("summon-")) {
    const data = await mutate("/api/gacha/draw", {
      count: Number(name.split("-")[1]),
    });
    modal(
      "共鳴が応答しました。",
      `<div class="draw-results">${data.result.draws
        .map((d) => {
          const c = char(d.characterId);
          return `<div class="draw-result"><img src="${c.face}" alt=""><b>${c.name}</b><small>${d.duplicate ? "欠片 +10" : "NEW CHARACTER"}</small></div>`;
        })
        .join("")}</div>${button("閉じる", "close", "secondary")}`,
      "RESONANCE SUMMON",
    );
    return;
  }
  if (name.startsWith("battle-pick-")) {
    battleCharacter = Number(name.split("-").at(-1));
    render();
    return;
  }
  if (name === "battle-start") {
    await runBattle();
    return;
  }
  if (name.startsWith("battle-finish-")) {
    const data = await mutate("/api/battle/finish", {
      battleId: name.slice(14),
    });
    closeModal();
    toast(
      `戦闘記録を保存しました。${data.result.result.rc} RC / ${data.result.result.exp} EXP`,
    );
    return;
  }
  if (name === "astrology") {
    const value = document.querySelector("#birth-date").value;
    astrology(value);
    const birthTime = document.querySelector("#birth-time").value;
    const offset = Number(document.querySelector("#birth-offset").value);
    planetaryProfile(value, birthTime, offset);
    if (!local.set("birth", value))
      throw new Error(
        "端末への保存ができません。ブラウザ設定を確認してください。",
      );
    local.set("birth-time", birthTime);
    local.set("birth-offset", offset);
    local.set("mbti", document.querySelector("#mbti-type").value || null);
    renderMbti();
    renderAstrology();
    return;
  }
  if (name === "birth-clear") {
    local.set("birth", null);
    local.set("birth-time", null);
    local.set("birth-offset", null);
    render();
    toast("この端末の出生情報を削除しました。");
    return;
  }
  if (name.startsWith("replay-")) {
    const h = player.history.find((h) => h.attemptId === name.slice(7));
    replayParticles(h.seed, h);
    return;
  }
  if (name === "export") {
    if (!player) throw new Error("保存する記録がありません。");
    const predictionRecords = (predictionData?.items || [])
      .filter((item) => item.selection)
      .map((item) => ({
        predictionId: item.id,
        version: item.version,
        question: item.question,
        choice: item.choices.find(
          (choice) => choice.id === item.selection.optionId,
        )?.label,
        selectedAt: item.selection.selectedAt,
        updatedAt: item.selection.updatedAt,
        state: item.state,
        result: item.result?.label || null,
        correct: item.correct,
      }));
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 2,
            exportedAt: new Date(serverNow()).toISOString(),
            player,
            predictionRecords,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `project-sixth-record-${dayKey(serverNow())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("閲覧用の記録を保存しました。進行の復元用ではありません。");
  }
}
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target || target.disabled) return;
  e.preventDefault();
  if (busy) return;
  busy = true;
  target.setAttribute("aria-busy", "true");
  try {
    await action(target.dataset.action);
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
    if (target.isConnected) target.removeAttribute("aria-busy");
  }
});
document.querySelector("#dialog-close").addEventListener("click", closeModal);
document.querySelector("#dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
document.addEventListener("change", (e) => {
  if (e.target.id === "large-text") {
    local.set("large-text", e.target.checked);
    applySettings();
  }
  if (e.target.id === "contrast") {
    local.set("contrast", e.target.checked);
    applySettings();
  }
});
window.addEventListener("hashchange", () => {
  route = location.hash.slice(1) || "home";
  closeModal();
  render();
  window.scrollTo(0, 0);
});
function applySettings() {
  document.documentElement.classList.toggle(
    "large-text",
    local.get("large-text", false),
  );
  document.documentElement.classList.toggle(
    "high-contrast",
    local.get("contrast", false),
  );
}
function revealAccessBonus() {
  if (!pendingAccessBonus) return;
  const dialog = document.querySelector("#dialog");
  if (dialog.open) {
    dialog.addEventListener("close", revealAccessBonus, { once: true });
    return;
  }
  const bonus = pendingAccessBonus;
  pendingAccessBonus = null;
  setTimeout(
    () => showAccessBonus(bonus.amount),
    Math.max(0, (bonus.showAfter ?? 0) - performance.now()),
  );
}
async function connect() {
  try {
    const data = await api("/api/bootstrap");
    player = data.player;
    observedDay = data.dateJst;
    if (data.accessBonus?.awarded) {
      pendingAccessBonus = {
        ...data.accessBonus,
        showAfter: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : terminalEntryDurationMs,
      };
      if (accessBonusUiReady) revealAccessBonus();
    }
    online = true;
  } catch {
    online = false;
    setPredictionData(null);
    render();
    return;
  }
  try {
    const feed = await api("/api/predictions");
    setPredictionData(feed.predictions);
  } catch {
    setPredictionData(null);
  }
  render();
}
function setPredictionData(data) {
  predictionData = data;
  clearTimeout(predictionRefreshTimer);
  predictionRefreshTimer = null;
  if (!data?.nextChangeAt) return;
  const delay = Math.max(
    1000,
    Math.min(2147483000, Date.parse(data.nextChangeAt) - serverNow() + 500),
  );
  predictionRefreshTimer = setTimeout(refreshPredictionBoundary, delay);
}
async function refreshPredictionBoundary() {
  if (!online) return;
  if (busy) {
    predictionRefreshTimer = setTimeout(refreshPredictionBoundary, 1000);
    return;
  }
  try {
    const feed = await api("/api/predictions");
    setPredictionData(feed.predictions);
    if (route === "prediction" || route === "archive") render();
  } catch {
    predictionRefreshTimer = setTimeout(refreshPredictionBoundary, 30000);
  }
}
applySettings();
route = location.hash.slice(1) || "home";
await connect();
if (online && !local.get("welcomed", false)) welcome();
accessBonusUiReady = true;
revealAccessBonus();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !document.querySelector("#dialog").open && !busy)
    void connect();
});
setInterval(() => {
  if (
    online &&
    observedDay !== dayKey(serverNow()) &&
    !busy &&
    !document.querySelector("#dialog").open
  )
    void connect();
}, 30000);

document.addEventListener("sixth:training-saved", () => render());
