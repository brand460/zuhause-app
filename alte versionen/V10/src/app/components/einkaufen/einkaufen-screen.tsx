import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Minus,
  GripVertical,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Search,
  X,
  Store,
  ArrowUpDown,
  Settings,
  ShoppingBag,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  ShoppingItem,
  StoreInfo,
  DEFAULT_STORES,
  getCategoriesForStore,
  searchGroceries,
  findGroceryTemplate,
  getQuickSuggestions,
  getLogoUrl,
  generateId,
  DEV_HOUSEHOLD_ID,
  STORE_SUGGESTIONS,
  StoreSuggestion,
  GroceryTemplate,
  GROCERY_DATABASE,
  getAllCategories,
} from "./shopping-data";
import { API_BASE } from "../supabase-client";
import { publicAnonKey } from "/utils/supabase/info";
import { useKeyboardHeight } from "./use-keyboard-height";

// ── Types ──────────────────────────────────────────────────────────
interface StoreSettingEntry {
  store_id: string;
  position: number;
  is_visible: boolean;
  category_order: string[];
}

// ── API helpers ────────────────────────────────────────────────────
async function fetchItems(): Promise<ShoppingItem[]> {
  try {
    const res = await fetch(
      `${API_BASE}/shopping?household_id=${DEV_HOUSEHOLD_ID}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    const json = await res.json();
    return json.items || [];
  } catch (err) {
    console.log("fetchItems error:", err);
    return [];
  }
}

async function saveItems(items: ShoppingItem[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/shopping`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: DEV_HOUSEHOLD_ID, items }),
    });
  } catch (err) {
    console.log("saveItems error:", err);
  }
}

async function fetchStoreSettings(): Promise<StoreSettingEntry[]> {
  try {
    const res = await fetch(
      `${API_BASE}/store-settings?household_id=${DEV_HOUSEHOLD_ID}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    const json = await res.json();
    return json.settings || [];
  } catch (err) {
    console.log("fetchStoreSettings error:", err);
    return [];
  }
}

async function saveStoreSettings(settings: StoreSettingEntry[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/store-settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: DEV_HOUSEHOLD_ID, settings }),
    });
  } catch (err) {
    console.log("saveStoreSettings error:", err);
  }
}

async function fetchCustomCategories(): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE}/custom-categories?household_id=${DEV_HOUSEHOLD_ID}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    const json = await res.json();
    return json.categories || [];
  } catch (err) {
    console.log("fetchCustomCategories error:", err);
    return [];
  }
}

async function saveCustomCategories(categories: string[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/custom-categories`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: DEV_HOUSEHOLD_ID, categories }),
    });
  } catch (err) {
    console.log("saveCustomCategories error:", err);
  }
}

// ── Global items API helpers ───────────────────────────────────────
interface GlobalItem {
  name: string;
  category: string;
  created_by_household_id: string;
  times_used: number;
}

async function fetchGlobalItems(): Promise<GlobalItem[]> {
  try {
    const res = await fetch(
      `${API_BASE}/global-items?household_id=${DEV_HOUSEHOLD_ID}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    const json = await res.json();
    return json.items || [];
  } catch (err) {
    console.log("fetchGlobalItems error:", err);
    return [];
  }
}

async function upsertGlobalItem(name: string, category: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/global-items`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ household_id: DEV_HOUSEHOLD_ID, name, category }),
    });
  } catch (err) {
    console.log("upsertGlobalItem error:", err);
  }
}

