"use client";

import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import { SandpackCodeEditor, useSandpack } from "@codesandbox/sandpack-react";
import { useEffect, useRef, useState } from "react";

/** Same Monaco version everywhere; loaded from the CDN the first time the Code tab opens. */
const MONACO_VERSION = "0.52.2";
loader.config({ paths: { vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs` } });

function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

/** Colours taken from the app's own tokens so the editor looks like part of the page. */
function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme("nexa-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0b0d12",
      "editor.lineHighlightBackground": "#171b2480",
      "editorLineNumber.foreground": "#4b5262",
      "editorLineNumber.activeForeground": "#9aa3b5",
      "editorGutter.background": "#0b0d12",
      "editor.selectionBackground": "#4f46e540",
      "editorCursor.foreground": "#818cf8",
      "editorIndentGuide.background1": "#ffffff10",
      "scrollbarSlider.background": "#ffffff14",
      "scrollbarSlider.hoverBackground": "#ffffff24",
    },
  });
}

function configureLanguages(monaco: Monaco) {
  const ts = monaco.languages.typescript;
  const options = {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    allowJs: true,
  };
  ts.typescriptDefaults.setCompilerOptions(options);
  ts.javascriptDefaults.setCompilerOptions(options);
  // The editor does not know the project's packages, so type errors would be noise.
  // Syntax errors are still underlined; real compile errors come from the preview.
  const diagnostics = { noSemanticValidation: true, noSuggestionDiagnostics: true, noSyntaxValidation: false };
  ts.typescriptDefaults.setDiagnosticsOptions(diagnostics);
  ts.javascriptDefaults.setDiagnosticsOptions(diagnostics);
}

/**
 * Code tab editor (Monaco). Reads and writes the files through Sandpack, so everything
 * else (live preview, saving, history) keeps working exactly as before.
 * If Monaco cannot load (offline, blocked CDN) the old Sandpack editor is shown instead.
 */
export default function CodeEditor({ readOnly = false }: { readOnly?: boolean }) {
  const { sandpack } = useSandpack();
  const [failed, setFailed] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  useEffect(() => {
    let alive = true;
    loader.init().catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const path = sandpack.activeFile;
  const code = sandpack.files[path]?.code ?? "";

  // Switching files in the explorer should not leave the cursor in a stale view.
  useEffect(() => {
    editorRef.current?.focus?.();
  }, [path]);

  if (failed) {
    return <SandpackCodeEditor showLineNumbers style={{ height: "100%", flex: 1 }} />;
  }

  return (
    <div style={{ height: "100%", flex: 1, minWidth: 0 }}>
      <Editor
        height="100%"
        // One model per file: undo history and scroll position stay with each file.
        path={path}
        language={languageOf(path)}
        value={code}
        theme="nexa-dark"
        beforeMount={(monaco) => {
          defineTheme(monaco);
          configureLanguages(monaco);
        }}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
        onChange={(value) => {
          if (readOnly || value === undefined) return;
          if (value !== sandpack.files[path]?.code) sandpack.updateFile(path, value);
        }}
        loading={<div className="flex h-full items-center justify-center text-sm text-white/50">Loading editor...</div>}
        options={{
          readOnly,
          fontSize: 13,
          lineHeight: 20,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontLigatures: false,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          wordWrap: "on",
          renderLineHighlight: "line",
          smoothScrolling: true,
          padding: { top: 12, bottom: 12 },
          bracketPairColorization: { enabled: true },
          formatOnPaste: true,
          overviewRulerLanes: 0,
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        }}
      />
    </div>
  );
}
