import { config } from "../shared/config.js";
export const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const button = (label, action, style = "primary", attrs = "") =>
  `<button class="${style}" data-action="${action}" ${attrs}>${label}</button>`;
export function radar(stats, caption = "第六感") {
  const point = (i, r) => [
    150 + Math.sin((i * Math.PI * 2) / 5) * r,
    140 - Math.cos((i * Math.PI * 2) / 5) * r,
  ];
  const points = (r) =>
    config.senses.map((_, i) => point(i, r).join(",")).join(" ");
  return `<svg class="radar" viewBox="0 0 300 280" role="img" aria-label="${caption}: ${config.senses.map((k) => config.labels[k] + " " + Math.round(stats[k])).join("、")}">
    ${[22, 44, 66, 88].map((r) => `<polygon points="${points(r)}" fill="none" stroke="#344651" stroke-width=".7"/>`).join("")}
    ${config.senses.map((_, i) => `<line x1="150" y1="140" x2="${point(i, 88)[0]}" y2="${point(i, 88)[1]}" stroke="#344651" stroke-width=".7"/>`).join("")}
    <polygon points="${config.senses.map((k, i) => point(i, Math.max(0, Math.min(100, stats[k])) * 0.88).join(",")).join(" ")}" fill="#8ce8cc26" stroke="#8ce8cc" stroke-width="1.8"/>
    ${config.senses
      .map((k, i) => {
        const [x, y] = point(i, stats[k] * 0.88),
          [tx, ty] = point(i, 113);
        return `<circle cx="${x}" cy="${y}" r="2.5" fill="#b2f4dd"/><text x="${tx}" y="${ty}" text-anchor="middle">${config.labels[k]}<tspan x="${tx}" dy="17" fill="#d6e7e2">${Math.round(stats[k])}</tspan></text>`;
      })
      .join("")}</svg>`;
}
export const xpHtml = (xp) =>
  `<div class="xp-list">${config.senses
    .filter((k) => xp[k] > 0)
    .map((k) => `<span>${config.labels[k]} +${xp[k]} XP</span>`)
    .join("")}</div>`;
let toastTimer;
export function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 4500);
}
let cleanup = null;
export const setCleanup = (fn) => {
  cleanup = fn;
};
export function closeModal() {
  const fn = cleanup;
  cleanup = null;
  fn?.();
  document.querySelector("#dialog").close();
}
export function modal(title, html, tag = "PROJECT SIXTH") {
  const fn = cleanup;
  cleanup = null;
  fn?.();
  const el = document.querySelector("#dialog");
  document.querySelector("#dialog-tag").textContent = tag;
  document.querySelector("#dialog-content").innerHTML =
    `<h2 id="dialog-title">${title}</h2>${html}`;
  if (!el.open) el.showModal();
}
export function errorInModal(error) {
  toast(error.message || "処理に失敗しました。");
}
