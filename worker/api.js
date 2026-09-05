import { config } from "../shared/config.js";
import { now, iso, dayKey } from "../shared/core.js";
import {
  newPlayer,
  publicPlayer,
  publicPredictions,
  perform,
  GameError,
} from "./game.js";
const json = (data, status = 200, headers = {}) =>
  Response.json(
    { version: config.gameVersion, ...data },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    },
  );
async function hash(text) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function readBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new GameError("JSON形式で送信してください。", 415);
  const reader = request.body?.getReader();
  if (!reader) return {};
  let bytes = 0,
    chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 32768) {
      await reader.cancel();
      throw new GameError("送信データが大きすぎます。", 413);
    }
    chunks.push(value);
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  try {
    const result = JSON.parse(new TextDecoder().decode(data));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw Error();
    return result;
  } catch {
    throw new GameError("送信内容を確認してください。");
  }
}
export async function handleApi(request, db, clock = now, cookiePath = "/") {
  const url = new URL(request.url),
    ms = clock();
  let cookie;
  try {
    if (!db)
      throw new GameError(
        "保存サーバーに接続できません。訓練モードをご利用ください。",
        503,
      );
    if (request.headers.get("X-Sixth-Client") !== "1")
      throw new GameError("リクエストを確認できません。", 403);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      throw new GameError("許可されていない送信元です。", 403);
    if (request.headers.get("Sec-Fetch-Site") === "cross-site")
      throw new GameError("許可されていない送信元です。", 403);
    const token = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)sixth_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    let row = token
      ? await db
          .prepare("SELECT * FROM players WHERE session_hash=?")
          .bind(await hash(token))
          .first()
      : null;
    if (!row) {
      if (url.pathname !== "/api/bootstrap" || request.method !== "GET")
        throw new GameError("研究所へ再接続してください。", 401);
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const id = crypto.randomUUID(),
        player = newPlayer(id, ms),
        sessionHash = await hash(secret);
      await db
        .prepare(
          "INSERT INTO players (id,session_hash,data,revision) VALUES (?,?,?,0)",
        )
        .bind(id, sessionHash, JSON.stringify(player))
        .run();
      row = {
        id,
        session_hash: sessionHash,
        data: JSON.stringify(player),
        revision: 0,
      };
      cookie = `sixth_session=${secret}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol === "https:" ? "; Secure" : ""}`;
    }
    const headers = cookie ? { "Set-Cookie": cookie } : {};
    const p = JSON.parse(row.data);
    if (
      request.method === "GET" &&
      ["/api/bootstrap", "/api/me"].includes(url.pathname)
    )
      return json(
        {
          serverTime: iso(ms),
          dateJst: dayKey(ms),
          player: publicPlayer(p, ms),
        },
        200,
        headers,
      );
    if (request.method === "GET" && url.pathname === "/api/predictions")
      return json(
        {
          serverTime: iso(ms),
          predictions: publicPredictions(p, ms),
        },
        200,
        headers,
      );
    if (request.method !== "POST")
      throw new GameError("この操作は利用できません。", 405);
    const body = await readBody(request),
      key = request.headers.get("Idempotency-Key");
    if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
      throw new GameError("操作IDが必要です。");
    const fingerprint = await hash(url.pathname + JSON.stringify(body));
    const previous = await db
      .prepare(
        "SELECT fingerprint,result FROM operations WHERE player_id=? AND op_key=?",
      )
      .bind(row.id, key)
      .first();
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new GameError("操作IDが別の操作に使用されています。", 409);
      return json(
        {
          result: JSON.parse(previous.result),
          player: publicPlayer(p, ms),
          serverTime: iso(ms),
          ...(url.pathname.startsWith("/api/predictions/")
            ? { predictions: publicPredictions(p, ms) }
            : {}),
        },
        200,
        headers,
      );
    }
    const result = perform(p, url.pathname, body, ms);
    // CAS + receipt insertion in one D1 transaction: no lost updates, no double spend.
    const updated = await db.batch([
      db
        .prepare(
          "UPDATE players SET data=?, revision=revision+1, last_op=? WHERE id=? AND revision=?",
        )
        .bind(JSON.stringify(p), key, row.id, row.revision),
      db
        .prepare(
          "INSERT INTO operations (player_id,op_key,fingerprint,result,created_at) SELECT id,?,?,?,? FROM players WHERE id=? AND revision=? AND last_op=?",
        )
        .bind(
          key,
          fingerprint,
          JSON.stringify(result),
          iso(ms),
          row.id,
          row.revision + 1,
          key,
        ),
    ]);
    if (updated[0].meta.changes !== 1)
      throw new GameError(
        "別の操作が保存されました。もう一度お試しください。",
        409,
      );
    return json(
      {
        result,
        player: publicPlayer(p, ms),
        serverTime: iso(ms),
        ...(url.pathname.startsWith("/api/predictions/")
          ? { predictions: publicPredictions(p, ms) }
          : {}),
      },
      200,
      headers,
    );
  } catch (e) {
    if (!(e instanceof GameError))
      console.error(
        JSON.stringify({
          event: "api_failure",
          path: url.pathname,
          message: e.message,
        }),
      );
    return json(
      {
        error:
          e instanceof GameError
            ? e.message
            : "保存処理に失敗しました。同じ操作を再試行してください。",
      },
      e.status || 500,
    );
  }
}
