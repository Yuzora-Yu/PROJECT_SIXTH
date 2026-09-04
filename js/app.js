import { config } from "../shared/config.js";
import { dateLabel, astrology, dayKey } from "../shared/core.js";
import { characters, monsters } from "../data/prisma/catalog.js";
import { api, local, serverNow } from "./api.js";
import {
  radar,
  button,
  escape,
  modal,
  closeModal,
  toast,
  setCleanup,
} from "./ui.js";
import { launchTest, replayParticles } from "./trials.js";
let player = null,
  online = false,
  route = "home",
  busy = false,
  battleCharacter = 101;
let observedDay = null;
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
    time: "60秒",
  },
  {
    id: "pattern",
    icon: "⌘",
    name: "潜在法則予測試験",
    sub: "HIDDEN PATTERN",
    desc: "流れる記号に潜む法則。次に現れるものを予測する。",
    sense: "予見・洞察",
    time: "5問",
  },
];
const navs = [
  ["home", "⌂", "ホーム", "HOME"],
  ["daily", "◈", "デイリーテスト", "DAILY TEST"],
  ["training", "⠿", "トレーニング", "TRAINING"],
  ["prediction", "◷", "現実予測", "PREDICTION"],
  ["battle", "⚔", "戦闘実験", "BATTLE"],
  ["characters", "♙", "キャラクター", "CHARACTER"],
  ["analyze", "⌁", "被験結果解析", "ANALYZE"],
  ["archive", "▦", "観測記録", "ARCHIVE"],
];
const char = (id) =>
  characters.find((c) => c.id === Number(id)) || characters[0];
