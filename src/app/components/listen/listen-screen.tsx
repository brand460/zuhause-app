import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Menu,
  ChevronRight,
  Plus,
  Search,
  X,
  GripVertical,
  MoreHorizontal,
  FolderPlus,
  Trash2,
} from "lucide-react";
import { apiFetch } from "../supabase-client";
import { useKvRealtime, markLocalWrite } from "../use-kv-realtime";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  DragOverlay,
  useDraggable,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

// ── Types ────────────────────────────────────────────────────────────

const HOUSEHOLD_ID = "dev-household";
const LS_LAST_PAGE_KEY = `last_open_page_${HOUSEHOLD_ID}`;

interface Page {
  id: string;
  title: string;
  icon: string;
  parent_id: string | null;
  position: number;
}

/** pageId → HTML content */
type PageContents = Record<string, string>;

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ���─ Migration from old block format ──────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function migrateOldBlocks(blocks: any[]): PageContents {
  if (!Array.isArray(blocks) || blocks.length === 0) return {};
  // If already new format (single object stored in array wrapper)
  if (blocks.length === 1 && typeof blocks[0] === "object" && !blocks[0].type && !blocks[0].page_id) {
    return blocks[0] as PageContents;
  }
  // Group by page_id
  const byPage: Record<string, any[]> = {};
  for (const b of blocks) {
    if (!b.page_id) continue;
    if (!byPage[b.page_id]) byPage[b.page_id] = [];
    byPage[b.page_id].push(b);
  }
  const result: PageContents = {};
  for (const [pid, pblocks] of Object.entries(byPage)) {
    const sorted = pblocks.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    result[pid] = oldBlocksToHtml(sorted);
  }
  return result;
}

function oldBlocksToHtml(blocks: any[]): string {
  let html = "";
  let inUl = false;
  let inOl = false;

  for (const b of blocks) {
    if (b.type !== "bullet" && inUl) { html += "</ul>"; inUl = false; }
    if (b.type !== "numbered-list" && inOl) { html += "</ol>"; inOl = false; }

    const content = b.content ? escapeHtml(b.content) : "<br>";

    switch (b.type) {
      case "heading1":
        html += `<h1>${content}</h1>`;
        break;
      case "heading2":
        html += `<h2>${content}</h2>`;
        break;
      case "heading3":
        html += `<h3>${content}</h3>`;
        break;
      case "bullet":
        if (!inUl) { html += "<ul>"; inUl = true; }
        html += `<li>${content}</li>`;
        break;
      case "numbered-list":
        if (!inOl) { html += "<ol>"; inOl = true; }
        html += `<li>${content}</li>`;
        break;
      case "divider":
        html += "<hr>";
        break;
      case "todo": {
        const checked = b.is_checked ? "true" : "false";
        html += `<div class="editor-todo" data-checked="${checked}"><span contenteditable="false" class="editor-todo-check"></span><span class="editor-todo-text">${content}</span></div>`;
        break;
      }
      case "link": {
        const url = b.url ? escapeHtml(b.url) : "";
        html += `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${content}</a></p>`;
        break;
      }
      default:
        html += `<p>${content}</p>`;
    }
  }
  if (inUl) html += "</ul>";
  if (inOl) html += "</ol>";
  return html || "<p><br></p>";
}

function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}

// ── Default pages ────────────────────────────────────────────────────

const DEFAULT_PAGES: Page[] = [
  { id: "p1", title: "Haushalt", icon: "\u{1F3E0}", parent_id: null, position: 0 },
  { id: "p2", title: "Reise & Urlaub", icon: "\u2708\uFE0F", parent_id: null, position: 1 },
  { id: "p3", title: "Filme & Serien", icon: "\u{1F3AC}", parent_id: null, position: 2 },
  { id: "p4", title: "Geschenkideen", icon: "\u{1F381}", parent_id: null, position: 3 },
  { id: "p5", title: "Packlisten", icon: "\u{1F9F3}", parent_id: null, position: 4 },
  { id: "p6", title: "Gedanken", icon: "\u{1F4AD}", parent_id: null, position: 5 },
  { id: "p7", title: "Langzeit To-Dos", icon: "\u2705", parent_id: null, position: 6 },
];

const DEFAULT_CONTENTS: PageContents = Object.fromEntries(
  DEFAULT_PAGES.map((p) => [p.id, "<p><br></p>"])
);



// ── Main Component ───────────────────────────────────────────────────

export function ListenScreen() {
  const [pages, setPages] = useState<Page[]>([]);
  const [pageContents, setPageContents] = useState<PageContents>({});
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ pageId: string; x: number; y: number } | null>(null);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [emojiPickerPageId, setEmojiPickerPageId] = useState<string | null>(null);
  const [deleteConfirmPageId, setDeleteConfirmPageId] = useState<string | null>(null);
  const [focusTitlePageId, setFocusTitlePageId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobile();
  const isTouch = useIsTouch();

  // ── Save helpers ───────────────────────────────────────────────
  const saveData = useCallback(async (p: Page[], c: PageContents) => {
    try {
      markLocalWrite();
      await Promise.all([
        apiFetch("/custom-pages", {
          method: "PUT",
          body: JSON.stringify({ household_id: HOUSEHOLD_ID, pages: p }),
        }),
        apiFetch("/custom-blocks", {
          method: "PUT",
          body: JSON.stringify({ household_id: HOUSEHOLD_ID, blocks: c }),
        }),
      ]);
    } catch (err) {
      console.error("Fehler beim Speichern:", err);
    }
  }, []);

  const lastLocalListenWrite = useRef(0);

  const scheduleSave = useCallback(
    (p: Page[], c: PageContents) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        lastLocalListenWrite.current = Date.now();
        saveData(p, c);
      }, 500);
    },
    [saveData]
  );

  // ── Load data ──────────────────────────────────────────────────

  const loadListenData = useCallback(async (isInitial = false) => {
    try {
      const [pRes, bRes] = await Promise.all([
        apiFetch(`/custom-pages?household_id=${HOUSEHOLD_ID}`),
        apiFetch(`/custom-blocks?household_id=${HOUSEHOLD_ID}`),
      ]);
      // Skip remote updates if we just wrote locally
      if (!isInitial && Date.now() - lastLocalListenWrite.current < 2000) return;
      const loadedPages: Page[] = pRes.pages || [];
      const rawBlocks = bRes.blocks;

      if (loadedPages.length === 0 && isInitial) {
        setPages(DEFAULT_PAGES);
        setPageContents(DEFAULT_CONTENTS);
        const savedId = localStorage.getItem(LS_LAST_PAGE_KEY);
        const initialId = (savedId && DEFAULT_PAGES.some(p => p.id === savedId)) ? savedId : "p1";
        setActivePageId(initialId);
        saveData(DEFAULT_PAGES, DEFAULT_CONTENTS);
      } else if (loadedPages.length > 0) {
        let contents: PageContents;
        if (Array.isArray(rawBlocks)) {
          contents = migrateOldBlocks(rawBlocks);
        } else if (rawBlocks && typeof rawBlocks === "object") {
          contents = rawBlocks as PageContents;
        } else {
          contents = {};
        }
        setPages(loadedPages);
        setPageContents(contents);
        if (isInitial) {
          const savedId = localStorage.getItem(LS_LAST_PAGE_KEY);
          const restoredId = (savedId && loadedPages.some(p => p.id === savedId)) ? savedId : loadedPages[0]?.id || null;
          setActivePageId(restoredId);
          // Expand ancestors so restored page is visible in sidebar
          if (restoredId) {
            const ancestors = new Set<string>();
            let cur = loadedPages.find(p => p.id === restoredId);
            while (cur?.parent_id) {
              ancestors.add(cur.parent_id);
              cur = loadedPages.find(p => p.id === cur!.parent_id);
            }
            if (ancestors.size > 0) setExpandedPages(prev => {
              const next = new Set(prev);
              ancestors.forEach(id => next.add(id));
              return next;
            });
          }
        }
      }
      if (isInitial) setLoaded(true);
    } catch (err) {
      console.error("Fehler beim Laden der Listen-Daten:", err);
      if (isInitial) {
        setPages(DEFAULT_PAGES);
        setPageContents(DEFAULT_CONTENTS);
        const savedId = localStorage.getItem(LS_LAST_PAGE_KEY);
        const initialId = (savedId && DEFAULT_PAGES.some(p => p.id === savedId)) ? savedId : "p1";
        setActivePageId(initialId);
        setLoaded(true);
      }
    }
  }, [saveData]);

  useEffect(() => {
    loadListenData(true);
  }, []);

  // ── Persist last opened page to localStorage ──
  useEffect(() => {
    if (activePageId && loaded) {
      localStorage.setItem(LS_LAST_PAGE_KEY, activePageId);
    }
  }, [activePageId, loaded]);

  // ── Supabase Realtime subscription for live sync ──
  useKvRealtime(
    [`custom_pages:${HOUSEHOLD_ID}`, `custom_blocks:${HOUSEHOLD_ID}`],
    useCallback(() => loadListenData(false), [loadListenData]),
  );

  // ── Page operations ────────────────────────────────────────────
  const updatePages = useCallback(
    (newPages: Page[]) => {
      setPages(newPages);
      setPageContents((prev) => {
        scheduleSave(newPages, prev);
        return prev;
      });
    },
    [scheduleSave]
  );

  const updatePageContent = useCallback(
    (pageId: string, html: string) => {
      setPageContents((prev) => {
        const next = { ...prev, [pageId]: html };
        setPages((pp) => {
          scheduleSave(pp, next);
          return pp;
        });
        return next;
      });
    },
    [scheduleSave]
  );

  const createPage = useCallback(
    (parentId: string | null = null) => {
      const siblings = pages.filter((p) => p.parent_id === parentId);
      const isSubpage = parentId !== null;
      const newPage: Page = {
        id: genId(),
        title: isSubpage ? "Neue Unterseite" : "Neue Seite",
        icon: isSubpage ? "\u{1F4C4}" : "\u{1F4DD}",
        parent_id: parentId,
        position: siblings.length,
      };
      const np = [...pages, newPage];
      const nc = { ...pageContents, [newPage.id]: "<p><br></p>" };
      setPages(np);
      setPageContents(nc);
      setActivePageId(newPage.id);
      setFocusTitlePageId(newPage.id);
      if (parentId) setExpandedPages((prev) => new Set(prev).add(parentId));
      scheduleSave(np, nc);
      if (isMobile) setSidebarOpen(false);
    },
    [pages, pageContents, scheduleSave, isMobile]
  );

  const deletePage = useCallback(
    (pageId: string) => {
      const toDelete = new Set<string>();
      const collect = (id: string) => {
        toDelete.add(id);
        pages.filter((p) => p.parent_id === id).forEach((p) => collect(p.id));
      };
      collect(pageId);
      const np = pages.filter((p) => !toDelete.has(p.id));
      const nc = { ...pageContents };
      toDelete.forEach((id) => delete nc[id]);
      setPages(np);
      setPageContents(nc);
      if (toDelete.has(activePageId || "")) {
        setActivePageId(np[0]?.id || null);
      }
      scheduleSave(np, nc);
    },
    [pages, pageContents, activePageId, scheduleSave]
  );

  const reparentPage = useCallback(
    (pageId: string, newParentId: string | null) => {
      // Prevent circular: can't parent a page under itself or its descendants
      const isDescendant = (id: string, ancestorId: string): boolean => {
        const p = pages.find((pg) => pg.id === id);
        if (!p || !p.parent_id) return false;
        if (p.parent_id === ancestorId) return true;
        return isDescendant(p.parent_id, ancestorId);
      };
      if (newParentId && (pageId === newParentId || isDescendant(newParentId, pageId))) return;
      const page = pages.find((p) => p.id === pageId);
      if (!page || page.parent_id === newParentId) return;

      const newSiblings = pages.filter((p) => p.parent_id === newParentId && p.id !== pageId);
      const np = pages.map((p) =>
        p.id === pageId ? { ...p, parent_id: newParentId, position: newSiblings.length } : p
      );
      setPages(np);
      setPageContents((prev) => {
        scheduleSave(np, prev);
        return prev;
      });
      if (newParentId) setExpandedPages((prev) => new Set(prev).add(newParentId));
    },
    [pages, scheduleSave]
  );

  /** Move a page to a new parent at a specific position */
  const movePage = useCallback(
    (pageId: string, newParentId: string | null, newPosition: number) => {
      // Prevent circular
      const isDescendant = (id: string, ancestorId: string): boolean => {
        const p = pages.find((pg) => pg.id === id);
        if (!p || !p.parent_id) return false;
        if (p.parent_id === ancestorId) return true;
        return isDescendant(p.parent_id, ancestorId);
      };
      if (newParentId && (pageId === newParentId || isDescendant(newParentId, pageId))) return;

      // Remove dragged page, reindex old siblings
      const withoutDragged = pages.filter((p) => p.id !== pageId);
      const oldParentId = pages.find((p) => p.id === pageId)?.parent_id ?? null;

      // Reindex old siblings
      let reindexed = withoutDragged.map((p) => {
        if (p.parent_id === oldParentId) {
          return p; // will be reindexed below
        }
        return p;
      });

      // Get new siblings (without the dragged page) and sort
      const newSiblings = reindexed
        .filter((p) => p.parent_id === newParentId)
        .sort((a, b) => a.position - b.position);

      // Insert at the right position
      const clampedPos = Math.max(0, Math.min(newPosition, newSiblings.length));

      // Build the new page entry
      const draggedPage = pages.find((p) => p.id === pageId);
      if (!draggedPage) return;

      const updatedDragged = { ...draggedPage, parent_id: newParentId, position: clampedPos };

      // Reindex all siblings at the new parent level
      const finalPages = reindexed.map((p) => {
        if (p.parent_id === newParentId) {
          const idx = newSiblings.indexOf(p);
          const adjustedIdx = idx >= clampedPos ? idx + 1 : idx;
          return { ...p, position: adjustedIdx };
        }
        // Reindex old parent siblings if parent changed
        if (oldParentId !== newParentId && p.parent_id === oldParentId) {
          const oldSiblings = reindexed
            .filter((s) => s.parent_id === oldParentId)
            .sort((a, b) => a.position - b.position);
          return { ...p, position: oldSiblings.indexOf(p) };
        }
        return p;
      });

      const np = [...finalPages, updatedDragged];
      setPages(np);
      setPageContents((prev) => {
        scheduleSave(np, prev);
        return prev;
      });
      if (newParentId) setExpandedPages((prev) => new Set(prev).add(newParentId));
    },
    [pages, scheduleSave]
  );

  const renamePage = useCallback(
    (pageId: string, newTitle: string) => {
      const np = pages.map((p) => (p.id === pageId ? { ...p, title: newTitle } : p));
      updatePages(np);
    },
    [pages, updatePages]
  );

  const changePageIcon = useCallback(
    (pageId: string, emoji: string) => {
      const np = pages.map((p) => (p.id === pageId ? { ...p, icon: emoji } : p));
      updatePages(np);
      setEmojiPickerPageId(null);
    },
    [pages, updatePages]
  );

  // ── Active page data ───────────────────────────────────────────
  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || null,
    [pages, activePageId]
  );
  const activeContent = activePageId ? pageContents[activePageId] || "" : "";

  // ── Search ─────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { pageId: string; snippet: string }[] = [];
    for (const page of pages) {
      if (page.title.toLowerCase().includes(q)) {
        results.push({ pageId: page.id, snippet: `${page.icon} ${page.title}` });
      }
      const html = pageContents[page.id];
      if (html) {
        const text = stripHtml(html);
        if (text.toLowerCase().includes(q)) {
          const idx = text.toLowerCase().indexOf(q);
          const snippet = `${page.icon} ${page.title}: ${text.slice(Math.max(0, idx - 20), idx + 60)}`;
          results.push({ pageId: page.id, snippet });
        }
      }
    }
    return results.slice(0, 20);
  }, [searchQuery, pages, pageContents]);

  // ── DnD sensors (desktop only — touch uses custom long-press drag) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: isTouch ? 999999 : 5 } }),
  );

  // ── Render ─────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sidebar = (
    <SidebarContent
      pages={pages}
      activePageId={activePageId}
      expandedPages={expandedPages}
      searchQuery={searchQuery}
      searchResults={searchResults}
      contextMenu={contextMenu}
      renamingPageId={renamingPageId}
      emojiPickerPageId={emojiPickerPageId}
      onSetSearchQuery={setSearchQuery}
      onSelectPage={(id) => {
        setActivePageId(id);
        if (isMobile) setSidebarOpen(false);
      }}
      onToggleExpand={(id) => {
        setExpandedPages((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
      }}
      onCreatePage={createPage}
      onContextMenu={(pageId, x, y) => setContextMenu({ pageId, x, y })}
      onCloseContextMenu={() => setContextMenu(null)}
      onRename={(id) => {
        setRenamingPageId(id);
        setContextMenu(null);
      }}
      onFinishRename={(id, title) => {
        renamePage(id, title);
        setRenamingPageId(null);
      }}
      onOpenEmojiPicker={(id) => {
        setEmojiPickerPageId(id);
        setContextMenu(null);
      }}
      onChangeIcon={changePageIcon}
      onCreateSubpage={(parentId) => {
        createPage(parentId);
        setContextMenu(null);
      }}
      onDeletePage={(id) => {
        setDeleteConfirmPageId(id);
        setContextMenu(null);
      }}
      onSearchResultClick={(pageId) => {
        setActivePageId(pageId);
        setSearchQuery("");
        if (isMobile) setSidebarOpen(false);
      }}
      sensors={sensors}
      onMovePage={movePage}
      onReparentPage={reparentPage}
      isTouch={isTouch}
    />
  );

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div className="w-60 flex-shrink-0 flex flex-col min-h-0" style={{ background: "var(--surface)", borderRight: "1px solid var(--zu-border)" }}>
          {sidebar}
        </div>
      )}

      {/* Mobile drawer */}
      {isMobile && sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-72 bg-surface z-50 flex flex-col" style={{ boxShadow: "var(--shadow-elevated)" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--zu-border)" }}>
              <span className="text-sm font-bold text-text-1">Seiten</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-surface-2">
                <X className="w-5 h-5 text-text-3" />
              </button>
            </div>
            {sidebar}
          </div>
        </>
      )}

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Mobile header */}
        {isMobile && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-2" style={{ background: "var(--zu-bg)" }}>
            <h2 className="text-lg font-bold text-text-1">Notizen</h2>
            <button
              onClick={() => setSidebarOpen(true)}
              className="-mr-1.5 p-1.5 rounded-lg hover:bg-surface-2"
            >
              <Menu className="w-5 h-5 text-text-2" />
            </button>
          </div>
        )}

        {/* Editor */}
        {activePage ? (
          <PageEditor
            key={activePage.id}
            page={activePage}
            content={activeContent}
            focusTitle={focusTitlePageId === activePage.id}
            onClearFocusTitle={() => setFocusTitlePageId(null)}
            onUpdatePage={(updates) => {
              const np = pages.map((p) => (p.id === activePage.id ? { ...p, ...updates } : p));
              updatePages(np);
            }}
            onContentChange={(html) => updatePageContent(activePage.id, html)}
            onOpenEmojiPicker={() => setEmojiPickerPageId(activePage.id)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-3">
            <p className="text-sm">Keine Seite ausgew\u00e4hlt</p>
          </div>
        )}
      </div>

      {/* Floating emoji picker */}
      {emojiPickerPageId && (
        <EmojiPicker
          onSelect={(emoji) => changePageIcon(emojiPickerPageId, emoji)}
          onClose={() => setEmojiPickerPageId(null)}
        />
      )}

      {/* Context menu popover — desktop only */}
      {!isTouch && contextMenu && (() => {
        return (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setContextMenu(null)} />
            <div
              ref={(el) => {
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const margin = 8;
                let newLeft = contextMenu.x + 4;
                let newTop = contextMenu.y;
                if (newLeft + rect.width > vw - margin) {
                  newLeft = contextMenu.x - rect.width - 4;
                }
                if (newLeft < margin) newLeft = margin;
                if (rect.bottom > vh - margin) newTop = contextMenu.y - rect.height;
                if (newTop < margin) newTop = margin;
                el.style.left = `${newLeft}px`;
                el.style.top = `${newTop}px`;
              }}
              className="fixed z-[70] bg-surface rounded-xl p-1.5 min-w-[192px]"
              style={{ left: contextMenu.x + 4, top: contextMenu.y, boxShadow: "var(--shadow-elevated)", border: "1px solid var(--zu-border)" }}
            >
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  createPage(contextMenu.pageId);
                  setContextMenu(null);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-[10px] hover:bg-surface-2 cursor-pointer w-full text-sm text-text-1 transition whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4 text-text-3" /> Unterseite erstellen
              </button>

              <div className="my-1" style={{ borderTop: "1px solid var(--zu-border)" }} />
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteConfirmPageId(contextMenu.pageId);
                  setContextMenu(null);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-[10px] hover:bg-danger-light cursor-pointer w-full text-sm text-danger transition whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" /> L{"\u00f6"}schen
              </button>
            </div>
          </>
        );
      })()}

      {/* Delete confirmation dialog */}
      {deleteConfirmPageId && (() => {
        const targetPage = pages.find((p) => p.id === deleteConfirmPageId);
        const hasSubpages = pages.some((p) => p.parent_id === deleteConfirmPageId);
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirmPageId(null)}>
            <div className="bg-surface w-[320px] mx-4 p-6" style={{ borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-elevated)" }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-text-1 text-center">Seite l&ouml;schen?</h3>
              <p className="text-sm text-text-2 text-center mt-2">
                {targetPage ? `\u201E${targetPage.icon} ${targetPage.title}\u201C` : "Diese Seite"}{hasSubpages ? " und alle Unterseiten werden" : " wird"} unwiderruflich gel&ouml;scht.
              </p>
              <div className="flex justify-center gap-3 mt-5">
                <button
                  onClick={() => setDeleteConfirmPageId(null)}
                  className="flex-1 py-2.5 rounded-full bg-surface-2 text-text-1 text-sm font-semibold hover:opacity-80 transition cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    deletePage(deleteConfirmPageId);
                    setDeleteConfirmPageId(null);
                  }}
                  className="flex-1 py-2.5 rounded-full bg-danger text-white text-sm font-semibold hover:opacity-90 transition cursor-pointer"
                >
                  L&ouml;schen
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── useIsMobile hook ─────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mobile;
}

