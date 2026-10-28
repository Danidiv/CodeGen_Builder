"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Chat, { UiMessage } from "@/components/Chat";
import Preview from "@/components/Preview";
import Toolbar, { type Device } from "@/components/Toolbar";
import Header, { type Tab } from "@/components/Header";
import HistoryDrawer from "@/components/HistoryDrawer";
import InboxDrawer from "@/components/InboxDrawer";
import EmptyState from "@/components/EmptyState";
import { THEMES, THEME_KEY, themeBg } from "@/components/themes";
import { computeThumb } from "@/lib/thumb";
import { AlertCircle, MessageSquare, Monitor, Wrench } from "lucide-react";
import AuthForm from "@/components/AuthForm";
import NewPassword from "@/components/NewPassword";
import ProjectsBar, { LocalName, SaveState } from "@/components/ProjectsBar";
import { DEFAULT_FILES } from "@/lib/prompts";
import { parseFiles } from "@/lib/parseFiles";
import { EmptyReason, interpretResponse } from "@/lib/interpret";
import { errorHint } from "@/lib/errorHints";
import { ERROR_MARKER } from "@/lib/protocol";
import { downloadProjectZip } from "@/lib/zip";
import { getStyle } from "@/lib/styles";
import { classifyIntent, smallTalkReply } from "@/lib/intent";
import { hasImageRefs, resolveImages, type Fetcher } from "@/lib/imageRefs";
import PublishBar from "@/components/PublishBar";
import FeedbackModal from "@/components/FeedbackModal";
import LimitPrompt from "@/components/LimitPrompt";
import type { Attachment } from "@/lib/attachments";
import { TEMPLATES, getTemplate } from "@/lib/templates";
import { isMultiSiteRequest } from "@/lib/siteTypes";
import { BRIEF_SEP, extractUrl } from "@/lib/urlRef";
import { MAX_VERSIONS, Version, makeVersion } from "@/lib/versions";
import { supabase } from "@/lib/supabase";
import { buildMeta, track } from "@/lib/track";
import {
  DEFAULT_PROJECT_NAME,
  ProjectData,
  ProjectMeta,
  createProject,
  deleteProject,
  deriveName,
  renameProject,
  listProjects,
  loadProject,
  saveProject,
  serializeData,
} from "@/lib/projects";

const STORAGE_KEY = "codegen-project-v1";
const MAX_AUTO_FIXES = 2;
const AUTO_FIX_DELAY_MS = 2500;
const CHAT_DEFAULT_W = 400;
const CHAT_MIN_W = 300;
const CHAT_WIDTH_KEY = "codegen-chat-w";
const NAME_KEY = "codegen-name";

// Shown when even the second try gave nothing usable (nothing was changed).
const EMPTY_WARNINGS: Record<EmptyReason, string> = {
  toolCall:
    "⚠️ This model answered with a tool call instead of code (even after a second try), so nothing changed. " +
    "Press Try again, or use a stronger model (for example through OpenRouter) in .env.local.",
  noCode:
    "⚠️ The model did not return any code (even after a second try), so nothing changed. " +
    "Press Try again, ask more specifically, or use a stronger model in .env.local.",
  unchanged:
    "⚠️ The model sent back the same code (even after a second try), so nothing changed. " +
    "Press Try again or describe the change more specifically.",
  badEdits:
    "⚠️ The model's small edits did not match your code (even after a second try), so nothing changed. " +
    "Press Try again.",
  cutOff:
    "⚠️ The model's answer was cut off (even after a second try), so nothing changed. " +
    "Press Try again. A larger context length in LM Studio can help.",
  tooLong:
    "⚠️ The model ran out of space while writing (even after a shorter second try), so nothing changed. " +
    "In LM Studio raise the model's Context Length to 16384 or more (then reload the model) and switch " +
    "thinking off if it has that option. Then press Try again.",
};

const LENGTH_RE = /\n?\[LENGTH_LIMIT\]\s*$/;

// What to show while the answer is coming in.
function progressStatus(raw: string, openFile: string | null): string {
  if (openFile) return `Writing ${openFile}...`;
  const open = raw.lastIndexOf("<think>");
  if (open > raw.lastIndexOf("</think>")) {
    // The model is still reasoning (this part is hidden from the chat).
    const tokens = Math.max(1, Math.round((raw.length - open - 7) / 4));
    return `Thinking... (about ${tokens} tokens so far)`;
  }
  const visible = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "");
  if (/<edit\b/.test(visible)) return "Preparing changes...";
  return visible.trim() ? "Writing the answer..." : "Thinking...";
}

type Files = Record<string, string>;
type History = { versions: Version[]; active: number };

// Sandpack sometimes wraps the real error in a confusing
// "Cannot assign to read only property 'message' of object '...'" TypeError.
// Show (and send to the model) only the real error.
function cleanError(message: string): string {
  const m = message.match(/^Cannot assign to read only property 'message' of object '([\s\S]*?)'?\s*$/);
  return m ? m[1] : message;
}

