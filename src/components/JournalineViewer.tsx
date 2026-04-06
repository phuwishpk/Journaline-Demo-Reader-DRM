import { useEffect, useMemo, useState } from 'react';
import { inlineToPlainText, resolveAudioUrl, type AudioMap } from '../audio';
import AudioControls from '../AudioControls';
import { resolvePage, resolveReferenceTarget } from '../navigation';
import { parseJournalineXml } from '../parser';
import type { ActionLink, InlineNode, JournalineDocument, PageNode } from '../types';
import { resolveImageUrl, type ImageMap } from '../images';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type Props = {
  xmlText: string;
  sourceLabel: string;
  audioMap: AudioMap;
  imageMap: ImageMap;
  status?: LoadState;
  error?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  serviceName?: string;
  serviceNote?: string;
  emptyMessage?: string;
};

export default function JournalineViewer({
  xmlText,
  sourceLabel,
  audioMap,
  imageMap,
  status = 'ready',
  error = '',
  headerTitle = 'Journaline Demo Reader',
  headerSubtitle = 'XML → Model → UI → Per-page audio',
  serviceName = 'EduRadio English',
  serviceNote = 'Open an XML page and play the audio assigned to that page.',
  emptyMessage = 'Load a sample XML file to begin.',
}: Props) {
  const [currentPageId, setCurrentPageId] = useState('');

  const doc = useMemo<JournalineDocument | null>(() => {
    if (!xmlText) return null;
    try {
      return parseJournalineXml(xmlText);
    } catch {
      return null;
    }
  }, [xmlText]);

  useEffect(() => {
    if (doc) setCurrentPageId(doc.rootPageId);
  }, [doc, sourceLabel]);

  const resolved = doc ? resolvePage(doc, currentPageId || doc.rootPageId) : null;
  const audioInfo = useMemo(
    () => resolveAudioUrl({ audioMap, page: resolved?.page ?? null, sourceLabel, doc }),
    [audioMap, resolved?.page, sourceLabel, doc],
  );

  // Debug navigation info
  useEffect(() => {
    if (resolved) {
      console.log('📍 Current Page Navigation:', {
        pageId: resolved.page.id,
        pageKind: resolved.page.kind,
        siblingIds: resolved.page.siblingIds,
        previousId: resolved.previousId,
        nextId: resolved.nextId,
        hasPreviousPage: !!resolved.previousId,
        hasNextPage: !!resolved.nextId,
      });
    }
  }, [resolved]);

  function navigateTo(id?: string) {
    console.log('🎯 navigateTo called:', { requestedId: id, hasDoc: !!doc });
    if (!doc || !id) {
      console.log('❌ navigateTo blocked - no doc or id:', { noDoc: !doc, noId: !id });
      return;
    }
    const actual = doc.pages[id]?.kind === 'reference'
      ? resolveReferenceTarget(doc, doc.pages[id].referenceTarget || '') || doc.rootPageId
      : id;
    console.log('🔄 Navigation result:', { 
      requestedId: id, 
      actualId: actual, 
      pageExists: !!doc.pages[actual],
      pageKind: doc.pages[actual]?.kind 
    });
    if (doc.pages[actual]) {
      console.log('✅ setCurrentPageId to:', actual);
      setCurrentPageId(actual);
    } else {
      console.log('⚠️ Page not found:', actual);
    }
  }

  return (
    <main className="viewer-shell">
      <header className="viewer-header-top">
        <div className="viewer-brand">{headerTitle}</div>
        <div className="viewer-subbrand">{headerSubtitle}</div>
      </header>

      <div className="viewer-service-bar">
        <div>
          <div className="service-name">{serviceName}</div>
          <div className="service-note">{serviceNote}</div>
        </div>
        <div className="service-actions">
          <span>i</span>
          <AudioControls audioUrl={audioInfo.url} />
          <span>⚙</span>
        </div>
      </div>

      {resolved ? (
        <section className="page-surface">
          <Toolbar 
            previousPage={resolved.previousId ? doc?.pages[resolved.previousId] : undefined}
            nextPage={resolved.nextId ? doc?.pages[resolved.nextId] : undefined}
            onPrev={() => navigateTo(resolved.previousId)} 
            onUp={() => navigateTo(resolved.upId)} 
            onNext={() => navigateTo(resolved.nextId)} 
          />

          <nav className="breadcrumbs">
            {resolved.breadcrumbs.map((crumb, index) => (
              <span key={crumb.id}>
                {index > 0 ? <span className="crumb-divider">›</span> : null}
                <button className="crumb-button" onClick={() => navigateTo(crumb.id)}>{inlineToPlainText(crumb.title) || 'Untitled'}</button>
              </span>
            ))}
          </nav>

          <PageView page={resolved.page} onNavigate={navigateTo} imageMap={imageMap} doc={doc || undefined} />
        </section>
      ) : (
        <section className="empty-state">
          <div>
            <div>{emptyMessage}</div>
            {status === 'error' && error ? <div className="empty-state-error">{error}</div> : null}
          </div>
        </section>
      )}
    </main>
  );
}

