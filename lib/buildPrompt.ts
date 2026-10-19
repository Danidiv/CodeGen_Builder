import { isMultiSiteRequest } from "./siteTypes";
import { classifyIntent } from "./intent";
import { Attachment, describeTextAttachments } from "./attachments";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Requests that only carry an error message are noise for later turns. */
function isErrorFixRequest(text: string): boolean {
  return text.startsWith("[Auto-fix") || text.startsWith("The preview shows this error");
}

/**
 * Builds ONE user message for the model: the current project files, a short
 * list of earlier requests (for context only), and the new request.
 *
 * We deliberately do NOT send earlier assistant turns. In the UI those are
 * stored as one-line summaries without code, and small models copy that
 * pattern: they answer with one sentence and never output any files.
 */
export function buildUserPrompt(messages: ChatMessage[], files: Record<string, string>, style = "", attachments: Attachment[] = []): string {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);
  const request = userTexts[userTexts.length - 1] ?? "";

  const previous = userTexts
    .slice(0, -1)
    .filter((t) => !isErrorFixRequest(t) && !isMultiSiteRequest(t) && classifyIntent(t) === "build")
    .slice(-5)
    .map((t) => "- " + (t.length > 200 ? t.slice(0, 200) + "..." : t));

  const currentFiles = Object.entries(files)
    .map(([path, content]) => `<file path="${path}">\n${content}</file>`)
    .join("\n");

  const parts = [`CURRENT PROJECT FILES:\n${currentFiles}`];
  if (previous.length > 0) {
    parts.push(`EARLIER REQUESTS (already done, for context only):\n${previous.join("\n")}`);
  }
  const attachedText = describeTextAttachments(attachments);
  if (attachedText) parts.push(attachedText);
  const imageCount = attachments.filter((a) => a.kind === "image").length;
  if (imageCount > 0) {
    parts.push(
      `REFERENCE IMAGE${imageCount > 1 ? "S" : ""}: the user attached ${imageCount} image${imageCount > 1 ? "s" : ""} to this message. ` +
        `Use them as a visual reference: match the layout, section structure, colour palette, typography feel and spacing. ` +
        `Do not copy logos, brand names or exact text from them. Images cannot be reused as files; keep using the allowed image URLs.`
    );
  }
  parts.push(
    `NEW REQUEST:\n${request}\n\n` +
      (style ? `DESIGN STYLE: ${style}\n\n` : "") +
      `Apply the new request to the current files. Keep everything that already exists unless the request says to remove or change it. ` +
      `Reply with one short sentence, then either the COMPLETE updated file(s) in <file path="..."> blocks, ` +
      `or, for a small change of a few lines, <edit> blocks with <find> and <replace>.`
  );
  return parts.join("\n\n");
}
