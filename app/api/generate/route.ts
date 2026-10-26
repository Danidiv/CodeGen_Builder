import Anthropic from "@anthropic-ai/sdk";
import { CHAT_PROMPT, getSystemPrompt } from "@/lib/prompts";

/** Local models get the short prompt (less context used); PROMPT_MODE=full|compact overrides. */
function systemPrompt(): string {
  const mode = (process.env.PROMPT_MODE || "").toLowerCase();
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  return getSystemPrompt(mode === "compact" || (mode !== "full" && provider === "lmstudio"));
}
import { ChatMessage, buildUserPrompt } from "@/lib/buildPrompt";
import { getBearer, requireUser, userClient } from "@/lib/serverAuth";
import { callUsage, limitMessage, parseLimit } from "@/lib/usage";
import { getStyle } from "@/lib/styles";
import { sanitizeAttachments } from "@/lib/attachments";
import { ERROR_MARKER, LENGTH_MARKER } from "@/lib/protocol";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  // Only signed-in users may spend AI budget (no-op when Supabase is not set up).
  const denied = await requireUser(req);
  if (denied) return denied;

  // Daily limit per user (only in cloud mode, where users are signed in).
  let usageHeaders: Record<string, string> = {};
  const sb = userClient(getBearer(req));
  if (sb) {
    try {
      const limit = parseLimit(process.env.DAILY_LIMIT);
      const usage = await callUsage(sb, limit, true);
      if (!usage.allowed) {
        // Count how often people hit the limit (the dashboard shows it). Never blocks the answer.
        void Promise.resolve(sb.rpc("track_event", { p_kind: "limit_hit", p_meta: { banned: usage.banned === true } })).then(() => {}, () => {});
        return new Response(limitMessage(usage), { status: 429 });
      }
      usageHeaders = { "X-Usage-Used": String(usage.used), "X-Usage-Limit": String(usage.limit) };
    } catch (err) {
      return new Response(err instanceof Error ? err.message : "Usage check failed.", { status: 500 });
    }
  }

  let body: { messages?: ChatMessage[]; files?: Record<string, string>; style?: string; attachments?: unknown; mode?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const messages = body.messages ?? [];
  const files = body.files ?? {};
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new Response("Last message must be from the user", { status: 400 });
  }

  const attachments = sanitizeAttachments(body.attachments);
  const images = attachments.filter((a) => a.kind === "image").map((a) => a.data);

  // Chat mode: the user only talks. Short answer, no code, recent messages as context.
  const chatMode = body.mode === "chat";
  const gen: GenOptions = chatMode ? { system: CHAT_PROMPT, maxTokens: 700 } : { system: systemPrompt() };

  // Build mode: ONE self-contained message: current files + earlier requests + new request.
  const apiMessages: ChatMessage[] = chatMode
    ? messages
        .slice(-8)
        .filter((m) => typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    : [{ role: "user", content: buildUserPrompt(messages, files, getStyle(body.style)?.prompt ?? "", attachments) }];

  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  const encoder = new TextEncoder();

  // When the browser presses Stop (or closes the tab) we stop the AI request
  // too, so a local model does not keep computing and an API does not keep billing.
  const upstream = new AbortController();
  req.signal.addEventListener("abort", () => upstream.abort());
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      try {
        if (provider === "lmstudio") {
          await streamFromLmStudio(apiMessages, send, upstream.signal, chatMode ? [] : images, gen);
        } else if (provider === "openrouter") {
          await streamFromOpenRouter(apiMessages, send, upstream.signal, chatMode ? [] : images, gen);
        } else {
          await streamFromClaude(apiMessages, send, upstream.signal, chatMode ? [] : images, gen);
        }
      } catch (err) {
        if (!upstream.signal.aborted) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          send(`\n${ERROR_MARKER} ${msg}`);
        }
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      closed = true;
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...usageHeaders },
  });
}

/** What differs between building and chatting: the system prompt and the answer length. */
type GenOptions = { system: string; maxTokens?: number };

// ---------------------------------------------------------------------------
// Provider: Claude API (Anthropic)
// ---------------------------------------------------------------------------
async function streamFromClaude(messages: ChatMessage[], send: (t: string) => void, signal: AbortSignal, images: string[] = [], gen: GenOptions) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local");

  const client = new Anthropic({ apiKey });
  const response = client.messages.stream(
    {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: gen.maxTokens ?? 16000,
      system: gen.system,
      messages: withImagesForClaude(messages, images),
    },
    { signal }
  );
  for await (const event of response) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      send(event.delta.text);
    }
  }
  try {
    const final = await response.finalMessage();
    if (final.stop_reason === "max_tokens") send(LENGTH_MARKER);
  } catch {
    // no final message (stopped early): nothing to report
  }
}

