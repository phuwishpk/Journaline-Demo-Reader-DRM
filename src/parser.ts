import type {
  ActionLink,
  DocumentMeta,
  InlineNode,
  JournalineDocument,
  MenuItem,
  PageMeta,
  PageNode,
  Position,
  Region,
} from './types';

type ParseContext = {
  counter: number;
  idStringMap: Record<string, string>;
  pages: Record<string, PageNode>;
};

type MacroMap = Record<string, InlineNode[]>;

type PageIdentity = {
  pageId: string;
  idString?: string;
  objectID?: string;
};

const TEXT_TAGS = new Set(['title', 'text', 'itemlabel', 'listitem']);

export function parseJournalineXml(xmlText: string): JournalineDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const parseError = xml.querySelector('parsererror');
  if (parseError) {
    throw new Error(parseError.textContent?.trim() || 'XML parse error');
  }

  const root = xml.documentElement;
  if (!root || root.tagName !== 'journaline') {
    throw new Error('Root element must be <journaline>.');
  }

  const meta = parseFileInfo(root);
  const topNode = getFirstChildElementByNames(root, ['menu', 'message']);
  if (!topNode) {
    throw new Error('Journaline file must contain a top-level <menu> or <message>.');
  }

  const context: ParseContext = {
    counter: 0,
    idStringMap: {},
    pages: {},
  };

  const rootPageId = parsePage(topNode, context, undefined, undefined, []);

  return {
    meta,
    rootPageId,
    pages: context.pages,
    idStringMap: context.idStringMap,
  };
}

function parseFileInfo(root: Element): DocumentMeta {
  const fileInfo = Array.from(root.children).find((child) => child.tagName === 'fileinfo');
  const read = (name: string) => fileInfo?.querySelector(name)?.textContent?.trim();
  return {
    description: read('description'),
    version: read('version'),
    author: read('author'),
    contact: read('contact'),
  };
}

function parsePage(
  element: Element,
  context: ParseContext,
  parentId?: string,
  siblingIndex?: number,
  siblingIds: string[] = [],
): string {
  if (element.tagName === 'reference') {
    const id = makePageId(context, 'ref');
    const title = [{ type: 'text', value: referenceLabel(element.textContent?.trim() || '') } satisfies InlineNode];
    const page: PageNode = {
      id,
      kind: 'reference',
      title,
      referenceTarget: element.textContent?.trim() || '',
      meta: emptyMeta(),
      parentId,
      siblingIndex,
      siblingIds,
    };
    context.pages[id] = page;
    return id;
  }

  const identity = resolvePageIdentity(element, context);
  const titleEl = getDirectChildByTagName(element, 'title');
  const objectParametersEl = getDirectChildByTagName(element, 'objectparameters');
  const macros = parseMacros(objectParametersEl);
  const meta = parseObjectParameters(objectParametersEl, macros);
  const title: InlineNode[] = titleEl ? parseInlineChildren(titleEl, macros) : [{ type: 'text', value: '(Untitled)' }];

  if (element.tagName === 'menu') {
    const menuItems = Array.from(element.children).filter((child) => child.tagName === 'menuitem');
    const childTargets = menuItems.map((item) => {
      const target = getFirstChildElementByNames(item, ['message', 'menu', 'reference']);
      return target ? target : null;
    });

    const childIds = childTargets
      .filter((target): target is Element => Boolean(target))
      .map((target) => previewPageId(target, context));

    const page: PageNode = {
      id: identity.pageId,
      idString: identity.idString,
      objectID: identity.objectID,
      kind: 'menu',
      title,
      menuItems: [],
      meta,
      parentId,
      siblingIndex,
      siblingIds,
    };
    context.pages[identity.pageId] = page;

    const items: MenuItem[] = [];
    menuItems.forEach((item, index) => {
      const itemLabelEl = getDirectChildByTagName(item, 'itemlabel');
      const targetEl = getFirstChildElementByNames(item, ['message', 'menu', 'reference']);
      if (!targetEl) {
        return;
      }
      const targetId = parsePage(targetEl, context, identity.pageId, index, childIds);
      const fallbackTitle: InlineNode[] = context.pages[targetId]?.title || [{ type: 'text', value: 'Untitled item' }];
      const label = itemLabelEl ? parseInlineChildren(itemLabelEl, macros) : fallbackTitle;
      items.push({ label, targetId });
    });

    context.pages[identity.pageId] = { ...page, menuItems: items };
    return identity.pageId;
  }

  const bodyEl = getDirectChildByTagName(element, 'body');
  const listItems = bodyEl ? Array.from(bodyEl.children).filter((child) => child.tagName === 'listitem') : [];
  const textEl = bodyEl ? getDirectChildByTagName(bodyEl, 'text') : null;

  let kind: PageNode['kind'] = 'titleOnly';
  let body: InlineNode[] | undefined;
  let parsedListItems: InlineNode[][] | undefined;

  if (listItems.length > 0) {
    kind = 'list';
    parsedListItems = listItems.map((item) => parseInlineChildren(item, macros));
  } else if (textEl) {
    kind = 'article';
    body = parseInlineChildren(textEl, macros);
  }

  const page: PageNode = {
    id: identity.pageId,
    idString: identity.idString,
    objectID: identity.objectID,
    kind,
    title,
    body,
    listItems: parsedListItems,
    meta,
    parentId,
    siblingIndex,
    siblingIds,
  };

  context.pages[identity.pageId] = page;
  return identity.pageId;
}

