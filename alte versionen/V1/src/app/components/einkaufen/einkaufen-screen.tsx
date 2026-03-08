import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

  return (
    <div
      className={`rounded-full flex items-center justify-center overflow-hidden transition-all ${
        isSelected
          ? "ring-2 ring-orange-500 ring-offset-2 scale-110"
          : "opacity-80"
      }`}
      style={{
        width: size,
        height: size,
        backgroundColor: showLogo ? "#F3F4F6" : store.bgColor,
        color: store.color,
      }}
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt={store.name}
          className="object-contain p-1.5"
          style={{ width: size * 0.75, height: size * 0.75 }}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="text-xs font-bold select-none">{store.abbr}</span>
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
        className={`flex flex-col items-center gap-1 touch-none animate-[wiggle_0.3s_ease-in-out_infinite] ${
          isDragging ? "scale-110 drop-shadow-lg" : ""
        }`}
      >
        <div className="relative">
          <StoreLogo store={store} size={48} isSelected={isSelected} />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {count}
            </span>
          )}
        </div>
        <span
          className={`text-[10px] leading-tight max-w-[52px] truncate ${
            isSelected ? "text-orange-500 font-semibold" : "text-gray-500"
          }`}
        >
          {store.name}
        </span>
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
}: {
  stores: StoreInfo[];
  selectedStore: string;
  onSelect: (id: string) => void;
  itemCounts: Record<string, number>;
  onAddStore: () => void;
  onLongPress: (storeId: string, anchorEl: HTMLElement) => void;
  isReorderMode: boolean;
  onStoreReorderEnd: (event: DragEndEvent) => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 100, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);

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
    <div className="bg-white border-b border-gray-100">
      <div
        className={`flex items-center gap-3 px-4 py-3 scrollbar-hide ${isReorderMode ? 'overflow-hidden' : 'overflow-x-auto'}`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {isReorderMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
            onDragEnd={onStoreReorderEnd}
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
            return (
              <button
                key={store.id}
                onPointerDown={(e) => handlePointerDown(store.id, e)}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onClick={() => handleClick(store.id)}
                className="flex flex-col items-center gap-1 flex-shrink-0 transition-all duration-150"
              >
                <div className="relative">
                  <StoreLogo
                    store={store}
                    size={48}
                    isSelected={isSelected}
                  />
                  {count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {count}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] leading-tight max-w-[52px] truncate ${
                    isSelected
                      ? "text-orange-500 font-semibold"
                      : "text-gray-500"
                  }`}
                >
                  {store.name}
                </span>
              </button>
            );
          })
        )}
        {!isReorderMode && (
          <button
            onClick={onAddStore}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-500 hover:text-orange-500 transition">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-[10px] text-gray-500 leading-tight">
              Mehr
            </span>
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
        className="bg-white rounded-xl shadow-lg p-2 overflow-hidden"
        style={{
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
            className="w-full flex items-center gap-2.5 p-3 text-sm text-gray-900 hover:bg-gray-50 rounded-lg transition whitespace-nowrap"
          >
            <span className="text-gray-500">{opt.icon}</span>
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
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap ${
        selected
          ? "bg-white border-2"
          : "bg-gray-50 border border-gray-100 hover:bg-gray-100"
      }`}
      style={
        selected
          ? { borderColor: colors.dot, color: colors.text }
          : { color: colors.text }
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

// ── Restrict drag within the scrollable ancestor ──────────────────
const restrictToContainer: any = ({
  transform,
  draggingNodeRect,
  scrollableAncestorRects,
}: any) => {
  const containerRect = scrollableAncestorRects[0];
  if (!draggingNodeRect || !containerRect) {
    return { ...transform, x: 0 };
  }
  const minY = containerRect.top - draggingNodeRect.top;
  const maxY =
    containerRect.top +
    containerRect.height -
    (draggingNodeRect.top + draggingNodeRect.height);
  return {
    ...transform,
    x: 0,
    y: Math.min(Math.max(transform.y, minY), maxY),
  };
};

// ── Sortable Shopping List Item (dnd-kit) ──────────────────────────
function SortableShoppingItem({
  item,
  onToggle,
  onQuantityChange,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onQuantityChange: (delta: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    zIndex: isDragging ? 20 : undefined,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-2 px-4 py-2.5 bg-white transition-shadow ${
          isDragging
            ? "shadow-lg rounded-xl scale-[1.02] opacity-95"
            : ""
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          className="touch-none flex-shrink-0 p-1 text-gray-300 cursor-grab active:cursor-grabbing hover:text-gray-500"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button
          onClick={onToggle}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
            item.is_checked
              ? "bg-orange-500 border-orange-500"
              : "border-gray-200 hover:border-orange-500"
          }`}
        >
          {item.is_checked && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm leading-tight truncate ${
              item.is_checked
                ? "line-through text-gray-400"
                : "text-gray-900 font-medium"
            }`}
          >
            {item.name}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onQuantityChange(-1)}
            disabled={item.quantity <= 1}
            className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-30 transition"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-semibold text-gray-900">
            {item.quantity}
          </span>
          <button
            onClick={() => onQuantityChange(1)}
            className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 transition"
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
          isDragging ? "shadow-md bg-white" : "bg-white"
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          className="touch-none flex-shrink-0 p-0.5 text-gray-300 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.dot }}
          />
          <span className="text-sm font-medium text-gray-900">
            {category}
          </span>
        </div>
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 transition"
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
  onSave,
  onClose,
}: {
  storeName: string;
  storeId: string;
  stores: StoreInfo[];
  initialCategories: string[];
  allKnownCategories: string[];
  onSave: (categories: string[]) => void;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [newCat, setNewCat] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = categories.indexOf(active.id as string);
    const newIdx = categories.indexOf(over.id as string);
    if (oldIdx >= 0 && newIdx >= 0) {
      setCategories(arrayMove(categories, oldIdx, newIdx));
    }
  };

  const availableChips = useMemo(() => {
    const catSet = new Set(categories);
    return allKnownCategories.filter((c) => !catSet.has(c));
  }, [categories, allKnownCategories]);

  const searchResults = useMemo(() => {
    if (!newCat.trim()) return [];
    const q = newCat.toLowerCase().trim();
    return availableChips.filter((c) => c.toLowerCase().includes(q));
  }, [newCat, availableChips]);

  const handleAddCategory = (name?: string) => {
    const catName = (name || newCat).trim();
    if (!catName || categories.includes(catName)) return;
    setCategories((prev) => [...prev, catName]);
    setNewCat("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const showCustomOption =
    newCat.trim() &&
    !allKnownCategories.some(
      (c) => c.toLowerCase() === newCat.trim().toLowerCase()
    ) &&
    !categories.includes(newCat.trim());

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-t-2xl shadow-lg flex flex-col max-h-[80vh]"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pb-3">
          <h3 className="text-base font-bold text-gray-900">
            Kategorien für {storeName}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Ziehe Kategorien um die Sortierung zu ändern
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
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
        <div className="flex-shrink-0 border-t border-gray-100">
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
                    className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium hover:scale-105 active:scale-95 transition whitespace-nowrap bg-gray-50 border border-gray-100"
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
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition"
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
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg transition"
                    >
                      <span className="text-sm text-orange-500 font-medium">
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
            <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
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
                className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
              />
              {newCat && (
                <button
                  type="button"
                  onClick={() => {
                    setNewCat("");
                    setShowSuggestions(false);
                  }}
                  className="text-gray-400 hover:text-gray-900"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                if (searchResults.length > 0) {
                  handleAddCategory(searchResults[0]);
                } else {
                  handleAddCategory();
                }
              }}
              disabled={
                !newCat.trim() || categories.includes(newCat.trim())
              }
              className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center disabled:opacity-40 transition flex-shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Save */}
        <div className="px-5 pb-5 flex-shrink-0">
          <button
            onClick={() => onSave(categories)}
            className="w-full py-3 rounded-full bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition"
          >
            Speichern
          </button>
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
    <div className="border-t border-gray-100 bg-gray-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5"
      >
        <span className="text-xs font-medium text-gray-500">
          Erledigt ({items.length})
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
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
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-500 border-2 border-orange-500 flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-white" />
                  </button>
                  <span className="text-xs line-through text-gray-500 flex-1 truncate">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {item.quantity}x
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2">
              <button
                onClick={onClearAll}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition"
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

  const handleSelect = (name: string, category?: string) => {
    const cat =
      category || findGroceryTemplate(name, customTemplates)?.category || null;
    if (!cat) {
      setPendingCustomName(name);
      setQuery("");
      setShowSuggestions(false);
      return;
    }
    onAdd(name, cat);
    setQuery("");
    setShowSuggestions(false);
    setQuickChips((prev) => prev.filter((c) => c !== name));
    inputRef.current?.focus();
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
      inputRef.current?.focus();
    }
  };

  const pickerCategories =
    categoryOrder.length > 0
      ? categoryOrder
      : getCategoriesForStore(storeId, stores);

  return (
    <>
      <div className="border-t border-gray-100 bg-white">
        {quickChips.length > 0 && (
          <div
            className="flex gap-2 px-4 pt-2.5 pb-1 overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {quickChips.map((chip) => (
              <button
                key={chip}
                onClick={() => handleSelect(chip)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 text-xs font-medium hover:bg-orange-100 transition whitespace-nowrap"
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
              className="overflow-hidden border-t border-gray-100"
            >
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map((result) => {
                  const colors = getCategoryChipColor(result.category);
                  return (
                    <button
                      key={result.name}
                      onClick={() => handleSelect(result.name, result.category)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between transition"
                    >
                      <span className="text-sm text-gray-900">
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
                {searchResults.length === 0 && query.trim() && (
                  <button
                    onClick={() => {
                      setPendingCustomName(query.trim());
                      setQuery("");
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition"
                  >
                    <span className="text-sm text-orange-500 font-medium">
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
          <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Artikel hinzufügen..."
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setShowSuggestions(false);
                }}
                className="text-gray-400 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!query.trim()}
            className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center disabled:opacity-40 transition flex-shrink-0"
          >
            <Plus className="w-5 h-5" />
          </button>
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

// ── Category Picker Modal ──────────────────────────────────────────
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
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-t-2xl shadow-lg flex flex-col max-h-[60vh]"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pb-3">
          <h3 className="text-base font-bold text-gray-900">
            Kategorie wählen
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Für &bdquo;{itemName}&ldquo;
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <CategoryChip
                key={cat}
                category={cat}
                onClick={() => onSelect(cat)}
              />
            ))}
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-t-2xl shadow-lg flex flex-col max-h-[75vh]"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pb-3">
          <h3 className="text-lg font-bold text-gray-900">
            Geschäft hinzufügen
          </h3>
        </div>
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Laden suchen..."
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-gray-400 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
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
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition"
              >
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-orange-300 flex items-center justify-center text-orange-500">
                  <Store className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-orange-500">
                    Eigenen Laden hinzufügen: &bdquo;{query.trim()}&ldquo;
                  </p>
                </div>
              </button>
            )}
            {filtered.length === 0 && !showCustomOption && (
              <p className="text-sm text-gray-500 text-center py-6">
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
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{ backgroundColor: showLogo ? "#F3F4F6" : suggestion.bgColor }}
      >
        {showLogo ? (
          <img
            src={logoUrl}
            alt={suggestion.name}
            className="w-[30px] h-[30px] object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-white text-xs font-bold">
            {suggestion.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="text-left flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {suggestion.name}
        </p>
        <p className="text-[11px] text-gray-500">
          {typeLabel[suggestion.type] || "Geschäft"}
        </p>
      </div>
      <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </button>
  );
}

// ── Main Einkaufen Screen ──────────────────────────────────────────
export function EinkaufenScreen() {
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

  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const settingsSaveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const storeSelectorRef = useRef<HTMLDivElement>(null);

  // ── Load items + store settings ────────────────────────────────
  useEffect(() => {
    Promise.all([fetchItems(), fetchStoreSettings()]).then(
      ([serverItems, settings]) => {
        setItems(serverItems);
        if (settings.length > 0) {
          setStoreSettings(settings);
          applyStoreSettings(DEFAULT_STORES, settings);
        }
        setLoaded(true);
      }
    );
  }, []);

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
      const serverItems = await fetchItems();
      if (serverItems.length > 0 && !activeDragId) {
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
    for (const item of items) {
      const key = item.name.toLowerCase();
      if (!dbNames.has(key) && !seen.has(key)) {
        seen.add(key);
        templates.push({ name: item.name, category: item.category });
      }
    }
    return templates;
  }, [items]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleToggle = useCallback(
    (id: string) => {
      updateItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, is_checked: !i.is_checked } : i
        )
      );
    },
    [updateItems]
  );

  const handleQuantityChange = useCallback(
    (id: string, delta: number) => {
      updateItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, quantity: Math.max(1, i.quantity + delta) }
            : i
        )
      );
    },
    [updateItems]
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

  const handleCategorySave = useCallback(
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

      setCategorySortStore(null);
    },
    [stores, updateStoreSettings, updateItems]
  );

  // ── dnd-kit sensors for item list ──────────────────────────────
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDndDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDndDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);

      if (!over || active.id === over.id) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const oldIndex = sortedStoreItems.findIndex((i) => i.id === activeId);
      const newIndex = sortedStoreItems.findIndex((i) => i.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(sortedStoreItems, oldIndex, newIndex);

      updateItems((prev) => {
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
    [sortedStoreItems, updateItems]
  );

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

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      {/* Wiggle animation for store reorder */}
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(-1.5deg); }
          50% { transform: rotate(1.5deg); }
        }
      `}</style>

      {/* Store selector */}
      <div className="flex-shrink-0" ref={storeSelectorRef}>
        <StoreSelector
          stores={stores}
          selectedStore={selectedStore}
          onSelect={setSelectedStore}
          itemCounts={itemCounts}
          onAddStore={() => setShowAddStore(true)}
          onLongPress={handleStoreLongPress}
          isReorderMode={storeReorderMode}
          onStoreReorderEnd={handleStoreReorderEnd}
        />
      </div>

      {/* Shopping list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!loaded ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedStoreItems.length === 0 && checkedItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
              <Search className="w-7 h-7 text-orange-500" />
            </div>
            <p className="text-base font-semibold text-gray-900">
              Liste ist leer
            </p>
            <p className="text-sm text-gray-500 mt-1 text-center">
              Füge unten Artikel hinzu, um deine Einkaufsliste zu starten.
            </p>
          </div>
        ) : sortedStoreItems.length === 0 && checkedItems.length > 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center mb-3">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-base font-semibold text-gray-900">
              Alles erledigt!
            </p>
            <p className="text-sm text-gray-500 mt-1 text-center">
              {checkedItems.length}{" "}
              {checkedItems.length === 1
                ? "Artikel wurde"
                : "Artikel wurden"}{" "}
              abgehakt.
            </p>
            <button
              onClick={handleClearChecked}
              className="mt-4 flex items-center gap-2 px-6 py-3 rounded-full bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 active:scale-95 transition"
            >
              <Trash2 className="w-4 h-4" />
              Liste bereinigen
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToContainer]}
            onDragStart={handleDndDragStart}
            onDragEnd={handleDndDragEnd}
          >
            <SortableContext
              items={sortableItemIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="pt-1">
                {sortedStoreItems.map((item) => (
                  <SortableShoppingItem
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggle(item.id)}
                    onQuantityChange={(d) =>
                      handleQuantityChange(item.id, d)
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Checked items */}
      <div className="flex-shrink-0">
        <CheckedSection
          items={checkedItems}
          onToggle={handleToggle}
          onClearAll={handleClearChecked}
        />
      </div>

      {/* Add item bar */}
      <div className="flex-shrink-0">
        <AddItemBar
          storeId={selectedStore}
          stores={stores}
          existingNames={existingNames}
          customTemplates={customTemplates}
          onAdd={handleAddItem}
          categoryOrder={currentCategoryOrder}
        />
      </div>

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
            onSave={(cats) => handleCategorySave(categorySortStore, cats)}
            onClose={() => setCategorySortStore(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
