import { config } from "../shared/config.js";
import { calendarDate } from "../shared/core.js";
import { combinedProfile, observedComment } from "../shared/profiles.js";
import { mbtiNames, mbtiLabel } from "../shared/profile-model.js";
import { local, serverNow } from "./api.js";
import { escape, radar } from "./ui.js";
import { shareButtons } from "./sharing.js";
let currentPlayer;
export const researcherNote = (comment) =>
  `<div class="researcher-note"><span class="eyebrow">研究員の所見</span><p>${escape(comment)}</p></div>`;
export function savedProfile() {
  const birth = local.get("birth");
  return birth
    ? combinedProfile(
        birth,
        local.get("birth-time", ""),
        local.get("birth-offset", 9),
        local.get("mbti", "") || "",
      )
    : null;
}
export function profilePanels(player) {
  currentPlayer = player;
  return `<section class="panel profile-section"><span class="eyebrow">SIXTH SIGNATURE</span><h2>星・数字・タイプから、自分を読む。</h2><p>数秘から始まる5つの輪郭に、MBTIと出生時の惑星配置を重ねる。</p><div class="profile-fields"><label class="form-field">生年月日<input type="date" id="birth-date" min="1800-01-01" max="${calendarDate(serverNow())}" value="${escape(local.get("birth", ""))}"></label><label class="form-field">出生時刻（任意）<input type="time" id="birth-time" value="${escape(local.get("birth-time", ""))}"></label><label class="form-field">出生地のUTC差<input type="number" id="birth-offset" min="-12" max="14" step="0.25" value="${Number(local.get("birth-offset", 9))}"><small>日本は+9。海外は出生当時の時差。</small></label><label class="form-field">MBTIタイプ（任意）<select id="mbti-type"><option value="">未入力</option>${Object.keys(
    mbtiNames,
  )
    .map(
      (t) =>
        `<option value="${t}" ${local.get("mbti") === t ? "selected" : ""}>${mbtiLabel(t)}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div class="actions"><button class="primary" data-action="astrology">プロフィールを見る</button><button class="secondary" data-action="mbti-save">タイプを保存</button><button class="text-button" data-action="mbti-clear">タイプを削除</button><button class="text-button" data-action="birth-clear">出生情報を削除</button></div><div id="mbti-result"></div><p class="small muted">数秘・星読みと自己申告のタイプを組み合わせた、創作による自己分析です。出生日時は端末内に保存します。</p><div id="astrology-result"></div></section>`;
}
export function renderBirthProfile() {
  const target = document.querySelector("#astrology-result"),
    p = savedProfile();
  if (!target || !p) return;
  const name = currentPlayer?.displayName || "";
  const numeric = {
    kind: "numeric",
    title: `数秘 ${p.numerology.life}`,
    summary: p.numerology.label,
    name,
    stats: p.base,
    comment: p.reading.paragraphs[0],
  };
  const comprehensive = {
    kind: "comprehensive",
    title: "総合プロフィール",
    summary: `数秘 ${p.numerology.life} · ${p.features.mbti ? mbtiLabel(p.features.mbti) : p.reading.title}`,
    name,
    stats: p.stats,
    comment: p.reading.short,
    lines: p.sky.planets.map(
      (q) => `${q.name}  ${q.possibleSigns.join(" / ")}`,
    ),
  };
  const applied =
    currentPlayer?.profileApplied &&
    config.senses.every(
      (k) => Math.abs(currentPlayer.profileBonus[k] - p.bonus[k]) < 0.01,
    );
  target.innerHTML = `<div class="two-columns profile-section"><section><span class="eyebrow">NUMEROLOGY</span><h3>数秘 ${p.numerology.label}</h3>${radar(p.base, "数秘プロフィール")}${shareButtons(numeric)}</section><section><span class="eyebrow">COMBINED PROFILE</span><h3>${p.reading.title}</h3>${radar(p.stats, "総合プロフィール")}${shareButtons(comprehensive)}</section></div><details class="profile-breakdown"><summary>5つの軸ができるまで</summary><table class="data-table"><thead><tr><th>軸</th><th>数秘</th><th>MBTI</th><th>天体</th><th>総合</th></tr></thead><tbody>${config.senses.map((k, i) => `<tr><td>${config.labels[k]}</td><td>${p.base[k]}</td><td>${p.mbtiDelta[i] >= 0 ? "+" : ""}${p.mbtiDelta[i]}</td><td>${p.planetDelta[i] >= 0 ? "+" : ""}${p.planetDelta[i]}</td><td>${p.stats[k]}</td></tr>`).join("")}</tbody></table></details><div class="baseline-panel"><h3>この輪郭を、研究の初期値へ。</h3><p>総合プロフィールの10%を、5つの初期ステータスへ加えます。</p><p class="bonus-values">${config.senses.map((k) => `${config.labels[k]} +${p.bonus[k].toFixed(1)}`).join(" / ")}</p><div class="actions"><button class="primary" data-action="profile-apply" ${applied ? "disabled" : ""}>${applied ? "初期値に反映済み" : "初期値へ反映する"}</button>${currentPlayer?.profileApplied ? '<button class="text-button" data-action="profile-reset">初期値補正を解除</button>' : ""}</div><p class="small muted">更新時は補正を置き換え、これまでの研究XPは引き継ぎます。反映時に数秘・タイプ・星座区分を計算用に送信し、サーバーには補正値だけを保存します。</p></div><section class="reading-report"><span class="eyebrow">RESEARCHER'S READING</span><h3>君の組合せについて、話そう。</h3>${p.reading.paragraphs.map((text, i) => `<div class="reading-item"><span class="reading-index">${String(i + 1).padStart(2, "0")}</span><p>${escape(text)}</p></div>`).join("")}</section><details class="sky-detail"><summary>出生時の惑星配置</summary><p class="small muted">${p.sky.approximate ? "出生時刻は未入力。現地正午の概算で、日内の星座候補を併記します。" : "入力した出生時刻で計算しています。"} 地心・トロピカル方式。</p><table class="data-table"><thead><tr><th>天体</th><th>星座</th><th>度数</th></tr></thead><tbody>${p.sky.planets.map((q) => `<tr><td>${q.symbol} ${q.name}</td><td>${q.possibleSigns.join(" / ")}</td><td>${q.possibleSigns.length > 1 ? "未確定" : q.degree.toFixed(1) + "°"}</td></tr>`).join("")}</tbody></table><p class="small muted">${p.sky.aspects.map((a) => `${a.bodyA}・${a.bodyB} ${a.label}`).join(" / ")}</p></details>`;
}
export function renderMbti() {
  const el = document.querySelector("#mbti-result");
  if (el)
    el.textContent = local.get("mbti") ? mbtiLabel(local.get("mbti")) : "";
}
export function observedPanel(player) {
  const comment = observedComment(player.senseStats, player.history);
  const started = calendarDate(Date.parse(player.createdAt));
  const days = Math.max(
    1,
    Math.floor(
      (Date.parse(calendarDate(serverNow())) - Date.parse(started)) / 86400000,
    ) + 1,
  );
  const card = player.history.filter((h) => h.testId === "card"),
    particle = player.history.filter((h) => h.testId === "particle");
  const lines = [
    `研究開始日  ${started.replaceAll("-", " / ")}`,
    `総研究日数  ${days}日`,
    `カード  ${card.length}回 · ${card.length ? ((card.filter((h) => h.correct).length / card.length) * 100).toFixed(1) + "% 的中" : "観測待ち"}`,
    `粒子観測  ${particle.length}回 · ${particle.length ? "平均 " + (particle.reduce((a, h) => a + h.found, 0) / particle.length).toFixed(1) + " / 16 発見" : "観測待ち"}`,
  ];
  return (
    `<p class="small muted">研究開始日 ${started} · 総研究日数 ${days}日</p>` +
    researcherNote(comment) +
    shareButtons({
      kind: "research",
      title: "研究記録",
      name: player.displayName,
      summary: player.displayName || "被験者の観測記録",
      stats: player.senseStats,
      lines,
      comment,
    })
  );
}
