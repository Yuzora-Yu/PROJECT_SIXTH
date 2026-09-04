import { config } from "../shared/config.js";
import { calendarDate } from "../shared/core.js";
import {
  numerologyProfile,
  planetaryProfile,
  mbtiNotes,
  observedComment,
} from "../shared/profiles.js";
import { local, serverNow } from "./api.js";
import { escape, radar } from "./ui.js";
import { shareButtons } from "./sharing.js";
export const researcherNote = (comment) =>
  `<div class="researcher-note"><span class="eyebrow">研究員の所見</span><p>${escape(comment)}</p></div>`;
export function profilePanels() {
  return `<section class="panel profile-section"><span class="eyebrow">ENTERTAINMENT PROFILE</span><h2>星と数字のプロフィール</h2><p class="small muted">出生情報はこの端末だけに保存します。惑星配置は地心・トロピカル方式（黄道12区分）で計算します。</p><div class="profile-fields"><label class="form-field">生年月日（任意）<input type="date" id="birth-date" value="${escape(local.get("birth", ""))}" min="1800-01-01" max="${calendarDate(serverNow())}"></label><label class="form-field">出生時刻（分かる場合）<input type="time" id="birth-time" value="${escape(local.get("birth-time", ""))}"></label><label class="form-field">出生地のUTC差<input type="number" id="birth-offset" min="-12" max="14" step="0.25" value="${Number(local.get("birth-offset", 9))}"><small class="muted">日本は+9。海外は出生当時の時差を入力。</small></label></div><div class="actions"><button class="primary" data-action="astrology">プロフィールを見る</button><button class="text-button" data-action="birth-clear">出生情報を削除</button></div><div id="astrology-result"></div></section><section class="panel profile-section"><span class="eyebrow">SELF-REPORTED PROFILE</span><h2>MBTIタイプ（任意）</h2><p class="small muted">すでに受けた診断の結果を記録できます。ここで新しい診断は行いません。</p><label class="form-field">あなたのタイプ<select id="mbti-type"><option value="">未入力</option>${Object.keys(
    mbtiNotes,
  )
    .map(
      (t) =>
        `<option value="${t}" ${local.get("mbti") === t ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="actions"><button class="primary" data-action="mbti-save">タイプを保存</button><button class="text-button" data-action="mbti-clear">削除</button></div><div id="mbti-result"></div></section>`;
}
export function renderBirthProfile() {
  const birth = local.get("birth"),
    target = document.querySelector("#astrology-result");
  if (!birth || !target) return;
  const n = numerologyProfile(birth),
    p = planetaryProfile(
      birth,
      local.get("birth-time", ""),
      local.get("birth-offset", 9),
    );
  const numeric = {
    title: `数秘 ${n.label}`,
    summary: `数秘プロフィール：${n.label}`,
    stats: n.stats,
    comment: n.comment,
    note: "数秘・占術を基にした娯楽用プロフィールです。",
  };
  const planetary = {
    title: "出生時の惑星配置",
    summary: p.approximate
      ? "出生時刻未入力・現地正午の概算"
      : "出生時刻をもとにした惑星配置",
    lines: p.planets.map(
      (q) =>
        `${q.name}：${q.possibleSigns.join(" / ")}${q.possibleSigns.length === 1 ? " " + q.degree.toFixed(1) + "°" : ""}`,
    ),
    comment: p.comment,
    note: "地心・トロピカル方式。占術の解釈は娯楽です。",
  };
  target.innerHTML = `<div class="two-columns profile-section"><section><span class="eyebrow">NUMEROLOGY</span><h3>数秘 ${n.label}</h3><p class="small muted">${n.method}</p>${radar(n.stats, "数秘の娯楽用5軸")}${researcherNote(n.comment)}${shareButtons(numeric)}</section><section><span class="eyebrow">NATAL SKY</span><h3>太陽：${p.planets[0].possibleSigns.join(" / ")}</h3><p class="small muted">${p.approximate ? "出生時刻は未入力。現地正午の概算です。日内に星座が変わる天体は候補を併記します。" : "入力した出生時刻で計算しています。"}<br>ASC・ハウスは出生地の座標が必要なため表示していません。</p><table class="data-table"><thead><tr><th>天体</th><th>星座</th><th>${p.approximate ? "概算度数" : "度数"}</th></tr></thead><tbody>${p.planets.map((q) => `<tr><td>${q.symbol} ${q.name}</td><td>${q.possibleSigns.join(" / ")}</td><td>${q.possibleSigns.length > 1 ? "未確定" : q.degree.toFixed(1) + "°"}</td></tr>`).join("")}</tbody></table>${p.aspects.length ? `<details><summary>主な角度関係${p.approximate ? "（正午の概算）" : ""}</summary><p class="small muted">${p.aspects.map((a) => `${a.bodyA}・${a.bodyB}：${a.label}（ずれ ${a.orb.toFixed(1)}°）`).join("<br>")}</p></details>` : ""}${researcherNote(p.comment)}<p class="small muted">${p.moonNote}</p>${shareButtons(planetary)}</section></div><p class="small muted">数秘・星座の所見は娯楽用です。研究値・戦闘能力へは反映しません。</p>`;
}
export function renderMbti() {
  const t = local.get("mbti"),
    el = document.querySelector("#mbti-result");
  if (!el) return;
  el.innerHTML =
    t && mbtiNotes[t]
      ? `<h3>${t}</h3>${researcherNote(mbtiNotes[t])}<p class="small muted">本人の自己申告です。能力の判定や戦闘補正には使いません。</p>${shareButtons({ title: `MBTIタイプ ${t}`, summary: `被験者プロフィールに ${t} を記録しました。`, comment: mbtiNotes[t], note: "MBTIタイプは自己申告。所見はゲーム内の短いコメントです。" })}`
      : "";
}
export function observedPanel(player) {
  const comment = observedComment(player.senseStats, player.history);
  return (
    researcherNote(comment) +
    shareButtons({
      title: "第六感プロファイル",
      summary: config.senses
        .map((k) => `${config.labels[k]} ${player.senseStats[k]}`)
        .join(" / "),
      stats: player.senseStats,
      comment,
    })
  );
}
