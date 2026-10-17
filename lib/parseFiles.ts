export type ParsedResult = {
  /** Text outside <file> blocks (the AI's short explanation) */
  message: string;
  /** Files found so far. A file still being streamed is included with its partial content. */
  files: Record<string, string>;
  /** Path of the file currently being streamed, if any */
  openFile: string | null;
};

/**
 * Parses streamed model output of the form:
 *   some text <file path="/App.tsx"> ...code... </file> more text
 * Works on partial text, so it can be called on every streaming chunk.
 */
export function parseFiles(text: string): ParsedResult {
  text = removeHidden(text);
  const files: Record<string, string> = {};
  let message = "";
  let openFile: string | null = null;
  let i = 0;

  const openRe = /<file\s+path="([^"]+)"\s*>/g;

  while (i < text.length) {
    openRe.lastIndex = i;
    const m = openRe.exec(text);
    if (!m) {
      message += text.slice(i);
      break;
    }
    message += text.slice(i, m.index);
    const path = normalizePath(m[1]);
    const bodyStart = m.index + m[0].length;
    const closeIdx = text.indexOf("</file>", bodyStart);

    if (closeIdx === -1) {
      files[path] = cleanBody(text.slice(bodyStart));
      openFile = path;
      break;
    }
    files[path] = cleanBody(text.slice(bodyStart, closeIdx));
    i = closeIdx + "</file>".length;
  }

  // Hide a half-typed opening tag like "<file pa" at the very end of the message
  message = cleanModelText(stripEdits(message).replace(/<file[^>]*$/, ""));
  return { message, files, openFile };
}

/**
 * Removes parts of the model output that are never meant for the user or the
 * parser: <think>...</think> reasoning (also while it is still open) and
 * tool-call blocks some models emit instead of code.
 */
export function removeHidden(text: string): string {
  return text
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
    .replace(/<\|tool_call_start\|>[\s\S]*?(<\|tool_call_end\|>|$)/g, "");
}

/** Removes <edit>...</edit> blocks (also unfinished or half-typed ones) from chat text. */
export function stripEdits(text: string): string {
  return text.replace(/<edit\b[\s\S]*?(<\/edit>|$)/g, "").replace(/<(?:edit\b[^>]*|edi|ed|e)$/, "");
}

/** Cleans the short chat message: special tokens and leaked template lines. */
export function cleanModelText(text: string): string {
  return text
    .replace(/<\|[^|<>\n]{1,40}\|>/g, "")
    .replace(/<\/?(?:output|answer|response|result|reply)\s*>/gi, "")
    .replace(/^\s*User Safety:.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the model answered with a tool/function call instead of code. */
export function looksLikeToolCall(raw: string): boolean {
  raw = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, ""); // reasoning may mention anything
  return /<\|tool_call_start\|>|<tool_call>|\b(?:edit|write|read)\(\s*file_path\s*=/.test(raw);
}

/**
 * Fallback for small models that ignore the <file> format and answer with a
 * normal markdown code block. If there is exactly such a block containing a
 * default export, treat it as the new /App.tsx.
 */
export function extractFallbackFiles(
  text: string
): { message: string; files: Record<string, string> } | null {
  text = removeHidden(text);
  const m = text.match(/```[a-zA-Z]*[^\n]*\n([\s\S]*?)```/);
  if (!m || m.index === undefined || !/export\s+default/.test(m[1])) return null;
  const message = cleanModelText(text.slice(0, m.index) + text.slice(m.index + m[0].length));
  return { message, files: { "/App.tsx": m[1].replace(/\s+$/, "") + "\n" } };
}

export function normalizePath(p: string): string {
  return p.startsWith("/") ? p : "/" + p;
}

function cleanBody(body: string): string {
  // Remove leading newline and accidental markdown fences
  let out = body.replace(/^\r?\n/, "");
  out = out.replace(/^```[a-zA-Z]*\r?\n/, "").replace(/\r?\n```\s*$/, "");
  return out.replace(/\s+$/, "") + "\n";
}