// Always use the latest /index.tsx so old saved projects get new fixes.
function withLatestIndex(files: Files): Files {
  return { ...files, "/index.tsx": DEFAULT_FILES["/index.tsx"] };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

function initialHistory(): History {
  return { versions: [makeVersion("Start", DEFAULT_FILES)], active: 0 };
}

export default function Home() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [files, setFiles] = useState<Files>(DEFAULT_FILES);
  const [history, setHistory] = useState<History>(initialHistory);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [autoFix, setAutoFix] = useState(true);
  const [styleId, setStyleId] = useState("auto");
  // Files attached to the message being answered (kept so "Try again" sends them again).
  const attachRef = useRef<Attachment[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // UI-only state (layout, view, drawers).
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [fullscreen, setFullscreen] = useState(false);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT_W);
  const rowRef = useRef<HTMLDivElement>(null);
  const [bgTheme, setBgTheme] = useState("aurora");
  // "home" = start page with all projects; "project" = the editor.
  const [view, setViewState] = useState<"home" | "project">("project");
  // Remember where the person is for this tab: a refresh keeps the start page (or the project),
  // and a fresh sign-in always starts on the start page.
  function setView(v: "home" | "project") {
    setViewState(v);
    try {
      sessionStorage.setItem("nexa-view", v);
    } catch {
      // ignore
    }
  }
  useEffect(() => {
    if (!supabase) return;
    try {
      setViewState(sessionStorage.getItem("nexa-view") === "project" ? "project" : "home");
    } catch {
      setViewState("home");
    }
  }, []);
  const [pending, setPending] = useState<{ text: string; files: Attachment[] } | null>(null);

  // Cloud (Supabase) state. Without Supabase config none of this is used and the
  // app works in "local mode" (no login, project kept in this browser).
  const cloud = supabase !== null;
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!cloud);
  // True after the person opened the link of the "reset password" email.
  const [recovering, setRecovering] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Today's AI requests (cloud mode only): { used, limit }, limit 0 = unlimited.
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const lastSavedRef = useRef(""); // what is currently stored in the database
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = projectId;
  const userId = session?.user.id ?? null;

  // Auto-fix bookkeeping (refs so they never cause re-renders or stale closures).
  const attemptsRef = useRef(0);
  // Auto-fix only starts after the AI finished a generation in this session,
  // so opening the page with an old broken project never triggers a request.
  const armedRef = useRef(false);
  const fixRef = useRef<(auto: boolean) => void>(() => {});
  // The request that is running right now (so the Stop button can cancel it).
  const abortRef = useRef<AbortController | null>(null);
  // Goes up every time the AI finishes or a version is restored; the preview uses it to repaint.
  const [settledTick, setSettledTick] = useState(0);

  const handlePreviewError = useCallback((message: string | null) => {
    setPreviewError(message ? cleanError(message) : null);
  }, []);

  // Remember the chat panel width.
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(CHAT_WIDTH_KEY));
      if (w >= CHAT_MIN_W && w <= 900) setChatWidth(w);
      const bgSaved = localStorage.getItem(THEME_KEY);
      if (bgSaved && THEMES.some((t) => t.id === bgSaved)) setBgTheme(bgSaved);
      if (!supabase) {
        const n = localStorage.getItem(NAME_KEY);
        if (n) setProjectName(n);
      }
    } catch {
      // ignore
    }
  }, []);

  // Esc leaves fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [fullscreen]);

  function changeBgTheme(id: string) {
    setBgTheme(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // ignore
    }
  }

  function clampChatWidth(w: number): number {
    const total = rowRef.current?.clientWidth ?? 1200;
    return Math.round(Math.min(Math.max(w, CHAT_MIN_W), Math.max(CHAT_MIN_W, Math.min(720, total - 360))));
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const left = rowRef.current?.getBoundingClientRect().left ?? 0;
    let last = chatWidth;
    const move = (ev: PointerEvent) => {
      last = clampChatWidth(ev.clientX - left);
      setChatWidth(last);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      try {
        localStorage.setItem(CHAT_WIDTH_KEY, String(last));
      } catch {
        // ignore
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  function resizeByKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = clampChatWidth(chatWidth + (e.key === "ArrowRight" ? 16 : -16));
    setChatWidth(next);
    try {
      localStorage.setItem(CHAT_WIDTH_KEY, String(next));
    } catch {
      // ignore
    }
  }

  // A prompt typed on the start page while another project was open: it waits here until the
  // new blank project is on screen, then it is sent (so the old project is never touched).
  useEffect(() => {
    if (!pending || loading) return;
    const blank = messages.length === 0 && files["/App.tsx"] === DEFAULT_FILES["/App.tsx"];
    const task = pending;
    setPending(null);
    if (!blank) return; // the new project could not be created
    setView("project");
    handleSend(task.text, undefined, [], task.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Remember the chosen design style.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("codegen-style");
      if (saved && getStyle(saved)) setStyleId(saved);
    } catch {
      // ignore
    }
  }, []);

  // Load the saved project once when the page opens.
  useEffect(() => {
    if (supabase) return; // cloud mode loads from the database instead
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.files && Object.keys(saved.files).length > 0) {
          const f = withLatestIndex(saved.files);
          setFiles(f);
          if (Array.isArray(saved.versions) && saved.versions.length > 0 && typeof saved.active === "number") {
            setHistory({
              versions: saved.versions,
              active: Math.min(Math.max(saved.active, 0), saved.versions.length - 1),
            });
          } else {
            setHistory({ versions: [makeVersion("Restored project", f)], active: 0 });
          }
        }
        if (Array.isArray(saved.messages)) setMessages(saved.messages);
        if (typeof saved.autoFix === "boolean") setAutoFix(saved.autoFix);
      }
    } catch {
      // ignore corrupted or blocked storage
    }
    setHydrated(true);
  }, []);

  // Save after every finished change (not while the AI is still streaming).
  useEffect(() => {
    if (supabase || !hydrated || loading) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ files, messages, versions: history.versions, active: history.active, autoFix })
      );
    } catch {
      // Storage full: keep only the 5 newest versions and try once more.
      try {
        const keep = history.versions.slice(-5);
        const active = Math.max(0, history.active - (history.versions.length - keep.length));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, messages, versions: keep, active, autoFix }));
      } catch {
        // storage blocked
      }
    }
  }, [files, messages, history, autoFix, hydrated, loading]);

  // ---- Cloud mode (Supabase) ------------------------------------------------

  function blankData(): ProjectData {
    const h = initialHistory();
    return { files: DEFAULT_FILES, messages: [], versions: h.versions, active: h.active };
  }

  // Put a project that came from the database onto the screen.
  function applyProject(meta: { id: string; name: string }, data: Partial<ProjectData>) {
    const f = withLatestIndex(data.files && Object.keys(data.files).length > 0 ? data.files : DEFAULT_FILES);
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    const versions =
      Array.isArray(data.versions) && data.versions.length > 0
        ? data.versions
        : [makeVersion("Restored project", f)];
    const wanted = typeof data.active === "number" ? data.active : versions.length - 1;
    const active = Math.min(Math.max(wanted, 0), versions.length - 1);

    setFiles(f);
    setMessages(msgs);
    setHistory({ versions, active });
    setProjectId(meta.id);
    setProjectName(meta.name);
    setPreviewError(null);
    setSaveState("idle");
    attemptsRef.current = 0;
    armedRef.current = false;
    lastSavedRef.current = serializeData({ files: f, messages: msgs, versions, active });
    setHydrated(true);
  }

  // A project saved in this browser before cloud mode existed (imported once).
  function readLocalProject(): ProjectData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved.files) return null;
      const hasWork =
        (Array.isArray(saved.messages) && saved.messages.length > 0) ||
        saved.files["/App.tsx"] !== DEFAULT_FILES["/App.tsx"];
      if (!hasWork) return null;
      const f = withLatestIndex(saved.files);
      const versions =
        Array.isArray(saved.versions) && saved.versions.length > 0
          ? saved.versions
          : [makeVersion("Restored project", f)];
      const wanted = typeof saved.active === "number" ? saved.active : versions.length - 1;
      return {
        files: f,
        messages: Array.isArray(saved.messages) ? saved.messages : [],
        versions,
        active: Math.min(Math.max(wanted, 0), versions.length - 1),
      };
    } catch {
      return null;
    }
  }

  // Follow the login state.
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    sb.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(() => setAuthReady(true));
    // The reset-password link comes back with #...type=recovery: ask for the new password first.
    try {
      if (/type=recovery/.test(window.location.hash)) setRecovering(true);
    } catch {
      /* ignore */
    }
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // When a user signs in: load their projects. When they sign out: clear the screen.
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;

    if (!userId) {
      setProjects([]);
      setProjectId(null);
      setProjectName(DEFAULT_PROJECT_NAME);
      setFiles(DEFAULT_FILES);
      setMessages([]);
      setHistory(initialHistory());
      setPreviewError(null);
      setCloudError(null);
      setHydrated(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setCloudError(null);
        const list = await listProjects(sb);
        if (cancelled) return;

        if (list.length === 0) {
          // First login: bring over the old browser-only project if there is one.
          const local = readLocalProject();
          const data = local ?? blankData();
          const created = await createProject(sb, local ? "Imported project" : DEFAULT_PROJECT_NAME, data);
          if (cancelled) return;
          if (local) {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              // ignore
            }
          }
          setProjects([created]);
          applyProject(created, data);
        } else {
          const first = await loadProject(sb, list[0].id);
          if (cancelled) return;
          setProjects(list);
          if (first) applyProject(first.meta, first.data);
          else setCloudError("Could not open your project. Try reloading the page.");
        }
      } catch (err) {
        if (!cancelled) setCloudError(errMsg(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Autosave to the database 1.5 seconds after the last change.
  useEffect(() => {
    const sb = supabase;
    if (!sb || !projectId || !hydrated || loading) return;

    const data: ProjectData = { files, messages, versions: history.versions, active: history.active };
    const serialized = serializeData(data);
    if (serialized === lastSavedRef.current) return;

    const id = projectId;
    const name = deriveName(projectName, messages);
    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveProject(sb, id, name, data);
        lastSavedRef.current = serialized;
        setProjects((list) =>
          list.map((p) =>
            p.id === id ? { ...p, name, updated_at: new Date().toISOString(), thumb: computeThumb(files) } : p
          )
        );
        if (projectIdRef.current === id) {
          if (name !== projectName) setProjectName(name);
          setSaveState("saved");
        }
      } catch {
        if (projectIdRef.current === id) setSaveState("error");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [files, messages, history, projectId, projectName, hydrated, loading]);

  // Save right now (used before switching project or signing out).
  async function flushSave() {
    const sb = supabase;
    if (!sb || !projectId) return;
    const data: ProjectData = { files, messages, versions: history.versions, active: history.active };
    const serialized = serializeData(data);
    if (serialized === lastSavedRef.current) return;
    await saveProject(sb, projectId, deriveName(projectName, messages), data);
    lastSavedRef.current = serialized;
  }

  async function handleOpenProject(id: string) {
    const sb = supabase;
    if (!sb || loading || id === projectId) return;
    try {
      setCloudError(null);
      await flushSave();
      const p = await loadProject(sb, id);
      if (p) applyProject(p.meta, p.data);
      else setCloudError("That project no longer exists.");
    } catch (err) {
      setCloudError(errMsg(err));
    }
  }

  async function handleDeleteProject(id: string) {
    const sb = supabase;
    if (!sb || loading) return;
    const target = projects.find((p) => p.id === id);
    if (!window.confirm(`Delete "${target?.name ?? "this project"}"? This cannot be undone.`)) return;
    try {
      setCloudError(null);
      await deleteProject(sb, id);
      const rest = projects.filter((p) => p.id !== id);
      setProjects(rest);
      if (id !== projectId) return;

      // The open project was deleted: open another one, or start a fresh one.
      if (rest.length > 0) {
        const next = await loadProject(sb, rest[0].id);
        if (next) applyProject(next.meta, next.data);
      } else {
        const data = blankData();
        const created = await createProject(sb, DEFAULT_PROJECT_NAME, data);
        setProjects([created]);
        applyProject(created, data);
      }
    } catch (err) {
      setCloudError(errMsg(err));
    }
  }

  async function handleSignOut() {
    const sb = supabase;
    if (!sb || loading) return;
    try {
      await flushSave();
    } catch {
      // sign out anyway
    }
    await sb.auth.signOut();
    try {
      sessionStorage.removeItem("nexa-view");
    } catch {
      // ignore
    }
    setViewState("home");
  }

  // ---------------------------------------------------------------------------

  function pushVersion(label: string, newFiles: Files) {
    setHistory((h) => {
      let versions = [...h.versions.slice(0, h.active + 1), makeVersion(label, newFiles)];
      if (versions.length > MAX_VERSIONS) versions = versions.slice(-MAX_VERSIONS);
      return { versions, active: versions.length - 1 };
    });
  }

  /** The user typed in the Code tab: keep the files and record it in the history. */
  function handleManualEdit(edited: Files) {
    if (loading) return;
    setFiles(edited);
    setHistory((h) => {
      const last = h.versions[h.active];
      const onTop = h.active === h.versions.length - 1;
      // Keep typing in one "Manual edit" entry instead of creating one per pause.
      if (last && last.label === "Manual edit" && onTop) {
        const versions = [...h.versions];
        versions[h.active] = { ...last, files: { ...edited }, createdAt: Date.now() };
        return { versions, active: h.active };
      }
      let versions = [...h.versions.slice(0, h.active + 1), makeVersion("Manual edit", edited)];
      if (versions.length > MAX_VERSIONS) versions = versions.slice(-MAX_VERSIONS);
      return { versions, active: versions.length - 1 };
    });
  }

  function restoreVersion(index: number) {
    if (loading) return;
    const v = history.versions[index];
    if (!v) return;
    setFiles(withLatestIndex(v.files));
    setHistory((h) => ({ ...h, active: index }));
    setPreviewError(null);
    setSettledTick((n) => n + 1);
    armedRef.current = false; // no surprise auto-fix right after going back
  }

  // Show today's usage as soon as the user is signed in.
  const accessToken = session?.access_token ?? null;
  // Admins get a link to the dashboard; everybody else never sees it (the database decides, not this page).
  const [isAdmin, setIsAdmin] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useEffect(() => {
    const sb = supabase;
    if (!sb || !userId) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    Promise.resolve(sb.rpc("is_admin")).then(
      ({ data }) => {
        if (!cancelled) setIsAdmin(data === true);
      },
      () => {}
    );
    // One "login" mark per person and day: shows who comes back.
    try {
      const day = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem("nexa-login-day") !== day + userId) {
        localStorage.setItem("nexa-login-day", day + userId);
        track("login");
      }
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true;
    };
  }, [userId]);
  useEffect(() => {
    if (!cloud || !accessToken) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    fetch("/api/usage", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!cancelled && u && typeof u.used === "number") setUsage({ used: u.used, limit: u.limit });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cloud, accessToken]);

  // Rename the open project (saved to the database in cloud mode, to this browser in local mode).
  async function handleRename(name: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    const sb = supabase;
    if (!sb || !projectId) {
      setProjectName(clean);
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {
        // ignore
      }
      return;
    }
    const id = projectId;
    const old = projectName;
    setProjectName(clean);
    setProjects((list) => list.map((p) => (p.id === id ? { ...p, name: clean } : p)));
    try {
      await renameProject(sb, id, clean);
    } catch (err) {
      setProjectName(old);
      setProjects((list) => list.map((p) => (p.id === id ? { ...p, name: old } : p)));
      setCloudError(errMsg(err));
    }
  }

  async function handleNewProject() {
    if (loading) return;

    const sb = supabase;
    if (sb) {
      // Cloud mode: the old project stays saved, we just open a fresh one.
      try {
        setCloudError(null);
        await flushSave();
        const data = blankData();
        const created = await createProject(sb, DEFAULT_PROJECT_NAME, data);
        setProjects((list) => [created, ...list]);
        applyProject(created, data);
      } catch (err) {
        setCloudError(errMsg(err));
      }
      return;
    }

    if (!window.confirm("Start a new project? The current one will be cleared.")) return;
    setFiles(DEFAULT_FILES);
    setMessages([]);
    setHistory(initialHistory());
    setPreviewError(null);
    setProjectName(DEFAULT_PROJECT_NAME);
    try {
      localStorage.removeItem(NAME_KEY);
    } catch {
      // ignore
    }
    attemptsRef.current = 0;
    armedRef.current = false;
  }

  // Start page: open a project from the list.
  async function openFromHome(id: string) {
    if (id !== projectId) await handleOpenProject(id);
    setView("project");
  }

  // Start page: a prompt always starts a NEW project when another one is open.
  async function sendFromHome(text: string, f: Attachment[]) {
    if (isEmptyNow()) {
      setView("project");
      handleSend(text, undefined, messages, f);
      return;
    }
    await handleNewProject();
    setPending({ text, files: f });
  }

  function isEmptyNow(): boolean {
    return messages.length === 0 && files["/App.tsx"] === DEFAULT_FILES["/App.tsx"];
  }

  async function handleDownload() {
    try {
      await downloadProjectZip(files);
      track("download");
    } catch (err) {
      window.alert("Could not create the ZIP: " + (err instanceof Error ? err.message : "unknown error"));
    }
  }

  function runFix(auto: boolean) {
    if (!previewError || loading) return;
    let label = "Fix error";
    let prefix = "";
    if (auto) {
      attemptsRef.current += 1;
      label = `Auto-fix ${attemptsRef.current}/${MAX_AUTO_FIXES}`;
      prefix = `[${label}] `;
    }
    const hint = errorHint(previewError);
    handleSend(
      `${prefix}The preview shows this error. Fix it.${hint ? " " + hint : ""} Make sure every component you use is defined or imported, and output the full corrected files:\n\n${previewError}`,
      label
    );
  }
  fixRef.current = runFix;

  // Auto-fix: if the preview still shows an error a moment after the AI finished,
  // send the error back to the model (at most MAX_AUTO_FIXES times in a row).
  useEffect(() => {
    if (!autoFix || loading || !previewError || !armedRef.current) return;
    if (attemptsRef.current >= MAX_AUTO_FIXES) return;
    const t = setTimeout(() => fixRef.current(true), AUTO_FIX_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoFix, loading, previewError]);

  // Sends ONE request to the model and streams the answer into the UI.
  // `sendMessages` is what the model sees, `shown` is what the chat displays.
  // Returns the complete raw answer.
  async function streamOnce(
    sendMessages: UiMessage[],
    shown: UiMessage[],
    baseFiles: Files,
    signal: AbortSignal
  ): Promise<{ raw: string; truncated: boolean }> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (supabase) {
      // The server only answers signed-in users when Supabase is configured.
      const { data } = await supabase.auth.getSession();
      if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({ messages: sendMessages, files: baseFiles, style: styleId, attachments: attachRef.current }),
    });

    const usedHeader = res.headers.get("X-Usage-Used");
    const limitHeader = res.headers.get("X-Usage-Limit");
    if (usedHeader !== null && limitHeader !== null) setUsage({ used: Number(usedHeader), limit: Number(limitHeader) });

    if (!res.ok || !res.body) {
      throw new Error(await res.text());
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });

      const parsed = parseFiles(raw.replace(LENGTH_RE, ""));
      setMessages([...shown, { role: "assistant", content: parsed.message }]);
      setStatus(progressStatus(raw, parsed.openFile));

      // Only apply files that are fully written (not the one still streaming)
      const complete = { ...parsed.files };
      if (parsed.openFile) delete complete[parsed.openFile];
      if (Object.keys(complete).length > 0) {
        setFiles({ ...baseFiles, ...complete });
      }
    }

    if (raw.includes(ERROR_MARKER)) {
      throw new Error(raw.slice(raw.indexOf(ERROR_MARKER) + ERROR_MARKER.length).trim());
    }
    // The server adds a marker when the model stopped because it ran out of space.
    const truncated = LENGTH_RE.test(raw);
    return { raw: raw.replace(LENGTH_RE, ""), truncated };
  }

  function changeStyle(id: string) {
    setStyleId(id);
    try {
      localStorage.setItem("codegen-style", id);
    } catch {
      // storage not available: the choice just is not remembered
    }
  }

  /** Loads a ready-made template as the current app (undo is possible in History). */
  async function handleTemplate(id: string) {
    if (loading) return;
    const tpl = getTemplate(id);
    if (!tpl) return;
    const isFresh = files["/App.tsx"] === DEFAULT_FILES["/App.tsx"];
    if (!isFresh && !window.confirm("Replace the current app with the " + tpl.name + " template? You can undo it in History.")) {
      return;
    }
    setLoading(true); // blocks other actions while the photos are being found
    let withReal = tpl.files;
    try {
      withReal = await withPhotos(tpl.files);
    } finally {
      setLoading(false);
      setStatus(null);
    }
    const next = withLatestIndex({ ...DEFAULT_FILES, ...withReal });
    setFiles(next);
    pushVersion("Template: " + tpl.name, next);
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content: tpl.name + " template loaded. Now tell me what to change, for example the name, colours, texts or a new section.",
      },
    ]);
    setPreviewError(null);
    setSettledTick((n) => n + 1);
    attemptsRef.current = 0;
    armedRef.current = false;
  }

  /** Asks the server for real photos for keywords (Pexels). Empty list = none found (placeholders are used). */
  const fetchPhotos: Fetcher = async (query, orientation, count) => {
    const headers: Record<string, string> = {};
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const res = await fetch(
      `/api/images?q=${encodeURIComponent(query)}&o=${orientation}&count=${count}`,
      { headers }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { urls?: string[] };
    return Array.isArray(data.urls) ? data.urls : [];
  };

  /** Replaces "image:keywords" placeholders in the given files by real photo URLs. */
  async function withPhotos(changed: Files): Promise<Files> {
    if (!hasImageRefs(changed)) return changed;
    setStatus("Finding photos...");
    try {
      return (await resolveImages(changed, fetchPhotos)).files;
    } catch {
      return changed;
    }
  }

  /** The user only talks (no build request): answer in the chat, never touch the project. */
  async function handleChat(text: string, baseMessages: UiMessage[]) {
    const chatHistory: UiMessage[] = [...baseMessages, { role: "user", content: text }];
    setMessages([...chatHistory, { role: "assistant", content: "" }]);
    setLoading(true);
    setStatus("Thinking...");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const res = await fetch("/api/generate", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          mode: "chat",
          messages: chatHistory.filter((m) => !m.kind).map((m) => ({ role: m.role, content: m.content })),
          files: {},
        }),
      });
      const usedHeader = res.headers.get("X-Usage-Used");
      const limitHeader = res.headers.get("X-Usage-Limit");
      if (usedHeader !== null && limitHeader !== null) setUsage({ used: Number(usedHeader), limit: Number(limitHeader) });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        setMessages([...chatHistory, { role: "assistant", content: parseFiles(raw.replace(LENGTH_RE, "")).message }]);
      }
      if (raw.includes(ERROR_MARKER)) throw new Error(raw.slice(raw.indexOf(ERROR_MARKER) + ERROR_MARKER.length).trim());
      const reply = parseFiles(raw.replace(LENGTH_RE, "")).message;
      setMessages([
        ...chatHistory,
        { role: "assistant", content: reply || "I did not get an answer. Please try again.", ...(reply ? {} : { kind: "warning" as const }) },
      ]);
    } catch (err) {
      if (controller.signal.aborted) {
        setMessages([...chatHistory, { role: "assistant", content: "⏹ Stopped.", kind: "stopped" }]);
      } else {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        const friendly = /failed to fetch|networkerror|load failed/i.test(msg)
          ? "Could not reach the server. Check that npm run dev is still running and your internet works."
          : msg;
        setMessages([...chatHistory, { role: "assistant", content: `Error: ${friendly}`, kind: "error" }]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
      setStatus(null);
    }
  }

  async function handleSend(text: string, versionLabel?: string, baseMessages: UiMessage[] = messages, attachments?: Attachment[]) {
    // Only talking ("hi", "thanks", a question)? Answer in the chat and do not build anything.
    // Fix requests and messages with files are always build requests.
    if (!versionLabel && (attachments ?? attachRef.current).length === 0) {
      const intent = classifyIntent(text);
      if (intent === "smalltalk") {
        setMessages([...baseMessages, { role: "user", content: text }, { role: "assistant", content: smallTalkReply(text) }]);
        return;
      }
      // A pasted website link (without a question mark) is a request to build something like it.
      if (intent === "chat" && !(extractUrl(text) && !text.trim().endsWith("?"))) {
        await handleChat(text, baseMessages);
        return;
      }
    }

    // Several different websites in one message: one answer cannot hold them all.
    if (!versionLabel && isMultiSiteRequest(text)) {
      setMessages([
        ...baseMessages,
        { role: "user", content: text },
        {
          role: "assistant",
          content:
            "These are " +
            TEMPLATES.length +
            " different websites, and one project holds one website. Pick the one to start with; " +
            "I will load it and then we customise it together. Make the others in new projects afterwards.",
          showTemplates: true,
        },
      ]);
      return;
    }
    // Fix requests never carry files; "Try again" (attachments undefined) reuses the last ones.
    if (versionLabel) attachRef.current = [];
    else if (attachments) attachRef.current = attachments;
    const isAutoFix = versionLabel?.startsWith("Auto-fix") ?? false;
    if (!isAutoFix) attemptsRef.current = 0; // a real user message resets the counter

    const controller = new AbortController();
    abortRef.current = controller;

    // A reference website in the message: read its layout and design first (the analysis is sent
    // to the AI together with the request, and hidden in the chat).
    let sentText = text;
    const refUrl = !versionLabel && !text.includes(BRIEF_SEP) ? extractUrl(text) : null;
    if (refUrl) {
      setMessages([...baseMessages, { role: "user", content: text }, { role: "assistant", content: "" }]);
      setLoading(true);
      setStatus("Reading the website...");
      let failure = "Could not read that website.";
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
        }
        const res = await fetch("/api/inspect", {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({ url: refUrl }),
        });
        const info = res.ok
          ? ((await res.json()) as { ok?: boolean; brief?: string; error?: string })
          : { ok: false, error: await res.text() };
        if (info.ok && info.brief) sentText = text + BRIEF_SEP + info.brief;
        else failure = info.error || failure;
      } catch (err) {
        if (controller.signal.aborted) failure = "Stopped.";
      }
      if (sentText === text) {
        if (abortRef.current === controller) abortRef.current = null;
        setMessages([
          ...baseMessages,
          { role: "user", content: text },
          {
            role: "assistant",
            content:
              failure +
              " Nothing was changed. You can attach a screenshot of the site with the paperclip, or remove the link and describe the design in words.",
            kind: "warning",
          },
        ]);
        setLoading(false);
        setStatus(null);
        return;
      }
    }

    const shownText =
      attachments && attachments.length > 0 ? sentText + "\n📎 " + attachments.map((f) => f.name).join(", ") : sentText;
    const chatHistory: UiMessage[] = [...baseMessages, { role: "user", content: shownText }];
    setMessages([...chatHistory, { role: "assistant", content: "" }]);
    setLoading(true);
    setStatus(isAutoFix ? `${versionLabel}...` : "Thinking...");

    const baseFiles = files;

    try {
      let pass = await streamOnce(chatHistory, chatHistory, baseFiles, controller.signal);
      let result = interpretResponse(pass.raw, baseFiles, pass.truncated);

      if (result.problem) {
        // The answer was unusable or looks broken: undo what streamed in and
        // ask the model once more, telling it what was wrong.
        setFiles(baseFiles);
        setStatus("The answer was not usable. Trying once more...");
        setMessages([...chatHistory, { role: "assistant", content: "" }]);
        const freshProject = baseFiles["/App.tsx"] === DEFAULT_FILES["/App.tsx"];
        const note = result.tooLong
          ? freshProject
            ? `\n\n[Your previous answer was too long and was cut off before it finished. Answer again with a MUCH SHORTER version: ` +
              `ONE file, /App.tsx, of at most about 150 lines, only the most important sections, short texts, no long lists. ` +
              `Reply with one short sentence, then the COMPLETE file in a <file path="/App.tsx"> block. No <edit> blocks, no tool calls.]`
            : `\n\n[Your previous answer was too long and was cut off before it finished. Do NOT rewrite whole files. ` +
              `Reply with one short sentence, then <edit> blocks with <find> and <replace> for ONLY the few lines that must change. No tool calls.]`
          : `\n\n[Your previous answer was rejected: ${result.problem} ` +
            `Answer again with one short sentence, then the COMPLETE updated file(s) in <file path="..."> blocks. ` +
            `Do NOT use <edit> blocks this time, and do not use tool calls or function-call syntax.]`;
        const retryMessages: UiMessage[] = [
          ...chatHistory.slice(0, -1),
          { role: "user", content: sentText + note },
        ];
        pass = await streamOnce(retryMessages, chatHistory, baseFiles, controller.signal);
        result = interpretResponse(pass.raw, baseFiles, pass.truncated);
      }

      let reply = result.message;
      let kind: UiMessage["kind"];
      const applied = Object.keys(result.files).length > 0;
      if (applied) {
        const nextFiles = { ...baseFiles, ...(await withPhotos(result.files)) };
        setFiles(nextFiles);
        pushVersion(versionLabel ?? (text.length > 48 ? text.slice(0, 48) + "..." : text), nextFiles);
        track("build", buildMeta({ files: nextFiles, prompt: text, first: baseMessages.length === 0, reference: sentText !== text, fix: versionLabel === "Fix error" || /^Auto-fix/.test(versionLabel ?? "") }));
        reply = reply || "Done. Check the preview.";
        if (result.problem) {
          reply += `\n\n⚠️ Please check the result: ${result.problem} You can press Undo.`;
        }
      } else {
        setFiles(baseFiles);
        reply = (reply ? reply + "\n\n" : "") + EMPTY_WARNINGS[result.emptyReason ?? "noCode"];
        kind = "warning";
        track("build_fail", { reason: result.emptyReason ?? "noCode" });
      }
      setMessages([...chatHistory, { role: "assistant", content: reply, ...(kind ? { kind } : {}) }]);
      // Auto-fix may react to preview errors, but only after a change was really applied.
      armedRef.current = applied;
    } catch (err) {
      setFiles(baseFiles); // never keep a half-written answer
      armedRef.current = false;
      if (controller.signal.aborted) {
        setMessages([
          ...chatHistory,
          { role: "assistant", content: "⏹ Stopped. Nothing was changed.", kind: "stopped" },
        ]);
      } else {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        track("build_fail", { reason: /daily limit/i.test(msg) ? "limit" : "error" });
        const friendly = /failed to fetch|networkerror|load failed/i.test(msg)
          ? "Could not reach the server. Check that npm run dev is still running and your internet works."
          : msg;
        setMessages([...chatHistory, { role: "assistant", content: `Error: ${friendly}`, kind: "error" }]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
      setStatus(null);
      setSettledTick((n) => n + 1);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  // Sends the last request again (after a stop, an error, or an answer that changed nothing).
  function handleRetry() {
    if (loading) return;
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    const text = messages[idx].content;
    handleSend(text, text.startsWith("[Auto-fix") ? "Fix error" : undefined, messages.slice(0, idx));
  }

  if (cloud && !authReady) {
    return <div className="flex h-screen items-center justify-center text-sm text-white/60">Loading...</div>;
  }
  if (cloud && recovering && session) {
    return <NewPassword onDone={() => setRecovering(false)} />;
  }
  if (cloud && !session) {
    return <AuthForm />;
  }
  if (cloud && !hydrated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-4 text-center text-sm">
        {cloudError ? (
          <>
            <p className="flex max-w-md items-start gap-2 rounded-btn bg-red-950/70 px-3 py-2 text-left text-red-200">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {cloudError}
            </p>
            <p className="max-w-md text-white/60">
              If this says the table does not exist, run <code>supabase/schema.sql</code> in the Supabase SQL
              Editor first.
            </p>
            <div className="flex gap-2">
              <button onClick={() => window.location.reload()} className="btn btn-primary">
                Try again
              </button>
              <button onClick={() => supabase?.auth.signOut()} className="btn">
                Sign out
              </button>
            </div>
          </>
        ) : (
          <p className="text-white/60">Loading your projects...</p>
        )}
      </div>
    );
  }

  // No project yet: big prompt box + starting cards instead of the two panels.
  const isEmpty = messages.length === 0 && files["/App.tsx"] === DEFAULT_FILES["/App.tsx"];
  const showHome = isEmpty || view === "home";
  const email = session?.user.email ?? null;

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-app">
      <Header
        projectSlot={
          cloud ? (
            <ProjectsBar
              projects={projects}
              currentId={projectId}
              currentName={projectName}
              saveState={saveState}
              email={email ?? ""}
              disabled={loading}
              onOpen={(id) => void openFromHome(id)}
              onNew={handleNewProject}
              onDelete={handleDeleteProject}
              onRename={handleRename}
            />
          ) : (
            <LocalName name={projectName} onRename={handleRename} disabled={loading} />
          )
        }
        showTools={!showHome}
        tab={tab}
        onTab={(t) => {
          setTab(t);
          setMobileTab("preview");
        }}
        publishSlot={
          supabase && projectId ? (
            <PublishBar sb={supabase} projectId={projectId} name={projectName} files={files} disabled={loading} />
          ) : null
        }
        email={email}
        usage={usage}
        disabled={loading}
        onNew={cloud ? undefined : handleNewProject}
        onSignOut={cloud ? handleSignOut : undefined}
        onInbox={supabase && projectId ? () => setInboxOpen(true) : undefined}
        isAdmin={isAdmin}
        onFeedback={supabase ? () => setFeedbackOpen(true) : undefined}
        onHome={cloud && !showHome ? () => setView("home") : undefined}
        bgTheme={bgTheme}
        onBgTheme={changeBgTheme}
      />
      {cloud && cloudError && (
        <p className="flex items-center gap-2 border-b border-line bg-red-950/70 px-4 py-2 text-xs text-red-200">
          <AlertCircle size={14} className="shrink-0" /> {cloudError}
        </p>
      )}

      {showHome ? (
        <EmptyState
          loading={loading}
          onSend={(text, f) => void sendFromHome(text, f ?? [])}
          onStop={handleStop}
          styleId={styleId}
          onStyle={changeStyle}
          projects={
            cloud
              ? projects.filter((x) => x.name !== DEFAULT_PROJECT_NAME || (x.id === projectId && !isEmpty))
              : []
          }
          onOpenProject={(id) => void openFromHome(id)}
          onDeleteProject={handleDeleteProject}
          bg={themeBg(bgTheme)}
        />
      ) : (
        <>
          <div ref={rowRef} className="flex min-h-0 flex-1">
            <section
              aria-label="Chat"
              style={{ "--chat-w": `${chatWidth}px` } as React.CSSProperties}
              className={`${mobileTab === "chat" ? "flex" : "hidden"} min-h-0 w-full shrink-0 flex-col md:flex md:w-[var(--chat-w)]`}
            >
              {supabase && usage && usage.limit > 0 && usage.used >= usage.limit && (
                <LimitPrompt sb={supabase} used={usage.used} limit={usage.limit} />
              )}
              <div className="min-h-0 flex-1">
              <Chat
                messages={messages}
                loading={loading}
                status={status}
                onSend={(text, f) => handleSend(text, undefined, messages, f ?? [])}
                onStop={handleStop}
                onRetry={handleRetry}
                onTemplate={handleTemplate}
                styleId={styleId}
                onStyle={changeStyle}
              />
              </div>
            </section>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat and preview (drag, or use the arrow keys)"
              aria-valuenow={chatWidth}
              tabIndex={0}
              onPointerDown={startResize}
              onKeyDown={resizeByKey}
              onDoubleClick={() => setChatWidth(CHAT_DEFAULT_W)}
              className="hidden w-1 shrink-0 cursor-col-resize touch-none bg-line transition-colors hover:bg-white/20 active:bg-indigo-400/60 focus-visible:bg-indigo-400/60 focus-visible:outline-none md:block"
            />

            <section
              aria-label="Preview"
              className={
                fullscreen
                  ? "fixed inset-0 z-50 flex flex-col bg-app"
                  : `${mobileTab === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`
              }
            >
              <Toolbar
                count={history.versions.length}
                active={history.active}
                disabled={loading}
                device={device}
                showDevices={tab === "preview"}
                fullscreen={fullscreen}
                onUndo={() => restoreVersion(history.active - 1)}
                onRedo={() => restoreVersion(history.active + 1)}
                onOpenHistory={() => setHistoryOpen(true)}
                onDownload={handleDownload}
                onDevice={setDevice}
                onReload={() => setReloadSignal((n) => n + 1)}
                onToggleFullscreen={() => setFullscreen((f) => !f)}
              />
              <div className="relative min-h-0 flex-1">
                <Preview
                  files={files}
                  onError={handlePreviewError}
                  busy={loading}
                  settledTick={settledTick}
                  onFilesEdit={handleManualEdit}
                  tab={tab}
                  device={device}
                  reloadSignal={reloadSignal}
                  testScope={projectId ?? "local"}
                  blank={files["/App.tsx"] === DEFAULT_FILES["/App.tsx"]}
                />
                {previewError && !loading && (
                  <div className="absolute inset-x-3 bottom-3 z-20 flex items-start gap-3 rounded-card border border-red-400/30 bg-red-950/90 p-3 text-sm shadow-lg">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
                    <p className="line-clamp-3 flex-1 whitespace-pre-wrap text-red-100">{previewError}</p>
                    <button onClick={() => runFix(false)} className="btn btn-danger shrink-0">
                      <Wrench size={14} /> Fix with AI
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>

          <nav aria-label="Switch panel" className="grid shrink-0 grid-cols-2 border-t border-line bg-panel md:hidden">
            {(
              [
                { id: "chat", label: "Chat", Icon: MessageSquare },
                { id: "preview", label: "Preview", Icon: Monitor },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mobileTab === id}
                onClick={() => setMobileTab(id)}
                className={`flex h-12 items-center justify-center gap-2 text-sm transition-colors active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70 ${
                  mobileTab === id ? "text-white" : "text-white/50 hover:text-white"
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
        </>
      )}

      {supabase && <FeedbackModal sb={supabase} open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />}
      {supabase && projectId && (
        <InboxDrawer sb={supabase} projectId={projectId} projectName={projectName} open={inboxOpen} onClose={() => setInboxOpen(false)} />
      )}
      <HistoryDrawer
        open={historyOpen}
        versions={history.versions}
        active={history.active}
        disabled={loading}
        onRestore={restoreVersion}
        onClose={() => setHistoryOpen(false)}
      />
    </main>
  );
}
