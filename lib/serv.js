// SERV Reasoning client. SERV is OpenAI-SDK compatible, so this is the
// standard client pointed at the SERV endpoint.
import OpenAI from "openai";

const KEY = process.env.SERV_API_KEY;
export const MODEL = process.env.SERV_MODEL || "gpt-5.4-mini";
const SHADOW = process.env.SERV_SHADOW !== "0";
export const LIVE = Boolean(KEY);
// Tests can run without a key by setting HANDSHAKE_STUB=1. Never set it in production.
const STUB = !LIVE && process.env.HANDSHAKE_STUB === "1";

const client = LIVE
  ? new OpenAI({ baseURL: "https://inference-api.openserv.ai/v1", apiKey: KEY })
  : null;

function shadowTool(hint) {
  return {
    type: "function",
    function: {
      name: "serv_shadow_agent",
      parameters: {
        type: "object",
        properties: {
          hint: { type: "string", default: hint },
          max_iterations: { type: "integer", default: 2 },
        },
      },
    },
  };
}

// Ask SERV for JSON that follows `schema`. Returns { data, meta }.
// Without a key the call fails, unless the test stub is switched on.
export async function reason({ name, schema, system, user, effort = "medium", shadowHint, mock }) {
  if (!LIVE && !STUB) {
    const err = new Error("SERV_API_KEY is not set.");
    err.code = "NO_KEY";
    throw err;
  }
  if (STUB) {
    return { data: mock(), meta: { live: false, model: "local-stub", shadow: false, ms: 0, tokens: 0 } };
  }
  const base = {
    model: MODEL,
    reasoning_effort: effort,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
  };
  const started = Date.now();
  let shadow = SHADOW && Boolean(shadowHint);
  let res;
  try {
    res = await client.chat.completions.create(shadow ? { ...base, tools: [shadowTool(shadowHint)] } : base);
  } catch (err) {
    // A 502 means the Shadow Agent could not validate a draft: surface it.
    if (!shadow || err?.status === 502 || err?.status === 401) throw err;
    shadow = false;
    res = await client.chat.completions.create(base);
  }
  const text = res.choices?.[0]?.message?.content;
  if (!text) throw new Error("SERV returned no content.");
  return {
    data: JSON.parse(text),
    meta: { live: true, model: res.model || MODEL, shadow, ms: Date.now() - started, tokens: res.usage?.total_tokens || 0 },
  };
}
