const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "video/m4v": "video/mp4",
  "video/x-m4v": "video/mp4",
};

const EXTENSION_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mp4: "video/mp4",
  png: "image/png",
  webm: "video/webm",
  webp: "image/webp",
};

const extensionOf = (filename: string) => filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

export const normalizeChatMedia = (input: {
  filename?: string | null;
  mimeType?: string | null;
  kind: "image" | "video";
  fallbackStem: string;
}) => {
  const reportedMime = input.mimeType?.split(";", 1)[0].trim().toLowerCase() || "";
  const originalFilename = input.filename?.trim() || "";
  const inferredMime = originalFilename ? EXTENSION_MIME[extensionOf(originalFilename) || ""] : undefined;
  const mimeType = MIME_ALIASES[reportedMime] || reportedMime || inferredMime;

  if (!mimeType || !MIME_EXTENSION[mimeType] || !mimeType.startsWith(`${input.kind}/`)) {
    throw new Error(
      input.kind === "video"
        ? `This camera produced an unsupported video format${reportedMime ? ` (${reportedMime})` : ""}. Try recording again.`
        : `This camera produced an unsupported image format${reportedMime ? ` (${reportedMime})` : ""}. Try capturing again.`,
    );
  }

  const expectedExtension = MIME_EXTENSION[mimeType];
  const currentExtension = originalFilename ? extensionOf(originalFilename) : undefined;
  const filename = originalFilename && currentExtension === expectedExtension
    ? originalFilename
    : `${originalFilename.replace(/\.[^.]+$/, "") || input.fallbackStem}.${expectedExtension}`;

  return { filename, mimeType };
};

export const readWebMediaBlob = async (blob: Blob) => {
  const bytes = await blob.arrayBuffer();
  if (!bytes.byteLength) throw new Error("The recorded video is empty. Please record it again.");
  return bytes;
};

export const normalizeImagePickerDurationMs = (
  duration: number | null | undefined,
  platform: "web" | "native",
) => {
  if (duration == null || !Number.isFinite(duration) || duration < 0) return undefined;

  // Expo ImagePicker documents milliseconds on every platform, but its SDK 57
  // web implementation currently forwards HTMLVideoElement.duration (seconds).
  const milliseconds = platform === "web" ? duration * 1_000 : duration;
  return Math.round(milliseconds);
};
