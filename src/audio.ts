import type { JournalineDocument, PageNode } from './types';

export type AudioMap = Record<string, string>;

export async function loadAudioMap(): Promise<AudioMap> {
  try {
    const res = await fetch('/audio/audio-map.json');
    if (!res.ok) return {};
    return (await res.json()) as AudioMap;
  } catch {
    return {};
  }
}

export function resolveAudioUrl(params: {
  audioMap: AudioMap;
  page: PageNode | null;
  sourceLabel: string;
  doc: JournalineDocument | null;
}): { url: string | null; matchedKey: string | null; candidates: string[] } {
  const { audioMap, page, sourceLabel } = params;
  if (!page) return { url: null, matchedKey: null, candidates: [] };

  const candidates = buildAudioCandidates(page, sourceLabel);
  for (const key of candidates) {
    if (audioMap[key]) {
      return { url: audioMap[key], matchedKey: key, candidates };
    }
  }
  
  // Fallback: if no page-specific match, use first available audio
  const audioKeys = Object.keys(audioMap);
  if (audioKeys.length > 0) {
    console.log(`📻 No exact match for page, using first available audio: ${audioKeys[0]}`);
    return { url: audioMap[audioKeys[0]]!, matchedKey: audioKeys[0], candidates };
  }
  
  return { url: null, matchedKey: null, candidates };
}

function buildAudioCandidates(page: PageNode, sourceLabel: string): string[] {
  const sourceBase = normalizeBaseName(sourceLabel);
  const title = inlineToPlainText(page.title);
  const titleSlug = slugify(title);

  const keys = [
    page.idString ? `${sourceBase}::${page.idString}` : null,
    page.objectID ? `${sourceBase}::objectID:${page.objectID}` : null,
    titleSlug ? `${sourceBase}::title:${titleSlug}` : null,
    page.idString ?? null,
    page.objectID ? `objectID:${page.objectID}` : null,
    titleSlug ? `title:${titleSlug}` : null,
    sourceBase,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(keys));
}

export function inlineToPlainText(nodes: PageNode['title']): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if ('children' in node && Array.isArray(node.children)) return inlineToPlainText(node.children);
      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeBaseName(value: string): string {
  return value.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || value.toLowerCase();
}
