/**
 * Simple safety rules for what may be published under a public link.
 * Login pages and card forms are the most common phishing shape, so a published
 * site may not contain a password field or card security code field.
 * (It can still be built, previewed and downloaded; only publishing is refused.)
 */
const RULES: { test: RegExp; what: string }[] = [
  { test: /type\s*=\s*["'{]\s*["']?password/i, what: "a password field" },
  { test: /autoComplete\s*=\s*["'](?:current|new)-password["']/i, what: "a password field" },
  { test: /\b(?:cvv|cvc|card\s*security\s*code)\b/i, what: "a card security code (CVV) field" },
];

/** Returns a message when the files may not be published, or null when they are fine. */
export function checkPublishable(files: Record<string, string>): string | null {
  for (const [path, code] of Object.entries(files)) {
    for (const rule of RULES) {
      if (rule.test.test(code)) {
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