function useIsTouch() {
  const [touch] = useState(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0);
  return touch;
}

// ── Sidebar ──────────────────────────────────────────────────────────

interface SidebarContentProps {
  pages: Page[];
  activePageId: string | null;
  expandedPages: Set<string>;
  searchQuery: string;
  searchResults: { pageId: string; snippet: string }[];
  contextMenu: { pageId: string; x: number; y: number } | null;
  renamingPageId: string | null;
  emojiPickerPageId: string | null;
  onSetSearchQuery: (q: string) => void;
  onSelectPage: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCreatePage: (parentId?: string | null) => void;
  onContextMenu: (pageId: string, x: number, y: number) => void;
  onCloseContextMenu: () => void;
  onRename: (id: string) => void;
  onFinishRename: (id: string, title: string) => void;
  onOpenEmojiPicker: (id: string) => void;
  onChangeIcon: (id: string, emoji: string) => void;
  onCreateSubpage: (parentId: string) => void;
  onDeletePage: (id: string) => void;
  onSearchResultClick: (pageId: string) => void;
  sensors: ReturnType<typeof useSensors>;
  onMovePage: (pageId: string, newParentId: string | null, newPosition: number) => void;
  onReparentPage: (pageId: string, newParentId: string | null) => void;
  isTouch: boolean;
}

type DropZone = "top" | "middle" | "bottom";
interface DropPreview {
  targetId: string;
  zone: DropZone;
}