function resolvePageIdentity(element: Element, context: ParseContext): PageIdentity {
  const idString = element.getAttribute('idString') || undefined;
  const objectID = element.getAttribute('objectID') || undefined;
  if (idString) {
    const existing = context.idStringMap[idString];
    if (existing) return { pageId: existing, idString, objectID };
    const created = makePageId(context, idString.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase());
    context.idStringMap[idString] = created;
    return { pageId: created, idString, objectID };
  }
  return { pageId: makePageId(context, element.tagName), idString, objectID };
}

function previewPageId(element: Element, context: ParseContext): string {
  const idString = element.getAttribute('idString');
  if (idString && context.idStringMap[idString]) {
    return context.idStringMap[idString];
  }
  return idString ? `${idString}__pending` : `${element.tagName}__pending_${context.counter + 1}`;
}

function parseMacros(objectParametersEl: Element | null): MacroMap {
  const map: MacroMap = {};
  const defs = objectParametersEl?.querySelector('macrodefinitions');
  if (!defs) return map;
  Array.from(defs.children)
    .filter((child) => child.tagName === 'macro')
    .forEach((macroEl) => {
      const id = macroEl.getAttribute('id');
      if (!id) return;
      map[id] = parseInlineChildren(macroEl, map);
    });
  return map;
}

function parseObjectParameters(objectParametersEl: Element | null, macros: MacroMap): PageMeta {
  if (!objectParametersEl) return emptyMeta();

  const links: ActionLink[] = Array.from(objectParametersEl.querySelectorAll(':scope > links > link')).map((linkEl) => ({
    type: linkEl.getAttribute('type') || 'url',
    target: linkEl.getAttribute('target') || '',
    label: parseInlineChildren(linkEl, macros),
  }));

  const positions: Position[] = Array.from(objectParametersEl.querySelectorAll(':scope > geopositions > position')).map((pos) => ({
    lat: Number(pos.getAttribute('lat') || '0'),
    lon: Number(pos.getAttribute('lon') || '0'),
    label: pos.textContent?.trim() ? parseInlineChildren(pos, macros) : undefined,
  }));

  const regions: Region[] = Array.from(objectParametersEl.querySelectorAll(':scope > georegions > region')).map((regionEl) => {
    const regionPositions = Array.from(regionEl.children)
      .filter((child) => child.tagName === 'position')
      .map((pos) => ({
        lat: Number(pos.getAttribute('lat') || '0'),
        lon: Number(pos.getAttribute('lon') || '0'),
        label: pos.textContent?.trim() ? parseInlineChildren(pos, macros) : undefined,
      }));

    const labelParts = parseRegionLabel(regionEl, macros);
    return {
      positions: regionPositions,
      label: labelParts.length > 0 ? labelParts : undefined,
    };
  });

  const abstimeout = objectParametersEl.querySelector(':scope > abstimeout')?.getAttribute('dateTime') || undefined;

  return { links, positions, regions, abstimeout };
}

