import { handleApi } from "./api.js";
export default {
  async fetch(request, env) {
    const url = new URL(request.url),
      prefix = "/project_sixth";
    if (url.pathname === prefix) {
      url.pathname += "/";
      return Response.redirect(url, 308);
    }
    const scoped = url.pathname.startsWith(prefix + "/");
    if (scoped) url.pathname = url.pathname.slice(prefix.length);
    const normalized = new Request(url, request);
    if (url.pathname.startsWith("/api/"))
      return handleApi(
        normalized,
        env,
        undefined,
        scoped ? prefix + "/" : "/",
      );
    if (url.pathname === "/") url.pathname = "/index.html";
    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.headers.get("content-type")?.includes("text/html")) {
      const headers = new Headers(response.headers);
      // Keep this app's HTML intact; zone-level analytics injection conflicts with its CSP.
      headers.set(
        "Cache-Control",
        "public, max-age=0, must-revalidate, no-transform",
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};
