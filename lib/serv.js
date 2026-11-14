// SERV Reasoning client. SERV is OpenAI-SDK compatible, so this is the
// standard client pointed at the SERV endpoint.
import OpenAI from "openai";

const KEY = process.env.SERV_API_KEY;
export const MODEL = process.env.SERV_MODEL || "gpt-5.4-mini";
const SHADOW = process.env.SERV_SHADOW !== "0";
export const LIVE = Boolean(KEY);

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
// `mock` is used only when no SERV_API_KEY is set, so the app can be
// clicked through locally. The UI labels that mode clearly.
export async function reason({ name, schema, system, user, effort = "medium", shadowHint, mock }) {
  if (!LIVE) {
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
