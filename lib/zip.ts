import JSZip from "jszip";

/**
 * Extra files that turn the generated code into a project you can run locally
 * with `npm install && npm run dev`. Only added when the project does not
 * already contain a file with the same name.
 */
function scaffold(appName: string): Record<string, string> {
  return {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
  </body>
</html>
`,
    "package.json": JSON.stringify(
      {
        name: appName,
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          "lucide-react": "latest",
          "react-icons": "latest",
          "framer-motion": "latest",
        },
        devDependencies: {
          "@types/react": "^18.3.3",
          "@types/react-dom": "^18.3.0",
          "@vitejs/plugin-react": "^4.3.2",
          typescript: "^5.5.4",
          vite: "^5.4.8",
        },
      },
      null,
      2
    ),
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`,
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          lib: ["DOM", "DOM.Iterable", "ES2020"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["**/*.ts", "**/*.tsx"],
      },
      null,
      2
    ),
    "README.md": `# ${appName}

Generated with CodeGen Builder.

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
  };
}

/** Packs the project into a .zip and starts the browser download. */
export async function downloadProjectZip(files: Record<string, string>, appName = "my-app") {
  const zip = new JSZip();
  const root = zip.folder(appName)!;

  const written = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    const clean = path.replace(/^\/+/, "");
    root.file(clean, content);
    written.add(clean);
  }
  for (const [path, content] of Object.entries(scaffold(appName))) {
    if (!written.has(path)) root.file(path, content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${appName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
