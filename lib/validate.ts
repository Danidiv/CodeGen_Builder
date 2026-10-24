import { backendFiles } from "./backend";

type Files = Record<string, string>;

/**
 * Quick sanity check of the files a model returned, compared with the project
 * before the request. Returns a short reason when the result looks broken
 * (so the app can ask the model again), or null when it looks fine.
 */
export function checkResult(base: Files, next: Files): string | null {
  const app = next["/App.tsx"];
  if (app !== undefined && !/export\s+default/.test(app)) {
    return "/App.tsx has no default export, so it is incomplete or cut off.";
  }

  for (const [path, content] of Object.entries(next)) {
    const old = base[path];
    if (old && old.length > 800 && content.length < old.length * 0.5) {
      return `${path} became less than half as long as before, so existing content was lost. Keep ALL existing code and only add or change what was asked.`;
    }
  }

  // Imports are checked against the whole project as it will look after the change.
  // The NEXA backend files exist at run time, so imports of "./nexa" are fine.
  return checkImports({ ...backendFiles(null), ...base, ...next }, Object.keys(next));
}

// ---------------------------------------------------------------------------
// Import checks: the usual cause of "Element type is invalid ... undefined"
// ---------------------------------------------------------------------------

const CODE_FILE_RE = /\.(tsx?|jsx?)$/;
const ASSET_RE = /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|ico|json|md)$/i;
const CODE_EXTS = [".tsx", ".ts", ".jsx", ".js"];

/** Brand icons that lucide-react does not provide (removed in newer versions). */
const BRAND_ICONS = new Set([
  "Instagram",
  "Facebook",
  "Twitter",
  "Youtube",
  "Github",
  "Gitlab",
  "Linkedin",
  "Slack",
  "Twitch",
  "Dribbble",
  "Figma",
  "Framer",
  "Chrome",
  "Codepen",
  "Codesandbox",
  "Trello",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resolves "./x" or "../x" (imported from `from`) to an existing project file. */
function resolveImport(from: string, spec: string, files: Files): string | null {
  const dir = from.slice(0, from.lastIndexOf("/"));
  const out: string[] = [];
  for (const part of (dir + "/" + spec).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  const base = "/" + out.join("/");
  const candidates = [
    base,
    ...CODE_EXTS.map((e) => base + e),
    ...CODE_EXTS.map((e) => base + "/index" + e),
  ];
  return candidates.find((c) => c in files) ?? null;
}

function exportsName(code: string, name: string): boolean {
  if (/export\s*\*\s*from/.test(code)) return true; // re-exports: cannot tell, assume fine
  const n = escapeRe(name);
  const declared = new RegExp(
    `export\\s+(?:declare\\s+)?(?:async\\s+)?(?:const|let|var|function\\*?|class|interface|type|enum)\\s+${n}\\b`
  );
  const listed = new RegExp(`export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`);
  return declared.test(code) || listed.test(code);
}

/** Returns a problem description, or null when every import in `importers` resolves. */
export function checkImports(files: Files, importers: string[]): string | null {
  // clause = what is imported, spec = where from. No quotes/semicolons in the
  // clause, so a side-effect import like  import "./a.css";  cannot be swallowed.
  const importRe = /import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/g;

  for (const path of importers) {
    const code = files[path];
    if (code === undefined || !CODE_FILE_RE.test(path)) continue;

    for (const m of code.matchAll(importRe)) {
      const clause = m[1].trim();
      const spec = m[2];
      if (/^type\s/.test(clause)) continue; // type-only imports vanish at build time

      const braces = clause.match(/\{([\s\S]*?)\}/);
      const named = braces
        ? braces[1]
            .split(",")
            .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
            .filter(Boolean)
        : [];
      const rest = clause.replace(/\{[\s\S]*?\}/, "").replace(/,/g, " ").trim();
      const hasDefault = rest !== "" && !rest.startsWith("*");

      if (spec === "lucide-react") {
        const bad = named.filter((n) => BRAND_ICONS.has(n));
        if (bad.length > 0) {
          return `${path} imports ${bad.join(", ")} from "lucide-react", but lucide-react has no brand icons, so they are undefined and crash the page. Use other icons instead (Globe, Share2, Mail, Camera, Phone, MapPin) or plain text.`;
        }
        continue;
      }

      if (!spec.startsWith("./") && !spec.startsWith("../")) continue; // npm package
      if (ASSET_RE.test(spec)) continue;

      const target = resolveImport(path, spec, files);
      if (!target) {
        return `${path} imports "${spec}" but that file was not provided. Either output that file too, or define the component inside the file that uses it.`;
      }

      const targetCode = files[target];
      if (hasDefault && !/export\s+default\b/.test(targetCode)) {
        return `${path} imports a default export from "${spec}", but ${target} has no "export default". Use a matching import style.`;
      }
      for (const name of named) {
        if (!exportsName(targetCode, name)) {
          return `${path} imports { ${name} } from "${spec}", but ${target} does not export "${name}" (maybe it is a default export, or the name differs).`;
        }
      }
    }
  }
  return null;
}
