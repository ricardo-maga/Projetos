export const projectSharepointUrlError = 'Introduza uma ligação válida a começar por https://.';

export function getProjectSharepointUrl(value?: string): string | undefined {
  const url = value?.trim();
  if (!url || !/^https:\/\/[^/\\]/i.test(url) || /[\s\u0000-\u001f\u007f\\]/.test(url)) return;

  try {
    const parsed = new URL(url);
    if (parsed.hostname && !parsed.username && !parsed.password) return url;
  } catch {
    return;
  }
}
