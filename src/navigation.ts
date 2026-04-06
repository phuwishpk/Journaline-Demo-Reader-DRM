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

  const siblingIds = page.siblingIds?.filter((id) => !id.includes('__pending')) ?? [];
  const currentIndex = siblingIds.indexOf(page.id);

  return {
    page,
    breadcrumbs,
    previousId: currentIndex > 0 ? siblingIds[currentIndex - 1] : undefined,
    nextId: currentIndex >= 0 && currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : undefined,
    upId: page.parentId,
  };
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