function SidebarContent(props: SidebarContentProps) {
  const {
    pages, activePageId, expandedPages, searchQuery, searchResults,
    contextMenu, renamingPageId,
    onSetSearchQuery, onSelectPage, onToggleExpand, onCreatePage,
    onContextMenu, onRename, onFinishRename, onOpenEmojiPicker,
    onCreateSubpage, onDeletePage, onSearchResultClick,
    sensors, onMovePage, isTouch,
  } = props;

  const rootPages = useMemo(
    () => pages.filter((p) => p.parent_id === null).sort((a, b) => a.position - b.position),
    [pages]
  );

  // Per sibling-group: does any page with same parent_id have children?
  // Key = parent_id (or "__root__" for null)
  const groupChevronMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    pages.forEach((pg) => {
      const key = pg.parent_id ?? "__root__";
      if (map[key]) return; // already true
      if (pages.some((p) => p.parent_id === pg.id)) map[key] = true;
    });
    return map;
  }, [pages]);

  const dndModifiers = useMemo(() => [restrictToVerticalAxis], []);

  // ── Shared DnD state (desktop dnd-kit + touch custom) ──
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragActiveWidth, setDragActiveWidth] = useState<number>(0);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [dragOverTrash, setDragOverTrash] = useState(false);
  const trashZoneRef = useRef<HTMLDivElement>(null);
  const rowRefsMap = useRef<Map<string, HTMLElement>>(new Map());

  const registerRowRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      rowRefsMap.current.set(id, el);
    } else {
      rowRefsMap.current.delete(id);
    }
  }, []);

  // ── Touch long-press drag state ──
  const touchDragEndTimeRef = useRef(0);
  const touchDragRef = useRef<{
    pageId: string;
    startX: number;
    startY: number;
    timerId: ReturnType<typeof setTimeout> | null;
    activated: boolean;
    ghostX: number;
    ghostY: number;
    ghostWidth: number;
    ghostLabel: string;
    ghostIcon: string;
  } | null>(null);
  const [touchDragGhost, setTouchDragGhost] = useState<{
    x: number; y: number; width: number; label: string; icon: string;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Flat list of all visible page IDs (tree order)
  const flatVisibleIds = useMemo(() => {
    const result: string[] = [];
    const walk = (parentId: string | null) => {
      const kids = pages
        .filter((p) => p.parent_id === parentId)
        .sort((a, b) => a.position - b.position);
      for (const kid of kids) {
        result.push(kid.id);
        if (expandedPages.has(kid.id)) walk(kid.id);
      }
    };
    walk(null);
    return result;
  }, [pages, expandedPages]);

  // Refs for stable DnD callbacks (avoids useLayoutEffect size-change warning in DndContext)
  const dragActiveIdRef = useRef(dragActiveId);
  dragActiveIdRef.current = dragActiveId;
  const flatVisibleIdsRef = useRef(flatVisibleIds);
  flatVisibleIdsRef.current = flatVisibleIds;
  const dropPreviewRef = useRef(dropPreview);
  dropPreviewRef.current = dropPreview;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const onMovePageRef = useRef(onMovePage);
  onMovePageRef.current = onMovePage;

  // ── Touch long-press drag handlers ──

  const computeTouchDropPreview = useCallback((cursorY: number, cursorX: number, dragPageId: string): { preview: DropPreview | null; overTrash: boolean } => {
    // Check trash zone
    if (trashZoneRef.current) {
      const trashRect = trashZoneRef.current.getBoundingClientRect();
      if (cursorX >= trashRect.left && cursorX <= trashRect.right && cursorY >= trashRect.top && cursorY <= trashRect.bottom) {
        return { preview: null, overTrash: true };
      }
    }
    // Find drop target
    for (const pageId of flatVisibleIdsRef.current) {
      if (pageId === dragPageId) continue;
      const el = rowRefsMap.current.get(pageId);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (cursorY >= rect.top && cursorY <= rect.bottom) {
        const relY = cursorY - rect.top;
        const third = rect.height / 3;
        let zone: DropZone;
        if (relY < third) zone = "top";
        else if (relY > third * 2) zone = "bottom";
        else zone = "middle";
        return { preview: { targetId: pageId, zone }, overTrash: false };
      }
    }
    return { preview: null, overTrash: false };
  }, []);

  const executeTouchDrop = useCallback((dragPageId: string, preview: DropPreview | null, overTrash: boolean) => {
    if (overTrash) {
      onDeletePageRef.current(dragPageId);
    } else if (preview) {
      const targetPage = pagesRef.current.find(p => p.id === preview.targetId);
      if (targetPage) {
        if (preview.zone === "middle") {
          onMovePageRef.current(dragPageId, preview.targetId, 0);
        } else {
          const parentId = targetPage.parent_id;
          const siblings = pagesRef.current
            .filter(p => p.parent_id === parentId && p.id !== dragPageId)
            .sort((a, b) => a.position - b.position);
          const targetIdx = siblings.findIndex(p => p.id === preview.targetId);
          const newPosition = preview.zone === "top" ? targetIdx : targetIdx + 1;
          onMovePageRef.current(dragPageId, parentId, Math.max(0, newPosition));
        }
      }
    }
  }, []);

  const handleRowTouchStart = useCallback((e: React.TouchEvent, pageId: string) => {
    // Edge guard: ignore touches near left edge (Android back gesture zone)
    const touch = e.touches[0];
    if (touch.clientX < 20) return;
    // Don't start drag if renaming
    if (props.renamingPageId === pageId) return;

    const page = pagesRef.current.find(p => p.id === pageId);
    if (!page) return;

    const rowEl = rowRefsMap.current.get(pageId);
    const width = rowEl?.getBoundingClientRect().width || 200;

    const startX = touch.clientX;
    const startY = touch.clientY;

    const timerId = setTimeout(() => {
      if (!touchDragRef.current || touchDragRef.current.pageId !== pageId) return;
      // Activate drag
      touchDragRef.current.activated = true;
      try { navigator.vibrate?.(30); } catch (_) {}

      setDragActiveId(pageId);
      setTouchDragGhost({
        x: startX, y: startY,
        width, label: page.title, icon: page.icon,
      });
      touchDragRef.current.ghostX = startX;
      touchDragRef.current.ghostY = startY;
      touchDragRef.current.ghostWidth = width;
    }, 400);

    touchDragRef.current = {
      pageId, startX, startY,
      timerId, activated: false,
      ghostX: startX, ghostY: startY,
      ghostWidth: width,
      ghostLabel: page.title, ghostIcon: page.icon,
    };
  }, [props.renamingPageId]);

  const handleRowTouchEnd = useCallback(() => {
    const state = touchDragRef.current;
    if (!state) return;

    if (state.timerId) clearTimeout(state.timerId);

    if (state.activated) {
      // Execute the drop — use refs for latest values
      executeTouchDrop(state.pageId, dropPreviewRef.current, dragOverTrashRef.current);
      setDragActiveId(null);
      setDragActiveWidth(0);
      setDropPreview(null);
      setDragOverTrash(false);
      setTouchDragGhost(null);
      touchDragEndTimeRef.current = Date.now();
    }

    touchDragRef.current = null;
  }, [executeTouchDrop]);

  // Native touchmove listener with { passive: false } to allow preventDefault during drag
  useEffect(() => {
    const handler = (e: TouchEvent) => {
      const state = touchDragRef.current;
      if (!state) return;
      const touch = e.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      if (!state.activated) {
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          if (state.timerId) clearTimeout(state.timerId);
          touchDragRef.current = null;
        }
        return;
      }

      // Prevent scrolling during drag
      e.preventDefault();

      state.ghostX = touch.clientX;
      state.ghostY = touch.clientY;
      setTouchDragGhost({
        x: touch.clientX, y: touch.clientY,
        width: state.ghostWidth, label: state.ghostLabel, icon: state.ghostIcon,
      });

      const { preview, overTrash } = computeTouchDropPreview(touch.clientY, touch.clientX, state.pageId);
      setDropPreview(preview);
      setDragOverTrash(overTrash);
    };
    const endHandler = () => {
      const state = touchDragRef.current;
      if (!state || !state.activated) return;
      // Same logic as handleRowTouchEnd
      executeTouchDrop(state.pageId, dropPreviewRef.current, dragOverTrashRef.current);
      setDragActiveId(null);
      setDragActiveWidth(0);
      setDropPreview(null);
      setDragOverTrash(false);
      setTouchDragGhost(null);
      touchDragEndTimeRef.current = Date.now();
      touchDragRef.current = null;
    };
    document.addEventListener("touchmove", handler, { passive: false });
    document.addEventListener("touchend", endHandler);
    document.addEventListener("touchcancel", endHandler);
    return () => {
      document.removeEventListener("touchmove", handler);
      document.removeEventListener("touchend", endHandler);
      document.removeEventListener("touchcancel", endHandler);
    };
  }, [computeTouchDropPreview, executeTouchDrop]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (touchDragRef.current?.timerId) clearTimeout(touchDragRef.current.timerId);
    };
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      setDragActiveId(id);
      // Measure width of the row element
      const rowEl = rowRefsMap.current.get(id);
      if (rowEl) {
        setDragActiveWidth(rowEl.getBoundingClientRect().width);
      }
    },
    []
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (!dragActiveIdRef.current) return;
      // Calculate cursor Y position
      const activatorEvent = event.activatorEvent as MouseEvent | TouchEvent;
      let startY = 0;
      let startX = 0;
      if ("touches" in activatorEvent) {
        startY = activatorEvent.touches[0].clientY;
        startX = activatorEvent.touches[0].clientX;
      } else {
        startY = activatorEvent.clientY;
        startX = activatorEvent.clientX;
      }
      const cursorY = startY + event.delta.y;
      const cursorX = startX + event.delta.x;

      // Check if over trash zone
      if (trashZoneRef.current) {
        const trashRect = trashZoneRef.current.getBoundingClientRect();
        const overTrash = cursorX >= trashRect.left && cursorX <= trashRect.right && cursorY >= trashRect.top && cursorY <= trashRect.bottom;
        setDragOverTrash(overTrash);
        if (overTrash) {
          setDropPreview(null);
          return;
        }
      }

      // Find which row the cursor is over
      let found: DropPreview | null = null;
      for (const pageId of flatVisibleIdsRef.current) {
        if (pageId === dragActiveIdRef.current) continue;
        const el = rowRefsMap.current.get(pageId);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (cursorY >= rect.top && cursorY <= rect.bottom) {
          const relY = cursorY - rect.top;
          const third = rect.height / 3;
          let zone: DropZone;
          if (relY < third) {
            zone = "top";
          } else if (relY > third * 2) {
            zone = "bottom";
          } else {
            zone = "middle";
          }
          found = { targetId: pageId, zone };
          break;
        }
      }
      setDropPreview(found);
    },
    []
  );

  const dragOverTrashRef = useRef(dragOverTrash);
  dragOverTrashRef.current = dragOverTrash;

  const onDeletePageRef = useRef(onDeletePage);
  onDeletePageRef.current = onDeletePage;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);

      // Check if dropped on trash zone
      if (trashZoneRef.current) {
        const trashRect = trashZoneRef.current.getBoundingClientRect();
        const activatorEvent = event.activatorEvent as MouseEvent | TouchEvent;
        let startY = 0, startX = 0;
        if ("touches" in activatorEvent) {
          startY = activatorEvent.touches[0].clientY;
          startX = activatorEvent.touches[0].clientX;
        } else {
          startY = activatorEvent.clientY;
          startX = activatorEvent.clientX;
        }
        const cursorX = startX + event.delta.x;
        const cursorY = startY + event.delta.y;
        if (cursorX >= trashRect.left && cursorX <= trashRect.right && cursorY >= trashRect.top && cursorY <= trashRect.bottom) {
          onDeletePageRef.current(activeId);
          setDragActiveId(null);
          setDragActiveWidth(0);
          setDropPreview(null);
          setDragOverTrash(false);
          return;
        }
      }

      const currentDropPreview = dropPreviewRef.current;
      if (currentDropPreview) {
        const targetPage = pagesRef.current.find((p) => p.id === currentDropPreview.targetId);
        if (targetPage) {
          if (currentDropPreview.zone === "middle") {
            onMovePageRef.current(activeId, currentDropPreview.targetId, 0);
          } else {
            const parentId = targetPage.parent_id;
            const siblings = pagesRef.current
              .filter((p) => p.parent_id === parentId && p.id !== activeId)
              .sort((a, b) => a.position - b.position);
            const targetIdx = siblings.findIndex((p) => p.id === currentDropPreview.targetId);
            const newPosition = currentDropPreview.zone === "top" ? targetIdx : targetIdx + 1;
            onMovePageRef.current(activeId, parentId, Math.max(0, newPosition));
          }
        }
      }
      setDragActiveId(null);
      setDragActiveWidth(0);
      setDropPreview(null);
      setDragOverTrash(false);
    },
    []
  );

  const handleDragCancel = useCallback(() => {
    setDragActiveId(null);
    setDragActiveWidth(0);
    setDropPreview(null);
    setDragOverTrash(false);
  }, []);

  const dragActivePage = useMemo(
    () => (dragActiveId ? pages.find((p) => p.id === dragActiveId) || null : null),
    [dragActiveId, pages]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3" />
          <input
            type="text"
            placeholder="Seiten durchsuchen..."
            value={searchQuery}
            onChange={(e) => onSetSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-surface-2 rounded-lg border-0 outline-none focus:outline-none placeholder:text-text-3"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            inputMode="text"
          />
          {searchQuery && (
            <button
              onClick={() => onSetSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-2"
            >
              <X className="w-3 h-3 text-text-3" />
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {searchQuery.trim() && (
        <div className="px-2 pb-2 max-h-60 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="text-xs text-text-3 px-2 py-2">Keine Ergebnisse</p>
          ) : (
            searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => onSearchResultClick(r.pageId)}
                className="w-full text-left px-2 py-1.5 text-sm text-text-2 rounded-lg hover:bg-accent-light transition truncate"
              >
                {r.snippet}
              </button>
            ))
          )}
        </div>
      )}

      {/* New page button */}
      {!searchQuery.trim() && (
        <div className="px-3 pb-2">
          <button
            onClick={() => onCreatePage(null)}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-text-3 rounded-lg hover:bg-surface-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Neue Seite</span>
          </button>
        </div>
      )}

      {/* Page tree — DndContext always mounted to prevent useLayoutEffect size-change warning */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 scrollbar-hide"
        style={{
          display: searchQuery.trim() ? "none" : undefined,
          ...(dragActiveId ? { overflow: "hidden", touchAction: "none" } : {}),
        }}
      >
        <DndContext
          sensors={sensors}
          modifiers={dndModifiers}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {rootPages.map((page) => (
            <PageTreeItem
              key={page.id}
              page={page}
              pages={pages}
                  depth={0}
                  activePageId={activePageId}
                  expandedPages={expandedPages}
                  renamingPageId={renamingPageId}
                  contextMenu={contextMenu}
                  onSelect={onSelectPage}
                  onToggleExpand={onToggleExpand}
                  onContextMenu={onContextMenu}
                  onRename={onRename}
                  onFinishRename={onFinishRename}
                  onOpenEmojiPicker={onOpenEmojiPicker}
                  onCreateSubpage={onCreateSubpage}
                  onDeletePage={onDeletePage}
                  dragActiveId={dragActiveId}
                  dropPreview={dropPreview}
                  registerRowRef={registerRowRef}
                  groupChevronMap={groupChevronMap}
                  isTouch={isTouch}
                  onRowTouchStart={handleRowTouchStart}
                  onRowTouchEnd={handleRowTouchEnd}
                  touchDragEndTimeRef={touchDragEndTimeRef}
                />
              ))}
              {/* Desktop DragOverlay — only for dnd-kit desktop drag */}
              {!isTouch && (
                <DragOverlay dropAnimation={null}>
                  {dragActivePage ? (
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-accent-mid text-sm text-text-2 opacity-90"
                      style={{ width: dragActiveWidth || "auto" }}
                    >
                      <GripVertical className="w-3 h-3 text-text-3 flex-shrink-0" />
                      <span className="text-sm flex-shrink-0">{dragActivePage.icon}</span>
                      <span className="flex-1 min-w-0 truncate">{dragActivePage.title}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              )}
        </DndContext>
      </div>

      {/* Touch ghost element — follows finger during long-press drag */}
      {isTouch && touchDragGhost && (
        <div
          className="fixed z-[60] flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-accent-mid text-sm text-text-2 shadow-lg pointer-events-none"
          style={{
            left: touchDragGhost.x - touchDragGhost.width / 2,
            top: touchDragGhost.y - 20,
            width: touchDragGhost.width,
            opacity: 0.9,
            transform: "scale(1.02)",
          }}
        >
          <span className="text-sm flex-shrink-0">{touchDragGhost.icon}</span>
          <span className="flex-1 min-w-0 truncate">{touchDragGhost.label}</span>
        </div>
      )}

      {/* Trash zone — visible during drag on touch devices */}
      {isTouch && dragActiveId && (
        <div
          ref={trashZoneRef}
          className={`flex-shrink-0 mx-2 mb-2 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors py-3 ${
            dragOverTrash
              ? "border-danger bg-danger-light text-danger"
              : "border-border text-text-3"
          }`}
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-medium">Seite entfernen</span>
        </div>
      )}
    </div>
  );
}

// ── Page tree item (recursive) ───────────────────────────────────────

interface PageTreeItemProps {
  page: Page;
  pages: Page[];
  depth: number;
  activePageId: string | null;
  expandedPages: Set<string>;
  renamingPageId: string | null;
  contextMenu: { pageId: string; x: number; y: number } | null;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onContextMenu: (pageId: string, x: number, y: number) => void;
  onRename: (id: string) => void;
  onFinishRename: (id: string, title: string) => void;
  onOpenEmojiPicker: (id: string) => void;
  onCreateSubpage: (parentId: string) => void;
  onDeletePage: (id: string) => void;
  dragActiveId: string | null;
  dropPreview: DropPreview | null;
  registerRowRef: (id: string, el: HTMLElement | null) => void;
  groupChevronMap: Record<string, boolean>;
  isTouch: boolean;
  onRowTouchStart?: (e: React.TouchEvent, pageId: string) => void;
  onRowTouchEnd?: () => void;
  touchDragEndTimeRef?: React.RefObject<number>;
}

// Fixed column widths (px)
const COL_DRAG = 20;
const COL_CHEVRON = 20;
const INDENT_PER_LEVEL = COL_DRAG + COL_CHEVRON; // 40px per depth level

function PageTreeItem(props: PageTreeItemProps) {
  const {
    page, pages, depth, activePageId, expandedPages, renamingPageId, contextMenu,
    onSelect, onToggleExpand, onContextMenu, onRename, onFinishRename,
    onOpenEmojiPicker, onCreateSubpage, onDeletePage,
    dragActiveId, dropPreview, registerRowRef, groupChevronMap, isTouch,
    onRowTouchStart, onRowTouchEnd, touchDragEndTimeRef,
  } = props;

  // Does my sibling group need a chevron column?
  const siblingGroupKey = page.parent_id ?? "__root__";
  const groupNeedsChevron = !!groupChevronMap[siblingGroupKey];

  const children = useMemo(
    () => pages.filter((p) => p.parent_id === page.id).sort((a, b) => a.position - b.position),
    [pages, page.id]
  );
  const hasChildren = children.length > 0;
  const isExpanded = expandedPages.has(page.id);
  const isActive = page.id === activePageId;
  const isRenaming = page.id === renamingPageId;
  const isDragging = page.id === dragActiveId;
  const renameRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Register/unregister row ref for drop zone detection
  useEffect(() => {
    registerRowRef(page.id, rowRef.current);
    return () => registerRowRef(page.id, null);
  }, [page.id, registerRowRef]);

  // Draggable (on the grip handle)
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: page.id });

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);

  // Drop preview indicators
  const isDropTarget = dropPreview?.targetId === page.id;
  const showTopLine = isDropTarget && dropPreview?.zone === "top";
  const showBottomLine = isDropTarget && dropPreview?.zone === "bottom";
  const showMiddleHighlight = isDropTarget && dropPreview?.zone === "middle";

  // Layout: [indent] [drag 20px] [chevron 20px] [emoji] [title] [... btn]
  const indent = depth * INDENT_PER_LEVEL;

  return (
    <div className="relative">
      {/* Top drop indicator line */}
      {showTopLine && (
        <div className="absolute top-0 right-2 h-0.5 bg-accent z-10 rounded-full pointer-events-none" style={{ left: indent }} />
      )}

      <div
        ref={(el) => {
          rowRef.current = el;
        }}
        className={`group flex items-center py-1 pr-1 rounded-lg cursor-pointer transition text-sm ${
          showMiddleHighlight
            ? "bg-accent-light border border-accent-mid"
            : isActive
              ? "bg-accent-light text-accent-dark"
              : "text-text-2 hover:bg-surface-2"
        } ${isDragging ? "opacity-40 scale-[1.02] shadow-lg" : ""}`}
        style={{ paddingLeft: indent, WebkitTouchCallout: isTouch ? "none" : undefined, userSelect: isTouch ? "none" : undefined }}
        onClick={() => {
          if (isRenaming || isDragging) return;
          if (touchDragEndTimeRef?.current && Date.now() - touchDragEndTimeRef.current < 300) return;
          onSelect(page.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!isTouch) onContextMenu(page.id, e.clientX, e.clientY);
        }}
        {...(isTouch ? {
          onTouchStart: (e: React.TouchEvent) => onRowTouchStart?.(e, page.id),
          onTouchEnd: onRowTouchEnd,
          onTouchCancel: onRowTouchEnd,
        } : {})}
      >
        {/* Drag handle — desktop only, fixed 20px */}
        {!isTouch && (
          <div
            ref={setDragRef}
            {...attributes}
            {...listeners}
            className="flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
            style={{ width: COL_DRAG }}
          >
            <GripVertical className="w-3.5 h-3.5 text-text-3" />
          </div>
        )}

        {/* Chevron — 20px column, only rendered when sibling group needs it */}
        {groupNeedsChevron && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) onToggleExpand(page.id);
            }}
            className={`flex-shrink-0 flex items-center justify-center text-text-3 ${
              hasChildren ? "" : "pointer-events-none"
            }`}
            style={{ width: COL_CHEVRON, visibility: hasChildren ? "visible" : "hidden" }}
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>
        )}

        {/* Emoji icon */}
        <span className="text-sm flex-shrink-0 mr-1" style={{ marginLeft: isTouch ? 4 : 0 }}>{page.icon}</span>

        {/* Title */}
        {isRenaming ? (
          <input
            ref={renameRef}
            defaultValue={page.title}
            className="flex-1 min-w-0 text-sm bg-surface border border-accent-mid rounded px-1 py-0 outline-none"
            onBlur={(e) => onFinishRename(page.id, e.target.value || "Unbenannt")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onFinishRename(page.id, (e.target as HTMLInputElement).value || "Unbenannt");
              }
              if (e.key === "Escape") onFinishRename(page.id, page.title);
            }}
            onClick={(e) => e.stopPropagation()}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate">{page.title}</span>
        )}

        {/* Context menu button — desktop only */}
        {!isTouch && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(page.id, e.clientX, e.clientY);
            }}
            className="w-5 h-5 flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-surface-2"
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-text-3" />
          </button>
        )}
      </div>

      {/* Bottom drop indicator line */}
      {showBottomLine && (
        <div className="absolute bottom-0 right-2 h-0.5 bg-accent z-10 rounded-full pointer-events-none" style={{ left: indent }} />
      )}

      {/* Children — no vertical lines, just indentation */}
      {isExpanded && hasChildren && children.map((child) => (
        <PageTreeItem
          key={child.id}
          page={child}
          pages={pages}
          depth={depth + 1}
          activePageId={activePageId}
          expandedPages={expandedPages}
          renamingPageId={renamingPageId}
          contextMenu={contextMenu}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onContextMenu={onContextMenu}
          onRename={onRename}
          onFinishRename={onFinishRename}
          onOpenEmojiPicker={onOpenEmojiPicker}
          onCreateSubpage={onCreateSubpage}
          onDeletePage={onDeletePage}
          dragActiveId={dragActiveId}
          dropPreview={dropPreview}
          registerRowRef={registerRowRef}
          groupChevronMap={groupChevronMap}
          isTouch={isTouch}
          onRowTouchStart={onRowTouchStart}
          onRowTouchEnd={onRowTouchEnd}
          touchDragEndTimeRef={touchDragEndTimeRef}
        />
      ))}
    </div>
  );
}

