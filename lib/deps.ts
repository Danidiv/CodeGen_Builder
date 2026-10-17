/**
 * Which npm packages the preview must load.
 *
 * The preview bundler downloads and prepares every listed package before the
 * first render. Big packages (react-icons has thousands of files) make that
 * slow and can end in a "TIME_OUT" error, so optional packages are added only
 * when a project file really imports them.
 */
const OPTIONAL_PACKAGES = ["react-icons", "framer-motion"];

export function detectDependencies(files: Record<string, string>): Record<string, string> {
  const deps: Record<string, string> = { "lucide-react": "latest" };
  const code = Object.values(files).join("\n");

  for (const pkg of OPTIONAL_PACKAGES) {
    const used = new RegExp(`(?:from|import)\\s*['"]${pkg}(?:/[^'"]*)?['"]|require\\(\\s*['"]${pkg}`);
    if (used.test(code)) deps[pkg] = "latest";
  }
  return deps;
}
