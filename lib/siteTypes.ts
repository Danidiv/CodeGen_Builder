/** Words that point at each kind of website. Used to notice "build all of these" requests. */
const PATTERNS: Record<string, RegExp> = {
  ecommerce: /e-?commerce|online (store|shop)|\bstore\b|\bshop\b/i,
  business: /business|corporate|company website/i,
  blog: /\bblog/i,
  portfolio: /portfolio/i,
  elearning: /e-?learning|educational|\bcourses?\b|\blms\b/i,
  saas: /\bsaas\b/i,
};

/**
 * Text that only gives examples or fills in a template does not count:
 * "[e.g., E-commerce, SaaS, Portfolio]" or "for example a blog".
 */
function withoutExamples(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\(\s*(e\.g\.|eg|for example|such as)[^)]*\)/gi, " ")
    .replace(/\b(e\.g\.|for example|such as)[^\n.;]*/gi, " ");
}

/** Which site types does the message ask for? */
export function detectSiteTypes(text: string): string[] {
  const t = withoutExamples(text);
  return Object.keys(PATTERNS).filter((id) => PATTERNS[id].test(t));
}

/** True when the message asks for several different websites at once. */
export function isMultiSiteRequest(text: string): boolean {
  // A long, detailed brief describes ONE site (its sections can mention shop, blog, ...).
  if (text.length > 600) return false;
  return detectSiteTypes(text).length >= 3;
}
