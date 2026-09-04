export const feedbackColors = {
  hit: "#91ead0",
  miss: "#ffac91",
  duplicate: "#f4d58a",
  cooldown: "#a5b3c6",
};
export function particlePointer(canvas, event) {
  const rect = canvas.getBoundingClientRect(),
    style = getComputedStyle(canvas);
  const left = parseFloat(style.borderLeftWidth) || 0,
    right = parseFloat(style.borderRightWidth) || 0;
  const top = parseFloat(style.borderTopWidth) || 0,
    bottom = parseFloat(style.borderBottomWidth) || 0;
  const x =
    ((event.clientX - rect.left - left) * canvas.width) /
    (rect.width - left - right);
  const y =
    ((event.clientY - rect.top - top) * canvas.height) /
    (rect.height - top - bottom);
  return x < 0 || x > canvas.width || y < 0 || y > canvas.height
    ? null
    : { x, y };
}
export function drawParticleFeedback(
  ctx,
  effects,
  elapsed,
  radius,
  reducedMotion = false,
) {
  for (const effect of effects) {
    const age = elapsed - effect.createdAt;
    if (age < 0 || age > 850) continue;
    const color = feedbackColors[effect.kind],
      fade = Math.min(1, (850 - age) / 250);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(effect.kind === "cooldown" ? [7, 7] : []);
    ctx.beginPath();
    ctx.arc(effect.tap.x, effect.tap.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = fade * 0.08;
    ctx.fill();
    ctx.globalAlpha = fade;
    const x = effect.x ?? effect.tap.x,
      y = effect.y ?? effect.tap.y;
    if (effect.kind === "hit") {
      const progress = reducedMotion ? 0.3 : Math.min(1, age / 650);
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 12 + progress * 32, 0, Math.PI * 2);
      ctx.stroke();
      if (!reducedMotion)
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4,
            d = 12 + progress * 55;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(angle) * d, y + Math.sin(angle) * d);
          ctx.lineTo(
            x + Math.cos(angle) * (d + 8),
            y + Math.sin(angle) * (d + 8),
          );
          ctx.stroke();
        }
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "✓ 発見 +1",
        Math.max(75, Math.min(885, x)),
        Math.max(32, y - 35 - progress * 10),
      );
    } else {
      const text = {
        miss: "× 異常なし",
        duplicate: "✓ 発見済み",
        cooldown: "… 入力待ち",
      }[effect.kind];
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, Math.max(80, Math.min(880, x)), Math.max(27, y - 20));
    }
    ctx.restore();
  }
}
