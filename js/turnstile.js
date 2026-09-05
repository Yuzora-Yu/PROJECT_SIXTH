let loader;

export function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-project-sixth-turnstile="1"]',
    );
    // loader is cleared only after a failed load. Remove that stale script so
    // a user retry actually performs a new network request.
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.defer = true;
    script.dataset.projectSixthTurnstile = "1";
    script.addEventListener(
      "load",
      () => {
        if (window.turnstile?.render) resolve(window.turnstile);
        else reject(new Error("投票確認画面を初期化できませんでした。"));
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error("投票確認画面を読み込めませんでした。"));
      },
      { once: true },
    );
    document.head.append(script);
  }).catch((error) => {
    loader = undefined;
    throw error;
  });
  return loader;
}