function parseRegionLabel(regionEl: Element, macros: MacroMap): InlineNode[] {
  const fragments: InlineNode[] = [];
  regionEl.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'position') {
      return;
    }
    fragments.push(...parseSingleNode(node, macros));
  });
  return cleanupInline(fragments);
}

function parseInlineChildren(element: Element, macros: MacroMap): InlineNode[] {
  const output: InlineNode[] = [];
  element.childNodes.forEach((node) => {
    output.push(...parseSingleNode(node, macros));
  });
  return cleanupInline(output);
}

function parseSingleNode(node: ChildNode, macros: MacroMap): InlineNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeText(node.textContent || '');
    return text ? [{ type: 'text', value: text }] : [];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as Element;
  const tag = el.tagName;

  switch (tag) {
    case 'br':
      return [{ type: 'br' }];
    case 'p':
      return [{ type: 'paragraph', children: parseInlineChildren(el, macros) }];
    case 'em':
    case 'i':
      return [{ type: 'emphasis', children: parseInlineChildren(el, macros) }];
    case 'b':
    case 'strong':
      return [{ type: 'strong', children: parseInlineChildren(el, macros) }];
    case 'wbr':
      return [];
    case 'introduction':
      return [{ type: 'introductionBreak' }];
    case 'speechbreak':
      return [{ type: 'speechBreak', seconds: el.getAttribute('seconds') || undefined }];
    case 'keyword':
      return [{ type: 'keyword', children: parseInlineChildren(el, macros), description: el.getAttribute('description') || undefined }];
    case 'image': {
      const target = el.getAttribute('target') || '';
      const type = el.getAttribute('type') || '';
      if (type === 'url' && target) {
        return [{ type: 'image', src: target, alt: textContentFromInline(parseInlineChildren(el, macros)) || undefined }];
      }
      return [{ type: 'unsupported', label: `Unsupported image source: ${type || 'unknown'}` }];
    }
    case 'macro': {
      const macroId = el.getAttribute('id') || '';
      return macros[macroId] ? cloneInline(macros[macroId]) : [];
    }
    default:
      if (TEXT_TAGS.has(tag)) {
        return parseInlineChildren(el, macros);
      }
      return [{ type: 'unsupported', label: `<${tag}>` }];
  }
}

function cloneInline(nodes: InlineNode[]): InlineNode[] {
  return nodes.map((node) => {
    if ('children' in node && node.children) {
      return { ...node, children: cloneInline(node.children) } as InlineNode;
    }
    return { ...node } as InlineNode;
  });
}

function cleanupInline(nodes: InlineNode[]): InlineNode[] {
  const result: InlineNode[] = [];
  let pendingText = '';

  const flushText = () => {
    const value = pendingText.replace(/\s+/g, ' ').trim();
    if (value) result.push({ type: 'text', value });
    pendingText = '';
  };

  for (const node of nodes) {
    if (node.type === 'text') {
      pendingText += ` ${node.value}`;
    } else {
      flushText();
      result.push(node);
    }
  }
  flushText();
  return result;
}

function textContentFromInline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if ('children' in node && node.children) return textContentFromInline(node.children);
      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text: string): string {
  return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ');
}

function makePageId(context: ParseContext, base: string): string {
  context.counter += 1;
  return `${base}_${context.counter}`;
}

function emptyMeta(): PageMeta {
  return { links: [], positions: [], regions: [] };
}

function referenceLabel(reference: string): string {
  if (reference.startsWith('#')) return `Reference ${reference}`;
  if (reference.startsWith('@')) return `Provider ${reference}`;
  return `Reference ${reference || '(empty)'}`;
}

function getFirstChildElementByNames(parent: Element, names: string[]): Element | null {
  return Array.from(parent.children).find((child) => names.includes(child.tagName)) || null;
}

function getDirectChildByTagName(parent: Element, name: string): Element | null {
  return Array.from(parent.children).find((child) => child.tagName === name) || null;
}
