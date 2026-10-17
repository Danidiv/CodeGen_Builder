/** Words that point at each kind of website. Used to notice "build all of these" requests. */
const PATTERNS: Record<string, RegExp> = {
  ecommerce: /e-?commerce|online (store|shop)|\bstore\b|\bshop\b/i,
  business: /business|corporate|company website/i,
  blog: /\bblog/i,
  portfolio: /portfolio/i,
  elearning: /e-?learning|educational|\bcourses?\b|\blms\b/i,
  saas: /\bsaas\b/i,
};

/** Which site types does the message ask for? */
export function detectSiteTypes(text: string): string[] {
  return Object.keys(PATTERNS).filter((id) => PATTERNS[id].test(text));
}

/** True when the message asks for several different websites at once. */
export function isMultiSiteRequest(text: string): boolean {
  return detectSiteTypes(text).length >= 3;
}
