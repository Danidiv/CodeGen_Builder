export type Version = {
  id: string;
  label: string;
  files: Record<string, string>;
  createdAt: number;
};

/** How many snapshots we keep per project. */
export const MAX_VERSIONS = 20;

export function makeVersion(label: string, files: Record<string, string>): Version {
  return {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    label,
    files: { ...files },
    createdAt: Date.now(),
  };
}