const ownedCount = () => Object.keys(player?.characters || {}).length;
function intro(eyebrow, title, desc) {
  return `<div class="screen-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${desc}</p></div>`;
}
function renderNav() {
  document.querySelector("#navigation").innerHTML = navs
    .map(
      ([id, symbol, label]) =>
        `<a href="#${id}" ${id === "prediction" ? 'data-action="coming" aria-disabled="true"' : ""} class="nav-link ${route === id ? "active" : ""} ${["prediction", "characters", "archive"].includes(id) ? "mobile-hide" : ""} ${id === "prediction" ? "locked" : ""}" ${route === id ? 'aria-current="page"' : ""}><span class="nav-symbol" aria-hidden="true">${symbol}</span><span>${label}</span>${id === "prediction" ? '<span class="lock-label">開発中</span>' : ""}</a>`,
    )
    .join("");
}
function render() {
  renderNav();
  document.querySelector("#breadcrumb").textContent =
    navs.find((n) => n[0] === route)?.[3] || "HOME";
  document.querySelector("#account").innerHTML = player
    ? `<span class="coin">◉ ${player.rc.toLocaleString()} <small>RC</small></span><button data-action="characters" aria-label="キャラクターを表示"><img src="${char(player.profileIconCharacterId).face}" alt=""><span class="subject-id">SUBJECT ${player.id.slice(0, 4).toUpperCase()}</span></button>`
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
  if (route === "analyze") renderAstrology();
}
function home() {
  const completed = Object.values(player?.dailyStatus || {}).filter(
      (x) => x === "complete",
    ).length,
    c = char(player?.profileIconCharacterId),
    stats = player?.senseStats;
  return `<div class="page-intro"><div><span class="eyebrow">OBSERVATION LOBBY</span><h1>ようこそ、被験者。</h1><p>今日の「なんとなく」を、観測しよう。</p></div><div class="date-chip">${dateLabel(serverNow())}</div></div>
  <div class="dashboard-grid"><div class="left-column"><section class="panel hero"><div class="signal-orbit" aria-hidden="true"><div class="signal-cross"></div><span>Ⅵ</span></div><span class="eyebrow">DAILY EXPERIMENT / ${String(completed).padStart(2, "0")} OF 03</span><h2>その直感に、<br>まだ知らない可能性。</h2><p>3つの実験で、第六感を記録する。<br>本日の観測を開始します。</p>${button(completed === 3 ? "本日の結果を見る　↗" : "今日のテストへ　→", completed === 3 ? "analyze" : "daily")}</section>
  <div class="section-heading"><h2>本日の実験</h2><small>${completed} / 3 完了</small></div><div class="test-grid">${labs.map((l, i) => `<button class="test-card" data-action="daily-${l.id}"><span class="number">0${i + 1}</span><span class="test-icon" aria-hidden="true">${l.icon}</span><h3>${["★カード感応", "粒子総合観測", "潜在法則予測"][i]}</h3><p>${l.time} · ${l.id === "particle" ? "4つの第六感" : l.sense}</p><div class="test-bottom"><span class="status ${player?.dailyStatus[l.id] === "complete" ? "done" : ""}">${player?.dailyStatus[l.id] === "complete" ? "本日完了" : "未実施"}</span><span class="card-arrow">↗</span></div></button>`).join("")}</div>
  <div class="wide-links"><button class="feature-link" data-action="training"><span class="feature-icon">⠿</span><span><h3>トレーニング</h3><p>気が済むまで、観測しよう。</p></span><span class="arrow">↗</span></button><button class="feature-link" data-action="battle"><span class="feature-icon">⚔</span><span><h3>戦闘実験</h3><p>本日 残り ${player?.battleRemaining ?? "—"} / 5 回</p></span><span class="arrow">↗</span></button></div></div>
  <div class="right-column"><section class="panel chart-panel"><div class="chart-heading"><h2>第六感プロファイル</h2><small>SUBJECT DATA</small></div>${stats ? radar(stats) : '<p class="muted">研究値は接続後に表示されます。</p>'}<div class="stat-strip">${config.senses.map((k) => `<span>${config.labels[k]}<b>${stats?.[k] ?? "—"}</b></span>`).join("")}</div><div class="condition"><span><span class="live-dot"></span>本日のコンディション</span><b>+${Math.round(player?.condition || 0)}</b></div>${button("被験結果を解析する　↗", "analyze", "text-button")}</section>
  <section class="panel character-panel"><img src="${c.image}" alt="${c.name}"><div class="character-copy"><span class="eyebrow">YOUR PARTNER</span><h2>${c.name}</h2><p>${c.job} / LV.${1 + Math.floor((player?.characters[c.id]?.exp || 0) / 60)}<br>得意な第六感：${config.labels[c.primarySense]}</p>${button("キャラクターへ　↗", "characters", "secondary")}</div></section></div></div>
  <div class="future-strip"><span>◷　REAL PREDICTION <small>現実世界で、直感を試す。</small></span>${button("開発中", "coming", "secondary", 'aria-disabled="true"')}</div>`;
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
        return `<section class="panel lab-row"><span class="test-icon" aria-hidden="true">${l.icon}</span><div><span class="eyebrow">LAB 0${i + 1} / ${l.sub}</span><h2>${l.name}</h2><p>${l.desc}</p><div class="lab-meta"><span>${l.time}</span><span>${l.sense}</span><span>${training ? `記録 ${records.length} 回` : done ? "✓ 本日完了" : "+10 RC"}</span></div>${training && records.length ? `<small class="muted">自己ベスト ${Math.max(local.get(`training-best:v${version}`, {})[l.id] || 0, ...records.map((r) => r.score ?? Number(r.correct)))} / 直近平均 ${(records.reduce((s, r) => s + (r.score ?? Number(r.correct)), 0) / records.length).toFixed(1)}</small>` : ""}</div>${button(training ? "訓練を始める　→" : done ? "結果を見る" : "試験を始める　→", `${training ? "training" : "daily"}-${l.id}`, done ? "secondary" : "primary")}</section>`;
      })
      .join("")}</div>`
  );
}
function future() {
  return (
    intro(
      "FIELD TEST",
      "現実予測",
      "現実世界の未確定な出来事を使った実地試験。",
    ) +
    `<section class="empty-state"><span class="symbol">◷</span><h2>開発中</h2><p class="muted">今後のアップデートで解放予定です。</p>${button("研究所ロビーへ", "home", "secondary")}</section>`
  );
}
function charactersPage() {
  return (
    intro(
      "SUBJECT FILE",
      "共鳴する、仲間たち。",
      `キャラクターごとに異なる第六感の適性。収集 ${ownedCount()} / ${characters.length}`,
    ) +
    `<section class="panel summon-bar"><div><h2>共鳴召喚</h2><p>全12名・各1/12（約8.33%）。重複は欠片10個に変換。<br>RCはプレイで獲得する無料・換金不能の通貨です。</p></div><div class="actions">${button("1回 · 100 RC", "draw-1")}${button("10連 · 900 RC", "draw-10", "secondary")}</div></section><div class="character-grid">${characters
      .map((c) => {
        const o = player?.characters[c.id];
        return `<button class="character-tile ${o ? "" : "unowned"}" data-action="character-${c.id}" aria-label="${c.name} ${o ? "所持" : "未取得"}"><span class="owned-badge">${o ? (player.profileIconCharacterId === c.id ? "PROFILE" : "OWNED") : "未取得"}</span><img src="${c.image}" alt="" loading="lazy"><div class="tile-caption"><h3>${c.name}</h3><small>${o ? `LV.${1 + Math.floor(o.exp / 60)} · ` : ""}${c.job}</small></div></button>`;
      })
      .join("")}</div>`
  );
}
function characterDetail(id) {
  const c = char(id),
    o = player?.characters[id];
  modal(
    c.name,
    `<div class="character-detail"><div><img class="character-art" src="${c.image}" alt="${c.name}"><p class="muted">${c.job} · 得意な第六感：${config.labels[c.primarySense]}</p></div><div><span class="eyebrow">CHARACTER AFFINITY</span>${radar(c.senseAffinity, "キャラクター固有適性")}<p class="small muted">キャラクター固有の適性です。被験者本人の研究値とは別に保持されます。</p>${o ? `<p>LV.${1 + Math.floor(o.exp / 60)}　EXP ${o.exp % 60} / 60<br>育成の欠片 ${o.shards} 個</p><div class="actions">${button("プロフィールに設定", `icon-${id}`)}${button("欠片10個で育成", `awaken-${id}`, "secondary", o.shards < 10 ? "disabled" : "")}</div>` : '<p class="muted">このキャラクターはまだ取得していません。</p>'}</div></div>`,
    "SUBJECT FILE",
  );
}
function battlePage() {
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
      )}</div><div class="battle-stage"><div class="combatant"><img src="${c.image}" alt="${c.name}"><h3>${c.name}</h3><small class="muted">${config.labels[c.primarySense]} 適性 ${c.senseAffinity[c.primarySense]}</small></div><div class="vs">VS</div><div class="combatant enemy"><img src="${monsters[0].image}" alt="実験対象のモンスター"><h3>観測領域のモンスター</h3><small class="muted">3種の対象から選出</small></div></div><p class="small muted">勝利：10 RC・20 EXP / 敗北：5 EXP。開始時に回数を消費します。</p>${button(player?.pendingBattle ? "進行中の戦闘へ戻る" : "戦闘実験を開始　→", "battle-start")}</section><div class="future-strip"><span>WEEKEND RAID <small>週末共同レイド</small></span>${button("開発中", "coming", "secondary", 'aria-disabled="true"')}</div>`
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
function analyzePage() {
  const history = player?.history || [],
    cards = history.filter((h) => h.testId === "card"),
    hits = cards.filter((h) => h.correct).length,
    particles = history.filter((h) => h.testId === "particle"),
    patterns = history.filter((h) => h.testId === "pattern");
  return (
    intro(
      "ANALYZE",
      "被験結果解析",
      "成長した研究値と、実際のプレイ成績を見比べる。",
    ) +
    `<div class="two-columns"><section class="panel"><span class="eyebrow">OBSERVED PROFILE</span><h2>ゲーム内研究値</h2>${player ? radar(player.senseStats) : "<p>記録は接続後に表示されます。</p>"}<p class="small muted">参加と成功で育つ研究値です。実際の能力を示す偏差値ではありません。</p></section><section class="panel"><span class="eyebrow">PLAY RECORD</span><h2>測定成績</h2><table class="data-table"><thead><tr><th>試験</th><th>試行数</th><th>実測結果</th></tr></thead><tbody><tr><td>★カード</td><td>${cards.length}</td><td>${cards.length ? ((hits / cards.length) * 100).toFixed(1) + "% 的中" : "—"}</td></tr><tr><td>粒子観測</td><td>${particles.length}</td><td>${particles.length ? (particles.reduce((s, h) => s + h.found, 0) / particles.length).toFixed(1) + " / 16 発見" : "—"}</td></tr><tr><td>潜在法則</td><td>${patterns.length}</td><td>${patterns.length ? (patterns.reduce((s, h) => s + h.correct, 0) / patterns.length).toFixed(1) + " / 5 正解" : "—"}</td></tr></tbody></table><p class="small muted">★カードの理論的中率は20%。少ない試行数では大きく変動します。</p><h3>直近30試験の獲得XP</h3>${
      history.length
        ? `<div class="trend" role="img" aria-label="直近30試験の獲得XP">${history
            .slice(-30)
            .map(
              (h) =>
                `<div class="bar" style="height:${Math.min(100, Object.values(h.xp).reduce((a, b) => a + b, 0) * 3)}%" title="${h.dateJst}: ${Object.values(h.xp).reduce((a, b) => a + b, 0)} XP"></div>`,
            )
            .join("")}</div>`
        : '<p class="muted small">試験を受けると、ここに記録が蓄積されます。</p>'
    }</section></div><section class="panel" style="margin-top:22px"><span class="eyebrow">ENTERTAINMENT PROFILE</span><h2>星と数字のプロフィール</h2><p class="small muted">星座・数秘を基にした娯楽用のルール表です。出生情報はこの端末だけに保存し、サーバーへ送信しません。</p><div class="two-columns"><div><label class="form-field">生年月日（任意）<input type="date" id="birth-date" value="${escape(local.get("birth", ""))}" max="${new Date(serverNow() + 9 * 3600000).toISOString().slice(0, 10)}"></label><div class="actions">${button("プロフィールを見る", "astrology")}${button("出生情報を削除", "birth-clear", "text-button")}</div></div><div id="astrology-result"></div></div></section>`
  );
}
function renderAstrology() {
  const birth = local.get("birth");
  if (!birth) return;
  try {
    const a = astrology(birth);
    document.querySelector("#astrology-result").innerHTML =
      `<h3>${a.zodiac} / 数秘 ${a.life}</h3>${radar(a.stats, "娯楽用占術プロフィール")}<p class="small muted">占術の値は研究値や戦闘へ反映されません。</p>`;
  } catch {}
}
function archivePage() {
  const h = player?.history || [];
  return (
    intro(
      "OBSERVATION LOG",
      "観測記録",
      "これまでに完了したDailyの記録。粒子試験は答え合わせを再生できます。",
    ) +
    (h.length
      ? `<div class="record-list">${[...h]
          .reverse()
          .map(
            (r) =>
              `<div class="record-row"><div><small>${r.dateJst} · v${r.testVersion}</small><br><b>${labs.find((l) => l.id === r.testId)?.name}</b></div><div><small>${Object.values(r.xp).reduce((a, b) => a + b, 0)} XP / +${r.rc} RC</small>${r.testId === "particle" ? button("再生", `replay-${r.attemptId}`, "text-button") : ""}</div></div>`,
          )
          .join("")}</div>`
      : '<div class="empty-state"><h2>まだ観測記録がありません。</h2><p class="muted">最初のDailyから始めましょう。</p></div>') +
    `<div class="future-strip"><span>予測記録カレンダー</span>${button("開発中", "coming", "secondary", 'aria-disabled="true"')}</div>`
  );
}
async function mutate(path, body) {
  if (!online) throw new Error("保存サーバーへの再接続が必要です。");
  const data = await api(path, body);
  if (data.player) player = data.player;
  render();
  return data;
}
function settings() {
  modal(
    "設定・この計画について",
    `<p>第六感強化計画-PROJECT SIXTH-</p><label class="toggle-row">文字を大きくする<input id="large-text" type="checkbox" ${local.get("large-text", false) ? "checked" : ""}></label><label class="toggle-row">高コントラスト<input id="contrast" type="checkbox" ${local.get("contrast", false) ? "checked" : ""}></label><p class="small muted" style="margin-top:20px">本作は娯楽を目的としたゲームです。第六感・占術・直感に関する表示は科学的・医学的能力を保証するものではありません。</p><p class="small muted">匿名セッションで進行を保存します。ブラウザのCookieを削除すると、この端末から記録にアクセスできなくなります。複数端末への引き継ぎは未対応です。</p><div class="actions">${button("プレイ記録を保存", "export", "secondary")}${button("はじめての方へ", "welcome", "text-button")}</div>`,
  );
}
function welcome() {
  modal(
    "第六感強化計画へようこそ。",
    `<p class="trial-instructions">あなたはこの計画の被験者です。まずは、★カードの練習から。</p><div class="result-metrics"><div class="metric"><b>01</b><span>訓練で慣れる</span></div><div class="metric"><b>02</b><span>Dailyで記録する</span></div><div class="metric"><b>03</b><span>仲間と戦う</span></div></div><p class="small muted">察知・予見・洞察・感応・共鳴の5つの研究値が育ちます。最初の仲間はジョセフ。300 RCで共鳴召喚も試せます。</p><p class="small muted">本作は娯楽です。第六感の科学的・医学的能力を保証しません。</p><div class="actions">${button("★カードを練習する", "training-card")}${button("研究所ロビーへ", "close", "secondary")}</div>`,
    "SUBJECT REGISTRATION",
  );
  local.set("welcomed", true);
}
async function action(name) {
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
        `<p>${labs.find((l) => l.id === test).name}</p><p class="mint">獲得 ${Object.values(r?.xp || {}).reduce((a, b) => a + b, 0)} XP / 10 RC</p><p class="muted">次回は04:00 JSTから受験できます。</p>${button("訓練モードで遊ぶ", `training-${test}`)}`,
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
      `<p>${count === 10 ? "900" : "100"} RCを使い、${count}回召喚します。</p><p class="small muted">全12名から均等に抽選。重複は欠片10個になります。</p>${button("召喚する", `summon-${count}`)}`,
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
    if (!local.set("birth", value))
      throw new Error(
        "端末への保存ができません。ブラウザ設定を確認してください。",
      );
    renderAstrology();
    return;
  }
  if (name === "birth-clear") {
    local.set("birth", null);
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
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            exportedAt: new Date(serverNow()).toISOString(),
            player,
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
async function connect() {
  try {
    const data = await api("/api/bootstrap");
    player = data.player;
    observedDay = data.dateJst;
    online = true;
  } catch {
    online = false;
  }
  render();
}
applySettings();
route = location.hash.slice(1) || "home";
await connect();
if (online && !local.get("welcomed", false)) welcome();
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
