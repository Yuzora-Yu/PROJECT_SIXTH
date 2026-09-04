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
    comment: p.reading.numeric,
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
  target.innerHTML = `<div class="signature-comparison"><div class="profile-tabs" role="tablist" aria-label="プロフィールの切り替え"><button type="button" role="tab" id="tab-numeric" aria-controls="panel-numeric" aria-selected="false" tabindex="-1"><span class="eyebrow">NUMEROLOGY</span><strong>数秘の輪郭</strong></button><span class="profile-flow" aria-hidden="true">＋ MBTI・惑星配置<span>→</span></span><button type="button" role="tab" id="tab-comprehensive" aria-controls="panel-comprehensive" aria-selected="true" tabindex="0"><span class="eyebrow">COMBINED PROFILE</span><strong>総合プロフィール</strong></button></div><section id="panel-numeric" role="tabpanel" aria-labelledby="tab-numeric" tabindex="0" hidden><p class="profile-layer-note">生年月日から読む、君の出発点。</p><h3>数秘 ${p.numerology.label}</h3>${radar(p.base, "数秘プロフィール")}<p class="profile-chart-note">${escape(p.reading.numeric)}</p>${shareButtons(numeric)}</section><section id="panel-comprehensive" role="tabpanel" aria-labelledby="tab-comprehensive" tabindex="0"><p class="profile-layer-note">数秘 ${p.numerology.life} ＋ ${p.features.mbti ? mbtiLabel(p.features.mbti) + " ＋ " : ""}惑星配置</p><h3>${p.reading.title}</h3>${radar(p.stats, "総合プロフィール")}<p class="profile-chart-note">数秘を土台に、${p.features.mbti ? "タイプと星の配置" : "星の配置"}を重ねた君の輪郭。${p.features.mbti ? "" : "MBTIを入力すると、タイプの傾向も加わる。"}</p>${shareButtons(comprehensive)}</section></div><details class="profile-breakdown"><summary>チャート詳細</summary><table class="data-table"><thead><tr><th>軸</th><th>数秘</th><th>MBTI</th><th>天体</th><th>総合</th></tr></thead><tbody>${config.senses.map((k, i) => `<tr><td>${config.labels[k]}</td><td>${p.base[k]}</td><td>${p.mbtiDelta[i] >= 0 ? "+" : ""}${p.mbtiDelta[i]}</td><td>${p.planetDelta[i] >= 0 ? "+" : ""}${p.planetDelta[i]}</td><td>${p.stats[k]}</td></tr>`).join("")}</tbody></table><p class="small muted">各軸は20〜100の範囲。総合値は数秘・MBTI・天体の値を合算し、この範囲に収めています。</p></details><div class="baseline-panel"><h3>この輪郭を、研究の初期値へ。</h3><p>総合プロフィールの10%を、5つの初期ステータスへ加えます。</p><p class="bonus-values">${config.senses.map((k) => `${config.labels[k]} +${p.bonus[k].toFixed(1)}`).join(" / ")}</p><div class="actions"><button class="primary" data-action="profile-apply" ${applied ? "disabled" : ""}>${applied ? "初期値に反映済み" : "初期値へ反映する"}</button>${currentPlayer?.profileApplied ? '<button class="text-button" data-action="profile-reset">初期値補正を解除</button>' : ""}</div><p class="small muted">更新時は補正を置き換え、これまでの研究XPは引き継ぎます。反映時に数秘・タイプ・星座区分を計算用に送信し、サーバーには補正値だけを保存します。</p></div><section class="reading-report"><span class="eyebrow">RESEARCHER'S READING</span><h3>君の組合せについて、話そう。</h3><div class="reading-letter">${p.reading.paragraphs.map((text) => `<p>${escape(text)}</p>`).join("")}</div></section><details class="sky-detail"><summary>出生時の惑星配置</summary><p class="small muted">${p.sky.approximate ? "出生時刻は未入力。現地正午の概算で、日内の星座候補を併記します。" : "入力した出生時刻で計算しています。"} 地心・トロピカル方式。</p><table class="data-table"><thead><tr><th>天体</th><th>星座</th><th>度数</th></tr></thead><tbody>${p.sky.planets.map((q) => `<tr><td>${q.symbol} ${q.name}</td><td>${q.possibleSigns.join(" / ")}</td><td>${q.possibleSigns.length > 1 ? "未確定" : q.degree.toFixed(1) + "°"}</td></tr>`).join("")}</tbody></table><p class="small muted">${p.sky.aspects.map((a) => `${a.bodyA}・${a.bodyB} ${a.label}`).join(" / ")}</p></details>`;
  const tabs = [...target.querySelectorAll('[role="tab"]')];
  const selectTab = (tab) => {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      target.querySelector("#" + item.getAttribute("aria-controls")).hidden =
        !selected;
    }
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs[1]
            : tabs[1 - tabs.indexOf(tab)];
      selectTab(next);
      next.focus();
    });
  }
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