function Toolbar({ 
  previousPage, 
  nextPage, 
  onPrev, 
  onUp, 
  onNext 
}: { 
  previousPage?: PageNode; 
  nextPage?: PageNode; 
  onPrev: () => void; 
  onUp: () => void; 
  onNext: () => void 
}) {
  const previousTitle = previousPage ? inlineToPlainText(previousPage.title) : null;
  const nextTitle = nextPage ? inlineToPlainText(nextPage.title) : null;

  // Debug log
  console.log('Toolbar Debug:', { 
    hasNextPage: !!nextPage, 
    hasPrevPage: !!previousPage, 
    nextTitle, 
    previousTitle 
  });

  return (
    <div className="mini-toolbar">
      <button 
        onClick={() => {
          console.log('🔙 Previous button clicked!');
          onPrev();
        }}
        title={previousTitle || undefined}
      >
        ◀ previous
      </button>
      <button onClick={onUp}>↑ up</button>
      <button 
        onClick={() => {
          console.log('⏭️ Next button clicked!');
          onNext();
        }}
        title={nextTitle || undefined}
      >
        next ▶
      </button>
    </div>
  );
}

function PageView({ page, onNavigate, imageMap, doc }: { page: PageNode; onNavigate: (id?: string) => void; imageMap: ImageMap; doc?: JournalineDocument }) {
  if (page.kind === 'menu') {
    return (
      <div className="page-layout">
        <div className="content-main">
          <h2 className="page-title"><InlineRenderer nodes={page.title} imageMap={imageMap} /></h2>
          <div className="menu-list">
            {page.menuItems?.map((item) => (
              <button key={`${page.id}-${item.targetId}`} className="menu-link" onClick={() => onNavigate(item.targetId)}>
                <span className="menu-link-bullet">➜</span>
                <span><InlineRenderer nodes={item.label} imageMap={imageMap} /></span>
              </button>
            ))}
          </div>
          <MetaPanel page={page} imageMap={imageMap} />
        </div>
        <aside className="content-aside">
          <AsideCard title="Menu Page" body="This page is rendered from a Journaline <menu> node. The layout stays fixed while XML content and audio mapping change." />
        </aside>
      </div>
    );
  }

  return (
    <div className="page-layout">
      <div className="content-main">
        <h2 className="page-title"><InlineRenderer nodes={page.title} imageMap={imageMap} /></h2>
        {page.kind === 'titleOnly' ? (
          <section className="article-card intro-card">
            <p className="article-intro">This is a title-only Journaline message. It behaves like a compact update page.</p>
          </section>
        ) : null}

        {page.kind === 'article' ? (
          <section className="article-card">
            <InlineBlockRenderer nodes={page.body || []} imageMap={imageMap} />
          </section>
        ) : null}

        {page.kind === 'list' ? (
          <section className="article-card">
            <div className="list-table">
              {page.listItems?.map((row, index) => (
                <div key={`${page.id}-row-${index}`} className="list-row">
                  <InlineRenderer nodes={row} imageMap={imageMap} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <ActionLinks links={page.meta.links} imageMap={imageMap} onNavigate={onNavigate} doc={doc} />
        <MetaPanel page={page} imageMap={imageMap} />
      </div>
      <aside className="content-aside">
        <AsideCard title={kindLabel(page.kind)} body="The UI theme stays the same. Only the parsed XML data changes page title, text, lists, links, audio, and navigation." />
      </aside>
    </div>
  );
}

function ActionLinks({ links, imageMap, onNavigate, doc }: { links: ActionLink[]; imageMap: ImageMap; onNavigate: (id?: string) => void; doc?: JournalineDocument }) {
  if (!links.length) return null;
  
  function handleLinkClick(target: string) {
    if (!doc) return;
    // Resolve the reference target (handles # prefix and numeric ids)
    const pageId = resolveReferenceTarget(doc, target);
    if (pageId) {
      onNavigate(pageId);
    }
  }
  
  return (
    <section className="action-links">
      {links.map((link, index) => (
        <button 
          key={`${link.target}-${index}`} 
          className="action-link-card"
          onClick={() => handleLinkClick(link.target)}
        >
          <div className="action-link-type">{link.type}</div>
          <div className="action-link-label"><InlineRenderer nodes={link.label} imageMap={imageMap} /></div>
          <div className="action-link-target">{link.target}</div>
        </button>
      ))}
    </section>
  );
}

function MetaPanel({ page, imageMap }: { page: PageNode; imageMap: ImageMap }) {
  const hasMeta = page.meta.positions.length || page.meta.regions.length || page.meta.abstimeout || page.idString || page.objectID;
  if (!hasMeta) return null;
  return (
    <section className="meta-panel">
      {page.idString ? <div><strong>idString:</strong> {page.idString}</div> : null}
      {page.objectID ? <div><strong>objectID:</strong> {page.objectID}</div> : null}
      {page.meta.positions.length ? (
        <div>
          <strong>Geo positions:</strong>
          <ul>
            {page.meta.positions.map((pos, index) => (
              <li key={`${page.id}-pos-${index}`}>{pos.lat}, {pos.lon}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {page.meta.regions.length ? (
        <div>
          <strong>Regions:</strong>
          <ul>
            {page.meta.regions.map((region, index) => (
              <li key={`${page.id}-region-${index}`}>Polygon with {region.positions.length} points</li>
            ))}
          </ul>
        </div>
      ) : null}
      {page.meta.abstimeout ? <div><strong>Absolute timeout:</strong> {page.meta.abstimeout}</div> : null}
    </section>
  );
}

function AsideCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="aside-card">
      <div className="aside-badge">UI</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function InlineBlockRenderer({ nodes, imageMap }: { nodes: InlineNode[]; imageMap: ImageMap }) {
  const blocks: React.ReactNode[] = [];
  let currentInline: InlineNode[] = [];

  const flush = (key: string) => {
    if (!currentInline.length) return;
    blocks.push(
      <p key={key} className="article-paragraph">
        <InlineRenderer nodes={currentInline} imageMap={imageMap} />
      </p>,
    );
    currentInline = [];
  };

  nodes.forEach((node, index) => {
    if (node.type === 'paragraph') {
      flush(`text-${index}`);
      blocks.push(
        <p key={`p-${index}`} className="article-paragraph">
          <InlineRenderer nodes={node.children} imageMap={imageMap} />
        </p>,
      );
      return;
    }
    if (node.type === 'introductionBreak') {
      flush(`intro-${index}`);
      blocks.push(<div key={`rule-${index}`} className="intro-divider">Introduction</div>);
      return;
    }
    currentInline.push(node);
  });

  flush('final');
  return <>{blocks}</>;
}

function InlineRenderer({ nodes, imageMap }: { nodes: InlineNode[]; imageMap: ImageMap }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'text':
            return <span key={index}>{node.value} </span>;
          case 'br':
            return <br key={index} />;
          case 'paragraph':
            return <span key={index} className="inline-paragraph"><InlineRenderer nodes={node.children} imageMap={imageMap} /></span>;
          case 'emphasis':
            return <em key={index}><InlineRenderer nodes={node.children} imageMap={imageMap} /></em>;
          case 'strong':
            return <strong key={index}><InlineRenderer nodes={node.children} imageMap={imageMap} /></strong>;
          case 'image':
            return <img key={index} className="inline-image" src={resolveImageUrl(node.src, imageMap)} alt={node.alt || 'Journaline image'} />;
          case 'speechBreak':
            return <span key={index} className="speech-break">⏸ {node.seconds || '1'}s </span>;
          case 'keyword':
            return <mark key={index} title={node.description}><InlineRenderer nodes={node.children} imageMap={imageMap} /></mark>;
          case 'unsupported':
            return <span key={index} className="unsupported-chip">{node.label}</span>;
          case 'introductionBreak':
            return null;
          default:
            return null;
        }
      })}
    </>
  );
}

function kindLabel(kind: PageNode['kind']) {
  switch (kind) {
    case 'article':
      return 'Article Page';
    case 'list':
      return 'List Page';
    case 'titleOnly':
      return 'Title-only Page';
    case 'menu':
      return 'Menu Page';
    default:
      return 'Page';
  }
}

function pageLabel(doc: JournalineDocument, id: string) {
  const page = doc.pages[id];
  return page ? inlineToPlainText(page.title) : id;
}
