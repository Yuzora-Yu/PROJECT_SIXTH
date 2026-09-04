import { config } from "../shared/config.js";
import { escape, toast } from "./ui.js";
export const siteUrl = "https://yu-zora.com/project_sixth/";
const records = new Map();
let serial = 0;
export function xIntent(record) {
  const params = new URLSearchParams({
    text: `${record.title}：${record.summary}`.slice(0, 95),
    url: siteUrl,
    hashtags: "第六感強化計画,PROJECTSIXTH",
  });
  return `https://twitter.com/intent/tweet?${params}`;
}
export function shareButtons(record) {
  const id = String(++serial);
  records.set(id, record);
  if (records.size > 250) records.delete(records.keys().next().value);
  return `<div class="share-actions" aria-label="${escape(record.title)}を共有"><button type="button" class="secondary" data-share-image="${id}">画像を作成</button><a class="secondary" href="${escape(xIntent(record))}" target="_blank" rel="noopener noreferrer">Xに投稿</a><button type="button" class="text-button" data-share-native="${id}">その他の共有</button></div>`;
}
function wrapped(ctx, text, x, y, width, lineHeight) {
  let line = "";
  for (const c of text) {
    if (c === "\n" || ctx.measureText(line + c).width > width) {
      ctx.fillText(line, x, y);
      line = c === "\n" ? "" : c;
      y += lineHeight;
    } else line += c;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}
export async function shareCanvas(record) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, "#172f35");
  gradient.addColorStop(1, "#0b131d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = "#355650";
  ctx.lineWidth = 2;
  ctx.strokeRect(35, 35, 1010, 1010);
  ctx.fillStyle = "#91ead0";
  ctx.font = '600 24px "Yu Gothic UI", sans-serif';
  ctx.fillText("PROJECT SIXTH  /  SUBJECT RECORD", 70, 99);
  ctx.fillStyle = "#eff8f4";
  ctx.font = '700 43px "Yu Gothic UI", sans-serif';
  wrapped(ctx, record.title, 70, 183, 940, 57);
  ctx.font = '28px "Yu Gothic UI", sans-serif';
  ctx.fillStyle = "#c1d8d5";
  wrapped(ctx, record.summary, 70, 275, 940, 43);
  let commentY = 560;
  if (record.stats) {
    const cx = 540,
      cy = 563,
      radius = 162;
    const point = (i, r) => [
      cx + Math.sin((i * 2 * Math.PI) / 5) * r,
      cy - Math.cos((i * 2 * Math.PI) / 5) * r,
    ];
    for (const r of [40, 80, 120, 162]) {
      ctx.strokeStyle = "#395257";
      ctx.beginPath();
      config.senses.forEach((_, i) => {
        const [x, y] = point(i, r);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.beginPath();
    config.senses.forEach((k, i) => {
      const [x, y] = point(
        i,
        (Math.min(100, Math.max(0, record.stats[k])) / 100) * radius,
      );
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "#80e3c739";
    ctx.fill();
    ctx.strokeStyle = "#91ead0";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.font = '24px "Yu Gothic UI",sans-serif';
    ctx.fillStyle = "#e3f2ec";
    config.senses.forEach((k, i) => {
      const [x, y] = point(i, 207);
      ctx.fillText(`${config.labels[k]} ${Math.round(record.stats[k])}`, x, y);
    });
    ctx.textAlign = "left";
    commentY = 815;
  } else if (record.lines?.length) {
    ctx.font = '29px "Yu Gothic UI",sans-serif';
    ctx.fillStyle = "#91ead0";
    if (record.lines.length > 6) {
      ctx.font = '25px "Yu Gothic UI",sans-serif';
      record.lines.slice(0, 10).forEach((line, i) => {
        wrapped(ctx, line, i < 5 ? 70 : 565, 390 + (i % 5) * 68, 445, 30);
      });
      commentY = 810;
    } else {
      let y = 400;
      for (const line of record.lines)
        y = wrapped(ctx, line, 70, y, 940, 43) + 12;
      commentY = Math.max(740, y + 25);
    }
  }
  ctx.fillStyle = "#91ead0";
  ctx.font = '600 19px "Yu Gothic UI",sans-serif';
  ctx.fillText("研究員の所見", 70, commentY - 25);
  ctx.fillStyle = "#d2dfdf";
  ctx.font = '25px "Yu Gothic UI",sans-serif';
  wrapped(
    ctx,
    record.comment || "今回の記録を受け取った。また次の観測で会おう。",
    70,
    commentY + 15,
    940,
    37,
  );
  ctx.fillStyle = "#92aaa9";
  ctx.font = '18px "Yu Gothic UI",sans-serif';
  ctx.fillText(
    record.note || "ゲーム内の記録・娯楽用プロフィールです。",
    70,
    986,
  );
  ctx.font = '20px "Yu Gothic UI",sans-serif';
  ctx.fillText(
    "yu-zora.com/project_sixth/    #第六感強化計画 #PROJECTSIXTH",
    70,
    1020,
  );
  return canvas;
}
async function createImage(record) {
  const canvas = await shareCanvas(record);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw Error("画像を作成できませんでした。");
  const url = URL.createObjectURL(blob),
    dialog = document.createElement("dialog");
  dialog.className = "share-dialog";
  dialog.setAttribute("aria-label", "共有画像のプレビュー");
  dialog.innerHTML = `<div class="dialog-top"><h2>共有画像</h2><button type="button" class="icon-button" aria-label="共有画像を閉じる">×</button></div><img src="${url}" alt="${escape(record.title)}の共有画像"><p class="small muted">画像は端末内で作成します。出生日時・被験者IDは含めません。Xへ画像を添える場合は、保存後に投稿画面で添付してください。</p><div class="actions"><a class="primary" href="${url}" download="project-sixth-record.png">PNGを保存</a><a class="secondary" href="${escape(xIntent(record))}" target="_blank" rel="noopener noreferrer">Xに投稿</a></div>`;
  document.body.append(dialog);
  dialog.querySelector("button").onclick = () => dialog.close();
  dialog.addEventListener(
    "close",
    () => {
      URL.revokeObjectURL(url);
      dialog.remove();
    },
    { once: true },
  );
  dialog.showModal();
}
if (typeof document !== "undefined")
  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-share-image],[data-share-native]");
    if (!button || button.disabled) return;
    const record = records.get(
      button.dataset.shareImage || button.dataset.shareNative,
    );
    if (!record) return;
    button.disabled = true;
    try {
      if (button.dataset.shareImage) await createImage(record);
      else if (navigator.share)
        await navigator.share({
          title: record.title,
          text: `${record.summary}\n#第六感強化計画 #PROJECTSIXTH`,
          url: siteUrl,
        });
      else {
        await navigator.clipboard.writeText(
          `${record.title}：${record.summary}\n${siteUrl}\n#第六感強化計画 #PROJECTSIXTH`,
        );
        toast("共有用の文章をコピーしました。");
      }
    } catch (err) {
      if (err.name !== "AbortError")
        toast(err.message || "共有できませんでした。");
    } finally {
      button.disabled = false;
    }
  });