// ---------------------------------------------------------------------------
// Provider: LM Studio (local, OpenAI-compatible server)
// ---------------------------------------------------------------------------
async function streamFromLmStudio(messages: ChatMessage[], send: (t: string) => void, signal: AbortSignal, images: string[] = [], gen: GenOptions) {
  const baseUrl = (process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1").replace(/\/$/, "");
  // Qwen3-style models "think" for a long time before answering, which is slow.
  // "/no_think" at the end of the message switches that off for models that support it.
  const noThink = /^(1|true|yes)$/i.test(process.env.LMSTUDIO_NO_THINK ?? "");
  if (noThink && messages.length > 0) {
    const last = messages.length - 1;
    messages = messages.map((m, i) => (i === last ? { ...m, content: m.content + "\n\n/no_think" } : m));
  }
  await streamOpenAICompatible({
    label: "LM Studio",
    baseUrl,
    headers: {},
    body: { model: process.env.LMSTUDIO_MODEL || "local-model", temperature: 0.2 },
    messages,
    images,
    gen,
    send,
    signal,
    unreachableHint: `Cannot reach LM Studio at ${baseUrl}. Start the local server in LM Studio and load a model.`,
  });
}

// ---------------------------------------------------------------------------
// Provider: OpenRouter (one key, many models; OpenAI-compatible)
// ---------------------------------------------------------------------------
async function streamFromOpenRouter(messages: ChatMessage[], send: (t: string) => void, signal: AbortSignal, images: string[] = [], gen: GenOptions) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set. Add it to .env.local");

  await streamOpenAICompatible({
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // Optional headers OpenRouter uses to identify your app.
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": "CodeGen Builder",
    },
    body: {
      model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5",
      temperature: 0.2,
      // Keep this modest: OpenRouter rejects a request if your credit
      // balance cannot cover the maximum possible output.
      max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS) || 8000,
    },
    messages,
    images,
    gen,
    send,
    signal,
    unreachableHint: "Cannot reach OpenRouter. Check your internet connection.",
  });
}

// ---------------------------------------------------------------------------
// Shared streaming for any OpenAI-compatible /chat/completions endpoint
// ---------------------------------------------------------------------------
async function streamOpenAICompatible(opts: {
  label: string;
  baseUrl: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  messages: ChatMessage[];
  images?: string[];
  gen: GenOptions;
  send: (t: string) => void;
  signal: AbortSignal;
  unreachableHint: string;
}) {
  const { label, baseUrl, headers, body, messages, images = [], gen, send, signal, unreachableHint } = opts;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      signal,
      body: JSON.stringify({
        ...body,
        ...(gen.maxTokens ? { max_tokens: gen.maxTokens } : {}),
        stream: true,
        messages: [{ role: "system", content: gen.system }, ...withImagesForOpenAI(messages, images)],
      }),
    });
  } catch (err) {
    if (signal.aborted) throw err; // user pressed Stop: not a connection problem
    throw new Error(unreachableHint);
  }

  if (!res.ok || !res.body) {
    const detail = await res.text();
    if (images.length > 0 && /image|vision|multimodal|modalit/i.test(detail)) {
      throw new Error(
        `${label}: this model cannot read images. Pick a model with image support (for example anthropic/claude-sonnet-4.5) or remove the image and send again.`
      );
    }
    throw new Error(`${label} error ${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Some servers send the model's reasoning in its own field. We forward it
  // wrapped in <think> tags: the browser hides it but can show "Thinking...".
  let thinking = false;
  let finishReason: string | null = null;
  const finish = () => {
    if (thinking) {
      send("</think>");
      thinking = false;
    }
    if (finishReason === "length") send(LENGTH_MARKER);
  };

  type Chunk = {
    choices?: {
      delta?: { content?: string; reasoning_content?: string; reasoning?: string };
      finish_reason?: string | null;
    }[];
    error?: { message?: string };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      // Comment lines such as ": OPENROUTER PROCESSING" are ignored here.
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        finish();
        return;
      }

      let json: Chunk;
      try {
        json = JSON.parse(data);
      } catch {
        continue; // partial/non-JSON line
      }
      if (json.error) {
        throw new Error(`${label} error: ${json.error.message ?? "unknown error"}`);
      }
      const choice = json.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const delta = choice?.delta;
      const reasoning = delta?.reasoning_content ?? delta?.reasoning;
      if (reasoning) {
        if (!thinking) {
          send("<think>");
          thinking = true;
        }
        send(reasoning);
      }
      if (delta?.content) {
        if (thinking) {
          send("</think>");
          thinking = false;
        }
        send(delta.content);
      }
    }
  }
  finish(); // the stream ended without [DONE]
}

// ---------------------------------------------------------------------------
// Reference images: added to the last user message
// ---------------------------------------------------------------------------
function withImagesForOpenAI(messages: ChatMessage[], images: string[]) {
  if (images.length === 0) return messages;
  const last = messages.length - 1;
  return messages.map((m, i) =>
    i === last
      ? {
          role: m.role,
          content: [
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
            { type: "text", text: m.content },
          ],
        }
      : m
  );
}

function withImagesForClaude(messages: ChatMessage[], images: string[]): Anthropic.MessageParam[] {
  if (images.length === 0) return messages as Anthropic.MessageParam[];
  const last = messages.length - 1;
  return messages.map((m, i) =>
    i === last
      ? {
          role: m.role,
          content: [
            ...images.map((url) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: "image/jpeg" as const, data: url.replace(/^data:image\/jpeg;base64,/, "") },
            })),
            { type: "text" as const, text: m.content },
          ],
        }
      : (m as Anthropic.MessageParam)
  );
}
