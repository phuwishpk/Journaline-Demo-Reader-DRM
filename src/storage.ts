import type { AudioMap } from './audio';
import type { ImageMap } from './images';

const XML_TEXT_KEY = 'jr_admin_xml_text';
const XML_LABEL_KEY = 'jr_admin_source_label';
const AUDIO_MAP_KEY = 'jr_admin_audio_map';
const IMAGE_MAP_KEY = 'jr_admin_image_map';

export interface MediaAssignment {
  audioFiles: string[];
  imageFiles: string[];
}

export function loadStoredXml() {
  return {
    xmlText: localStorage.getItem(XML_TEXT_KEY) || '',
    sourceLabel: localStorage.getItem(XML_LABEL_KEY) || 'root.xml',
  };
}

export function saveStoredXml(xmlText: string, sourceLabel: string) {
  localStorage.setItem(XML_TEXT_KEY, xmlText);
  localStorage.setItem(XML_LABEL_KEY, sourceLabel);
}

export function loadStoredAudioMap(): AudioMap {
  return parseJson<AudioMap>(localStorage.getItem(AUDIO_MAP_KEY), {});
}

export function saveStoredAudioMap(map: AudioMap) {
  localStorage.setItem(AUDIO_MAP_KEY, JSON.stringify(map));
}

export function loadStoredImageMap(): ImageMap {
  return parseJson<ImageMap>(localStorage.getItem(IMAGE_MAP_KEY), {});
}

export function saveStoredImageMap(map: ImageMap) {
  localStorage.setItem(IMAGE_MAP_KEY, JSON.stringify(map));
}

// Save media assignment for a specific XML file
export function saveMediaAssignmentForXml(xmlStem: string, audioFiles: string[], imageFiles: string[]) {
  const key = `jr_media_assignment_${xmlStem}`;
  const assignment: MediaAssignment = { audioFiles, imageFiles };
  localStorage.setItem(key, JSON.stringify(assignment));
}

// Load media assignment for a specific XML file
export function loadMediaAssignmentForXml(xmlStem: string): MediaAssignment {
  const key = `jr_media_assignment_${xmlStem}`;
  return parseJson<MediaAssignment>(localStorage.getItem(key), { audioFiles: [], imageFiles: [] });
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
