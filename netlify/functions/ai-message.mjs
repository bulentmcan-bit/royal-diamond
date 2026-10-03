// ═══════════════════════════════════════════════════════════════════════════
// AI WhatsApp message writer — runs on Netlify's server, never in the browser.
//
// The salon app sends { prompt, maxTokens } to /.netlify/functions/ai-message.
// This function adds the secret ANTHROPIC_API_KEY (set in Netlify → Site
// configuration → Environment variables) and asks Claude for the message text.
// The key never reaches the browser, so nobody can copy it out of the page.
//
// So that the endpoint cannot be used by strangers as a free Claude proxy:
//   • only POST from the salon's own web page (Origin must match the site)
//   • only the two fields the app sends; anything else is refused
//   • the prompt must be a salon message prompt and is capped in length
//   • the answer is capped at a few hundred tokens
//   • a simple per-visitor limit on how many messages per minute
// ═══════════════════════════════════════════════════════════════════════════
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_BODY_CHARS = 6000;      // whole request body
const MAX_PROMPT_CHARS = 4000;    // the app's longest prompt is ~2,000 characters
const MIN_PROMPT_CHARS = 20;
const DEFAULT_MAX_TOKENS = 300;
const MAX_MAX_TOKENS = 400;
const PER_MINUTE_LIMIT = 60;      // per visitor IP, per warm server instance

const SYSTEM =
  "You write short WhatsApp messages for Royal Diamond Nail Studio, a nail salon. " +
  "Follow the instructions in the user's request and reply with ONLY the finished " +
  "message text — no explanations, no quotes, no headings. If the request is not " +
  "about writing a message for the salon's clients, reply with an empty message.";

const hits = new Map(); // ip -> [timestamps]

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function refuse(status, error, message) {
  return json(status, { error, message });
}

function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return recent.length > PER_MINUTE_LIMIT;
}

function sameSite(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost;
  try { originHost = new URL(origin).host; } catch { return false; }
  const allowed = new Set([new URL(req.url).host]);
  for (const v of [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    if (v) { try { allowed.add(new URL(v).host); } catch {} }
  }
  return allowed.has(originHost);
}

export default async (req) => {
  if (req.method !== "POST") return refuse(405, "method_not_allowed", "Sadece POST kabul edilir.");
  if (!sameSite(req)) return refuse(403, "forbidden", "Bu istek salon uygulamasından gelmedi.");

  const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
  if (tooMany(ip)) return refuse(429, "rate_limited", "Çok fazla istek — lütfen bir dakika sonra tekrar deneyin.");

  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return refuse(413, "too_large", "Mesaj isteği çok uzun.");

  let body;
  try { body = JSON.parse(raw); } catch { return refuse(400, "bad_json", "Geçersiz istek."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return refuse(400, "bad_request", "Geçersiz istek.");

  const extra = Object.keys(body).filter((k) => k !== "prompt" && k !== "maxTokens");
  if (extra.length) return refuse(400, "bad_request", "Geçersiz istek.");

  const { prompt } = body;
  if (typeof prompt !== "string") return refuse(400, "bad_request", "Geçersiz istek.");
  if (prompt.length < MIN_PROMPT_CHARS || prompt.length > MAX_PROMPT_CHARS) {
    return refuse(400, "bad_prompt_length", "Mesaj isteğinin uzunluğu uygun değil.");
  }
  // Every prompt the app builds is a salon message that signs off as the studio.
  if (!prompt.includes("Royal Diamond")) return refuse(400, "bad_prompt", "Geçersiz mesaj isteği.");

  let maxTokens = DEFAULT_MAX_TOKENS;
  if (body.maxTokens !== undefined) {
    const n = Number(body.maxTokens);
    if (!Number.isFinite(n)) return refuse(400, "bad_request", "Geçersiz istek.");
    maxTokens = Math.min(MAX_MAX_TOKENS, Math.max(50, Math.round(n)));
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return refuse(503, "not_configured",
      "Yapay zekâ mesajı henüz ayarlanmadı. Hazır şablon kullanıldı — mesajı elle düzenleyip gönderebilirsiniz.");
  }

  try {
    const client = new Anthropic({ maxRetries: 1, timeout: 20_000 });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return refuse(502, "empty", "Yapay zekâ boş yanıt verdi. Hazır şablon kullanıldı.");
    return json(200, { text });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("ai-message: API key rejected");
      return refuse(503, "bad_key",
        "Yapay zekâ anahtarı geçersiz. Hazır şablon kullanıldı — Netlify'daki ANTHROPIC_API_KEY'i kontrol edin.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      console.error("ai-message: rate limited by Anthropic");
      return refuse(429, "upstream_busy", "Yapay zekâ şu an yoğun. Hazır şablon kullanıldı, biraz sonra tekrar deneyin.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      console.error("ai-message: connection error", err.message);
    } else if (err instanceof Anthropic.APIError) {
      console.error("ai-message: API error", err.status, err.type, err.message);
    } else {
      console.error("ai-message: unexpected error", err);
    }
    return refuse(502, "upstream_error", "Yapay zekâ şu an yanıt vermiyor. Hazır şablon kullanıldı.");
  }
};
