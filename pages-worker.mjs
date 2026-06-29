const DEFAULT_SEEDANCE_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const API_PREFIX = "/api/seedance/tasks";

function endpoint(env) {
  return env.SEEDANCE_ENDPOINT || DEFAULT_SEEDANCE_ENDPOINT;
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "cache-control": "no-store",
  };
}

async function forward(request, env, taskId) {
  const apiKey = env.ARK_API_KEY;
  if (!apiKey) {
    return new Response("Missing ARK_API_KEY on server", {
      status: 500,
      headers: { ...corsHeaders(), "content-type": "text/plain; charset=utf-8" },
    });
  }

  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.delete("host");
  const target = taskId ? `${endpoint(env)}/${taskId}` : endpoint(env);

  try {
    const init = { method: request.method, headers };
    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
      init.body = await request.text();
    }
    const upstream = await fetch(target, init);
    const body = await upstream.text();
    const responseHeaders = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(corsHeaders())) responseHeaders.set(key, value);
    if (!responseHeaders.get("content-type")) {
      responseHeaders.set("content-type", "application/json; charset=utf-8");
    }
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Seedance proxy failed\n${message}`, {
      status: 502,
      headers: { ...corsHeaders(), "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/seedance/")) {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === "/api/seedance/tasks/health") {
      return new Response(`ok=true\nhasArkKey=${Boolean(env.ARK_API_KEY)}\nendpoint=${endpoint(env)}`, {
        status: 200,
        headers: { ...corsHeaders(), "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      const taskId = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, "").replace(/\/+$/, "");
      return forward(request, env, taskId || undefined);
    }
    return env.ASSETS.fetch(request);
  },
};
