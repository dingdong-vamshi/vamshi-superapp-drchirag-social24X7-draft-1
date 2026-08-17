const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const trustedWebHosts = new Set([
  "social24x7.app",
  "www.social24x7.app",
  "vamshi-superapp-drchirag-social24x7.vercel.app",
]);

export function profileIdFromQrPayload(value: string) {
  const clean = value.trim();
  const custom = clean.match(/^social24x7:\/\/profile\/([0-9a-f-]+)$/i)?.[1];
  if (custom && uuidPattern.test(custom)) return custom;
  try {
    const url = new URL(clean);
    if (url.protocol !== "https:" || !trustedWebHosts.has(url.hostname.toLocaleLowerCase())) return null;
    const id = url.pathname.match(/^\/profile\/([0-9a-f-]+)$/i)?.[1];
    return id && uuidPattern.test(id) ? id : null;
  } catch {
    return uuidPattern.test(clean) ? clean : null;
  }
}