// ── Store Logo Avatar ──────────────────────────────────────────────
function StoreLogo({
  store,
  size = 48,
  isSelected,
}: {
  store: StoreInfo;
  size?: number;
  isSelected?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = getLogoUrl(store.domain);
  const showLogo = logoUrl && !imgError;
  const isAlleStore = store.id === "alle";

  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden transition-all"
      style={{
        width: size,
        height: size,
        backgroundColor: isAlleStore ? "var(--color-surface-2)" : (showLogo ? "var(--color-surface-2)" : (imgError ? "var(--color-surface-2)" : store.bgColor)),
        border: isSelected ? "2.5px solid var(--color-accent)" : "2.5px solid transparent",
        opacity: isSelected ? 1 : 0.45,
      }}
    >
      {isAlleStore ? (
        <ShoppingBag style={{ width: size * 0.45, height: size * 0.45 }} className="text-text-3" />
      ) : store.emoji ? (
        <span className="select-none" style={{ fontSize: size * 0.45 }}>{store.emoji}</span>
      ) : showLogo ? (
        <img
          src={logoUrl}
          alt={store.name}
          className="object-contain p-1.5"
          style={{ width: size * 0.75, height: size * 0.75, imageRendering: "crisp-edges" }}
          onError={() => setImgError(true)}
        />
      ) : (
        <span
          className="font-bold select-none"
          style={{ fontSize: size * 0.35, color: imgError ? "#6B7280" : store.color }}
        >
          {store.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ── Sortable Store Item (for reorder mode) ─────────────────────────
function SortableStoreButton({
  store,
  isSelected,
  count,
}: {
  store: StoreInfo;
  isSelected: boolean;
  count: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: store.id,
    transition: {
      duration: 250,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0">
      <button
        {...attributes}
        {...listeners}
        className={`flex items-center justify-center touch-none animate-[wiggle_0.3s_ease-in-out_infinite] ${
          isDragging ? "scale-110 drop-shadow-lg" : ""
        }`}
      >
        <div className="relative">
          <StoreLogo store={store} size={48} isSelected={isSelected} />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {count}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

// ── Store Selector ─────────────────────────────────────────────────
function StoreSelector({
  stores,
  selectedStore,
  onSelect,
  itemCounts,
  onAddStore,
  onLongPress,
  isReorderMode,
  onStoreReorderEnd,
  transferHoveredStoreId,
  isTransferActive,
}: {
  stores: StoreInfo[];
  selectedStore: string;
  onSelect: (id: string) => void;
  itemCounts: Record<string, number>;
  onAddStore: () => void;
  onLongPress: (storeId: string, anchorEl: HTMLElement) => void;
  isReorderMode: boolean;
  onStoreReorderEnd: (event: DragEndEvent) => void;
  transferHoveredStoreId?: string | null;
  isTransferActive?: boolean;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const storeSensorOpts = useMemo(() => ({
    pointer: { activationConstraint: { distance: 5 } },
    touch: { activationConstraint: { delay: 100, tolerance: 5 } },
  }), []);
  const pointerSensor = useSensor(PointerSensor, storeSensorOpts.pointer);
  const touchSensor = useSensor(TouchSensor, storeSensorOpts.touch);
  const sensors = useSensors(pointerSensor, touchSensor);

  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);

  const storeModifiers = useMemo(
    () => [restrictToHorizontalAxis, restrictToParentElement],
    []
  );
  const storeAutoScroll = useMemo(
    () => ({ threshold: { x: 0.2, y: 0 }, acceleration: 10 }),
    []
  );

  const handlePointerDown = (storeId: string, e: React.PointerEvent) => {
    if (isReorderMode) return;
    longPressTriggered.current = false;
    const target = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress(storeId, target);
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = (storeId: string) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (!isReorderMode) {
      onSelect(storeId);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-4 py-3 scrollbar-hide ${isReorderMode ? 'overflow-x-auto scroll-smooth' : 'overflow-x-auto'}`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {isReorderMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={storeModifiers}
            onDragEnd={onStoreReorderEnd}
            autoScroll={storeAutoScroll}
          >
            <SortableContext
              items={storeIds}
              strategy={horizontalListSortingStrategy}
            >
              {stores.map((store) => {
                const count = itemCounts[store.id] || 0;
                return (
                  <SortableStoreButton
                    key={store.id}
                    store={store}
                    isSelected={selectedStore === store.id}
                    count={count}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        ) : (
          stores.map((store) => {
            const isSelected = selectedStore === store.id;
            const count = itemCounts[store.id] || 0;
            const isTransferHovered = isTransferActive && transferHoveredStoreId === store.id;
            return (
              <button
                key={store.id}
                data-store-id={store.id}
                onPointerDown={(e) => handlePointerDown(store.id, e)}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onClick={() => handleClick(store.id)}
                onContextMenu={(e) => e.preventDefault()}
                className={`flex items-center justify-center flex-shrink-0 transition-all duration-150 ${
                  isTransferHovered ? "scale-125" : ""
                }`}
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
              >
                <div className={`relative ${isTransferHovered ? "ring-3 ring-accent rounded-full shadow-lg" : ""}`}>
                  <StoreLogo
                    store={store}
                    size={48}
                    isSelected={isSelected || !!isTransferHovered}
                  />
                  {count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {count}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
        {!isReorderMode && (
          <button
            onClick={onAddStore}
            className="flex items-center justify-center flex-shrink-0"
          >
            <div className="rounded-full border-2 border-dashed flex items-center justify-center text-text-3 hover:border-accent hover:text-accent transition" style={{ width: 48, height: 48, borderColor: "var(--zu-border)" }}>
              <Plus className="w-5 h-5" />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Store Popover ──────────────────────────────────────────────────
function StorePopover({
  storeId,
  storeName,
  anchorEl,
  onClose,
  onReorder,
  onRemove,
  onCategorySort,
}: {
  storeId: string;
  storeName: string;
  anchorEl: HTMLElement;
  onClose: () => void;
  onReorder: () => void;
  onRemove: () => void;
  onCategorySort: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - 100, window.innerWidth - 208)),
    });
  }, [anchorEl]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", handleClick), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", handleClick);
    };
  }, [onClose]);

  const options = [
    { icon: <ArrowUpDown className="w-4 h-4" />, label: "Laden verschieben", action: onReorder },
    { icon: <Trash2 className="w-4 h-4" />, label: "Laden entfernen", action: onRemove },
    { icon: <Settings className="w-4 h-4" />, label: "Kategorien anpassen", action: onCategorySort },
  ];

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: "none" }}>
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, scale: 0.9, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -4 }}
        transition={{ duration: 0.15 }}
        className="bg-surface rounded-xl p-2 overflow-hidden"
        style={{
          boxShadow: "var(--shadow-elevated)",
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: 200,
          pointerEvents: "auto",
        }}
      >
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => {
              opt.action();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 p-3 text-sm text-text-1 hover:bg-surface-2 rounded-[10px] transition whitespace-nowrap"
          >
            <span className="text-text-2">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </motion.div>
    </div>
  );
}

// ── Category chip colors ───────────────────────────────────────────
const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Obst & Gemüse": { bg: "#DCFCE7", text: "#166534", dot: "#22C55E" },
  Backwaren: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  "Fleisch & Wurst": { bg: "#FCE7F3", text: "#9D174D", dot: "#EC4899" },
  "Milch & Käse": { bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  Eier: { bg: "#FEF9C3", text: "#854D0E", dot: "#EAB308" },
  "Nudeln & Reis": { bg: "#FFF7ED", text: "#9A3412", dot: "#F97316" },
  Konserven: { bg: "#FEE2E2", text: "#991B1B", dot: "#EF4444" },
  "Saucen & Gewürze": { bg: "#FED7AA", text: "#9A3412", dot: "#FB923C" },
  "Kaffee & Tee": { bg: "#F3E8FF", text: "#6B21A8", dot: "#A855F7" },
  "Müsli & Frühstück": { bg: "#FFEDD5", text: "#C2410C", dot: "#F97316" },
  Tiefkühl: { bg: "#E0F2FE", text: "#075985", dot: "#0EA5E9" },
  "Süßwaren & Snacks": { bg: "#FDF2F8", text: "#BE185D", dot: "#EC4899" },
  Getränke: { bg: "#ECFDF5", text: "#065F46", dot: "#10B981" },
  "Haushalt & Reinigung": { bg: "#F3F4F6", text: "#374151", dot: "#6B7280" },
  Tiernahrung: { bg: "#FEF3C7", text: "#78350F", dot: "#D97706" },
  Körperpflege: { bg: "#FCE7F3", text: "#9D174D", dot: "#EC4899" },
  Haarpflege: { bg: "#F3E8FF", text: "#6B21A8", dot: "#A855F7" },
  Gesichtspflege: { bg: "#FDF2F8", text: "#BE185D", dot: "#F472B6" },
  "Makeup & Kosmetik": { bg: "#FECDD3", text: "#9F1239", dot: "#FB7185" },
  Mundhygiene: { bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  Damenhygiene: { bg: "#FCE7F3", text: "#9D174D", dot: "#EC4899" },
  Babypflege: { bg: "#FEF9C3", text: "#854D0E", dot: "#EAB308" },
  Reinigungsmittel: { bg: "#E0F2FE", text: "#075985", dot: "#0EA5E9" },
  Waschmittel: { bg: "#ECFDF5", text: "#065F46", dot: "#10B981" },
  Papierprodukte: { bg: "#F3F4F6", text: "#374151", dot: "#6B7280" },
  "Gesundheit & Medizin": { bg: "#DCFCE7", text: "#166534", dot: "#22C55E" },
  "Vitamine & Nahrungsergänzung": { bg: "#FFF7ED", text: "#C2410C", dot: "#F97316" },
  "Foto & Technik": { bg: "#E0E7FF", text: "#3730A3", dot: "#6366F1" },
  "Lebensmittel & Snacks": { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  Elektronik: { bg: "#E0E7FF", text: "#3730A3", dot: "#6366F1" },
  Haushalt: { bg: "#F3F4F6", text: "#374151", dot: "#6B7280" },
  Lebensmittel: { bg: "#DCFCE7", text: "#166534", dot: "#22C55E" },
  "Bücher & Medien": { bg: "#F3E8FF", text: "#6B21A8", dot: "#A855F7" },
  "Sport & Freizeit": { bg: "#ECFDF5", text: "#065F46", dot: "#10B981" },
  Kleidung: { bg: "#FCE7F3", text: "#9D174D", dot: "#EC4899" },
  Bürobedarf: { bg: "#FEF9C3", text: "#854D0E", dot: "#EAB308" },
  Spielzeug: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  Garten: { bg: "#DCFCE7", text: "#166534", dot: "#22C55E" },
  Sonstiges: { bg: "#F1F5F9", text: "#475569", dot: "#94A3B8" },
};

function getCategoryChipColor(category: string): { bg: string; text: string; dot: string } {
  return CATEGORY_COLORS[category] || { ...CATEGORY_COLORS.Sonstiges };
}

// ── Category Chip Component ────────────────────────────────────────
function CategoryChip({
  category,
  selected,
  onClick,
}: {
  category: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const colors = getCategoryChipColor(category);
  return (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap ${
        selected
          ? "bg-surface border-2"
          : "bg-surface-2 border hover:opacity-80"
      }`}
      style={
        selected
          ? { borderColor: colors.dot, color: colors.text }
          : { borderColor: "var(--zu-border)", color: colors.text }
      }
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: colors.dot }}
      />
      {category}
    </button>
  );
}

// ── Restrict drag to vertical axis ─────────────────────────────────
const restrictToVerticalAxis: any = ({ transform }: any) => ({
  ...transform,
  x: 0,
});

// ── Factory: restrict drag between store selector and checked section ──
function createRestrictToListBounds(
  storeSelectorRef: React.RefObject<HTMLDivElement | null>,
  checkedSectionRef: React.RefObject<HTMLDivElement | null>,
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  storeTransferModeRef: { current: boolean },
) {
  return ({ transform, draggingNodeRect }: any) => {
    if (!draggingNodeRect) return { ...transform, x: 0 };

    // In store transfer mode, allow free movement
    if (storeTransferModeRef.current) {
      return transform;
    }

    // Top bound: bottom edge of store selector
    const selectorRect = storeSelectorRef.current?.getBoundingClientRect();
    const topBound = selectorRect ? selectorRect.bottom : 0;

    // Bottom bound: top edge of checked section, or bottom of scroll container
    const checkedRect = checkedSectionRef.current?.getBoundingClientRect();
    const scrollRect = scrollContainerRef.current?.getBoundingClientRect();
    // If checked section has content (height > 0), use its top; otherwise use scroll container bottom
    const bottomBound =
      checkedRect && checkedRect.height > 0
        ? checkedRect.top
        : scrollRect
          ? scrollRect.bottom
          : window.innerHeight;

    const minY = topBound - draggingNodeRect.top;
    const maxY = bottomBound - (draggingNodeRect.top + draggingNodeRect.height);

    return {
      ...transform,
      x: 0,
      y: Math.min(Math.max(transform.y, minY), maxY),
    };
  };
}

// ── Unit helpers ───────────────────────────────────────────────────
type UnitType = null | "g" | "kg" | "ml" | "L";
const UNITS: { value: UnitType; label: string }[] = [
  { value: null, label: "Stk." },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "L", label: "L" },
];

function getUnitStep(unit: string | null | undefined): number {
  switch (unit) {
    case "g": case "ml": return 50;
    case "kg": case "L": return 0.5;
    default: return 1;
  }
}

function getUnitMin(unit: string | null | undefined): number {
  switch (unit) {
    case "g": case "ml": return 50;
    case "kg": case "L": return 0.5;
    default: return 1;
  }
}

function formatQuantity(qty: number, unit: string | null | undefined): string {
  if (unit === "kg" || unit === "L") {
    return qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
  }
  return qty.toString();
}

function getDefaultQuantityForUnit(unit: UnitType): number {
  switch (unit) {
    case "g": case "ml": return 100;
    case "kg": case "L": return 1;
    default: return 1;
  }
}

// ── Quantity / Unit Drawer ─────────────────────────────────────────
function QuantityDrawer({
  item,
  onSave,
  onClose,
}: {
  item: ShoppingItem;
  onSave: (quantity: number, unit: UnitType) => void;
  onClose: () => void;
}) {
  const currentUnit = (item.unit as UnitType) || null;
  const [unit, setUnit] = useState<UnitType>(currentUnit);
  const [inputValue, setInputValue] = useState(item.quantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input AFTER the 300ms slide-up animation completes
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const handleUnitChange = (newUnit: UnitType) => {
    setUnit(newUnit);
    // If switching unit category, set a sensible default
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || parsed <= 0) {
      setInputValue(getDefaultQuantityForUnit(newUnit).toString());
    }
  };

  const doSave = useCallback(() => {
    let qty = parseFloat(inputValue);
    if (isNaN(qty) || qty <= 0) qty = getDefaultQuantityForUnit(unit);
    const min = getUnitMin(unit);
    if (qty < min) qty = min;
    onSave(qty, unit);
    onClose();
  }, [inputValue, unit, onSave, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSave();
    }
  };

  // Save on backdrop click or close
  const handleBackdropClick = () => doSave();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={handleBackdropClick} />
      <motion.div
        className="relative bg-surface rounded-t-[20px] px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        style={{ height: 160, minHeight: 160 }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-4">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        <p className="text-sm font-semibold text-text-1 mb-3">{item.name}</p>

        <div className="flex items-center gap-3">
          {/* Quantity input */}
          <input
            ref={inputRef}
            type="tel"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-20 h-11 rounded-[16px] text-center text-sm font-semibold text-text-1 bg-surface-2 focus:outline-none"
            style={{ border: "1px solid var(--zu-border)" }}
          />

          {/* Unit segmented control — prevent focus steal to keep keyboard open */}
          <div
            className="flex-1 flex bg-surface-2 rounded-xl p-1 gap-0.5"
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
          >
            {UNITS.map((u) => (
              <button
                key={u.label}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => handleUnitChange(u.value)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  unit === u.value
                    ? "bg-accent text-white shadow-sm"
                    : "text-text-2 hover:text-text-1"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Sortable Shopping List Item (dnd-kit) ──────────────────────────
function SortableShoppingItem({
  item,
  onToggle,
  onQuantityChange,
  onOpenQuantityDrawer,
  onNameChange,
  animatingCheckId,
  isTransferDragging,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onQuantityChange: (delta: number) => void;
  onOpenQuantityDrawer: () => void;
  onNameChange: (newName: string) => void;
  animatingCheckId: string | null;
  isTransferDragging?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const isAnimating = animatingCheckId === item.id;
  const [phase, setPhase] = useState<"idle" | "flash" | "flyout">("idle");

  useEffect(() => {
    if (!isAnimating) { setPhase("idle"); return; }
    setPhase("flash");
    const t1 = setTimeout(() => setPhase("flyout"), 300);
    return () => clearTimeout(t1);
  }, [isAnimating]);

  // ── Name editing state ──
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(item.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      // Place cursor at end — do NOT select all text (prevents word-selection on mobile tap)
      const len = nameInputRef.current.value.length;
      nameInputRef.current.setSelectionRange(len, len);
    }
  }, [isEditingName]);

  // Keep edit value in sync if item.name changes externally
  useEffect(() => {
    if (!isEditingName) setEditNameValue(item.name);
  }, [item.name, isEditingName]);

  const handleNameSave = useCallback(() => {
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== item.name) {
      onNameChange(trimmed);
    }
    setIsEditingName(false);
  }, [editNameValue, item.name, onNameChange]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
    }
    if (e.key === "Escape") {
      setEditNameValue(item.name);
      setIsEditingName(false);
    }
  }, [handleNameSave, item.name]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    zIndex: isDragging ? 20 : undefined,
    position: "relative" as const,
  };

  // Long press on counter area
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handlePointerDown = useCallback(() => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onOpenQuantityDrawer();
    }, 500);
  }, [onOpenQuantityDrawer]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const step = getUnitStep(item.unit);
  const min = getUnitMin(item.unit);
  const unitLabel = item.unit && item.unit !== "Stk." ? item.unit : null;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-2 px-4 py-2.5 transition-all ${
          isDragging && isTransferDragging
            ? "shadow-xl rounded-[16px] scale-[1.08] opacity-95 bg-surface ring-2 ring-accent-mid"
            : isDragging
              ? "rounded-[16px] scale-[1.02] opacity-95 bg-surface"
              : phase === "flash"
                ? "bg-green-50"
                : ""
        }`}
        style={
          phase === "flyout"
            ? {
                transform: "translateY(100px)",
                opacity: 0,
                transition: "transform 400ms ease-in, opacity 400ms ease-in",
              }
            : phase === "flash"
              ? { transition: "background-color 150ms ease-in" }
              : undefined
        }
      >
        <button
          {...attributes}
          {...listeners}
          className="touch-none flex-shrink-0 p-1 text-text-3 cursor-grab active:cursor-grabbing hover:text-text-2"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button
          onClick={onToggle}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
            phase === "flash" || phase === "flyout"
              ? "bg-accent border-accent"
              : item.is_checked
                ? "bg-accent border-accent"
                : "hover:border-accent"
          }`}
        >
          {(item.is_checked || phase === "flash" || phase === "flyout") && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          {isEditingName && !item.is_checked ? (
            <input
              ref={nameInputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleNameKeyDown}
              className="w-full text-sm font-medium text-text-1 bg-transparent outline-none border-b border-accent-mid py-0.5 leading-tight"
            />
          ) : (
            <p
              onClick={(e) => {
                if (item.is_checked || isDragging) return;
                e.stopPropagation();
                setEditNameValue(item.name);
                setIsEditingName(true);
              }}
              className={`text-sm leading-tight truncate cursor-text ${
                item.is_checked
                  ? "line-through text-text-3"
                  : "text-text-1 font-medium"
              }`}
            >
              {item.name}
            </p>
          )}
        </div>
        <div
          className="flex items-center gap-1 flex-shrink-0 select-none"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!longPressFired.current) onQuantityChange(-step);
            }}
            disabled={item.quantity <= min}
            className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-text-2 hover:text-text-1 disabled:opacity-30 transition"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-baseline gap-0.5 min-w-[28px] justify-center">
            <span className="text-sm font-semibold text-text-1">
              {formatQuantity(item.quantity, item.unit)}
            </span>
            {unitLabel && (
              <span className="text-xs text-text-3">{unitLabel}</span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!longPressFired.current) onQuantityChange(step);
            }}
            className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-text-2 hover:text-text-1 transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sortable category item (for category sort modal) ───────────────
