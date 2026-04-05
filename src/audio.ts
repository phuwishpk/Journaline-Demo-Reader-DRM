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
  return { url: null, matchedKey: null, candidates };
}

function buildAudioCandidates(page: PageNode, sourceLabel: string): string[] {
  const sourceBase = normalizeBaseName(sourceLabel);

  // Only use the XML filename as the key (one audio per XML file)
  return [sourceBase];
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
