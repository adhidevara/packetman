/** UTF-8 safe base64, usable in browsers, Node and workers. */
export function base64EncodeUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function byteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}