// ── Emoji Picker (emoji-mart) ─────────────────────────────────────────

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  return (
    <div className="contents">
      <div className="fixed inset-0 z-[80]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[85]">
        <Picker
          data={data}
          onEmojiSelect={(emoji: any) => {
            onSelect(emoji.native);
            onClose();
          }}
          locale="de"
          theme="light"
          previewPosition="none"
          skinTonePosition="none"
        />
      </div>
    </div>
  );
}

// ── Page Editor (single contentEditable) ─────────────────────────────

interface PageEditorProps {
  page: Page;
  content: string;
  focusTitle?: boolean;
  onClearFocusTitle?: () => void;
  onUpdatePage: (updates: Partial<Page>) => void;
  onContentChange: (html: string) => void;
  onOpenEmojiPicker: () => void;
}

// ── Slash-command menu items ──
const SLASH_ITEMS = [
  { id: "checklist", label: "Checkliste", icon: "\u2705" },
  { id: "h1", label: "\u00dcberschrift 1", icon: "H1" },
  { id: "h2", label: "\u00dcberschrift 2", icon: "H2" },
  { id: "h3", label: "\u00dcberschrift 3", icon: "H3" },
  { id: "hr", label: "Trennlinie", icon: "\u2014" },
  { id: "table", label: "Tabelle", icon: "\ud83d\udcca" },
];

