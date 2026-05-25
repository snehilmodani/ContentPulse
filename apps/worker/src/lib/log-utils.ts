export function previewUrl(url: string): string {
  if (!url.startsWith('data:')) return url;
  const comma = url.indexOf(',');
  if (comma < 0) return 'data:<malformed>';
  const header = url.slice(0, comma);
  const payloadLen = url.length - comma - 1;
  return `${header},<${payloadLen} chars>`;
}
