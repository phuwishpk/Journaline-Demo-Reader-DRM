export type ImageMap = Record<string, string>;

export function resolveImageUrl(src: string, imageMap: ImageMap): string {
  if (!src) return src;
  if (src.startsWith('data:')) return src;

  const normalized = src.trim();
  const candidates = new Set<string>([
    normalized,
    normalized.replace(/^\//, ''),
    normalized.replace(/^localfile:/, ''),
    normalized.replace(/^\/?images\//, ''),
    basename(normalized),
  ]);

  for (const key of candidates) {
    if (key && imageMap[key]) return imageMap[key];
  }
  return normalized;
}

export function buildImageAliases(name: string, value: string): ImageMap {
  const base = basename(name);
  const aliases = [
    name,
    name.replace(/^\//, ''),
    base,
    `images/${base}`,
    `/images/${base}`,
    `localfile:${name}`,
    `localfile:${base}`,
    `data:image/png;localfile,${name}`,
    `data:image/jpeg;localfile,${name}`,
    `data:image/jpg;localfile,${name}`,
    `data:image/svg+xml;localfile,${name}`,
    `data:image/png;localfile,${base}`,
    `data:image/jpeg;localfile,${base}`,
    `data:image/jpg;localfile,${base}`,
    `data:image/svg+xml;localfile,${base}`,
  ];
  return Object.fromEntries(aliases.map((key) => [key, value]));
}

function basename(value: string): string {
  const clean = value.split(',').pop() || value;
  return clean.replace(/\\/g, '/').split('/').pop() || clean;
}