function PageEditor({ page, content, focusTitle, onClearFocusTitle, onUpdatePage, onContentChange, onOpenEmojiPicker }: PageEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredBlockEl, setHoveredBlockEl] = useState<HTMLElement | null>(null);
  const [handlePos, setHandlePos] = useState<{ top: number } | null>(null);
  const initializedRef = useRef(false);
  const dragSrcRef = useRef<HTMLElement | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // ── Li drag handles ──────────────────────────────────────────────
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const [liPositions, setLiPositions] = useState<Array<{ top: number; left: number; type: "li" | "todo" }>>([]);
  const liElsRef = useRef<HTMLElement[]>([]);
  const liDragRef = useRef<{
    el: HTMLElement;
    elType: "li" | "todo";
    intent: "none" | "vertical" | "horizontal";
    startX: number;
    startY: number;
    parentList: HTMLElement;
    siblings: HTMLElement[];
    srcIdx: number;
    indentLevel: number;
    lastFlashedLevel: number;
    dropIdx: number;
    allItems: HTMLElement[];
    allSrcIdx: number;
  } | null>(null);
  const [liDragging, setLiDragging] = useState(false);
  const [liDropIndicator, setLiDropIndicator] = useState<number | null>(null);
  const HANDLE_LINE_H = 26;

  // Helper: get the "own-line" midpoint of a <li>, excluding nested sublists.
  // Parent <li> elements have very tall bounding rects (they contain nested <ul>/<ol>),
  // so using the full rect midpoint makes the first child position unreachable.
  const getOwnMidpoint = useCallback((el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    const nested = el.querySelector(":scope > ul, :scope > ol");
    const ownBottom = nested ? nested.getBoundingClientRect().top : rect.bottom;
    return (rect.top + ownBottom) / 2;
  }, []);

  const recomputeLiPositions = useCallback(() => {
    const wrapper = editorWrapperRef.current;
    const editor = editorRef.current;
    if (!wrapper || !editor) { setLiPositions([]); liElsRef.current = []; return; }
    const wrapperRect = wrapper.getBoundingClientRect();
    const elements: HTMLElement[] = [];
    const positions: Array<{ top: number; left: number; type: "li" | "todo" }> = [];
    // <li> elements
    const lis = Array.from(editor.querySelectorAll("li")) as HTMLLIElement[];
    for (const li of lis) {
      let depth = 0;
      let el: HTMLElement | null = li.parentElement;
      while (el && el !== editor) {
        if (el.tagName === "UL" || el.tagName === "OL") depth++;
        el = el.parentElement;
      }
      // Handle at li left edge: wrapperPad(32) + (depth-1)*liPadLeft(28)
      const handleLeft = 32 + (depth - 1) * 28;
      const r = li.getBoundingClientRect();
      elements.push(li);
      positions.push({ top: r.top - wrapperRect.top, left: handleLeft, type: "li" });
    }
    // .editor-todo elements
    const todos = Array.from(editor.querySelectorAll(".editor-todo")) as HTMLElement[];
    for (const todo of todos) {
      const indent = parseInt(todo.getAttribute("data-indent") || "0", 10) || 0;
      // Handle at todo left edge: wrapperPad(32) + indent*28
      const handleLeft = 32 + indent * 28;
      const r = todo.getBoundingClientRect();
      elements.push(todo);
      positions.push({ top: r.top - wrapperRect.top, left: handleLeft, type: "todo" });
    }
    liElsRef.current = elements;
    setLiPositions(positions);
  }, []);

  // Watch for DOM mutations in the editor to track <li> elements
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const observer = new MutationObserver(() => {
      if (!liDragRef.current) recomputeLiPositions();
    });
    observer.observe(editor, { childList: true, subtree: true, characterData: true });
    recomputeLiPositions();
    const container = editor.closest(".overflow-y-auto");
    const onScroll = () => { if (!liDragRef.current) recomputeLiPositions(); };
    container?.addEventListener("scroll", onScroll, { passive: true });
    return () => { observer.disconnect(); container?.removeEventListener("scroll", onScroll); };
  }, [recomputeLiPositions]);

  // Slash-command state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const slashBlockRef = useRef<HTMLElement | null>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // Hint to browsers: new blocks should be <p> not <div> (best-effort, non-critical)
  useEffect(() => {
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* ignored */ }
  }, []);

  // Load content into editor on mount (key={page.id} ensures remount)
  useEffect(() => {
    if (editorRef.current && !initializedRef.current) {
      initializedRef.current = true;
      editorRef.current.innerHTML = content || "<p><br></p>";
    }
  }, [content]);

  // ── Get top-level block element from any descendant node ──
  const getBlockElement = useCallback((node: Node | null): HTMLElement | null => {
    if (!node || !editorRef.current) return null;
    let el = node instanceof HTMLElement ? node : node.parentElement;
    while (el && el !== editorRef.current && el.parentElement !== editorRef.current) {
      el = el.parentElement;
    }
    return el && el !== editorRef.current ? el : null;
  }, []);

  // ── Sync innerHTML to state ──
  const syncContent = useCallback(() => {
    if (editorRef.current) {
      onContentChange(editorRef.current.innerHTML);
    }
  }, [onContentChange]);

  // ── Ensure editor is never completely empty ──
  const ensureNotEmpty = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML.trim();
    if (!html || html === "<br>" || html === "") {
      editorRef.current.innerHTML = "<p><br></p>";
      const p = editorRef.current.querySelector("p");
      if (p) {
        const r = document.createRange();
        r.setStart(p, 0);
        r.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
  }, []);

  // ── Find closest ancestor with a given tag ──
  const findClosestTag = useCallback(
    (node: Node | null, tag: string): HTMLElement | null => {
      let el = node instanceof HTMLElement ? node : node?.parentElement || null;
      while (el) {
        if (el === editorRef.current) return null;
        if (el.tagName === tag) return el;
        el = el.parentElement;
      }
      return null;
    },
    []
  );

  // ── Helper: place cursor at start of element ──
  const placeCursorAtStart = useCallback((el: HTMLElement) => {
    const r = document.createRange();
    if (el.firstChild) {
      r.setStart(el.firstChild, 0);
    } else {
      r.setStart(el, 0);
    }
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }, []);

  // Get indent level of an <li> or .editor-todo
  const getLiIndentLevel = useCallback((el: HTMLElement): number => {
    if (el.classList.contains("editor-todo")) {
      return parseInt(el.getAttribute("data-indent") || "0", 10) || 0;
    }
    let level = 0;
    let p: HTMLElement | null = el.parentElement;
    while (p && p !== editorRef.current) {
      if (p.tagName === "UL" || p.tagName === "OL") level++;
      p = p.parentElement;
    }
    return Math.max(0, level - 1);
  }, []);

  // Indent a specific <li> or .editor-todo (unified: needs predecessor, max 4 levels)
  const indentLi = useCallback((el: HTMLElement): boolean => {
    if (el.classList.contains("editor-todo")) {
      const cur = parseInt(el.getAttribute("data-indent") || "0", 10) || 0;
      if (cur >= 4) return false;
      // Must have a predecessor todo at same or deeper indent level
      let prev: Element | null = el.previousElementSibling;
      while (prev && !prev.classList.contains("editor-todo")) prev = prev.previousElementSibling;
      if (!prev) return false;
      const prevIndent = parseInt((prev as HTMLElement).getAttribute("data-indent") || "0", 10) || 0;
      if (prevIndent < cur) return false;
      el.setAttribute("data-indent", String(cur + 1));
      syncContent();
      return true;
    }
    // <li>: nest into previous sibling's sub-list
    const parentList = el.parentElement;
    if (!parentList || (parentList.tagName !== "UL" && parentList.tagName !== "OL")) return false;
    if (getLiIndentLevel(el) >= 4) return false;
    const prevLi = el.previousElementSibling;
    if (!prevLi || prevLi.tagName !== "LI") return false;
    const tag = parentList.tagName.toLowerCase();
    let subList = prevLi.querySelector(`:scope > ${tag}`) as HTMLElement | null;
    if (!subList) { subList = document.createElement(tag); prevLi.appendChild(subList); }
    subList.appendChild(el);
    syncContent();
    return true;
  }, [getLiIndentLevel, syncContent]);

  // Outdent a specific <li> or .editor-todo (unified: min level 0)
  const outdentLi = useCallback((el: HTMLElement): boolean => {
    if (el.classList.contains("editor-todo")) {
      const cur = parseInt(el.getAttribute("data-indent") || "0", 10) || 0;
      if (cur <= 0) return false;
      el.setAttribute("data-indent", String(cur - 1));
      syncContent();
      return true;
    }
    // <li>: move out of nested list
    const parentList = el.parentElement;
    if (!parentList) return false;
    const grandparentLi = parentList.parentElement;
    if (!grandparentLi || grandparentLi.tagName !== "LI") return false;
    const outerList = grandparentLi.parentElement;
    if (!outerList) return false;
    const siblingsAfter: Element[] = [];
    let next = el.nextElementSibling;
    while (next) { siblingsAfter.push(next); next = next.nextElementSibling; }
    outerList.insertBefore(el, grandparentLi.nextSibling);
    if (siblingsAfter.length > 0) {
      const subList = document.createElement(parentList.tagName.toLowerCase());
      siblingsAfter.forEach((s) => subList.appendChild(s));
      el.appendChild(subList);
    }
    if (parentList.children.length === 0) parentList.remove();
    syncContent();
    return true;
  }, [syncContent]);

  // ── Li drag touch handlers ──
  const handleLiTouchStart = useCallback((e: React.TouchEvent, idx: number) => {
    const touch = e.touches[0];
    if (touch.clientX < 20) return;
    e.preventDefault();
    e.stopPropagation();
    const el = liElsRef.current[idx];
    if (!el) return;
    const pos = liPositions[idx];
    const elType = pos?.type || "li";

    let parentList: HTMLElement;
    let siblings: HTMLElement[];
    if (elType === "todo") {
      // Todos are siblings at editor top level — gather consecutive .editor-todo elements around this one
      parentList = el.parentElement!;
      siblings = Array.from(parentList.children).filter((c) => c.classList.contains("editor-todo")) as HTMLElement[];
    } else {
      const pl = el.parentElement;
      if (!pl || (pl.tagName !== "UL" && pl.tagName !== "OL")) return;
      parentList = pl;
      siblings = Array.from(pl.children).filter((c) => c.tagName === "LI") as HTMLElement[];
    }
    const srcIdx = siblings.indexOf(el);
    el.style.opacity = "0.4";
    const level = getLiIndentLevel(el);
    const editor = editorRef.current;
    const allItems = editor
      ? elType === "todo"
        ? Array.from(editor.querySelectorAll(".editor-todo")) as HTMLElement[]
        : Array.from(editor.querySelectorAll("li")) as HTMLElement[]
      : [];
    const allSrcIdx = allItems.indexOf(el);
    liDragRef.current = {
      el, elType, intent: "none", startX: touch.clientX, startY: touch.clientY,
      parentList, siblings, srcIdx,
      indentLevel: level, lastFlashedLevel: level, dropIdx: allSrcIdx,
      allItems, allSrcIdx,
    };
    setLiDragging(true);
  }, [getLiIndentLevel, liPositions]);

  const handleLiTouchMove = useCallback((e: TouchEvent) => {
    const state = liDragRef.current;
    if (!state) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    if (state.intent === "none") {
      if (Math.sqrt(dx * dx + dy * dy) >= 10) {
        state.intent = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      } else return;
    }

    if (state.intent === "horizontal") {
      const INDENT_PX = 40;
      const rawDelta = Math.round(dx / INDENT_PX);
      const targetLevel = Math.max(0, Math.min(4, state.indentLevel + rawDelta));
      if (targetLevel !== state.lastFlashedLevel) {
        const diff = targetLevel - state.lastFlashedLevel;
        const success = diff > 0 ? indentLi(state.el) : outdentLi(state.el);
        if (success) {
          state.lastFlashedLevel = getLiIndentLevel(state.el);
          state.el.classList.remove("li-indent-flash");
          void state.el.offsetWidth;
          state.el.classList.add("li-indent-flash");
          if (state.elType === "li") {
            const newParent = state.el.parentElement;
            if (newParent && (newParent.tagName === "UL" || newParent.tagName === "OL")) {
              state.parentList = newParent;
              state.siblings = Array.from(newParent.children).filter((c) => c.tagName === "LI") as HTMLElement[];
              state.srcIdx = state.siblings.indexOf(state.el);
            }
          }
        }
      }
    } else {
      // Vertical mode: iterate over ALL elements of the same type (flat list across all levels)
      const wrapper = editorWrapperRef.current;
      if (!wrapper) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      const items = state.allItems;
      let targetIdx = items.length;
      for (let i = 0; i < items.length; i++) {
        if (items[i] === state.el || state.el.contains(items[i])) continue; // skip self & descendants
        // Use own-line midpoint so first child position in nested lists is reachable
        if (touch.clientY < getOwnMidpoint(items[i])) { targetIdx = i; break; }
      }
      state.dropIdx = targetIdx;
      if (targetIdx < items.length && !state.el.contains(items[targetIdx])) {
        setLiDropIndicator(items[targetIdx].getBoundingClientRect().top - wrapperRect.top);
      } else {
        // Find last non-descendant item
        let last: HTMLElement | null = null;
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i] !== state.el && !state.el.contains(items[i])) { last = items[i]; break; }
        }
        if (last) setLiDropIndicator(last.getBoundingClientRect().bottom - wrapperRect.top);
      }
    }
  }, [indentLi, outdentLi, getLiIndentLevel, getOwnMidpoint]);

  const handleLiTouchEnd = useCallback(() => {
    const state = liDragRef.current;
    if (!state) return;
    state.el.style.opacity = "";
    state.el.classList.remove("li-indent-flash");
    if (state.intent === "vertical" && state.dropIdx !== state.allSrcIdx) {
      const { el, elType, allItems, allSrcIdx, dropIdx } = state;
      if (elType === "todo") {
        // Todos are top-level siblings — simple reorder
        const parent = el.parentElement!;
        parent.removeChild(el);
        const remaining = allItems.filter(item => item !== el);
        const adj = dropIdx > allSrcIdx ? dropIdx - 1 : dropIdx;
        if (adj >= remaining.length) {
          const last = remaining[remaining.length - 1];
          if (last && last.nextSibling) parent.insertBefore(el, last.nextSibling);
          else parent.appendChild(el);
        } else {
          parent.insertBefore(el, remaining[adj]);
        }
      } else {
        // <li>: cross-level move — filter out descendants to avoid circular insertion
        const remaining = allItems.filter(item => item !== el && !el.contains(item));
        // Count how many removed items (el + descendants) are before dropIdx
        let removedBefore = 0;
        for (let i = 0; i < dropIdx && i < allItems.length; i++) {
          if (allItems[i] === el || el.contains(allItems[i])) removedBefore++;
        }
        const adj = dropIdx - removedBefore;

        if (adj >= 0 && adj <= remaining.length) {
          const oldParent = el.parentElement!;
          oldParent.removeChild(el);
          if (oldParent.children.length === 0 && oldParent !== editorRef.current) {
            oldParent.remove();
          }
          if (adj < remaining.length) {
            const targetEl = remaining[adj];
            const targetParent = targetEl.parentElement!;
            targetParent.insertBefore(el, targetEl);
          } else if (remaining.length > 0) {
            const lastEl = remaining[remaining.length - 1];
            const lastParent = lastEl.parentElement!;
            lastParent.insertBefore(el, lastEl.nextSibling);
          }
        }
      }
      syncContent();
    }
    liDragRef.current = null;
    setLiDragging(false);
    setLiDropIndicator(null);
    requestAnimationFrame(recomputeLiPositions);
  }, [syncContent, recomputeLiPositions]);

  // Mouse handlers for li drag (desktop)
  const handleLiMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const el = liElsRef.current[idx];
    if (!el) return;
    const pos = liPositions[idx];
    const elType = pos?.type || "li";

    let parentList: HTMLElement;
    let siblings: HTMLElement[];
    if (elType === "todo") {
      parentList = el.parentElement!;
      siblings = Array.from(parentList.children).filter((c) => c.classList.contains("editor-todo")) as HTMLElement[];
    } else {
      const pl = el.parentElement;
      if (!pl || (pl.tagName !== "UL" && pl.tagName !== "OL")) return;
      parentList = pl;
      siblings = Array.from(pl.children).filter((c) => c.tagName === "LI") as HTMLElement[];
    }
    const srcIdx = siblings.indexOf(el);
    el.style.opacity = "0.4";
    const level = getLiIndentLevel(el);
    const editor = editorRef.current;
    const allItems = editor
      ? elType === "todo"
        ? Array.from(editor.querySelectorAll(".editor-todo")) as HTMLElement[]
        : Array.from(editor.querySelectorAll("li")) as HTMLElement[]
      : [];
    const allSrcIdx = allItems.indexOf(el);
    liDragRef.current = {
      el, elType, intent: "none", startX: e.clientX, startY: e.clientY,
      parentList, siblings, srcIdx,
      indentLevel: level, lastFlashedLevel: level, dropIdx: allSrcIdx,
      allItems, allSrcIdx,
    };
    setLiDragging(true);
  }, [getLiIndentLevel, liPositions]);

  const handleLiMouseMove = useCallback((e: MouseEvent) => {
    const state = liDragRef.current;
    if (!state) return;
    e.preventDefault();
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (state.intent === "none") {
      if (Math.sqrt(dx * dx + dy * dy) >= 10) {
        state.intent = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      } else return;
    }
    if (state.intent === "horizontal") {
      const INDENT_PX = 40;
      const rawDelta = Math.round(dx / INDENT_PX);
      const targetLevel = Math.max(0, Math.min(4, state.indentLevel + rawDelta));
      if (targetLevel !== state.lastFlashedLevel) {
        const diff = targetLevel - state.lastFlashedLevel;
        const success = diff > 0 ? indentLi(state.el) : outdentLi(state.el);
        if (success) {
          state.lastFlashedLevel = getLiIndentLevel(state.el);
          state.el.classList.remove("li-indent-flash");
          void state.el.offsetWidth;
          state.el.classList.add("li-indent-flash");
          if (state.elType === "li") {
            const newParent = state.el.parentElement;
            if (newParent && (newParent.tagName === "UL" || newParent.tagName === "OL")) {
              state.parentList = newParent;
              state.siblings = Array.from(newParent.children).filter((c) => c.tagName === "LI") as HTMLElement[];
              state.srcIdx = state.siblings.indexOf(state.el);
            }
          }
        }
      }
    } else {
      // Vertical mode: iterate over ALL elements of the same type (flat list across all levels)
      const wrapper = editorWrapperRef.current;
      if (!wrapper) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      const items = state.allItems;
      let targetIdx = items.length;
      for (let i = 0; i < items.length; i++) {
        if (items[i] === state.el || state.el.contains(items[i])) continue;
        // Use own-line midpoint so first child position in nested lists is reachable
        if (e.clientY < getOwnMidpoint(items[i])) { targetIdx = i; break; }
      }
      state.dropIdx = targetIdx;
      if (targetIdx < items.length && !state.el.contains(items[targetIdx])) {
        setLiDropIndicator(items[targetIdx].getBoundingClientRect().top - wrapperRect.top);
      } else {
        let last: HTMLElement | null = null;
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i] !== state.el && !state.el.contains(items[i])) { last = items[i]; break; }
        }
        if (last) setLiDropIndicator(last.getBoundingClientRect().bottom - wrapperRect.top);
      }
    }
  }, [indentLi, outdentLi, getLiIndentLevel, getOwnMidpoint]);

  const handleLiMouseUp = useCallback(() => {
    const state = liDragRef.current;
    if (!state) return;
    state.el.style.opacity = "";
    state.el.classList.remove("li-indent-flash");
    if (state.intent === "vertical" && state.dropIdx !== state.allSrcIdx) {
      const { el, elType, allItems, allSrcIdx, dropIdx } = state;
      if (elType === "todo") {
        const parent = el.parentElement!;
        parent.removeChild(el);
        const remaining = allItems.filter(item => item !== el);
        const adj = dropIdx > allSrcIdx ? dropIdx - 1 : dropIdx;
        if (adj >= remaining.length) {
          const last = remaining[remaining.length - 1];
          if (last && last.nextSibling) parent.insertBefore(el, last.nextSibling);
          else parent.appendChild(el);
        } else {
          parent.insertBefore(el, remaining[adj]);
        }
      } else {
        // <li>: cross-level move — filter out descendants to avoid circular insertion
        const remaining = allItems.filter(item => item !== el && !el.contains(item));
        let removedBefore = 0;
        for (let i = 0; i < dropIdx && i < allItems.length; i++) {
          if (allItems[i] === el || el.contains(allItems[i])) removedBefore++;
        }
        const adj = dropIdx - removedBefore;

        if (adj >= 0 && adj <= remaining.length) {
          const oldParent = el.parentElement!;
          oldParent.removeChild(el);
          if (oldParent.children.length === 0 && oldParent !== editorRef.current) {
            oldParent.remove();
          }
          if (adj < remaining.length) {
            const targetEl = remaining[adj];
            const targetParent = targetEl.parentElement!;
            targetParent.insertBefore(el, targetEl);
          } else if (remaining.length > 0) {
            const lastEl = remaining[remaining.length - 1];
            const lastParent = lastEl.parentElement!;
            lastParent.insertBefore(el, lastEl.nextSibling);
          }
        }
      }
      syncContent();
    }
    liDragRef.current = null;
    setLiDragging(false);
    setLiDropIndicator(null);
    requestAnimationFrame(recomputeLiPositions);
  }, [syncContent, recomputeLiPositions]);

  // Global listeners for li drag
  useEffect(() => {
    if (!liDragging) return;
    // Touch
    document.addEventListener("touchmove", handleLiTouchMove, { passive: false });
    document.addEventListener("touchend", handleLiTouchEnd);
    document.addEventListener("touchcancel", handleLiTouchEnd);
    // Mouse
    document.addEventListener("mousemove", handleLiMouseMove);
    document.addEventListener("mouseup", handleLiMouseUp);
    return () => {
      document.removeEventListener("touchmove", handleLiTouchMove);
      document.removeEventListener("touchend", handleLiTouchEnd);
      document.removeEventListener("touchcancel", handleLiTouchEnd);
      document.removeEventListener("mousemove", handleLiMouseMove);
      document.removeEventListener("mouseup", handleLiMouseUp);
    };
  }, [liDragging, handleLiTouchMove, handleLiTouchEnd, handleLiMouseMove, handleLiMouseUp]);

  // ── Slash-command: filtered items ──
  const slashFiltered = useMemo(() => {
    if (!slashFilter) return SLASH_ITEMS;
    const q = slashFilter.toLowerCase();
    return SLASH_ITEMS.filter((it) => it.label.toLowerCase().includes(q) || it.id.includes(q));
  }, [slashFilter]);

  // Reset slashIdx when filter changes
  useEffect(() => {
    setSlashIdx(0);
  }, [slashFilter]);

  // ── Create a table element (2 rows × 3 cols) ──
  const createTable = useCallback((): HTMLTableElement => {
    const table = document.createElement("table");
    for (let r = 0; r < 2; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < 3; c++) {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.innerHTML = "<br>";
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }, []);

  // ── Execute a slash command ──
  const executeSlashCommand = useCallback(
    (id: string) => {
      const blockEl = slashBlockRef.current;
      if (!blockEl || !editorRef.current) return;
      setSlashOpen(false);
      setSlashFilter("");

      switch (id) {
        case "checklist": {
          const todoDiv = document.createElement("div");
          todoDiv.className = "editor-todo";
          todoDiv.setAttribute("data-checked", "false");
          const checkbox = document.createElement("span");
          checkbox.contentEditable = "false";
          checkbox.className = "editor-todo-check";
          todoDiv.appendChild(checkbox);
          const textSpan = document.createElement("span");
          textSpan.className = "editor-todo-text";
          textSpan.innerHTML = "<br>";
          todoDiv.appendChild(textSpan);
          blockEl.replaceWith(todoDiv);
          placeCursorAtStart(textSpan);
          break;
        }
        case "h1": {
          const h = document.createElement("h1");
          h.innerHTML = "<br>";
          blockEl.replaceWith(h);
          placeCursorAtStart(h);
          break;
        }
        case "h2": {
          const h = document.createElement("h2");
          h.innerHTML = "<br>";
          blockEl.replaceWith(h);
          placeCursorAtStart(h);
          break;
        }
        case "h3": {
          const h = document.createElement("h3");
          h.innerHTML = "<br>";
          blockEl.replaceWith(h);
          placeCursorAtStart(h);
          break;
        }
        case "hr": {
          const hr = document.createElement("hr");
          const newP = document.createElement("p");
          newP.innerHTML = "<br>";
          blockEl.replaceWith(hr);
          hr.after(newP);
          placeCursorAtStart(newP);
          break;
        }
        case "table": {
          const table = createTable();
          const newP = document.createElement("p");
          newP.innerHTML = "<br>";
          blockEl.replaceWith(table);
          table.after(newP);
          // Focus first cell
          const firstCell = table.querySelector("td");
          if (firstCell) {
            firstCell.focus();
            placeCursorAtStart(firstCell as HTMLElement);
          }
          break;
        }
      }
      syncContent();
    },
    [placeCursorAtStart, syncContent, createTable]
  );

  // ── Open slash menu at current cursor position ──
  const openSlashMenu = useCallback(
    (blockEl: HTMLElement) => {
      slashBlockRef.current = blockEl;
      setSlashFilter("");
      setSlashIdx(0);
      setSlashOpen(true);
      // Position is computed by the useEffect below after render
    },
    []
  );

  // ── Recompute slash menu position whenever it's open ──
  useEffect(() => {
    if (!slashOpen || !slashBlockRef.current) return;

    const computePos = () => {
      const sel = window.getSelection();
      const wrapperEl = editorRef.current?.parentElement; // the relative container
      if (!sel?.rangeCount || !wrapperEl) return;

      // Get caret rect (cursor position)
      const range = sel.getRangeAt(0);
      let caretRect = range.getBoundingClientRect();
      // Fallback: if caret rect is zero-size (collapsed at <br>), use the block element
      if (caretRect.width === 0 && caretRect.height === 0 && caretRect.top === 0) {
        caretRect = slashBlockRef.current!.getBoundingClientRect();
      }

      const wrapperRect = wrapperEl.getBoundingClientRect();
      const MARGIN = 16;
      const MENU_HEIGHT_EST = 300;
      const MENU_WIDTH = 220;

      // Default: below the caret
      let top = caretRect.bottom - wrapperRect.top + 4;
      let left = caretRect.left - wrapperRect.left;

      // Check if popup would be clipped at the bottom of the viewport
      const spaceBelow = window.innerHeight - caretRect.bottom - MARGIN;
      if (spaceBelow < MENU_HEIGHT_EST) {
        // Show above the caret
        top = caretRect.top - wrapperRect.top - MENU_HEIGHT_EST - 4;
        const absTop = wrapperRect.top + top;
        if (absTop < MARGIN) {
          top = MARGIN - wrapperRect.top;
        }
      }

      // Clamp left so popup stays within viewport
      const absLeft = wrapperRect.left + left;
      if (absLeft + MENU_WIDTH > window.innerWidth - MARGIN) {
        left = window.innerWidth - MARGIN - MENU_WIDTH - wrapperRect.left;
      }
      if (absLeft < MARGIN) {
        left = MARGIN - wrapperRect.left;
      }

      setSlashPos({ top, left });
    };

    // Compute immediately and on scroll/resize
    requestAnimationFrame(computePos);
    const scrollParent = editorRef.current?.closest(".overflow-y-auto");
    scrollParent?.addEventListener("scroll", computePos);
    window.addEventListener("resize", computePos);
    return () => {
      scrollParent?.removeEventListener("scroll", computePos);
      window.removeEventListener("resize", computePos);
    };
  }, [slashOpen]);

  // ── Close slash menu ──
  const closeSlashMenu = useCallback(() => {
    setSlashOpen(false);
    setSlashFilter("");
    slashBlockRef.current = null;
  }, []);

  // ── Table handle state ─────────────────────────────────────────
  const [tableInfos, setTableInfos] = useState<{
    tableEl: HTMLTableElement;
    top: number; left: number; width: number; height: number;
    cols: { left: number; width: number }[];
    rows: { top: number; height: number }[];
  }[]>([]);
  const [tablePopover, setTablePopover] = useState<{
    type: "col" | "row";
    tableEl: HTMLTableElement;
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const tableDoubleTapRef = useRef<{ type: string; tableEl: HTMLTableElement; index: number; time: number } | null>(null);

  const scanTables = useCallback(() => {
    if (!editorRef.current) { setTableInfos([]); return; }
    const wrapper = editorRef.current.parentElement;
    if (!wrapper) return;
    const tables = Array.from(editorRef.current.querySelectorAll("table")) as HTMLTableElement[];
    if (tables.length === 0) { setTableInfos([]); return; }
    const wr = wrapper.getBoundingClientRect();
    setTableInfos(
      tables.map((t) => {
        const tr = t.getBoundingClientRect();
        const cols: { left: number; width: number }[] = [];
        if (t.rows[0]) {
          for (let c = 0; c < t.rows[0].cells.length; c++) {
            const cr = t.rows[0].cells[c].getBoundingClientRect();
            cols.push({ left: cr.left - wr.left, width: cr.width });
          }
        }
        const rows: { top: number; height: number }[] = [];
        for (let r = 0; r < t.rows.length; r++) {
          const rr = t.rows[r].getBoundingClientRect();
          rows.push({ top: rr.top - wr.top, height: rr.height });
        }
        return {
          tableEl: t,
          top: tr.top - wr.top, left: tr.left - wr.left,
          width: tr.width, height: tr.height, cols, rows,
        };
      })
    );
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const scan = () => requestAnimationFrame(scanTables);
    const mo = new MutationObserver(scan);
    mo.observe(editor, { childList: true, subtree: true, attributes: true });
    scan();
    const sp = editor.closest(".overflow-y-auto");
    sp?.addEventListener("scroll", scan);
    window.addEventListener("resize", scan);
    return () => { mo.disconnect(); sp?.removeEventListener("scroll", scan); window.removeEventListener("resize", scan); };
  }, [scanTables]);

  const handleTableDoubleTap = useCallback(
    (e: React.TouchEvent | React.MouseEvent, type: "col" | "row", tableEl: HTMLTableElement, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
      const now = Date.now();
      const prev = tableDoubleTapRef.current;
      if (prev && prev.type === type && prev.tableEl === tableEl && prev.index === index && now - prev.time < 300) {
        // Double tap detected — open popover
        tableDoubleTapRef.current = null;
        const PW = 220, PH = type === "col" ? 210 : 170, M = 16;
        let px = cx, py = cy;
        if (px + PW > window.innerWidth - M) px = window.innerWidth - M - PW;
        if (px < M) px = M;
        if (py + PH > window.innerHeight - M) py = cy - PH;
        if (py < M) py = M;
        setTablePopover({ type, tableEl, index, x: px, y: py });
      } else {
        // First tap — record it
        tableDoubleTapRef.current = { type, tableEl, index, time: now };
      }
    },
    []
  );

  const insertColRight = useCallback((table: HTMLTableElement, colIdx: number) => {
    for (let r = 0; r < table.rows.length; r++) {
      const td = document.createElement("td"); td.contentEditable = "true"; td.innerHTML = "<br>";
      const ref = table.rows[r].cells[colIdx + 1] || null;
      table.rows[r].insertBefore(td, ref);
    }
    setTablePopover(null); syncContent();
  }, [syncContent]);

  const duplicateCol = useCallback((table: HTMLTableElement, colIdx: number) => {
    for (let r = 0; r < table.rows.length; r++) {
      const clone = table.rows[r].cells[colIdx].cloneNode(true) as HTMLTableCellElement;
      clone.contentEditable = "true";
      const ref = table.rows[r].cells[colIdx + 1] || null;
      table.rows[r].insertBefore(clone, ref);
    }
    setTablePopover(null); syncContent();
  }, [syncContent]);

  const moveColRight = useCallback((table: HTMLTableElement, colIdx: number) => {
    const numCols = table.rows[0]?.cells.length || 0;
    if (numCols < 2) return;
    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      const cell = row.cells[colIdx];
      const next = cell.nextElementSibling;
      if (next) { row.insertBefore(next, cell); } else { row.insertBefore(cell, row.cells[0]); }
    }
    setTablePopover(null); syncContent();
  }, [syncContent]);

  const deleteCol = useCallback((table: HTMLTableElement, colIdx: number) => {
    if ((table.rows[0]?.cells.length || 0) <= 1) {
      const p = document.createElement("p"); p.innerHTML = "<br>"; table.replaceWith(p); placeCursorAtStart(p);
    } else {
      for (let r = 0; r < table.rows.length; r++) table.rows[r].deleteCell(colIdx);
    }
    setTablePopover(null); syncContent();
  }, [syncContent, placeCursorAtStart]);

  const insertRowBelow = useCallback((table: HTMLTableElement, rowIdx: number) => {
    const cols = table.rows[0]?.cells.length || 3;
    const nr = table.insertRow(rowIdx + 1);
    for (let c = 0; c < cols; c++) { const td = document.createElement("td"); td.contentEditable = "true"; td.innerHTML = "<br>"; nr.appendChild(td); }
    setTablePopover(null); syncContent();
  }, [syncContent]);

  const duplicateRow = useCallback((table: HTMLTableElement, rowIdx: number) => {
    const clone = table.rows[rowIdx].cloneNode(true) as HTMLTableRowElement;
    Array.from(clone.cells).forEach((c) => { (c as HTMLTableCellElement).contentEditable = "true"; });
    table.rows[rowIdx].after(clone);
    setTablePopover(null); syncContent();
  }, [syncContent]);

  const deleteRow = useCallback((table: HTMLTableElement, rowIdx: number) => {
    if (table.rows.length <= 1) {
      const p = document.createElement("p"); p.innerHTML = "<br>"; table.replaceWith(p); placeCursorAtStart(p);
    } else { table.deleteRow(rowIdx); }
    setTablePopover(null); syncContent();
  }, [syncContent, placeCursorAtStart]);

  useEffect(() => {
    if (!tablePopover) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTablePopover(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tablePopover]);

  // ── Handle input events ──
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    ensureNotEmpty();

    // Check for slash command trigger
    const sel = window.getSelection();
    if (sel?.isCollapsed && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const blockEl = getBlockElement(range.startContainer);
      if (blockEl && (blockEl.tagName === "P" || blockEl.tagName === "DIV") && !blockEl.classList.contains("editor-todo")) {
        const text = blockEl.textContent || "";
        if (text.startsWith("/")) {
          if (!slashOpen) {
            openSlashMenu(blockEl);
          }
          setSlashFilter(text.slice(1));
          syncContent();
          return;
        }
      }
    }

    // Close slash menu if text no longer starts with /
    if (slashOpen) {
      closeSlashMenu();
    }

    // ── Markdown shortcuts via input event (reliable on mobile where keydown is unreliable) ──
    if (sel?.isCollapsed && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const node = sel.anchorNode;
      const blockEl = getBlockElement(range.startContainer);
      if (node && blockEl && (blockEl.tagName === "P" || blockEl.tagName === "DIV") && !blockEl.classList.contains("editor-todo")) {
        const text = node.textContent || "";
        const lineText = text.substring(0, sel.anchorOffset);

        // "- " → bullet list
        if (lineText === "- " || lineText === "\u2013 " || lineText === "\u2014 ") {
          // Preserve any text after the trigger
          const rest = text.substring(sel.anchorOffset);
          const li = document.createElement("li");
          li.innerHTML = rest || "<br>";
          const ul = document.createElement("ul");
          ul.appendChild(li);
          blockEl.replaceWith(ul);
          placeCursorAtStart(li);
          syncContent();
          return;
        }
        // "1. " → numbered list
        if (/^\d+\.\s$/.test(lineText)) {
          const rest = text.substring(sel.anchorOffset);
          const li = document.createElement("li");
          li.innerHTML = rest || "<br>";
          const ol = document.createElement("ol");
          ol.appendChild(li);
          blockEl.replaceWith(ol);
          placeCursorAtStart(li);
          syncContent();
          return;
        }
        // "[] " → to-do
        if (lineText === "[] ") {
          const rest = text.substring(sel.anchorOffset);
          const todoDiv = document.createElement("div");
          todoDiv.className = "editor-todo";
          todoDiv.setAttribute("data-checked", "false");
          const checkbox = document.createElement("span");
          checkbox.contentEditable = "false";
          checkbox.className = "editor-todo-check";
          todoDiv.appendChild(checkbox);
          const textSpan = document.createElement("span");
          textSpan.className = "editor-todo-text";
          textSpan.innerHTML = rest || "<br>";
          todoDiv.appendChild(textSpan);
          blockEl.replaceWith(todoDiv);
          placeCursorAtStart(textSpan);
          syncContent();
          return;
        }
        // "# " → H1, "## " → H2, "### " → H3
        if (lineText === "# ") {
          const rest = text.substring(sel.anchorOffset);
          const h = document.createElement("h1"); h.innerHTML = rest || "<br>"; blockEl.replaceWith(h); placeCursorAtStart(h); syncContent(); return;
        }
        if (lineText === "## ") {
          const rest = text.substring(sel.anchorOffset);
          const h = document.createElement("h2"); h.innerHTML = rest || "<br>"; blockEl.replaceWith(h); placeCursorAtStart(h); syncContent(); return;
        }
        if (lineText === "### ") {
          const rest = text.substring(sel.anchorOffset);
          const h = document.createElement("h3"); h.innerHTML = rest || "<br>"; blockEl.replaceWith(h); placeCursorAtStart(h); syncContent(); return;
        }
      }
    }

    syncContent();
  }, [syncContent, ensureNotEmpty, getBlockElement, placeCursorAtStart, slashOpen, openSlashMenu, closeSlashMenu]);

  // ── Handle keydown ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      const anchorNode = range.startContainer;

      // ─── Slash menu keyboard navigation ─────────────────────
      if (slashOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeSlashMenu();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIdx((prev) => Math.min(prev + 1, slashFiltered.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIdx((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (slashFiltered.length > 0) {
            executeSlashCommand(slashFiltered[Math.min(slashIdx, slashFiltered.length - 1)].id);
          }
          return;
        }
        // Let other keys through (typing filters the menu via handleInput)
        if (e.key === "Backspace") {
          // If the slash block text is just "/", backspace will remove it → close menu
          const blockEl = slashBlockRef.current;
          if (blockEl && (blockEl.textContent || "") === "/") {
            closeSlashMenu();
          }
        }
      }

      // ─── Tab in table cells ─────────────────────────────────
      if (e.key === "Tab") {
        const td = findClosestTag(anchorNode, "TD");
        if (td) {
          e.preventDefault();
          const tr = td.parentElement as HTMLTableRowElement;
          const table = tr?.parentElement as HTMLTableElement;
          if (!tr || !table) return;
          const cells = Array.from(table.querySelectorAll("td"));
          const currentIdx = cells.indexOf(td as HTMLTableCellElement);
          if (currentIdx === -1) return;
          const nextIdx = e.shiftKey ? currentIdx - 1 : currentIdx + 1;
          if (nextIdx >= 0 && nextIdx < cells.length) {
            (cells[nextIdx] as HTMLElement).focus();
            placeCursorAtStart(cells[nextIdx] as HTMLElement);
          }
          return;
        }
      }

      // ─── Enter in table cells ───────────────────────────────
      if (e.key === "Enter" && !e.shiftKey) {
        const td = findClosestTag(anchorNode, "TD");
        if (td) {
          e.preventDefault();
          const tr = td.parentElement as HTMLTableRowElement;
          const table = tr?.parentElement as HTMLTableElement;
          if (!tr || !table) return;
          const cells = Array.from(table.querySelectorAll("td"));
          const currentIdx = cells.indexOf(td as HTMLTableCellElement);
          const isLastCell = currentIdx === cells.length - 1;
          if (isLastCell) {
            // Add new row with same number of columns
            const colCount = tr.cells.length;
            const newTr = document.createElement("tr");
            for (let c = 0; c < colCount; c++) {
              const newTd = document.createElement("td");
              newTd.contentEditable = "true";
              newTd.innerHTML = "<br>";
              newTr.appendChild(newTd);
            }
            table.appendChild(newTr);
            const firstNewCell = newTr.querySelector("td");
            if (firstNewCell) {
              (firstNewCell as HTMLElement).focus();
              placeCursorAtStart(firstNewCell as HTMLElement);
            }
          } else {
            // Move to next cell
            const nextCell = cells[currentIdx + 1];
            if (nextCell) {
              (nextCell as HTMLElement).focus();
              placeCursorAtStart(nextCell as HTMLElement);
            }
          }
          syncContent();
          return;
        }
      }

      // ─── Space: Markdown shortcuts ──────────────────────────
      if (e.key === " ") {
        const blockEl = getBlockElement(anchorNode);
        if (!blockEl) return;
        const tag = blockEl.tagName;
        const text = blockEl.textContent || "";
        const offset = range.startOffset;

        // Only in plain paragraphs/divs (not in lists, not in todo)
        if ((tag === "P" || tag === "DIV") && !blockEl.classList.contains("editor-todo")) {
          const lineStart = text.substring(0, offset);

          // "- " → bullet list
          if (lineStart === "-" || lineStart === "\u2013" || lineStart === "\u2014") {
            e.preventDefault();
            const li = document.createElement("li");
            li.innerHTML = "<br>";
            const ul = document.createElement("ul");
            ul.appendChild(li);
            blockEl.replaceWith(ul);
            placeCursorAtStart(li);
            syncContent();
            return;
          }

          // "1.", "2.", etc. → numbered list
          if (/^\d+\.$/.test(lineStart.trim())) {
            e.preventDefault();
            const li = document.createElement("li");
            li.innerHTML = "<br>";
            const ol = document.createElement("ol");
            ol.appendChild(li);
            blockEl.replaceWith(ol);
            placeCursorAtStart(li);
            syncContent();
            return;
          }

          // "# " → H1
          if (lineStart === "#") {
            e.preventDefault();
            const h = document.createElement("h1");
            h.innerHTML = "<br>";
            blockEl.replaceWith(h);
            placeCursorAtStart(h);
            syncContent();
            return;
          }

          // "## " → H2
          if (lineStart === "##") {
            e.preventDefault();
            const h = document.createElement("h2");
            h.innerHTML = "<br>";
            blockEl.replaceWith(h);
            placeCursorAtStart(h);
            syncContent();
            return;
          }

          // "### " → H3
          if (lineStart === "###") {
            e.preventDefault();
            const h = document.createElement("h3");
            h.innerHTML = "<br>";
            blockEl.replaceWith(h);
            placeCursorAtStart(h);
            syncContent();
            return;
          }

          // "[]" → To-do
          if (lineStart === "[]") {
            e.preventDefault();
            const todoDiv = document.createElement("div");
            todoDiv.className = "editor-todo";
            todoDiv.setAttribute("data-checked", "false");
            const checkbox = document.createElement("span");
            checkbox.contentEditable = "false";
            checkbox.className = "editor-todo-check";
            todoDiv.appendChild(checkbox);
            const textSpan = document.createElement("span");
            textSpan.className = "editor-todo-text";
            textSpan.innerHTML = "<br>";
            todoDiv.appendChild(textSpan);
            blockEl.replaceWith(todoDiv);
            placeCursorAtStart(textSpan);
            syncContent();
            return;
          }
        }
        // Space not a shortcut → let browser handle normally
        return;
      }

      // ─── Tab / Shift+Tab: indent/outdent in todos ──────────
      if (e.key === "Tab") {
        const blockEl = getBlockElement(anchorNode);
        if (blockEl?.classList.contains("editor-todo")) {
          e.preventDefault();
          const current = parseInt(blockEl.getAttribute("data-indent") || "0", 10);
          if (e.shiftKey) {
            if (current > 0) {
              blockEl.setAttribute("data-indent", String(current - 1));
              if (current - 1 === 0) blockEl.removeAttribute("data-indent");
            }
          } else {
            if (current < 3) {
              blockEl.setAttribute("data-indent", String(current + 1));
            }
          }
          syncContent();
          return;
        }
      }

      // ─── Tab / Shift+Tab: indent/outdent in lists ──────────
      if (e.key === "Tab") {
        e.preventDefault();
        const li = findClosestTag(anchorNode, "LI");
        if (!li) return; // not in a list item

        const parentList = li.parentElement;
        if (!parentList || (parentList.tagName !== "UL" && parentList.tagName !== "OL")) return;

        // Save cursor state
        const savedOffset = range.startOffset;
        const savedNode = range.startContainer;

        if (e.shiftKey) {
          // ── Outdent ────────────────────────────────────────
          const grandparentLi = parentList.parentElement;
          if (!grandparentLi || grandparentLi.tagName !== "LI") return; // already at top level
          const outerList = grandparentLi.parentElement;
          if (!outerList) return;

          // Collect siblings after this <li> in the inner list
          const siblingsAfter: Element[] = [];
          let next = li.nextElementSibling;
          while (next) {
            siblingsAfter.push(next);
            next = next.nextElementSibling;
          }

          // Move this <li> after grandparentLi in the outer list
          outerList.insertBefore(li, grandparentLi.nextSibling);

          // If there were siblings after, keep them as a sub-list inside this <li>
          if (siblingsAfter.length > 0) {
            const subList = document.createElement(parentList.tagName.toLowerCase());
            siblingsAfter.forEach((s) => subList.appendChild(s));
            li.appendChild(subList);
          }

          // Clean up empty inner list
          if (parentList.children.length === 0) {
            parentList.remove();
          }
        } else {
          // ── Indent ─────────────────────────────────────────
          const prevLi = li.previousElementSibling;
          if (!prevLi || prevLi.tagName !== "LI") return; // nothing to nest under

          // Find or create a sub-list of same type in previous <li>
          const listTag = parentList.tagName.toLowerCase();
          let subList = prevLi.querySelector(`:scope > ${listTag}`) as HTMLElement | null;
          if (!subList) {
            subList = document.createElement(listTag);
            prevLi.appendChild(subList);
          }
          subList.appendChild(li);
        }

        // Restore cursor position
        try {
          const r = document.createRange();
          r.setStart(savedNode, Math.min(savedOffset, (savedNode.textContent || "").length));
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        } catch {
          placeCursorAtStart(li);
        }

        syncContent();
        return;
      }

      // ─── Enter ─────────────────────────────────────────────
      if (e.key === "Enter" && !e.shiftKey) {
        const blockEl = getBlockElement(range.startContainer);

        // Enter on "---" → insert HR
        if (blockEl?.tagName === "P" && blockEl.textContent === "---") {
          e.preventDefault();
          const hr = document.createElement("hr");
          const newP = document.createElement("p");
          newP.innerHTML = "<br>";
          blockEl.replaceWith(hr);
          hr.after(newP);
          placeCursorAtStart(newP);
          syncContent();
          return;
        }

        // Enter on empty to-do → convert to paragraph
        if (blockEl?.classList.contains("editor-todo")) {
          const textSpan = blockEl.querySelector(".editor-todo-text");
          const todoText = (textSpan?.textContent || "").trim();
          if (!todoText) {
            e.preventDefault();
            const newP = document.createElement("p");
            newP.innerHTML = "<br>";
            blockEl.replaceWith(newP);
            placeCursorAtStart(newP);
            syncContent();
            return;
          }
          // Non-empty to-do: create a new to-do after, preserving indentation
          e.preventDefault();
          const newTodo = document.createElement("div");
          newTodo.className = "editor-todo";
          newTodo.setAttribute("data-checked", "false");
          const indent = blockEl.getAttribute("data-indent");
          if (indent) newTodo.setAttribute("data-indent", indent);
          const newCheck = document.createElement("span");
          newCheck.contentEditable = "false";
          newCheck.className = "editor-todo-check";
          newTodo.appendChild(newCheck);
          const newText = document.createElement("span");
          newText.className = "editor-todo-text";
          newText.innerHTML = "<br>";
          newTodo.appendChild(newText);
          blockEl.after(newTodo);
          placeCursorAtStart(newText);
          syncContent();
          return;
        }

        // Enter on empty <li> → exit or outdent list
        const li = findClosestTag(range.startContainer, "LI");
        if (li && !li.textContent?.trim()) {
          e.preventDefault();
          const parentList = li.parentElement;
          if (!parentList) return;

          const grandparentLi = parentList.parentElement;
          const isNested = grandparentLi?.tagName === "LI";

          if (isNested) {
            // Nested: outdent this empty <li> to parent level
            const outerList = grandparentLi!.parentElement;
            if (!outerList) return;

            const siblingsAfter: Element[] = [];
            let next = li.nextElementSibling;
            while (next) {
              siblingsAfter.push(next);
              next = next.nextElementSibling;
            }

            outerList.insertBefore(li, grandparentLi!.nextSibling);
            li.innerHTML = "<br>";

            if (siblingsAfter.length > 0) {
              const subList = document.createElement(parentList.tagName.toLowerCase());
              siblingsAfter.forEach((s) => subList.appendChild(s));
              li.appendChild(subList);
            }

            if (parentList.children.length === 0) {
              parentList.remove();
            }

            placeCursorAtStart(li);
          } else {
            // Top-level: exit list, insert <p>
            const newP = document.createElement("p");
            newP.innerHTML = "<br>";

            const itemsAfter: Element[] = [];
            let next = li.nextElementSibling;
            while (next) {
              itemsAfter.push(next);
              next = next.nextElementSibling;
            }

            li.remove();
            parentList.after(newP);

            if (itemsAfter.length > 0) {
              const newList = document.createElement(parentList.tagName.toLowerCase());
              itemsAfter.forEach((item) => newList.appendChild(item));
              newP.after(newList);
            }

            if (parentList.children.length === 0) {
              parentList.remove();
            }

            placeCursorAtStart(newP);
          }

          syncContent();
          return;
        }

        // All other Enter: let browser handle natively
        // (new <p>, new <li> in list with content, etc.)
        setTimeout(syncContent, 0);
        return;
      }

      // ─── Backspace ─────────────────────────────────────────
      if (e.key === "Backspace") {
        if (!sel.isCollapsed) {
          setTimeout(syncContent, 0);
          return;
        }

        const blockEl = getBlockElement(range.startContainer);

        // Backspace on empty heading → convert to <p>
        if (blockEl && /^H[1-3]$/.test(blockEl.tagName)) {
          if (range.startOffset === 0 && (!blockEl.textContent || blockEl.textContent.length === 0)) {
            e.preventDefault();
            const newP = document.createElement("p");
            newP.innerHTML = "<br>";
            blockEl.replaceWith(newP);
            placeCursorAtStart(newP);
            syncContent();
            return;
          }
        }

        // Backspace at start of to-do → convert to <p>
        if (blockEl?.classList.contains("editor-todo")) {
          const textSpan = blockEl.querySelector(".editor-todo-text");
          if (textSpan) {
            // Check if cursor is at start of the text span
            let atStart = false;
            if (range.startContainer === textSpan && range.startOffset === 0) {
              atStart = true;
            } else if (range.startContainer.parentNode === textSpan && range.startOffset === 0) {
              // Cursor in a child text node at offset 0
              let node: Node | null = range.startContainer;
              while (node && node !== textSpan) {
                if (node.previousSibling) { atStart = false; break; }
                node = node.parentNode;
              }
              if (node === textSpan) atStart = true;
            }
            if (atStart) {
              e.preventDefault();
              const newP = document.createElement("p");
              newP.innerHTML = textSpan.innerHTML || "<br>";
              blockEl.replaceWith(newP);
              placeCursorAtStart(newP);
              syncContent();
              return;
            }
          }
        }

        // Backspace at start of <li>
        const li = findClosestTag(range.startContainer, "LI");
        if (li && range.startOffset === 0) {
          // Verify cursor is truly at start of <li> content
          let atStart = true;
          let node: Node | null = range.startContainer;
          while (node && node !== li) {
            if (node.previousSibling) {
              let prev: Node | null = node.previousSibling;
              while (prev) {
                if ((prev.textContent || "").length > 0) { atStart = false; break; }
                prev = prev.previousSibling;
              }
              if (!atStart) break;
            }
            node = node.parentNode;
          }

          if (atStart) {
            const parentList = li.parentElement;
            const isNested = parentList?.parentElement?.tagName === "LI";

            if (isNested) {
              // Outdent from nested list
              e.preventDefault();
              const grandparentLi = parentList!.parentElement!;
              const outerList = grandparentLi.parentElement;
              if (!outerList) return;

              const siblingsAfter: Element[] = [];
              let next = li.nextElementSibling;
              while (next) {
                siblingsAfter.push(next);
                next = next.nextElementSibling;
              }

              outerList.insertBefore(li, grandparentLi.nextSibling);

              if (siblingsAfter.length > 0) {
                const subList = document.createElement(parentList!.tagName.toLowerCase());
                siblingsAfter.forEach((s) => subList.appendChild(s));
                li.appendChild(subList);
              }

              if (parentList!.children.length === 0) {
                parentList!.remove();
              }

              placeCursorAtStart(li);
              syncContent();
              return;
            } else if (parentList) {
              // Top-level: convert <li> to <p>
              e.preventDefault();
              const newP = document.createElement("p");
              newP.innerHTML = li.innerHTML || "<br>";
              // Remove any nested sub-lists from the new <p>
              newP.querySelectorAll("ul, ol").forEach((l) => l.remove());

              const itemsAfter: Element[] = [];
              let next = li.nextElementSibling;
              while (next) {
                itemsAfter.push(next);
                next = next.nextElementSibling;
              }

              li.remove();
              parentList.before(newP);

              if (parentList.children.length === 0) {
                parentList.remove();
              }

              placeCursorAtStart(newP);
              syncContent();
              return;
            }
          }
        }

        setTimeout(syncContent, 0);
        return;
      }

      // All other keys: onInput will fire syncContent for character keys
    },
    [getBlockElement, findClosestTag, syncContent, placeCursorAtStart, slashOpen, slashFiltered, slashIdx, closeSlashMenu, executeSlashCommand]
  );

  // ── Click handler for to-do checkboxes ──
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("editor-todo-check")) {
        e.preventDefault();
        e.stopPropagation();
        const todoDiv = target.closest(".editor-todo");
        if (todoDiv) {
          const isChecked = todoDiv.getAttribute("data-checked") === "true";
          todoDiv.setAttribute("data-checked", String(!isChecked));
          syncContent();
        }
      }
    },
    [syncContent]
  );

  // ── Paste handler: plain text only (no execCommand) ──
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      // Move cursor after the inserted text
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      syncContent();
    },
    [syncContent]
  );

  // ── Mouse tracking for drag handle ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!editorRef.current) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target) {
        setHoveredBlockEl(null);
        setHandlePos(null);
        return;
      }
      const block = getBlockElement(target);
      if (block && block !== hoveredBlockEl) {
        setHoveredBlockEl(block);
        const editorRect = editorRef.current.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        setHandlePos({ top: blockRect.top - editorRect.top });
      } else if (!block) {
        setHoveredBlockEl(null);
        setHandlePos(null);
      }
    },
    [getBlockElement, hoveredBlockEl]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredBlockEl(null);
    setHandlePos(null);
  }, []);

  // ── Block DnD via HTML5 API ──
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!hoveredBlockEl || !editorRef.current) return;
      dragSrcRef.current = hoveredBlockEl;
      hoveredBlockEl.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
      // Use a transparent pixel as drag image to avoid default ghost
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      e.dataTransfer.setDragImage(canvas, 0, 0);
    },
    [hoveredBlockEl]
  );

  const handleEditorDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!dragSrcRef.current || !editorRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const children = Array.from(editorRef.current.children) as HTMLElement[];
      let targetIdx = children.length;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          targetIdx = i;
          break;
        }
      }
      setDropIdx(targetIdx);
    },
    []
  );

  const handleEditorDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragSrcRef.current || !editorRef.current || dropIdx === null) return;
      const children = Array.from(editorRef.current.children);
      const srcIdx = children.indexOf(dragSrcRef.current);
      if (srcIdx === -1) return;
      // Remove from current position
      editorRef.current.removeChild(dragSrcRef.current);
      // Re-fetch children after removal
      const newChildren = Array.from(editorRef.current.children);
      const adjustedIdx = dropIdx > srcIdx ? dropIdx - 1 : dropIdx;
      if (adjustedIdx >= newChildren.length) {
        editorRef.current.appendChild(dragSrcRef.current);
      } else {
        editorRef.current.insertBefore(dragSrcRef.current, newChildren[adjustedIdx]);
      }
      dragSrcRef.current.style.opacity = "";
      dragSrcRef.current = null;
      setDropIdx(null);
      syncContent();
    },
    [dropIdx, syncContent]
  );

  const handleDragEnd = useCallback(() => {
    if (dragSrcRef.current) {
      dragSrcRef.current.style.opacity = "";
      dragSrcRef.current = null;
    }
    setDropIdx(null);
  }, []);

  // ── Compute drop indicator position ──
  const dropIndicatorTop = useMemo(() => {
    if (dropIdx === null || !editorRef.current) return null;
    const children = Array.from(editorRef.current.children) as HTMLElement[];
    const editorRect = editorRef.current.getBoundingClientRect();
    if (dropIdx >= children.length) {
      const last = children[children.length - 1];
      return last ? last.getBoundingClientRect().bottom - editorRect.top : 0;
    }
    return children[dropIdx].getBoundingClientRect().top - editorRect.top;
  }, [dropIdx]);

  // ── Title auto-height ──
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = titleRef.current.scrollHeight + "px";
    }
  }, [page.title]);

  // ── Fix title height when container becomes visible (hidden → shown) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && titleRef.current) {
          titleRef.current.style.height = "auto";
          titleRef.current.style.height = titleRef.current.scrollHeight + "px";
        }
      },
      { threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Focus & select title when creating a new page ──
  useEffect(() => {
    if (focusTitle && titleRef.current) {
      // Small delay to ensure the textarea is rendered and visible
      requestAnimationFrame(() => {
        if (titleRef.current) {
          titleRef.current.focus();
          titleRef.current.select();
          onClearFocusTitle?.();
        }
      });
    }
  }, [focusTitle, onClearFocusTitle]);

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide relative">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-40 md:max-w-none md:mx-0 md:pl-4 md:pr-4">
        {/* Page icon */}
        <button
          onClick={onOpenEmojiPicker}
          className="text-4xl mb-2 hover:bg-surface-2 rounded-xl p-2 -ml-2 transition"
        >
          {page.icon}
        </button>

        {/* Page title */}
        <textarea
          ref={titleRef}
          value={page.title}
          onChange={(e) => {
            onUpdatePage({ title: e.target.value });
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              if (editorRef.current) {
                editorRef.current.focus();
                const first = editorRef.current.firstElementChild;
                if (first) {
                  const r = document.createRange();
                  r.setStart(first, 0);
                  r.collapse(true);
                  const sel = window.getSelection();
                  sel?.removeAllRanges();
                  sel?.addRange(r);
                }
              }
            }
          }}
          className="w-full text-2xl font-bold text-text-1 bg-transparent border-0 outline-none resize-none placeholder:text-text-3 mb-4"
          placeholder="Unbenannt"
          rows={1}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          style={{ overflow: "hidden" }}
        />

        {/* Single contentEditable editor with drag handle overlay */}
        <div
          ref={editorWrapperRef}
          className="relative"
          style={{ marginLeft: -32, paddingLeft: 32 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onDragOver={handleEditorDragOver}
          onDrop={handleEditorDrop}
          onDragEnd={handleDragEnd}
        >
          {/* Drag handle - appears on hover */}
          {handlePos && !dragSrcRef.current && (
            <div
              className="absolute z-10 transition-opacity opacity-0 hover:opacity-100"
              style={{ top: handlePos.top, left: 0, width: 28 }}
            >
              <div
                draggable
                onDragStart={handleDragStart}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-2 text-text-3 cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* Drop indicator line */}
          {dropIndicatorTop !== null && (
            <div
              className="absolute left-8 right-0 h-0.5 bg-accent z-20 pointer-events-none"
              style={{ top: dropIndicatorTop }}
            />
          )}

          {/* The editor */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="editor-content outline-none min-h-[200px]"
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onClick={(e) => {
              handleClick(e);
              // Close slash menu on click outside it
              if (slashOpen && slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
                closeSlashMenu();
              }
            }}
            onPaste={handlePaste}
            onBlur={(e) => {
              // Don't close slash menu if focus moved into it
              if (slashMenuRef.current?.contains(e.relatedTarget as Node)) return;
              if (slashOpen) closeSlashMenu();
              ensureNotEmpty();
              syncContent();
            }}
          />

          {/* Slash-command popup */}
          {slashOpen && slashFiltered.length > 0 && (
            <div
              ref={slashMenuRef}
              className="absolute z-30 bg-surface rounded-xl py-1 min-w-[200px] max-h-[60vh] overflow-y-auto"
              style={{ boxShadow: "var(--shadow-elevated)", border: "1px solid var(--zu-border)", top: slashPos.top, left: slashPos.left }}
            >
              {slashFiltered.map((item, i) => (
                <button
                  key={item.id}
                  className={`flex items-center gap-3 w-full px-3 py-2 text-sm text-left transition ${
                    i === slashIdx ? "bg-accent-light text-accent-dark" : "text-text-2 hover:bg-surface-2"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blur
                    executeSlashCommand(item.id);
                  }}
                  onMouseEnter={() => setSlashIdx(i)}
                >
                  <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold flex-shrink-0">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Table column/row handles */}
          {tableInfos.map((info, ti) => (
            <div key={`th-${ti}`} className="contents">
              {/* Corner square */}
              <div
                className="absolute bg-border z-10 pointer-events-none"
                style={{ top: info.top - 8, left: info.left - 8, width: 8, height: 8, userSelect: "none" }}
              />
              {/* Column handles */}
              {info.cols.map((col, ci) => (
                <div
                  key={`col-${ci}`}
                  className="absolute bg-surface-2 border-b border-border z-10 cursor-default"
                  style={{ top: info.top - 8, left: col.left, width: col.width, height: 8, userSelect: "none" }}
                  onTouchStart={(e) => handleTableDoubleTap(e, "col", info.tableEl, ci)}
                  onMouseDown={(e) => handleTableDoubleTap(e, "col", info.tableEl, ci)}
                />
              ))}
              {/* Row handles */}
              {info.rows.map((row, ri) => (
                <div
                  key={`row-${ri}`}
                  className="absolute bg-surface-2 border-r border-border z-10 cursor-default"
                  style={{ top: row.top, left: info.left - 8, width: 8, height: row.height, userSelect: "none" }}
                  onTouchStart={(e) => handleTableDoubleTap(e, "row", info.tableEl, ri)}
                  onMouseDown={(e) => handleTableDoubleTap(e, "row", info.tableEl, ri)}
                />
              ))}
            </div>
          ))}

          {/* Table action popover */}
          {tablePopover && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setTablePopover(null)} />
              <div
                className="fixed z-[65] bg-surface rounded-xl p-2 min-w-[200px]"
                style={{ left: tablePopover.x, top: tablePopover.y, boxShadow: 'var(--shadow-elevated)' }}
              >
                {tablePopover.type === "col" ? (
                  <>
                    <button
                      onClick={() => insertColRight(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-text-2 rounded-lg hover:bg-surface-2 transition"
                    >
                      Spalte rechts einf{"\u00fc"}gen
                    </button>
                    <button
                      onClick={() => duplicateCol(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-text-2 rounded-lg hover:bg-surface-2 transition"
                    >
                      Spalte duplizieren
                    </button>
                    <button
                      onClick={() => moveColRight(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-text-2 rounded-lg hover:bg-surface-2 transition"
                    >
                      Spalte verschieben &rarr;
                    </button>
                    <button
                      onClick={() => deleteCol(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-danger rounded-lg hover:bg-danger-light transition"
                    >
                      Spalte l{"\u00f6"}schen
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => insertRowBelow(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-text-2 rounded-lg hover:bg-surface-2 transition"
                    >
                      Zeile darunter einf{"\u00fc"}gen
                    </button>
                    <button
                      onClick={() => duplicateRow(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-text-2 rounded-lg hover:bg-surface-2 transition"
                    >
                      Zeile duplizieren
                    </button>
                    <button
                      onClick={() => deleteRow(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-danger rounded-lg hover:bg-danger-light transition"
                    >
                      Zeile l{"\u00f6"}schen
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* Drag handles for li and todo items */}
          {!liDragging && liPositions.map((pos, i) => (
            <div
              key={i}
              className="li-drag-handle"
              style={{ top: pos.top, left: pos.left, height: HANDLE_LINE_H }}
              onTouchStart={(e) => handleLiTouchStart(e, i)}
              onMouseDown={(e) => handleLiMouseDown(e, i)}
              onContextMenu={(e) => e.preventDefault()}
              role="presentation"
              aria-hidden="true"
            >
              <GripVertical className="w-3 h-3" />
            </div>
          ))}

          {/* Li vertical drag drop indicator */}
          {liDropIndicator !== null && (
            <div
              className="absolute left-8 right-0 h-0.5 bg-accent z-20 pointer-events-none rounded-full"
              style={{ top: liDropIndicator }}
            />
          )}
        </div>
      </div>


    </div>
  );
}
