import type { JournalineDocument, PageNode } from './types';

export type AudioMapValue = string | { fileId: string; filename: string; originalName: string };
export type AudioMap = Record<string, AudioMapValue>;

export async function loadAudioMap(sourceLabel: string): Promise<AudioMap> {
  try {
    // Extract XML filename from sourceLabel
    const xmlName = sourceLabel.replace(/\.xml$/, '') + '.xml';
    
    // Fetch from backend server on port 5001 - now from MongoDB
    const res = await fetch(`http://localhost:5001/api/audio-mapping/${xmlName}`);
    if (!res.ok) return {};
    
    const data = await res.json() as { audioMap?: Record<string, boolean | string | AudioMapValue> };
    return (data.audioMap || {}) as AudioMap;
  } catch {
    return {};
  }
}

export function resolveAudioUrl(params: {
  audioMap: AudioMap;
  page: PageNode | null;
  sourceLabel: string;
  doc: JournalineDocument | null;
}): { url: string | null; matchedKey: string | null; filename: string | null; candidates: string[] } {
  const { audioMap, page, sourceLabel } = params;
  if (!page) return { url: null, matchedKey: null, filename: null, candidates: [] };

  const candidates = buildAudioCandidates(page, sourceLabel);
  const pageId = page.idString || page.id || 'unknown';
  console.log(`🔍 Resolving audio - page: ${pageId}, candidates: [${candidates.join(', ')}], audioMap keys: [${Object.keys(audioMap).join(', ')}]`);
  
  // First, try exact candidate matches
  for (const key of candidates) {
    if (audioMap[key]) {
      return createAudioResult(audioMap, key);
    }
  }
  
  // Second, try to find XML-level audio (just the sourceBase key)
  // This handles the case where entire XML has one audio for all pages
  const sourceBase = normalizeBaseName(sourceLabel);
  const sourceFull = sourceLabel.toLowerCase();
  
  // Try exact key matches for the XML itself
  for (const key of [sourceBase, sourceFull]) {
    if (audioMap[key]) {
      console.log(`✅ Found XML-level audio: ${key}`);
      return createAudioResult(audioMap, key);
    }
  }
  
  // Third: if there's only one audio file in the map, use it for all pages
  // This is the universal fallback for XML files with a single audio
  const audioMapKeys = Object.keys(audioMap);
  if (audioMapKeys.length === 1) {
    const singleKey = audioMapKeys[0];
    console.log(`✨ Using universal audio fallback: ${singleKey}`);
    return createAudioResult(audioMap, singleKey);
  }
  
  // No match found
  console.warn(`⚠️  No audio mapping found for page ${pageId}`);
  console.log(`   Debug: candidates were: [${candidates.join(', ')}]`);
  console.log(`   Debug: audioMap has keys: [${Object.keys(audioMap).join(', ')}]`);
  
  return { url: null, matchedKey: null, filename: null, candidates };
}

function createAudioResult(audioMap: AudioMap, key: string) {
  const value = audioMap[key];
  const audioUrl = getAudioUrlFromValue(value);
  const filename = getAudioFilenameFromValue(value);

  if (!audioUrl) {
    return { url: null, matchedKey: key, filename: 'unknown.wav', candidates: [] };
  }
  
  console.log(`✅ Found match: ${key} → ${filename}`);
  return { url: audioUrl, matchedKey: key, filename, candidates: [] };
}

function buildAudioCandidates(page: PageNode, sourceLabel: string): string[] {
  const sourceBase = normalizeBaseName(sourceLabel);
  const sourceBaseFull = sourceLabel.toLowerCase(); // Keep .xml if present
  const title = inlineToPlainText(page.title);
  const titleSlug = slugify(title);

  const keys = [
    // Candidates with sourceBase (without .xml)
    page.idString ? `${sourceBase}::${page.idString}` : null,
    page.objectID ? `${sourceBase}::objectID:${page.objectID}` : null,
    titleSlug ? `${sourceBase}::title:${titleSlug}` : null,
    
    // Candidates with sourceBase including .xml extension
    page.idString ? `${sourceBaseFull}::${page.idString}` : null,
    page.objectID ? `${sourceBaseFull}::objectID:${page.objectID}` : null,
    titleSlug ? `${sourceBaseFull}::title:${titleSlug}` : null,
    
    // Page-only candidates
    page.idString ?? null,
    page.objectID ? `objectID:${page.objectID}` : null,
    titleSlug ? `title:${titleSlug}` : null,
    
    // Source base candidates
    sourceBase,
    sourceBaseFull,
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

export function getAudioUrlFromValue(value: AudioMapValue): string | null {
  if (typeof value === 'object' && value !== null && 'fileId' in value) {
    // It's a fileId object from MongoDB
    return `http://localhost:5001/api/get-audio?fileId=${value.fileId}`;
  } else if (typeof value === 'string') {
    // Check if it's a fileId (MongoDB ObjectId format) or a path
    const isMongoObjectId = /^[0-9a-f]{24}$/i.test(value);
    
    if (isMongoObjectId) {
      // It's a fileId from MongoDB
      return `http://localhost:5001/api/get-audio?fileId=${value}`;
    } else if (value.startsWith('/')) {
      // It's a file path
      return `http://localhost:5001${value}`;
    } else {
      return value;
    }
  }
  return null;
}

export function getAudioFilenameFromValue(value: AudioMapValue): string {
  if (typeof value === 'object' && value !== null && 'originalName' in value) {
    return value.originalName || value.filename || 'unknown.wav';
  } else if (typeof value === 'string') {
    return value.split('/').pop() || 'unknown.wav';
  }
  return 'unknown.wav';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeBaseName(value: string): string {
  const filename = value.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || value.toLowerCase();
  // Remove .xml extension if present
  return filename.replace(/\.xml$/i, '');
}
