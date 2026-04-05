import type { JournalineDocument, PageNode } from './types';

export type ResolvedPage = {
  page: PageNode;
  breadcrumbs: PageNode[];
  previousId?: string;
  nextId?: string;
  upId?: string;
};

export function resolvePage(doc: JournalineDocument, pageId: string): ResolvedPage {
  let page = doc.pages[pageId];
  if (!page) {
    page = doc.pages[doc.rootPageId];
  }

  if (page.kind === 'reference' && page.referenceTarget) {
    const actual = resolveReferenceTarget(doc, page.referenceTarget);
    if (actual) {
      return resolvePage(doc, actual);
    }
  }

  const breadcrumbs: PageNode[] = [];
  let cursor: PageNode | undefined = page;
  while (cursor) {
    breadcrumbs.unshift(cursor);
    cursor = cursor.parentId ? doc.pages[cursor.parentId] : undefined;
  }

  // First, try to get next/previous from explicit links in page metadata
  let nextId: string | undefined;
  let previousId: string | undefined;

  for (const link of page.meta.links) {
    if (link.type === 'jml') {
      const resolvedId = resolveReferenceTarget(doc, link.target);
      const linkLabel = inlineToPlainText(link.label).toLowerCase();
      
      if (linkLabel.includes('หน้าถัดไป') || linkLabel.includes('next')) {
        nextId = resolvedId;
      }
      if (linkLabel.includes('หน้าก่อนหน้า') || linkLabel.includes('previous') || linkLabel.includes('back')) {
        previousId = resolvedId;
      }
    }
  }

  // Fallback to sibling navigation if no explicit links found
  if (!nextId && !previousId) {
    const siblingIds = page.siblingIds?.filter((id) => !id.includes('__pending')) ?? [];
    const currentIndex = siblingIds.indexOf(page.id);
    if (currentIndex >= 0 && currentIndex < siblingIds.length - 1) {
      nextId = siblingIds[currentIndex + 1];
    }
    if (currentIndex > 0) {
      previousId = siblingIds[currentIndex - 1];
    }
  }

  return {
    page,
    breadcrumbs,
    previousId,
    nextId,
    upId: page.parentId,
  };
}

function inlineToPlainText(nodes: any[]): string {
  if (!Array.isArray(nodes)) return '';
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

export function resolveReferenceTarget(doc: JournalineDocument, rawTarget: string): string | undefined {
  if (!rawTarget) return undefined;
  if (rawTarget.startsWith('#')) {
    return doc.idStringMap[rawTarget.slice(1)];
  }
  if (/^0x/i.test(rawTarget) || /^\d+$/.test(rawTarget)) {
    const numeric = rawTarget.toLowerCase();
    return Object.values(doc.pages).find((page) => page.id.toLowerCase() === numeric)?.id;
  }
  return undefined;
}
