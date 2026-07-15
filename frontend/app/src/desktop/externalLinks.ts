export function normalizeExternalHttpUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https links can be opened externally.");
  }
  return parsed.toString();
}
