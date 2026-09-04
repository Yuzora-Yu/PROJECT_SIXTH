import { now } from "../shared/core.js";
export const local = {
  get(key, fallback = null) {
    try {
      return (
        JSON.parse(localStorage.getItem(`project-sixth:${key}`)) ?? fallback
      );
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`project-sixth:${key}`, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
let offset = 0;
export const serverNow = () => now() + offset;
export async function api(path, body) {
  const apiUrl = new URL(
    path.replace(/^\//, ""),
    new URL("../", import.meta.url),
  );
  const fingerprint = path + JSON.stringify(body || {});
  let key;
  if (body) {
    try {
      const pending = JSON.parse(
        sessionStorage.getItem("project-sixth:pending") || "null",
      );
      key =
        pending?.fingerprint === fingerprint
          ? pending.key
          : crypto.randomUUID();
      sessionStorage.setItem(
        "project-sixth:pending",
        JSON.stringify({ key, fingerprint }),
      );
    } catch {
      key = crypto.randomUUID();
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: body ? "POST" : "GET",
        credentials: "same-origin",
        headers: {
          "X-Sixth-Client": "1",
          ...(body
            ? { "Content-Type": "application/json", "Idempotency-Key": key }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "接続を確認してください。");
        error.status = response.status;
        throw error;
      }
      if (data.serverTime) offset = Date.parse(data.serverTime) - now();
      if (body)
        try {
          sessionStorage.removeItem("project-sixth:pending");
        } catch {}
      return data;
    } catch (e) {
      if (attempt === 0 && (!e.status || e.status >= 500)) continue;
      if (e.status && e.status < 500 && body)
        try {
          sessionStorage.removeItem("project-sixth:pending");
        } catch {}
      throw e;
    }
  }
}