function SortableCategoryItem({
  category,
  onRemove,
}: {
  category: string;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    zIndex: isDragging ? 20 : undefined,
    position: "relative" as const,
  };

  const colors = getCategoryChipColor(category);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-shadow ${
          isDragging ? "bg-surface" : ""
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          className="touch-none flex-shrink-0 p-0.5 text-text-3 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.dot }}
          />
          <span className="text-sm font-medium text-text-1">
            {category}
          </span>
        </div>
        <button
          onClick={onRemove}
          onMouseDown={(e) => e.preventDefault()}
          className="flex-shrink-0 p-1 text-text-3 hover:text-danger transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Category Sort Modal ────────────────────────────────────────────
function CategorySortModal({
  storeName,
  storeId,
  stores,
  initialCategories,
  allKnownCategories,
  globalCustomCategories,
  onAutoSave,
  onAddGlobalCategory,
  onClose,
}: {
  storeName: string;
  storeId: string;
  stores: StoreInfo[];
  initialCategories: string[];
  allKnownCategories: string[];
  globalCustomCategories: string[];
  onAutoSave: (categories: string[]) => void;
  onAddGlobalCategory: (name: string) => void;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [newCat, setNewCat] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);

  // Auto-focus the search field when drawer opens
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Auto-save on every change (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onAutoSave(categories);
  }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const catSensorOpts = useMemo(() => ({
    pointer: { activationConstraint: { distance: 5 } },
    touch: { activationConstraint: { delay: 150, tolerance: 5 } },
  }), []);
  const pointerSensor = useSensor(PointerSensor, catSensorOpts.pointer);
  const touchSensor = useSensor(TouchSensor, catSensorOpts.touch);
  const sensors = useSensors(pointerSensor, touchSensor);

  const catModifiers = useMemo(() => [restrictToVerticalAxis], []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = categories.indexOf(active.id as string);
      const newIdx = categories.indexOf(over.id as string);
      if (oldIdx >= 0 && newIdx >= 0) {
        setCategories(arrayMove(categories, oldIdx, newIdx));
      }
    },
    [categories]
  );

  // Merge built-in known categories with global custom pool (deduplicated)
  const mergedKnownCategories = useMemo(() => {
    const set = new Set(allKnownCategories);
    for (const c of globalCustomCategories) set.add(c);
    return Array.from(set);
  }, [allKnownCategories, globalCustomCategories]);

  const availableChips = useMemo(() => {
    const catSet = new Set(categories);
    return mergedKnownCategories.filter((c) => !catSet.has(c));
  }, [categories, mergedKnownCategories]);

  const searchResults = useMemo(() => {
    if (!newCat.trim()) return [];
    const q = newCat.toLowerCase().trim();
    return availableChips.filter((c) => c.toLowerCase().includes(q));
  }, [newCat, availableChips]);

  const handleAddCategory = (name?: string) => {
    const catName = (name || newCat).trim();
    if (!catName || categories.includes(catName)) return;
    setCategories((prev) => [...prev, catName]);
    // If this is a truly new category (not in any built-in list), add to global pool
    const isBuiltIn = allKnownCategories.some(
      (c) => c.toLowerCase() === catName.toLowerCase()
    );
    const isAlreadyCustom = globalCustomCategories.some(
      (c) => c.toLowerCase() === catName.toLowerCase()
    );
    if (!isBuiltIn && !isAlreadyCustom) {
      onAddGlobalCategory(catName);
    }
    setNewCat("");
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const showCustomOption =
    newCat.trim() &&
    !mergedKnownCategories.some(
      (c) => c.toLowerCase() === newCat.trim().toLowerCase()
    ) &&
    !categories.includes(newCat.trim());

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      style={{ touchAction: "none" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-surface rounded-t-[20px] flex flex-col max-h-[80vh]"
        style={{ boxShadow: "var(--shadow-elevated)" }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-3">
          <h3 className="text-base font-bold text-text-1">
            Kategorien für {storeName}
          </h3>
          <p className="text-xs text-text-2 mt-0.5">
            Ziehe Kategorien um die Sortierung zu ändern
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0" style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={catModifiers}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={categories}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {categories.map((cat) => (
                  <SortableCategoryItem
                    key={cat}
                    category={cat}
                    onRemove={() =>
                      setCategories((prev) =>
                        prev.filter((c) => c !== cat)
                      )
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Add category section */}
        <div className="flex-shrink-0" style={{ borderTop: "1px solid var(--zu-border)" }}>
          {/* Quick-add chips */}
          {availableChips.length > 0 && (!showSuggestions || !newCat.trim()) && (
            <div
              className="flex gap-1.5 px-5 pt-2.5 pb-1 overflow-x-auto scrollbar-hide"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {availableChips.slice(0, 12).map((chip) => {
                const colors = getCategoryChipColor(chip);
                return (
                  <button
                    key={chip}
                    onClick={() => handleAddCategory(chip)}
                    onMouseDown={(e) => e.preventDefault()}
                    className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium hover:scale-105 active:scale-95 transition whitespace-nowrap bg-surface-2"
                    style={{ color: colors.text }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: colors.dot }}
                    />
                    + {chip}
                  </button>
                );
              })}
            </div>
          )}

          {/* Autocomplete dropdown */}
          <AnimatePresence>
            {showSuggestions && newCat.trim() && (searchResults.length > 0 || showCustomOption) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="max-h-36 overflow-y-auto px-5">
                  {searchResults.map((result) => {
                    const colors = getCategoryChipColor(result);
                    return (
                      <button
                        key={result}
                        onClick={() => handleAddCategory(result)}
                        onMouseDown={(e) => e.preventDefault()}
                        className="w-full text-left px-3 py-2 hover:bg-surface-2 rounded-[10px] flex items-center gap-2 transition"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: colors.dot }}
                        />
                        <span className="text-sm font-medium" style={{ color: colors.text }}>
                          {result}
                        </span>
                      </button>
                    );
                  })}
                  {showCustomOption && (
                    <button
                      onClick={() => handleAddCategory()}
                      onMouseDown={(e) => e.preventDefault()}
                      className="w-full text-left px-3 py-2 hover:bg-surface-2 rounded-[10px] transition"
                    >
                      <span className="text-sm text-accent font-medium">
                        + &bdquo;{newCat.trim()}&ldquo; erstellen
                      </span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input bar */}
          <div className="flex items-center gap-2 px-5 py-2.5">
            <div className="flex-1 flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2.5" style={{ border: "1px solid var(--zu-border)" }}>
              <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
              <input
                ref={inputRef}
                type="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                inputMode="text"
                value={newCat}
                onChange={(e) => {
                  setNewCat(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() =>
                  setTimeout(() => setShowSuggestions(false), 200)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (searchResults.length > 0) {
                      handleAddCategory(searchResults[0]);
                    } else if (newCat.trim()) {
                      handleAddCategory();
                    }
                  }
                }}
                placeholder="Kategorie suchen oder erstellen..."
                className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
              />
              {newCat && (
                <button
                  type="button"
                  onClick={() => {
                    setNewCat("");
                    setShowSuggestions(false);
                  }}
                  className="text-text-3 hover:text-text-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
          </div>
        </div>

      </motion.div>
    </motion.div>
  );
}

// ── Checked items section ──────────────────────────────────────────
function CheckedSection({
  items,
  onToggle,
  onClearAll,
}: {
  items: ShoppingItem[];
  onToggle: (id: string) => void;
  onClearAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="bg-surface-2" style={{ borderTop: "1px solid var(--zu-border)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5"
      >
        <span className="text-xs font-medium text-text-2">
          Erledigt ({items.length})
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-text-3" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-text-3" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="max-h-40 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-1.5 opacity-60"
                >
                  <button
                    onClick={() => onToggle(item.id)}
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-accent border-2 border-accent flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-white" />
                  </button>
                  <span className="text-xs line-through text-text-3 flex-1 truncate">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-text-3">
                    {formatQuantity(item.quantity, item.unit)}
                    {item.unit && item.unit !== "Stk." ? item.unit : "x"}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2">
              <button
                onClick={onClearAll}
                className="flex items-center gap-1.5 text-xs text-danger hover:text-danger transition"
              >
                <Trash2 className="w-3 h-3" />
                Erledigte löschen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Add Item Bar ───────────────────────────────────────────────────
function AddItemBar({
  storeId,
  stores,
  existingNames,
  customTemplates,
  onAdd,
  categoryOrder,
}: {
  storeId: string;
  stores: StoreInfo[];
  existingNames: Set<string>;
  customTemplates: GroceryTemplate[];
  onAdd: (name: string, category: string) => void;
  categoryOrder: string[];
}) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quickChips, setQuickChips] = useState<string[]>([]);
  const [pendingCustomName, setPendingCustomName] = useState<string | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const suggestions = getQuickSuggestions(storeId).filter(
      (s) => !existingNames.has(s)
    );
    setQuickChips(suggestions);
  }, [storeId, existingNames]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchGroceries(query, storeId, stores, customTemplates).filter(
      (g) => !existingNames.has(g.name)
    );
  }, [query, storeId, stores, existingNames, customTemplates]);

  const handleSelect = (name: string, category?: string, fromSearch?: boolean) => {
    const cat =
      category || findGroceryTemplate(name, customTemplates)?.category || null;
    if (!cat) {
      setPendingCustomName(name);
      setQuery("");
      setShowSuggestions(false);
      return;
    }
    onAdd(name, cat);
    setQuickChips((prev) => prev.filter((c) => c !== name));
    if (fromSearch && query.trim()) {
      // Search had text + result tapped → clear search, keep keyboard open, keep focus
      setQuery("");
      setShowSuggestions(false);
      // Focus stays because onPointerDown prevented blur
    } else {
      // Chip tapped with empty search → add, keyboard stays closed
      setQuery("");
      setShowSuggestions(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (searchResults.length > 0) {
      handleSelect(searchResults[0].name, searchResults[0].category);
    } else {
      setPendingCustomName(query.trim());
      setQuery("");
      setShowSuggestions(false);
    }
  };

  const handleCategoryPicked = (category: string) => {
    if (pendingCustomName) {
      onAdd(pendingCustomName, category);
      setQuickChips((prev) => prev.filter((c) => c !== pendingCustomName));
      setPendingCustomName(null);
    }
  };

  const pickerCategories =
    categoryOrder.length > 0
      ? categoryOrder
      : getCategoriesForStore(storeId, stores);

  return (
    <>
      <div className="bg-surface" style={{ borderTop: "1px solid var(--zu-border)" }}>
        {quickChips.length > 0 && (
          <div
            className="flex gap-2 px-4 pt-2.5 pb-1 overflow-x-auto scrollbar-hide"
            style={{
              WebkitOverflowScrolling: "touch",
              opacity: query.length > 0 ? 0 : 1,
              maxHeight: query.length > 0 ? 0 : 100,
              paddingTop: query.length > 0 ? 0 : undefined,
              paddingBottom: query.length > 0 ? 0 : undefined,
              pointerEvents: query.length > 0 ? "none" : "auto",
              transition: "opacity 200ms, max-height 200ms, padding 200ms",
              overflow: query.length > 0 ? "hidden" : undefined,
            }}
          >
            {quickChips.map((chip) => (
              <button
                key={chip}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(chip)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-2)",
                  border: "1px solid var(--zu-border)",
                }}
              >
                + {chip}
              </button>
            ))}
          </div>
        )}
        <AnimatePresence>
          {showSuggestions && query.trim() && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden" style={{ borderTop: "1px solid var(--zu-border)" }}
            >
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map((result) => {
                  const colors = getCategoryChipColor(result.category);
                  return (
                    <button
                      key={result.name}
                      onPointerDown={(e) => e.preventDefault()}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(result.name, result.category, true)}
                      className="w-full text-left px-4 py-2.5 hover:bg-surface-2 flex items-center justify-between transition"
                    >
                      <span className="text-sm text-text-1">
                        {result.name}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] ml-2 flex-shrink-0 font-medium" style={{ color: colors.text }}>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: colors.dot }}
                        />
                        {result.category}
                      </span>
                    </button>
                  );
                })}
                {query.trim() &&
                  !searchResults.some(
                    (r) => r.name.toLowerCase() === query.trim().toLowerCase()
                  ) && (
                  <button
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPendingCustomName(query.trim());
                      setQuery("");
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-surface-2 transition"
                  >
                    <span className="text-sm text-accent font-medium">
                      + &bdquo;{query.trim()}&ldquo; hinzufügen&hellip;
                    </span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-4 py-2.5"
        >
          <div className="flex-1 flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2.5" style={{ border: "1px solid var(--zu-border)" }}>
            <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
            <input
              ref={inputRef}
              type="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Artikel hinzufügen..."
              className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setShowSuggestions(false);
                }}
                className="text-text-3 hover:text-text-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
        </form>
      </div>

      <AnimatePresence>
        {pendingCustomName && (
          <CategoryPickerModal
            itemName={pendingCustomName}
            categories={pickerCategories}
            onSelect={handleCategoryPicked}
            onClose={() => setPendingCustomName(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Category Picker Modal (keyboard-aware) ─────────────────────────
function CategoryPickerModal({
  itemName,
  categories,
  onSelect,
  onClose,
}: {
  itemName: string;
  categories: string[];
  onSelect: (category: string) => void;
  onClose: () => void;
}) {
  const [filterQuery, setFilterQuery] = useState("");
  const [bottomOffset, setBottomOffset] = useState(0);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search field when drawer opens
  useEffect(() => {
    setTimeout(() => filterInputRef.current?.focus(), 100);
  }, []);

  // Track visual viewport to position above keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kbHeight = window.innerHeight - vv.height - vv.offsetTop;
      setBottomOffset(Math.max(0, kbHeight));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return categories;
    const q = filterQuery.toLowerCase().trim();
    return categories.filter((c) => c.toLowerCase().includes(q));
  }, [categories, filterQuery]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40"
      style={{ touchAction: "none" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed left-0 right-0 mx-auto w-full max-w-sm bg-surface rounded-t-[20px] flex flex-col"
        style={{
          bottom: bottomOffset,
          height: "40vh",
          maxHeight: `calc(100vh - ${bottomOffset}px - 40px)`,
          boxShadow: "var(--shadow-elevated)",
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-2 flex-shrink-0">
          <h3 className="text-base font-bold text-text-1">
            Kategorie wählen
          </h3>
          <p className="text-sm text-text-2 mt-0.5">
            Für &bdquo;{itemName}&ldquo;
          </p>
        </div>
        {/* Search field */}
        <div className="px-5 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2" style={{ border: "1px solid var(--zu-border)" }}>
            <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
            <input
              ref={filterInputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Kategorie suchen..."
              className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
            />
            {filterQuery && (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setFilterQuery("")}
                className="text-text-3 hover:text-text-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0" style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}>
          <div className="flex flex-wrap gap-2">
            {filtered.map((cat) => (
              <CategoryChip
                key={cat}
                category={cat}
                onClick={() => onSelect(cat)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-text-2 text-center py-4 w-full">
                Keine Kategorien gefunden
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Add Store Modal ────────────────────────────────────────────────
function AddStoreModal({
  onClose,
  onAdd,
  existingStoreIds,
}: {
  onClose: () => void;
  onAdd: (suggestion: StoreSuggestion) => void;
  existingStoreIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [bottomOffset, setBottomOffset] = useState(0);

  // Track visual viewport to shift modal above keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
      setBottomOffset(Math.max(0, keyboardHeight));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const allSuggestions = useMemo(() => {
    const suggestionIds = new Set(
      STORE_SUGGESTIONS.map((s) => s.name.toLowerCase().replace(/\s+/g, "-"))
    );
    const fromDefaults: StoreSuggestion[] = DEFAULT_STORES
      .filter((s) => s.id !== "alle" && !suggestionIds.has(s.id))
      .map((s) => ({
        name: s.name,
        domain: s.domain,
        type: s.type as StoreSuggestion["type"],
        bgColor: s.bgColor,
      }));
    return [...fromDefaults, ...STORE_SUGGESTIONS];
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allSuggestions.filter(
      (s) =>
        !existingStoreIds.has(s.name.toLowerCase().replace(/\s+/g, "-")) &&
        (!q || s.name.toLowerCase().includes(q))
    );
  }, [query, existingStoreIds, allSuggestions]);

  const showCustomOption =
    query.trim() &&
    !STORE_SUGGESTIONS.some(
      (s) => s.name.toLowerCase() === query.trim().toLowerCase()
    );

  const handleCustomAdd = () => {
    const name = query.trim();
    if (!name) return;
    onAdd({ name, type: "sonstige", bgColor: "#6B7280" });
  };

  const MIN_HEIGHT = 320;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed left-0 right-0 mx-auto w-full max-w-sm bg-surface rounded-t-[20px] flex flex-col"
        style={{
          bottom: bottomOffset,
          height: "60vh",
          minHeight: MIN_HEIGHT,
          maxHeight: `calc(100vh - ${bottomOffset}px - 40px)`,
          boxShadow: "var(--shadow-elevated)",
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="px-5 pb-3 flex-shrink-0">
          <h3 className="text-lg font-bold text-text-1">
            Geschäft hinzufügen
          </h3>
        </div>
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2.5" style={{ border: "1px solid var(--zu-border)" }}>
            <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
            <input
              autoFocus
              type="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Laden suchen..."
              className="flex-1 bg-transparent outline-none text-sm text-text-1 placeholder:text-text-3"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-text-3 hover:text-text-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
          <div className="space-y-1">
            {filtered.map((s) => {
              const logoUrl = s.domain ? getLogoUrl(s.domain) : null;
              return (
                <StoreSuggestionRow
                  key={s.name}
                  suggestion={s}
                  logoUrl={logoUrl}
                  onSelect={() => onAdd(s)}
                />
              );
            })}
            {showCustomOption && (
              <button
                onClick={handleCustomAdd}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-2 transition"
              >
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-accent-mid flex items-center justify-center text-accent">
                  <Store className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-accent">
                    Eigenen Laden hinzufügen: &bdquo;{query.trim()}&ldquo;
                  </p>
                </div>
              </button>
            )}
            {filtered.length === 0 && !showCustomOption && (
              <p className="text-sm text-text-2 text-center py-6">
                Keine Vorschläge gefunden
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StoreSuggestionRow({
  suggestion,
  logoUrl,
  onSelect,
}: {
  suggestion: StoreSuggestion;
  logoUrl: string | null;
  onSelect: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const showLogo = logoUrl && !imgError;

  const typeLabel: Record<string, string> = {
    supermarkt: "Supermarkt",
    drogerie: "Drogerie",
    online: "Online",
    sonstige: "Geschäft",
  };

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 active:bg-surface-2 transition"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{ backgroundColor: suggestion.emoji ? suggestion.bgColor : showLogo ? "#F3F4F6" : "#E5E7EB" }}
      >
        {suggestion.emoji ? (
          <span className="text-lg">{suggestion.emoji}</span>
        ) : showLogo ? (
          <img
            src={logoUrl}
            alt={suggestion.name}
            className="w-[30px] h-[30px] object-contain"
            style={{ imageRendering: "crisp-edges" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-text-3 text-xs font-bold">
            {suggestion.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="text-left flex-1 min-w-0">
        <p className="text-sm font-medium text-text-1 truncate">
          {suggestion.name}
        </p>
        <p className="text-[11px] text-text-2">
          {typeLabel[suggestion.type] || "Geschäft"}
        </p>
      </div>
    </button>
  );
}

// ── Main Einkaufen Screen ──────────────────────────────────────────
export function EinkaufenScreen({ onItemCountChange }: { onItemCountChange?: (count: number) => void }) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [stores, setStores] = useState<StoreInfo[]>(DEFAULT_STORES);
  const [storeSettings, setStoreSettings] = useState<StoreSettingEntry[]>([]);
  const [selectedStore, setSelectedStore] = useState("aldi");
  const [showAddStore, setShowAddStore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Popover & modal state
  const [popover, setPopover] = useState<{
    storeId: string;
    anchorEl: HTMLElement;
  } | null>(null);
  const [storeReorderMode, setStoreReorderMode] = useState(false);
  const [categorySortStore, setCategorySortStore] = useState<string | null>(
    null
  );
  const [globalCustomCategories, setGlobalCustomCategories] = useState<string[]>([]);
  const [globalItems, setGlobalItems] = useState<GlobalItem[]>([]);
  const [animatingCheckId, setAnimatingCheckId] = useState<string | null>(null);

  // Store transfer drag state
  const storeTransferModeRef = useRef(false);
  const storeTransferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const [storeTransferActive, setStoreTransferActive] = useState(false);
  const [hoveredStoreId, setHoveredStoreId] = useState<string | null>(null);
  const hoveredStoreRef = useRef<string | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const customCatSaveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const settingsSaveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const storeSelectorRef = useRef<HTMLDivElement>(null);
  const checkedSectionRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastLocalChangeRef = useRef<number>(0);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(56);
  const keyboardHeight = useKeyboardHeight();

  // ── Load items + store settings ────────────────────────────────
  const reloadAllData = useCallback(async () => {
    try {
      const [serverItems, settings, customCats, gItems] = await Promise.all([
        fetchItems(),
        fetchStoreSettings(),
        fetchCustomCategories(),
        fetchGlobalItems(),
      ]);
      // Only update if no local changes happened during fetch
      if (Date.now() - lastLocalChangeRef.current < 2000) return;
      setItems(serverItems);
      if (settings.length > 0) {
        setStoreSettings(settings);
        applyStoreSettings(DEFAULT_STORES, settings);
      }
      setGlobalCustomCategories(customCats);
      setGlobalItems(gItems);
      setLoaded(true);
    } catch (err) {
      console.log("reloadAllData error:", err);
    }
  }, []);

  useEffect(() => {
    reloadAllData();
  }, [reloadAllData]);

  // ── Reload on visibility change / focus (fixes empty list after app switch) ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[Einkaufen] App visible again, reloading data...");
        reloadAllData();
      }
    };
    const handleFocus = () => {
      console.log("[Einkaufen] Window focused, reloading data...");
      reloadAllData();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [reloadAllData]);

  const applyStoreSettings = (
    baseStores: StoreInfo[],
    settings: StoreSettingEntry[]
  ) => {
    const settingsMap = new Map(settings.map((s) => [s.store_id, s]));
    const visible = baseStores.filter((s) => {
      const setting = settingsMap.get(s.id);
      return setting ? setting.is_visible : true;
    });
    visible.sort((a, b) => {
      const pa = settingsMap.get(a.id)?.position ?? 999;
      const pb = settingsMap.get(b.id)?.position ?? 999;
      return pa - pb;
    });
    setStores(visible);
    if (!visible.find((s) => s.id === selectedStore) && visible.length > 0) {
      setSelectedStore(visible[0].id);
    }
  };

  // ── Poll for sync ──────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      // Skip poll if a local change happened recently (debounce save is 300ms,
      // give extra buffer so the server has time to persist)
      if (Date.now() - lastLocalChangeRef.current < 2000) return;
      const serverItems = await fetchItems();
      // Re-check after async fetch in case a local change happened while waiting
      if (Date.now() - lastLocalChangeRef.current < 2000) return;
      if (!activeDragId) {
        setItems(serverItems);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [activeDragId]);

  // ── Click outside to exit store reorder mode ───────────────────
  useEffect(() => {
    if (!storeReorderMode) return;
    const handler = (e: PointerEvent) => {
      if (
        storeSelectorRef.current &&
        !storeSelectorRef.current.contains(e.target as Node)
      ) {
        setStoreReorderMode(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", handler), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", handler);
    };
  }, [storeReorderMode]);

  // ── Debounced save for items ───────────────────────────────────
  const debouncedSave = useCallback((newItems: ShoppingItem[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveItems(newItems), 300);
  }, []);

  const updateItems = useCallback(
    (updater: (prev: ShoppingItem[]) => ShoppingItem[]) => {
      lastLocalChangeRef.current = Date.now();
      setItems((prev) => {
        const next = updater(prev);
        debouncedSave(next);
        return next;
      });
    },
    [debouncedSave]
  );

  // ── Debounced save for store settings ──────────────────────────
  const debouncedSaveSettings = useCallback(
    (newSettings: StoreSettingEntry[]) => {
      if (settingsSaveTimeout.current)
        clearTimeout(settingsSaveTimeout.current);
      settingsSaveTimeout.current = setTimeout(
        () => saveStoreSettings(newSettings),
        300
      );
    },
    []
  );

  const updateStoreSettings = useCallback(
    (updater: (prev: StoreSettingEntry[]) => StoreSettingEntry[]) => {
      setStoreSettings((prev) => {
        const next = updater(prev);
        debouncedSaveSettings(next);
        return next;
      });
    },
    [debouncedSaveSettings]
  );

  // ── Helper: get or create setting entry for a store ────────────
  const getOrCreateSetting = useCallback(
    (storeId: string): StoreSettingEntry => {
      const existing = storeSettings.find((s) => s.store_id === storeId);
      if (existing) return existing;
      const store = stores.find((s) => s.id === storeId);
      return {
        store_id: storeId,
        position: stores.findIndex((s) => s.id === storeId),
        is_visible: true,
        category_order: getCategoriesForStore(storeId, stores),
      };
    },
    [storeSettings, stores]
  );

  // ── Get category order for a store ─────────────────────────────
  const getCategoryOrderForStore = useCallback(
    (storeId: string): string[] => {
      const setting = storeSettings.find((s) => s.store_id === storeId);
      if (setting && setting.category_order && setting.category_order.length > 0) {
        return setting.category_order;
      }
      return getCategoriesForStore(storeId, stores);
    },
    [storeSettings, stores]
  );

  // ── Custom getCategoryIndex using persisted order ──────────────
  const getCustomCategoryIndex = useCallback(
    (category: string, storeId: string): number => {
      const order = getCategoryOrderForStore(storeId);
      const idx = order.indexOf(category);
      return idx >= 0 ? idx : order.length;
    },
    [getCategoryOrderForStore]
  );

  // ── Derived data ───────────────────────────────────────────────
  const sortedStoreItems = useMemo(() => {
    return items
      .filter((i) => i.store === selectedStore && !i.is_checked)
      .sort((a, b) => a.position - b.position);
  }, [items, selectedStore]);

  // Refs for stable DnD callbacks (avoids useLayoutEffect size-change warning in DndContext)
  const sortedStoreItemsRef = useRef(sortedStoreItems);
  sortedStoreItemsRef.current = sortedStoreItems;
  const selectedStoreRefStable = useRef(selectedStore);
  selectedStoreRefStable.current = selectedStore;
  const updateItemsRef = useRef(updateItems);
  updateItemsRef.current = updateItems;

  const checkedItems = useMemo(() => {
    return items.filter((i) => i.store === selectedStore && i.is_checked);
  }, [items, selectedStore]);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((i) => {
      if (!i.is_checked) counts[i.store] = (counts[i.store] || 0) + 1;
    });
    return counts;
  }, [items]);

  // Report total unchecked count to parent
  const totalUncheckedCount = useMemo(() => {
    return items.filter((i) => !i.is_checked).length;
  }, [items]);

  useEffect(() => {
    onItemCountChange?.(totalUncheckedCount);
  }, [totalUncheckedCount, onItemCountChange]);

  const existingNames = useMemo(() => {
    return new Set(
      items.filter((i) => i.store === selectedStore).map((i) => i.name)
    );
  }, [items, selectedStore]);

  const existingStoreIds = useMemo(() => {
    return new Set(stores.map((s) => s.id));
  }, [stores]);

  const customTemplates = useMemo(() => {
    const dbNames = new Set(GROCERY_DATABASE.map((g) => g.name.toLowerCase()));
    const seen = new Set<string>();
    const templates: GroceryTemplate[] = [];

    // Add global items first (sorted by times_used desc for priority)
    const sortedGlobal = [...globalItems].sort((a, b) => b.times_used - a.times_used);
    for (const gi of sortedGlobal) {
      const key = gi.name.toLowerCase();
      if (!dbNames.has(key) && !seen.has(key)) {
        seen.add(key);
        templates.push({ name: gi.name, category: gi.category });
      }
    }

    // Also add from current items list (catch any not yet in global)
    for (const item of items) {
      const key = item.name.toLowerCase();
      if (!dbNames.has(key) && !seen.has(key)) {
        seen.add(key);
        templates.push({ name: item.name, category: item.category });
      }
    }
    return templates;
  }, [items, globalItems]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleToggle = useCallback(
    (id: string) => {
      // If unchecking (already checked), do it immediately
      const item = items.find((i) => i.id === id);
      if (item?.is_checked) {
        updateItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, is_checked: false } : i
          )
        );
        return;
      }
      // Checking: animate first, then update
      setAnimatingCheckId(id);
      // After flash (300ms) + flyout (400ms), actually check the item
      setTimeout(() => {
        updateItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, is_checked: true } : i
          )
        );
        setAnimatingCheckId(null);
      }, 700);
    },
    [items, updateItems]
  );

  const handleQuantityChange = useCallback(
    (id: string, delta: number) => {
      updateItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const min = getUnitMin(i.unit);
          const raw = Math.round((i.quantity + delta) * 100) / 100; // avoid float issues
          return { ...i, quantity: Math.max(min, raw) };
        })
      );
    },
    [updateItems]
  );

  const handleUpdateQuantityUnit = useCallback(
    (id: string, quantity: number, unit: UnitType) => {
      updateItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, quantity, unit } : i
        )
      );
    },
    [updateItems]
  );

  const handleNameChange = useCallback(
    (id: string, newName: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      updateItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, name: newName } : i))
      );
      // If the new name doesn't exist in global_items or GROCERY_DATABASE, upsert it
      const isBuiltIn = GROCERY_DATABASE.some(
        (g) => g.name.toLowerCase() === newName.toLowerCase()
      );
      const isInGlobal = globalItems.some(
        (g) => g.name.toLowerCase() === newName.toLowerCase()
      );
      if (!isBuiltIn && !isInGlobal) {
        setGlobalItems((prev) => [
          ...prev,
          { name: newName, category: item.category, created_by_household_id: DEV_HOUSEHOLD_ID, times_used: 1 },
        ]);
        upsertGlobalItem(newName, item.category);
      }
    },
    [items, globalItems, updateItems]
  );

  // State for the quantity/unit drawer
  const [quantityDrawerItemId, setQuantityDrawerItemId] = useState<string | null>(null);
  const quantityDrawerItem = useMemo(
    () => items.find((i) => i.id === quantityDrawerItemId) ?? null,
    [items, quantityDrawerItemId]
  );

  const handleAddItem = useCallback(
    (name: string, category: string) => {
      const catIdx = getCustomCategoryIndex(category, selectedStore);
      const storeUnchecked = items
        .filter((i) => i.store === selectedStore && !i.is_checked)
        .sort((a, b) => a.position - b.position);

      let insertPosition = 0;
      for (const existing of storeUnchecked) {
        if (existing.manually_positioned) {
          if (existing.position >= insertPosition) {
            insertPosition = existing.position + 1;
          }
          continue;
        }
        const existingCatIdx = getCustomCategoryIndex(
          existing.category,
          selectedStore
        );
        if (existingCatIdx <= catIdx) {
          insertPosition = existing.position + 1;
        }
      }

      const newItem: ShoppingItem = {
        id: generateId(),
        name,
        store: selectedStore,
        category,
        is_checked: false,
        position: insertPosition,
        quantity: 1,
        household_id: DEV_HOUSEHOLD_ID,
      };

      updateItems((prev) => {
        const shifted = prev.map((i) =>
          i.store === selectedStore &&
          !i.is_checked &&
          i.position >= insertPosition
            ? { ...i, position: i.position + 1 }
            : i
        );
        return [...shifted, newItem];
      });

      // If this is a custom article (not in built-in DB), save/upsert to global items
      const isBuiltIn = GROCERY_DATABASE.some(
        (g) => g.name.toLowerCase() === name.toLowerCase()
      );
      if (!isBuiltIn) {
        // Update local state immediately for instant search visibility
        setGlobalItems((prev) => {
          const idx = prev.findIndex(
            (g) => g.name.toLowerCase() === name.toLowerCase()
          );
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], times_used: copy[idx].times_used + 1, category };
            return copy;
          }
          return [...prev, { name, category, created_by_household_id: DEV_HOUSEHOLD_ID, times_used: 1 }];
        });
        // Persist to server (fire and forget)
        upsertGlobalItem(name, category);
      }
    },
    [items, selectedStore, getCustomCategoryIndex, updateItems]
  );

  const handleClearChecked = useCallback(() => {
    updateItems((prev) =>
      prev.filter((i) => !(i.store === selectedStore && i.is_checked))
    );
  }, [selectedStore, updateItems]);

  const handleAddStore = useCallback(
    (suggestion: StoreSuggestion) => {
      const id = suggestion.name.toLowerCase().replace(/\s+/g, "-");

      const defaultStore = DEFAULT_STORES.find((s) => s.id === id);
      if (defaultStore) {
        setStores((prev) => {
          if (prev.find((s) => s.id === id)) {
            return prev;
          }
          const alleIdx = prev.findIndex((s) => s.id === "alle");
          const copy = [...prev];
          if (alleIdx >= 0) {
            copy.splice(alleIdx, 0, defaultStore);
          } else {
            copy.push(defaultStore);
          }
          return copy;
        });
        updateStoreSettings((prev) => {
          const idx = prev.findIndex((s) => s.store_id === id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], is_visible: true };
            return copy;
          }
          return prev;
        });
        setSelectedStore(id);
        setShowAddStore(false);
        return;
      }

      if (stores.find((s) => s.id === id)) {
        setSelectedStore(id);
        setShowAddStore(false);
        return;
      }
      const newStore: StoreInfo = {
        id,
        name: suggestion.name,
        abbr: suggestion.name.slice(0, 2).toUpperCase(),
        color: "#FFFFFF",
        bgColor: suggestion.bgColor,
        domain: suggestion.domain,
        emoji: suggestion.emoji,
        type: suggestion.type,
      };
      setStores((prev) => {
        const alleIdx = prev.findIndex((s) => s.id === "alle");
        if (alleIdx >= 0) {
          const copy = [...prev];
          copy.splice(alleIdx, 0, newStore);
          return copy;
        }
        return [...prev, newStore];
      });
      updateStoreSettings((prev) => [
        ...prev,
        {
          store_id: id,
          position: stores.length,
          is_visible: true,
          category_order: getCategoriesForStore(id, [...stores, newStore]),
        },
      ]);
      setSelectedStore(id);
      setShowAddStore(false);
    },
    [stores, updateStoreSettings]
  );

  // ── Store long-press handlers ──────────────────────────────────
  const handleStoreLongPress = useCallback(
    (storeId: string, anchorEl: HTMLElement) => {
      setPopover({ storeId, anchorEl });
    },
    []
  );

  const handleRemoveStore = useCallback(
    (storeId: string) => {
      setStores((prev) => {
        const remaining = prev.filter((s) => s.id !== storeId);
        if (selectedStore === storeId && remaining.length > 0) {
          setSelectedStore(remaining[0].id);
        }
        return remaining;
      });
      updateStoreSettings((prev) => {
        const idx = prev.findIndex((s) => s.store_id === storeId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], is_visible: false };
          return copy;
        }
        return [
          ...prev,
          {
            store_id: storeId,
            position: 999,
            is_visible: false,
            category_order: [],
          },
        ];
      });
    },
    [selectedStore, updateStoreSettings]
  );

  const handleStoreReorderEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setStores((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return prev;
        const moved = arrayMove(prev, oldIdx, newIdx);
        updateStoreSettings((settings) => {
          const newSettings = moved.map((store, idx) => {
            const existing = settings.find((s) => s.store_id === store.id);
            return {
              store_id: store.id,
              position: idx,
              is_visible: true,
              category_order: existing?.category_order || getCategoriesForStore(store.id, moved),
            };
          });
          const hiddenSettings = settings.filter(
            (s) => !s.is_visible && !moved.find((st) => st.id === s.store_id)
          );
          return [...newSettings, ...hiddenSettings];
        });
        return moved;
      });
    },
    [updateStoreSettings]
  );

  const handleCategoryAutoSave = useCallback(
    (storeId: string, categories: string[]) => {
      updateStoreSettings((prev) => {
        const idx = prev.findIndex((s) => s.store_id === storeId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], category_order: categories };
          return copy;
        }
        return [
          ...prev,
          {
            store_id: storeId,
            position: stores.findIndex((s) => s.id === storeId),
            is_visible: true,
            category_order: categories,
          },
        ];
      });

      updateItems((prev) => {
        const storeUnchecked = prev
          .filter((i) => i.store === storeId && !i.is_checked)
          .sort((a, b) => a.position - b.position);

        const manual = storeUnchecked.filter((i) => i.manually_positioned);
        const auto = storeUnchecked.filter((i) => !i.manually_positioned);

        auto.sort((a, b) => {
          const ai = categories.indexOf(a.category);
          const bi = categories.indexOf(b.category);
          return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
        });

        const merged = [...storeUnchecked];
        let autoIdx = 0;
        const result: ShoppingItem[] = [];
        for (const item of merged) {
          if (item.manually_positioned) {
            result.push(item);
          } else {
            if (autoIdx < auto.length) {
              result.push(auto[autoIdx]);
              autoIdx++;
            }
          }
        }
        while (autoIdx < auto.length) {
          result.push(auto[autoIdx]);
          autoIdx++;
        }

        const posMap = new Map<string, number>();
        result.forEach((item, idx) => posMap.set(item.id, idx));

        return prev.map((i) => {
          const newPos = posMap.get(i.id);
          if (newPos !== undefined) {
            return { ...i, position: newPos };
          }
          return i;
        });
      });

      // Do NOT close the modal — auto-save keeps it open
    },
    [stores, updateStoreSettings, updateItems]
  );

  const handleAddGlobalCategory = useCallback(
    (name: string) => {
      setGlobalCustomCategories((prev) => {
        const alreadyExists = prev.some(
          (c) => c.toLowerCase() === name.toLowerCase()
        );
        if (alreadyExists) return prev;
        const next = [...prev, name];
        // Debounce save to server
        if (customCatSaveTimeout.current) clearTimeout(customCatSaveTimeout.current);
        customCatSaveTimeout.current = setTimeout(() => saveCustomCategories(next), 300);
        return next;
      });
    },
    []
  );

  // ── dnd-kit sensors for item list ──────────────────────────────
  const itemSensorOptions = useMemo(() => ({
    pointer: { activationConstraint: { distance: 5 } },
    touch: { activationConstraint: { delay: 150, tolerance: 5 } },
  }), []);
  const pointerSensor = useSensor(PointerSensor, itemSensorOptions.pointer);
  const touchSensor = useSensor(TouchSensor, itemSensorOptions.touch);
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDndDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    storeTransferModeRef.current = false;
    setStoreTransferActive(false);
    hoveredStoreRef.current = null;
    setHoveredStoreId(null);

    // Track pointer position for store transfer detection
    const trackPointer = (e: PointerEvent | TouchEvent) => {
      if ("touches" in e) {
        pointerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else {
        pointerPosRef.current = { x: e.clientX, y: e.clientY };
      }
    };
    document.addEventListener("pointermove", trackPointer as any);
    document.addEventListener("touchmove", trackPointer as any, { passive: true });

    // Clean up on drag end (will be removed in handleDndDragEnd too)
    const cleanup = () => {
      document.removeEventListener("pointermove", trackPointer as any);
      document.removeEventListener("touchmove", trackPointer as any);
      document.removeEventListener("pointerup", cleanup);
      document.removeEventListener("touchend", cleanup);
    };
    document.addEventListener("pointerup", cleanup, { once: true });
    document.addEventListener("touchend", cleanup, { once: true });
  }, []);

  const handleDndDragMove = useCallback(() => {
    // Check if the dragged item is near the top of the list area
    const selectorRect = storeSelectorRef.current?.getBoundingClientRect();
    if (!selectorRect) return;

    const topThreshold = selectorRect.bottom + 60; // within 60px of the top
    const itemRect = scrollContainerRef.current?.getBoundingClientRect();
    if (!itemRect) return;

    // Use pointer position for detection
    const py = pointerPosRef.current.y;

    if (py < topThreshold && py > selectorRect.top) {
      // Near the top — start timer if not already started
      if (!storeTransferTimerRef.current && !storeTransferModeRef.current) {
        storeTransferTimerRef.current = setTimeout(() => {
          storeTransferModeRef.current = true;
          setStoreTransferActive(true);
          // Vibrate for haptic feedback if available
          if (navigator.vibrate) navigator.vibrate(50);
        }, 800);
      }
    } else {
      // Not near top — clear timer
      if (storeTransferTimerRef.current) {
        clearTimeout(storeTransferTimerRef.current);
        storeTransferTimerRef.current = null;
      }
    }

    // In transfer mode, detect which store icon the pointer is hovering over
    if (storeTransferModeRef.current) {
      const storeButtons = document.querySelectorAll<HTMLElement>("[data-store-id]");
      let foundStore: string | null = null;
      const px = pointerPosRef.current.x;
      storeButtons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if (
          px >= rect.left - 10 &&
          px <= rect.right + 10 &&
          py >= rect.top - 10 &&
          py <= rect.bottom + 10
        ) {
          foundStore = btn.getAttribute("data-store-id");
        }
      });
      hoveredStoreRef.current = foundStore;
      setHoveredStoreId(foundStore);
    }
  }, []);

  const handleDndDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = active.id as string;

      // Clean up transfer state
      if (storeTransferTimerRef.current) {
        clearTimeout(storeTransferTimerRef.current);
        storeTransferTimerRef.current = null;
      }
      const wasTransferMode = storeTransferModeRef.current;
      const targetStore = hoveredStoreRef.current;
      storeTransferModeRef.current = false;
      setStoreTransferActive(false);
      hoveredStoreRef.current = null;
      setHoveredStoreId(null);
      setActiveDragId(null);

      // Handle store transfer
      if (wasTransferMode && targetStore && targetStore !== selectedStoreRefStable.current) {
        // Transfer the item to the new store
        updateItemsRef.current((prev) => {
          // Get the max position in the target store
          const targetItems = prev.filter(
            (i) => i.store === targetStore && !i.is_checked
          );
          const maxPos = targetItems.length > 0
            ? Math.max(...targetItems.map((i) => i.position)) + 1
            : 0;

          return prev.map((i) =>
            i.id === activeId
              ? { ...i, store: targetStore, position: maxPos, manually_positioned: false }
              : i
          );
        });
        return;
      }

      // If transfer mode was active but no valid target, cancel (item stays)
      if (wasTransferMode) return;

      // Normal reorder
      if (!over || active.id === over.id) return;

      const overId = over.id as string;

      const currentSorted = sortedStoreItemsRef.current;
      const oldIndex = currentSorted.findIndex((i) => i.id === activeId);
      const newIndex = currentSorted.findIndex((i) => i.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(currentSorted, oldIndex, newIndex);

      updateItemsRef.current((prev) => {
        const positionMap = new Map<
          string,
          { position: number; manually_positioned?: boolean }
        >();
        reordered.forEach((item, idx) => {
          positionMap.set(item.id, {
            position: idx,
            manually_positioned:
              item.id === activeId ? true : item.manually_positioned,
          });
        });

        return prev.map((i) => {
          const update = positionMap.get(i.id);
          if (update) {
            return {
              ...i,
              position: update.position,
              manually_positioned: update.manually_positioned,
            };
          }
          return i;
        });
      });
    },
    []
  );

  const handleDndDragCancel = useCallback(() => {
    if (storeTransferTimerRef.current) {
      clearTimeout(storeTransferTimerRef.current);
      storeTransferTimerRef.current = null;
    }
    storeTransferModeRef.current = false;
    setStoreTransferActive(false);
    hoveredStoreRef.current = null;
    setHoveredStoreId(null);
    setActiveDragId(null);
  }, []);

  const restrictToListBounds = useMemo(
    () => createRestrictToListBounds(storeSelectorRef, checkedSectionRef, scrollContainerRef, storeTransferModeRef),
    []
  );
  const itemModifiers = useMemo(() => [restrictToListBounds], [restrictToListBounds]);

  const sortableItemIds = useMemo(
    () => sortedStoreItems.map((i) => i.id),
    [sortedStoreItems]
  );

  const currentCategoryOrder = useMemo(
    () => getCategoryOrderForStore(selectedStore),
    [selectedStore, getCategoryOrderForStore]
  );

  const categorySortStoreName = useMemo(() => {
    if (!categorySortStore) return "";
    return stores.find((s) => s.id === categorySortStore)?.name || "";
  }, [categorySortStore, stores]);

  const categorySortInitial = useMemo(() => {
    if (!categorySortStore) return [];
    return getCategoryOrderForStore(categorySortStore);
  }, [categorySortStore, getCategoryOrderForStore]);

  const allKnownCategories = useMemo(() => {
    const base = getAllCategories();
    const fromSettings = new Set<string>();
    for (const setting of storeSettings) {
      if (setting.category_order) {
        for (const c of setting.category_order) {
          fromSettings.add(c);
        }
      }
    }
    const result = [...base];
    for (const c of fromSettings) {
      if (!result.includes(c)) result.push(c);
    }
    return result;
  }, [storeSettings]);

  // Measure the bottom bar height for scroll area padding
  useLayoutEffect(() => {
    if (!bottomBarRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setBottomBarHeight(entry.contentRect.height);
      }
    });
    ro.observe(bottomBarRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--zu-bg)" }}>
      {/* Wiggle animation for store reorder */}
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(-1.5deg); }
          50% { transform: rotate(1.5deg); }
        }
      `}</style>

      {/* Screen Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2" style={{ background: "var(--zu-bg)" }}>
        <h2 className="text-lg font-bold text-text-1">Einkaufen</h2>
      </div>

      {/* Store selector — stays at top, never moves */}
      <div className="flex-shrink-0 z-10" ref={storeSelectorRef}>
        <StoreSelector
          stores={stores}
          selectedStore={selectedStore}
          onSelect={setSelectedStore}
          itemCounts={itemCounts}
          onAddStore={() => setShowAddStore(true)}
          onLongPress={handleStoreLongPress}
          isReorderMode={storeReorderMode}
          onStoreReorderEnd={handleStoreReorderEnd}
          transferHoveredStoreId={hoveredStoreId}
          isTransferActive={storeTransferActive}
        />
      </div>

      {/* Scrollable list area — dynamic padding-bottom for the fixed input bar */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto flex flex-col"
        style={{ paddingBottom: bottomBarHeight + keyboardHeight }}
      >
        {!loaded ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedStoreItems.length === 0 && checkedItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-xl bg-accent-light flex items-center justify-center mb-3">
              <Search className="w-7 h-7 text-accent" />
            </div>
            <p className="text-base font-semibold text-text-1">
              Liste ist leer
            </p>
            <p className="text-sm text-text-2 mt-1 text-center">
              Füge unten Artikel hinzu, um deine Einkaufsliste zu starten.
            </p>
          </div>
        ) : sortedStoreItems.length === 0 && checkedItems.length > 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-xl bg-accent-light flex items-center justify-center mb-3">
              <Check className="w-7 h-7 text-accent" />
            </div>
            <p className="text-base font-semibold text-text-1">
              Alles erledigt!
            </p>
            <p className="text-sm text-text-2 mt-1 text-center">
              {checkedItems.length}{" "}
              {checkedItems.length === 1
                ? "Artikel wurde"
                : "Artikel wurden"}{" "}
              abgehakt.
            </p>
            <button
              onClick={handleClearChecked}
              className="mt-4 flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-white text-sm font-semibold hover:bg-accent-dark active:scale-95 transition"
            >
              <Trash2 className="w-4 h-4" />
              Liste bereinigen
            </button>
          </div>
        ) : null}
        {/* DndContext always mounted to prevent useLayoutEffect dep-array size change warning */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={itemModifiers}
          onDragStart={handleDndDragStart}
          onDragMove={handleDndDragMove}
          onDragEnd={handleDndDragEnd}
          onDragCancel={handleDndDragCancel}
        >
          <SortableContext
            items={sortableItemIds}
            strategy={verticalListSortingStrategy}
          >
            {loaded && sortedStoreItems.length > 0 && (
              <div className="pt-1">
                {sortedStoreItems.map((item) => (
                  <SortableShoppingItem
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggle(item.id)}
                    onQuantityChange={(d) =>
                      handleQuantityChange(item.id, d)
                    }
                    onOpenQuantityDrawer={() =>
                      setQuantityDrawerItemId(item.id)
                    }
                    onNameChange={(newName) =>
                      handleNameChange(item.id, newName)
                    }
                    animatingCheckId={animatingCheckId}
                    isTransferDragging={storeTransferActive && activeDragId === item.id}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>

        {/* Spacer pushes checked section to bottom of visible scroll area (only when keyboard is closed) */}
        {keyboardHeight === 0 && <div className="flex-1" />}
        {/* Checked items — inside scroll area so they scroll with the list */}
        <div ref={checkedSectionRef}>
          <CheckedSection
            items={checkedItems}
            onToggle={handleToggle}
            onClearAll={handleClearChecked}
          />
        </div>
      </div>

      {/* Add item bar — fixed when keyboard open, absolute otherwise */}
      <div
        ref={bottomBarRef}
        className="z-10 bg-surface"
        style={keyboardHeight > 0 ? {
          position: "fixed",
          left: 0,
          right: 0,
          bottom: keyboardHeight,
          willChange: "bottom",
        } : {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <AddItemBar
          storeId={selectedStore}
          stores={stores}
          existingNames={existingNames}
          customTemplates={customTemplates}
          onAdd={handleAddItem}
          categoryOrder={currentCategoryOrder}
        />
      </div>

      {/* Quantity / Unit drawer */}
      <AnimatePresence>
        {quantityDrawerItem && (
          <QuantityDrawer
            item={quantityDrawerItem}
            onSave={(qty, unit) =>
              handleUpdateQuantityUnit(quantityDrawerItem.id, qty, unit)
            }
            onClose={() => setQuantityDrawerItemId(null)}
          />
        )}
      </AnimatePresence>

      {/* Add store modal */}
      <AnimatePresence>
        {showAddStore && (
          <AddStoreModal
            onClose={() => setShowAddStore(false)}
            onAdd={handleAddStore}
            existingStoreIds={existingStoreIds}
          />
        )}
      </AnimatePresence>

      {/* Store popover */}
      <AnimatePresence>
        {popover && (
          <StorePopover
            storeId={popover.storeId}
            storeName={
              stores.find((s) => s.id === popover.storeId)?.name || ""
            }
            anchorEl={popover.anchorEl}
            onClose={() => setPopover(null)}
            onReorder={() => setStoreReorderMode(true)}
            onRemove={() => handleRemoveStore(popover.storeId)}
            onCategorySort={() => setCategorySortStore(popover.storeId)}
          />
        )}
      </AnimatePresence>

      {/* Category sort modal */}
      <AnimatePresence>
        {categorySortStore && (
          <CategorySortModal
            storeName={categorySortStoreName}
            storeId={categorySortStore}
            stores={stores}
            initialCategories={categorySortInitial}
            allKnownCategories={allKnownCategories}
            globalCustomCategories={globalCustomCategories}
            onAutoSave={(cats) => handleCategoryAutoSave(categorySortStore, cats)}
            onAddGlobalCategory={handleAddGlobalCategory}
            onClose={() => setCategorySortStore(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
