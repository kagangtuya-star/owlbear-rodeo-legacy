const imageMimeByExt: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export function getFileNameFromUrl(url: string, fallback: string) {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return decodeURIComponent(segments[segments.length - 1]);
    }
  } catch (error) {
    // Fallback below
  }
  return fallback;
}

export function guessImageMimeFromUrl(
  url: string,
  fallback = "image/png"
): string {
  try {
    const { pathname } = new URL(url);
    const match = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (match) {
      const ext = match[1];
      return imageMimeByExt[ext] || fallback;
    }
  } catch (error) {
    // Fallback below
  }
  return fallback;
}
