"use client";

import { Download, History, Maximize2, Minimize2, Monitor, RefreshCw, Smartphone, Tablet, Undo2, Redo2 } from "lucide-react";
import { IconButton } from "./ui";

export type Device = "desktop" | "tablet" | "mobile";

type Props = {
  count: number;
  active: number;
  disabled: boolean;
  device: Device;
  showDevices: boolean;
  fullscreen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHistory: () => void;
  onDownload: () => void;
  onDevice: (d: Device) => void;
  onReload: () => void;
  onToggleFullscreen: () => void;
};

const DEVICES: { id: Device; label: string; Icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", Icon: Monitor },
  { id: "tablet", label: "Tablet", Icon: Tablet },
  { id: "mobile", label: "Mobile", Icon: Smartphone },
];

/** Small icon-only toolbar above the preview. */
export default function Toolbar({
  count,
  active,
  disabled,
  device,
  showDevices,
  fullscreen,
  onUndo,
  onRedo,
  onOpenHistory,
  onDownload,
  onDevice,
  onReload,
  onToggleFullscreen,
}: Props) {
  const canUndo = active > 0;
  const canRedo = active < count - 1;

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <IconButton label="Undo (go back one version)" disabled={disabled || !canUndo} onClick={onUndo}>
        <Undo2 size={16} />
      </IconButton>
      <IconButton label="Redo (go forward one version)" disabled={disabled || !canRedo} onClick={onRedo}>
        <Redo2 size={16} />
      </IconButton>
      <IconButton label={`History (${count} versions)`} disabled={disabled} onClick={onOpenHistory}>
        <History size={16} />
      </IconButton>
      <IconButton label="Download project as .zip" disabled={disabled} onClick={onDownload}>
        <Download size={16} />
      </IconButton>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {showDevices && (
          <div role="group" aria-label="Preview size" className="hidden items-center rounded-btn border border-line p-1 sm:flex">
            {DEVICES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={device === id}
                data-tip={label}
                onClick={() => onDevice(id)}
                className={`tip flex h-6 w-8 items-center justify-center rounded-[6px] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 active:bg-white/[0.16] ${
                  device === id ? "bg-white/10 text-white" : "text-white/50"
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        )}
        <IconButton label="Reload preview" onClick={onReload} className="tip-right">
          <RefreshCw size={16} />
        </IconButton>
        <IconButton label={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"} onClick={onToggleFullscreen} className="tip-right">
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </IconButton>
      </div>
    </div>
  );
}
