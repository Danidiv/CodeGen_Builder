/**
 * Files the user attaches to a chat message: text files (notes, content, a brief)
 * and reference images (a design to imitate).
 * The browser part reads and shrinks the files; the server part (sanitizeAttachments)
 * checks everything again, because the request body can never be trusted.
 */
export type Attachment =
  | { kind: "text"; name: string; data: string } // data = the text
  | { kind: "image"; name: string; data: string }; // data = "data:image/jpeg;base64,..."

export const MAX_TEXT_FILES = 3;
export const MAX_IMAGES = 3;
export const MAX_TEXT_CHARS = 12000; // per text file
export const MAX_IMAGE_SIDE = 1024; // px, longer side
export const MAX_IMAGE_DATA_CHARS = 1_000_000; // per image, as base64 text (about 750 KB); 3 images stay under host body limits

export const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|csv|html|css|js|ts|tsx|jsx)$/i;

export function isImageFile(file: { name: string; type: string }): boolean {
  return /^image\/(png|jpe?g|webp|gif)$/i.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

export function isTextFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.test(file.name);
}

/** Server side: keep only valid attachments, within the limits. */
export function sanitizeAttachments(input: unknown): Attachment[] {
  if (!Array.isArray(input)) return [];
  const out: Attachment[] = [];
  let texts = 0;
  let images = 0;
  for (const a of input) {
    if (!a || typeof a !== "object") continue;
    const { kind, name, data } = a as Record<string, unknown>;
    if (typeof name !== "string" || typeof data !== "string") continue;
    const safeName = name.replace(/[^\w.\- ]/g, "_").slice(0, 80) || "file";
    if (kind === "text" && texts < MAX_TEXT_FILES) {
      out.push({ kind: "text", name: safeName, data: data.slice(0, MAX_TEXT_CHARS) });
      texts++;
    } else if (
      kind === "image" &&
      images < MAX_IMAGES &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data) &&
      data.length <= MAX_IMAGE_DATA_CHARS
    ) {
      out.push({ kind: "image", name: safeName, data });
      images++;
    }
  }
  return out;
}

/** The text-file part of the prompt. */
export function describeTextAttachments(list: Attachment[]): string {
  const texts = list.filter((a) => a.kind === "text");
  if (texts.length === 0) return "";
  return (
    "ATTACHED FILES (material from the user: content, notes or a brief; use it where it fits the request):\n" +
    texts.map((t) => `--- ${t.name} ---\n${t.data}`).join("\n\n")
  );
}

// ---------------------------------------------------------------------------
// Browser only
// ---------------------------------------------------------------------------

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("Could not read " + file.name));
    r.readAsText(file);
  });
}

/** Shrinks an image to at most MAX_IMAGE_SIDE px and converts it to JPEG. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not process " + file.name));
      ctx.fillStyle = "#ffffff"; // transparent PNGs become white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > MAX_IMAGE_DATA_CHARS && quality > 0.4) {
        quality -= 0.15;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(file.name + " is not an image this browser can open."));
    };
    img.src = url;
  });
}

export async function readAttachment(file: File): Promise<Attachment> {
  if (isImageFile(file)) {
    return { kind: "image", name: file.name || "image.jpg", data: await shrinkImage(file) };
  }
  if (isTextFile(file)) {
    const text = await readAsText(file);
    return { kind: "text", name: file.name, data: text.slice(0, MAX_TEXT_CHARS) };
  }
  throw new Error(file.name + ": only text files (.txt, .md, .json, .csv...) and images (png, jpg, webp) can be attached.");
}
