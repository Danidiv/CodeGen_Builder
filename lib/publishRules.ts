/**
 * Simple safety rules for what may be published under a public link.
 * Login pages and card forms are the most common phishing shape, so a published
 * site may not contain a password field or card security code field.
 * (It can still be built, previewed and downloaded; only publishing is refused.)
 *
 * Exception: a password field is allowed when the site uses the built-in visitor accounts
 * (auth.signIn / auth.signUp from "./nexa"): the password then goes only to our own database
 * (stored hashed, the site owner never sees it). To keep that safe the same site may not contain any
 * other way to send data out (submitForm, fetch, XMLHttpRequest, form actions, ...).
 */
const RULES: { test: RegExp; what: string }[] = [
  { test: /type\s*=\s*["'{]\s*["']?password/i, what: "a password field" },
  { test: /autoComplete\s*=\s*["'](?:current|new)-password["']/i, what: "a password field" },
  { test: /\b(?:cvv|cvc|card\s*security\s*code)\b/i, what: "a card security code (CVV) field" },
];

const PASSWORD_RULE_COUNT = 2; // the first two RULES are about passwords

const SENDS_DATA_OUT = [
  /\bsubmitForm\s*\(/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bsendBeacon\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /<form\b[^>]*\baction\s*=/i,
  /\bimport\s*\(/,
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
];

/** True when the site's passwords can only go to the built-in accounts (see the note at the top). */
export function usesOnlyBuiltInAuth(files: Record<string, string>): boolean {
  const all = Object.entries(files)
    .filter(([path]) => !/^\/nexa(-config)?\.ts$/.test(path))
    .map(([, code]) => code)
    .join("\n");
  const imports = /from\s+['"][./]*\/?nexa['"]/.test(all);
  const signs = /\bauth\s*\.\s*(signIn|signUp)\s*\(/.test(all);
  return imports && signs && !SENDS_DATA_OUT.some((re) => re.test(all));
}

/** Returns a message when the files may not be published, or null when they are fine. */
export function checkPublishable(files: Record<string, string>): string | null {
  const passwordsOk = usesOnlyBuiltInAuth(files);
  for (const [path, code] of Object.entries(files)) {
    for (let i = 0; i < RULES.length; i++) {
      const rule = RULES[i];
      if (i < PASSWORD_RULE_COUNT && passwordsOk) continue;
      if (rule.test.test(code)) {
        if (i < PASSWORD_RULE_COUNT && /\bauth\s*\.\s*(signIn|signUp)\s*\(/.test(Object.values(files).join("\n"))) {
          return (
            `${path} has a password field, and this site also sends data out in another way (submitForm, fetch, a form action...). ` +
            `A login with passwords is only allowed with the built-in accounts (auth.signIn / auth.signUp) and no other way of sending data. ` +
            `Remove the other way of sending data (or the contact form) and publish again.`
          );
        }
        return (
          `${path} contains ${rule.what}. Public sites cannot contain password or card-code fields, ` +
          `because such pages are often used to steal data. Remove it (use a demo form without it) and publish again.`
        );
      }
    }
  }
  return null;
}

export const REPORT_REASONS = [
  "Phishing or scam",
  "Pretends to be another company or person",
  "Illegal or harmful content",
  "Adult content",
  "Other",
] as const;
