export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'br' }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'emphasis'; children: InlineNode[] }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'introductionBreak' }
  | { type: 'speechBreak'; seconds?: string }
  | { type: 'keyword'; children: InlineNode[]; description?: string }
  | { type: 'unsupported'; label: string };

export type ActionLink = {
  type: string;
  target: string;
  label: InlineNode[];
};

export type Position = { lat: number; lon: number; label?: InlineNode[] };
export type Region = { positions: Position[]; label?: InlineNode[] };

export type PageMeta = {
  links: ActionLink[];
  positions: Position[];
  regions: Region[];
  abstimeout?: string;
};

export type PageKind = 'menu' | 'article' | 'list' | 'titleOnly' | 'reference';

export type MenuItem = {
  label: InlineNode[];
  targetId: string;
};

export type PageNode = {
  id: string;
  idString?: string;
  objectID?: string;
  kind: PageKind;
  title: InlineNode[];
  menuItems?: MenuItem[];
  body?: InlineNode[];
  listItems?: InlineNode[][];
  referenceTarget?: string;
  meta: PageMeta;
  parentId?: string;
  siblingIndex?: number;
  siblingIds?: string[];
};

export type DocumentMeta = {
  description?: string;
  version?: string;
  author?: string;
  contact?: string;
};

export type JournalineDocument = {
  meta: DocumentMeta;
  rootPageId: string;
  pages: Record<string, PageNode>;
  idStringMap: Record<string, string>;
};
