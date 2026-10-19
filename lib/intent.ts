/**
 * Decides whether a message is a request to BUILD or CHANGE the project, or just talk.
 * "hi", "thanks", "what can you do?" must not make the AI generate an app.
 * Words in English and Roman Urdu. When unsure, the message is treated as a build request.
 */
const BUILD_VERBS =
  /\b(build|create|make|add|change|update|remove|delete|fix|edit|replace|redesign|design|generate|write|implement|insert|modify|rename|move|resize|style|improve|convert|clone|banao|banana|bana\s+do|bana\s+dein|badlo|badal\s+do|badal\s+dein|hatao|hata\s+do|lagao|laga\s+do|dalo|daal\s+do|add\s+karo|change\s+karo|update\s+karo|fix\s+karo)\b/i;

const APP_NOUNS =
  /\b(app|apps|website|web\s?site|site|page|landing|dashboard|store|shop|blog|portfolio|todo|to-do|saas|section|navbar|header|footer|hero|button|form|colou?rs?|dark\s?mode|theme|layout|component|ui|ux|pricing|cart|login|chart|table|image|images|logo|font|calculator|game|clone)\b/i;

/** Info-seeking questions ("how do I...?") are talk even when they mention a site or a verb. */
const INFO_QUESTION = /^(what|how|why|when|where|which|who|kaise|kese|kyun|kyu|kab|kaun|kahan|kitna|konsa)\b/i;
/** "Can you / kya aap ... sakte ho?" about abilities, without a build verb. */
const ABILITY_QUESTION = /\b(can you|could you|sakte|sakta|sakti)\b/i;

const QUESTION_START =
  /^(what|how|why|when|where|which|who|can|could|is|are|do|does|will|should|kya|kaise|kese|kyun|kyu|kab|kaun|kahan|kaisa|kitna|konsa)\b/i;

/** Only a greeting, thanks, or a question about the assistant itself: answered without calling the AI. */
const SMALL_TALK =
  /^(hi+|hii+|hello+|hey+|hola|salam|salaam|assalam[\w\s-]*|aoa|good\s+(morning|evening|afternoon|night)|thanks?(\s+you)?|thank\s+u|thanx|shukriya|shukria|ok(ay)?|okk+|theek\s+hai|thik\s+hai|acha|achha|accha|cool|nice|great|bye|good\s+bye|kya\s+hal\s+hai|kaise\s+ho|how\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do|what\s+do\s+you\s+do|tum\s+kaun\s+ho|aap\s+kaun\s+ho|help|help\s+me|test|testing)$/i;

export type Intent = "build" | "smalltalk" | "chat";

export function classifyIntent(text: string): Intent {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "chat";
  const plain = t.replace(/[^\w\s-]/g, "").trim();

  if (SMALL_TALK.test(plain)) return "smalltalk";
  if (t.endsWith("?") && INFO_QUESTION.test(t)) return "chat";
  if (BUILD_VERBS.test(t)) return "build";
  if (t.endsWith("?") && ABILITY_QUESTION.test(t)) return "chat";
  if (APP_NOUNS.test(t)) return "build";
  if (t.endsWith("?") || QUESTION_START.test(t)) return "chat";
  if (plain.split(" ").length <= 3) return "chat"; // "coffee", "kuch bhi": ask what they want
  return "build";
}

/** The free answer for small talk (no AI call). */
export function smallTalkReply(text: string): string {
  const t = text.toLowerCase();
  if (/thank|shukr|thanx/.test(t)) return "You are welcome! Tell me what to build or change next. 🙂";
  if (/\bbye\b/.test(t)) return "Bye! Your project is saved, come back anytime.";
  return (
    "Hi! I can build a website or app from your description. For example:\n" +
    "• Build a landing page for a coffee shop\n" +
    "• Add a pricing section\n" +
    "• Make it dark mode\n" +
    "You can also pick a template, choose a style, or attach a reference image with the 📎 button."
  );
}
