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
  ChevronUp,
  ChevronDown,
  Plus,
  Search,
  X,
  GripVertical,
  MoreHorizontal,
  FolderPlus,
  Trash2,
  IndentIncrease,
  IndentDecrease,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { apiFetch } from "../supabase-client";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
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

// ── Migration from old block format ──────────────────────────────────

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

  // ── Load data ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, bRes] = await Promise.all([
          apiFetch(`/custom-pages?household_id=${HOUSEHOLD_ID}`),
          apiFetch(`/custom-blocks?household_id=${HOUSEHOLD_ID}`),
        ]);
        if (cancelled) return;
        const loadedPages: Page[] = pRes.pages || [];
        const rawBlocks = bRes.blocks;

        if (loadedPages.length === 0) {
          setPages(DEFAULT_PAGES);
          setPageContents(DEFAULT_CONTENTS);
          setActivePageId("p1");
          saveData(DEFAULT_PAGES, DEFAULT_CONTENTS);
        } else {
          // Detect format: new format is an object/map, old format is an array
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
          setActivePageId(loadedPages[0]?.id || null);
        }
        setLoaded(true);
      } catch (err) {
        console.error("Fehler beim Laden der Listen-Daten:", err);
        setPages(DEFAULT_PAGES);
        setPageContents(DEFAULT_CONTENTS);
        setActivePageId("p1");
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Save helpers ───────────────────────────────────────────────
  const saveData = useCallback(async (p: Page[], c: PageContents) => {
    try {
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

  const scheduleSave = useCallback(
    (p: Page[], c: PageContents) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveData(p, c), 500);
    },
    [saveData]
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

  // ── DnD sensors (for sidebar page reordering) ─────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // ── Render ─────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
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
    />
  );

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div className="w-60 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 flex flex-col min-h-0">
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
          <div className="fixed inset-y-0 left-0 w-72 bg-white z-50 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-900">Seiten</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {sidebar}
          </div>
        </>
      )}

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Mobile header — only hamburger, emoji+title are in the content area */}
        {isMobile && (
          <div className="flex-shrink-0 flex items-center px-4 py-2 bg-white border-b border-gray-100">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <Menu className="w-5 h-5 text-gray-600" />
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
          <div className="flex-1 flex items-center justify-center text-gray-400">
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

      {/* Context menu popover — rendered at top level to avoid stacking context issues */}
      {contextMenu && (() => {
        const isTouchDevice = 'ontouchstart' in window;
        const cmPage = pages.find((p) => p.id === contextMenu.pageId);
        const cmSiblings = cmPage
          ? pages.filter((p) => p.parent_id === cmPage.parent_id).sort((a, b) => a.position - b.position)
          : [];
        const cmIdx = cmSiblings.findIndex((p) => p.id === contextMenu.pageId);
        const canMoveUp = cmIdx > 0;
        const canMoveDown = cmIdx >= 0 && cmIdx < cmSiblings.length - 1;
        // Can indent if there's a sibling above (becomes child of sibling above)
        const canIndent = cmIdx > 0;
        // Can outdent if the page has a parent
        const canOutdent = cmPage ? cmPage.parent_id !== null : false;

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
              className="fixed z-[70] bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 min-w-[192px]"
              style={{ left: contextMenu.x + 4, top: contextMenu.y }}
            >
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  createPage(contextMenu.pageId);
                  setContextMenu(null);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 cursor-pointer w-full text-sm text-gray-700 transition whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4 text-gray-400" /> Unterseite erstellen
              </button>

              {/* Mobile-only move options */}
              {isTouchDevice && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    disabled={!canMoveUp}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (canMoveUp && cmPage) {
                        movePage(contextMenu.pageId, cmPage.parent_id, cmIdx - 1);
                        setContextMenu(null);
                      }
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 cursor-pointer w-full text-sm text-gray-700 transition whitespace-nowrap disabled:opacity-30 disabled:cursor-default"
                  >
                    <ArrowUp className="w-4 h-4 text-gray-400" /> Nach oben
                  </button>
                  <button
                    disabled={!canMoveDown}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (canMoveDown && cmPage) {
                        movePage(contextMenu.pageId, cmPage.parent_id, cmIdx + 1);
                        setContextMenu(null);
                      }
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 cursor-pointer w-full text-sm text-gray-700 transition whitespace-nowrap disabled:opacity-30 disabled:cursor-default"
                  >
                    <ArrowDown className="w-4 h-4 text-gray-400" /> Nach unten
                  </button>
                  <button
                    disabled={!canIndent}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (canIndent && cmPage) {
                        const siblingAbove = cmSiblings[cmIdx - 1];
                        // Make child of sibling above, at the end
                        const siblingChildren = pages.filter((p) => p.parent_id === siblingAbove.id);
                        movePage(contextMenu.pageId, siblingAbove.id, siblingChildren.length);
                        setExpandedPages((prev) => new Set(prev).add(siblingAbove.id));
                        setContextMenu(null);
                      }
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 cursor-pointer w-full text-sm text-gray-700 transition whitespace-nowrap disabled:opacity-30 disabled:cursor-default"
                  >
                    <IndentIncrease className="w-4 h-4 text-gray-400" /> Einr{"\u00fc"}cken
                  </button>
                  <button
                    disabled={!canOutdent}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (canOutdent && cmPage && cmPage.parent_id) {
                        const parent = pages.find((p) => p.id === cmPage.parent_id);
                        const grandparentId = parent ? parent.parent_id : null;
                        const gpSiblings = pages
                          .filter((p) => p.parent_id === grandparentId)
                          .sort((a, b) => a.position - b.position);
                        const parentIdx = gpSiblings.findIndex((p) => p.id === cmPage.parent_id);
                        movePage(contextMenu.pageId, grandparentId, parentIdx + 1);
                        setContextMenu(null);
                      }
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 cursor-pointer w-full text-sm text-gray-700 transition whitespace-nowrap disabled:opacity-30 disabled:cursor-default"
                  >
                    <IndentDecrease className="w-4 h-4 text-gray-400" /> Ausr{"\u00fc"}cken
                  </button>
                </>
              )}

              <div className="border-t border-gray-100 my-1" />
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteConfirmPageId(contextMenu.pageId);
                  setContextMenu(null);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-50 cursor-pointer w-full text-sm text-red-500 transition whitespace-nowrap"
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
            <div className="bg-white rounded-xl shadow-lg w-[320px] mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-gray-900 text-center">Seite l&ouml;schen?</h3>
              <p className="text-sm text-gray-500 text-center mt-2">
                {targetPage ? `\u201E${targetPage.icon} ${targetPage.title}\u201C` : "Diese Seite"}{hasSubpages ? " und alle Unterseiten werden" : " wird"} unwiderruflich gel&ouml;scht.
              </p>
              <div className="flex justify-center gap-3 mt-5">
                <button
                  onClick={() => setDeleteConfirmPageId(null)}
                  className="flex-1 py-2.5 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    deletePage(deleteConfirmPageId);
                    setDeleteConfirmPageId(null);
                  }}
                  className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition cursor-pointer"
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
    sensors, onMovePage,
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

  // ── Intelligent DnD state ──
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragActiveWidth, setDragActiveWidth] = useState<number>(0);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const rowRefsMap = useRef<Map<string, HTMLElement>>(new Map());

  const registerRowRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      rowRefsMap.current.set(id, el);
    } else {
      rowRefsMap.current.delete(id);
    }
  }, []);

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
      if (!dragActiveId) return;
      // Calculate cursor Y position
      const activatorEvent = event.activatorEvent as MouseEvent | TouchEvent;
      let startY = 0;
      if ("touches" in activatorEvent) {
        startY = activatorEvent.touches[0].clientY;
      } else {
        startY = activatorEvent.clientY;
      }
      const cursorY = startY + event.delta.y;

      // Find which row the cursor is over
      let found: DropPreview | null = null;
      for (const pageId of flatVisibleIds) {
        if (pageId === dragActiveId) continue;
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
    [dragActiveId, flatVisibleIds]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      if (dropPreview) {
        const targetPage = pages.find((p) => p.id === dropPreview.targetId);
        if (targetPage) {
          if (dropPreview.zone === "middle") {
            // Make child of target page, position 0
            onMovePage(activeId, dropPreview.targetId, 0);
          } else {
            // Insert above or below target, same parent as target
            const parentId = targetPage.parent_id;
            const siblings = pages
              .filter((p) => p.parent_id === parentId && p.id !== activeId)
              .sort((a, b) => a.position - b.position);
            const targetIdx = siblings.findIndex((p) => p.id === dropPreview.targetId);
            const newPosition = dropPreview.zone === "top" ? targetIdx : targetIdx + 1;
            onMovePage(activeId, parentId, Math.max(0, newPosition));
          }
        }
      }
      setDragActiveId(null);
      setDragActiveWidth(0);
      setDropPreview(null);
    },
    [dropPreview, pages, onMovePage]
  );

  const handleDragCancel = useCallback(() => {
    setDragActiveId(null);
    setDragActiveWidth(0);
    setDropPreview(null);
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
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Seiten durchsuchen..."
            value={searchQuery}
            onChange={(e) => onSetSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-100 rounded-lg border-0 outline-none focus:ring-2 focus:ring-orange-300 placeholder:text-gray-400"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
          />
          {searchQuery && (
            <button
              onClick={() => onSetSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {searchQuery.trim() && (
        <div className="px-2 pb-2 max-h-60 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-2">Keine Ergebnisse</p>
          ) : (
            searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => onSearchResultClick(r.pageId)}
                className="w-full text-left px-2 py-1.5 text-sm text-gray-700 rounded-lg hover:bg-orange-50 transition truncate"
              >
                {r.snippet}
              </button>
            ))
          )}
        </div>
      )}

      {/* New page button */}
      {!searchQuery.trim() && (
        <>
          <div className="px-3 pb-2">
            <button
              onClick={() => onCreatePage(null)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Neue Seite</span>
            </button>
          </div>

          {/* Page tree */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 scrollbar-hide">
            <DndContext
              sensors={sensors}
              modifiers={[restrictToVerticalAxis]}
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
                />
              ))}
              <DragOverlay dropAnimation={null}>
                {dragActivePage ? (
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white shadow-lg border border-orange-200 text-sm text-gray-700 opacity-90"
                    style={{ width: dragActiveWidth || "auto" }}
                  >
                    <GripVertical className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    <span className="text-sm flex-shrink-0">{dragActivePage.icon}</span>
                    <span className="flex-1 min-w-0 truncate">{dragActivePage.title}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </>
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
    dragActiveId, dropPreview, registerRowRef, groupChevronMap,
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
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMovedRef = useRef(false);
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

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    longPressMovedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      // Only open popover if no movement was detected (i.e. not a drag)
      if (!longPressMovedRef.current) {
        onContextMenu(page.id, clientX, clientY);
      }
    }, 500);
  };

  const handleLongPressMove = () => {
    // Movement detected → this is a drag, not a popover trigger
    longPressMovedRef.current = true;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

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
        <div className="absolute top-0 right-2 h-0.5 bg-orange-500 z-10 rounded-full pointer-events-none" style={{ left: indent }} />
      )}

      <div
        ref={(el) => { rowRef.current = el; }}
        className={`group flex items-center py-1 pr-1 rounded-lg cursor-pointer transition text-sm ${
          showMiddleHighlight
            ? "bg-orange-50 border border-orange-200"
            : isActive
              ? "bg-orange-50 text-orange-600"
              : "text-gray-700 hover:bg-gray-100"
        } ${isDragging ? "opacity-30" : ""}`}
        style={{ paddingLeft: indent }}
        onClick={() => !isRenaming && onSelect(page.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(page.id, e.clientX, e.clientY);
        }}
        onTouchStart={handleLongPressStart}
        onTouchMove={handleLongPressMove}
        onTouchEnd={handleLongPressEnd}
        onTouchCancel={handleLongPressEnd}
      >
        {/* Drag handle — fixed 20px */}
        <div
          ref={setDragRef}
          {...attributes}
          {...listeners}
          className="flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
          style={{ width: COL_DRAG }}
        >
          <GripVertical className="w-3.5 h-3.5 text-gray-300" />
        </div>

        {/* Chevron — 20px column, only rendered when sibling group needs it */}
        {groupNeedsChevron && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) onToggleExpand(page.id);
            }}
            className={`flex-shrink-0 flex items-center justify-center text-gray-400 ${
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
        <span className="text-sm flex-shrink-0 mr-1">{page.icon}</span>

        {/* Title */}
        {isRenaming ? (
          <input
            ref={renameRef}
            defaultValue={page.title}
            className="flex-1 min-w-0 text-sm bg-white border border-orange-300 rounded px-1 py-0 outline-none"
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

        {/* Context menu button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(page.id, e.clientX, e.clientY);
          }}
          className="w-5 h-5 flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-gray-200"
        >
          <MoreHorizontal className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      {/* Bottom drop indicator line */}
      {showBottomLine && (
        <div className="absolute bottom-0 right-2 h-0.5 bg-orange-500 z-10 rounded-full pointer-events-none" style={{ left: indent }} />
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

  // Mobile indent toolbar state
  const [cursorInLi, setCursorInLi] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track visualViewport for keyboard height
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kbH = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardHeight(Math.max(0, kbH));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Track whether cursor is inside an <li>
  useEffect(() => {
    const checkCursorInLi = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount || !editorRef.current) { setCursorInLi(false); return; }
      let node: Node | null = sel.getRangeAt(0).startContainer;
      while (node && node !== editorRef.current) {
        if (node instanceof HTMLElement && node.tagName === "LI") { setCursorInLi(true); return; }
        node = node.parentNode;
      }
      setCursorInLi(false);
    };
    document.addEventListener("selectionchange", checkCursorInLi);
    return () => document.removeEventListener("selectionchange", checkCursorInLi);
  }, []);

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

  // ── Indent/Outdent helpers for the mobile toolbar ──
  const handleMobileIndent = useCallback(() => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !editorRef.current) return;
    const li = findClosestTag(sel.getRangeAt(0).startContainer, "LI");
    if (!li) return;
    const parentList = li.parentElement;
    if (!parentList || (parentList.tagName !== "UL" && parentList.tagName !== "OL")) return;
    const prevLi = li.previousElementSibling;
    if (!prevLi || prevLi.tagName !== "LI") return;
    const listTag = parentList.tagName.toLowerCase();
    let subList = prevLi.querySelector(`:scope > ${listTag}`) as HTMLElement | null;
    if (!subList) { subList = document.createElement(listTag); prevLi.appendChild(subList); }
    subList.appendChild(li);
    placeCursorAtStart(li);
    syncContent();
  }, [findClosestTag, placeCursorAtStart, syncContent]);

  const handleMobileOutdent = useCallback(() => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !editorRef.current) return;
    const li = findClosestTag(sel.getRangeAt(0).startContainer, "LI");
    if (!li) return;
    const parentList = li.parentElement;
    if (!parentList) return;
    const grandparentLi = parentList.parentElement;
    if (!grandparentLi || grandparentLi.tagName !== "LI") return;
    const outerList = grandparentLi.parentElement;
    if (!outerList) return;
    const siblingsAfter: Element[] = [];
    let next = li.nextElementSibling;
    while (next) { siblingsAfter.push(next); next = next.nextElementSibling; }
    outerList.insertBefore(li, grandparentLi.nextSibling);
    if (siblingsAfter.length > 0) {
      const subList = document.createElement(parentList.tagName.toLowerCase());
      siblingsAfter.forEach((s) => subList.appendChild(s));
      li.appendChild(subList);
    }
    if (parentList.children.length === 0) parentList.remove();
    placeCursorAtStart(li);
    syncContent();
  }, [findClosestTag, placeCursorAtStart, syncContent]);

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

    // ── Mobile fallback: detect "- " via input event for bullet list ──
    if (sel?.isCollapsed && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const blockEl = getBlockElement(range.startContainer);
      if (blockEl && (blockEl.tagName === "P" || blockEl.tagName === "DIV") && !blockEl.classList.contains("editor-todo")) {
        const text = blockEl.textContent || "";
        if (text === "- " || text === "\u2013 " || text === "\u2014 ") {
          const li = document.createElement("li");
          li.innerHTML = "<br>";
          const ul = document.createElement("ul");
          ul.appendChild(li);
          blockEl.replaceWith(ul);
          placeCursorAtStart(li);
          syncContent();
          return;
        }
        // "1. " → numbered list
        if (/^\d+\.\s$/.test(text)) {
          const li = document.createElement("li");
          li.innerHTML = "<br>";
          const ol = document.createElement("ol");
          ol.appendChild(li);
          blockEl.replaceWith(ol);
          placeCursorAtStart(li);
          syncContent();
          return;
        }
        // "[] " → to-do
        if (text === "[] ") {
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
        // "# " → H1, "## " → H2, "### " → H3
        if (text === "# ") {
          const h = document.createElement("h1"); h.innerHTML = "<br>"; blockEl.replaceWith(h); placeCursorAtStart(h); syncContent(); return;
        }
        if (text === "## ") {
          const h = document.createElement("h2"); h.innerHTML = "<br>"; blockEl.replaceWith(h); placeCursorAtStart(h); syncContent(); return;
        }
        if (text === "### ") {
          const h = document.createElement("h3"); h.innerHTML = "<br>"; blockEl.replaceWith(h); placeCursorAtStart(h); syncContent(); return;
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
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-40 md:max-w-none md:mx-0 md:pl-4 md:pr-4">
        {/* Page icon */}
        <button
          onClick={onOpenEmojiPicker}
          className="text-4xl mb-2 hover:bg-gray-50 rounded-xl p-2 -ml-2 transition"
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
          className="w-full text-2xl font-bold text-gray-900 bg-transparent border-0 outline-none resize-none placeholder:text-gray-300 mb-4"
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
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* Drop indicator line */}
          {dropIndicatorTop !== null && (
            <div
              className="absolute left-8 right-0 h-0.5 bg-orange-500 z-20 pointer-events-none"
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
              className="absolute z-30 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[200px] max-h-[60vh] overflow-y-auto"
              style={{ top: slashPos.top, left: slashPos.left }}
            >
              {slashFiltered.map((item, i) => (
                <button
                  key={item.id}
                  className={`flex items-center gap-3 w-full px-3 py-2 text-sm text-left transition ${
                    i === slashIdx ? "bg-orange-50 text-orange-600" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blur
                    executeSlashCommand(item.id);
                  }}
                  onMouseEnter={() => setSlashIdx(i)}
                >
                  <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold flex-shrink-0">
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
                className="absolute bg-gray-200 z-10 pointer-events-none"
                style={{ top: info.top - 8, left: info.left - 8, width: 8, height: 8, userSelect: "none" }}
              />
              {/* Column handles */}
              {info.cols.map((col, ci) => (
                <div
                  key={`col-${ci}`}
                  className="absolute bg-gray-100 border-b border-gray-200 z-10 cursor-default"
                  style={{ top: info.top - 8, left: col.left, width: col.width, height: 8, userSelect: "none" }}
                  onTouchStart={(e) => handleTableDoubleTap(e, "col", info.tableEl, ci)}
                  onMouseDown={(e) => handleTableDoubleTap(e, "col", info.tableEl, ci)}
                />
              ))}
              {/* Row handles */}
              {info.rows.map((row, ri) => (
                <div
                  key={`row-${ri}`}
                  className="absolute bg-gray-100 border-r border-gray-200 z-10 cursor-default"
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
                className="fixed z-[65] bg-white rounded-xl shadow-lg p-2 min-w-[200px]"
                style={{ left: tablePopover.x, top: tablePopover.y }}
              >
                {tablePopover.type === "col" ? (
                  <>
                    <button
                      onClick={() => insertColRight(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      Spalte rechts einf{"\u00fc"}gen
                    </button>
                    <button
                      onClick={() => duplicateCol(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      Spalte duplizieren
                    </button>
                    <button
                      onClick={() => moveColRight(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      Spalte verschieben &rarr;
                    </button>
                    <button
                      onClick={() => deleteCol(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-red-500 rounded-lg hover:bg-red-50 transition"
                    >
                      Spalte l{"\u00f6"}schen
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => insertRowBelow(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      Zeile darunter einf{"\u00fc"}gen
                    </button>
                    <button
                      onClick={() => duplicateRow(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      Zeile duplizieren
                    </button>
                    <button
                      onClick={() => deleteRow(tablePopover.tableEl, tablePopover.index)}
                      className="flex items-center w-full py-3 px-4 text-sm text-red-500 rounded-lg hover:bg-red-50 transition"
                    >
                      Zeile l{"\u00f6"}schen
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile indent/outdent toolbar above keyboard */}
      {cursorInLi && keyboardHeight > 0 && (
        <div
          className="fixed left-0 right-0 z-50 flex items-center justify-center gap-1 bg-gray-100 border-t border-gray-200 px-3 py-1.5"
          style={{ bottom: keyboardHeight }}
        >
          <button
            onPointerDown={(e) => { e.preventDefault(); handleMobileOutdent(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 active:bg-orange-50 active:border-orange-300 transition shadow-sm"
          >
            <IndentDecrease className="w-4 h-4" />
            <span className="text-xs">{"\u2190"} Ausr{"\u00fc"}cken</span>
          </button>
          <button
            onPointerDown={(e) => { e.preventDefault(); handleMobileIndent(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 active:bg-orange-50 active:border-orange-300 transition shadow-sm"
          >
            <IndentIncrease className="w-4 h-4" />
            <span className="text-xs">Einr{"\u00fc"}cken {"\u2192"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
