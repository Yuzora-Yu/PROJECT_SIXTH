import { handleApi } from "./api.js";
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return handleApi(request, env.DB);
    return env.ASSETS.fetch(request);
  },
};
