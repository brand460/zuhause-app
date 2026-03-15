import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  GripVertical,
  Trash2,
  Plus,
  Check,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { CalendarLabel, CalendarEvent, EventColor, generateId } from "./calendar-types";
import { useBackHandler } from "../ui/use-back-handler";

// ── Color Swatches (15 Farben) ─────────────────────────────────────

interface ColorSwatch {
  label: string;
  hex: string;
  eventColor: EventColor; // nearest EventColor for pill rendering
}

const COLOR_SWATCHES: ColorSwatch[] = [
  { label: "Rot", hex: "#EF4444", eventColor: "red" },
  { label: "Orange", hex: "#F97316", eventColor: "orange" },
  { label: "Gelb", hex: "#EAB308", eventColor: "orange" },
  { label: "Grün", hex: "#22C55E", eventColor: "green" },
  { label: "Türkis", hex: "#14B8A6", eventColor: "green" },
  { label: "Cyan", hex: "#06B6D4", eventColor: "blue" },
  { label: "Blau", hex: "#3B82F6", eventColor: "blue" },
  { label: "Indigo", hex: "#6366F1", eventColor: "purple" },
  { label: "Violett", hex: "#8B5CF6", eventColor: "purple" },
  { label: "Pink", hex: "#EC4899", eventColor: "red" },
  { label: "Rosa", hex: "#F472B6", eventColor: "red" },
  { label: "Braun", hex: "#92400E", eventColor: "orange" },
  { label: "Grau (hell)", hex: "#9CA3AF", eventColor: "gray" },
  { label: "Grau (dunkel)", hex: "#4B5563", eventColor: "gray" },
  { label: "Schwarz", hex: "#1F2937", eventColor: "gray" },
];

// ── Sortable Label Row ─────────────────────────────────────────────

function SortableLabelRow({
  label,
  isEditing,
  onStartEdit,
  onFinishEdit,
  onColorClick,
  onDelete,
}: {
  label: CalendarLabel;
  isEditing: boolean;
  onStartEdit: () => void;
  onFinishEdit: (name: string) => void;
  onColorClick: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: label.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: "relative" as const,
    opacity: isDragging ? 0.9 : 1,
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(label.name);

  useEffect(() => {
    if (isEditing) {
      setEditValue(label.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isEditing, label.name]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      onFinishEdit(trimmed);
    } else {
      onFinishEdit(label.name); // revert to original
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-2 px-4 py-3 ${
          isDragging ? "bg-surface-2 rounded-xl shadow-lg" : "bg-surface"
        }`}
        style={{ borderBottom: "1px solid var(--zu-border)" }}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="touch-none flex-shrink-0 p-0.5 text-text-3 cursor-grab active:cursor-grabbing"
          style={{ WebkitTouchCallout: "none", userSelect: "none" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Color dot (tappable) */}
        <button
          onClick={onColorClick}
          className="flex-shrink-0 w-5 h-5 rounded-full active:scale-110 transition-transform"
          style={{ backgroundColor: label.hex, minWidth: 20, minHeight: 20 }}
        />

        {/* Label name (tappable → inline edit) */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
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
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                }
              }}
              className="w-full text-sm font-medium bg-transparent border-none outline-none p-0 m-0 text-text-1"
              style={{ caretColor: "var(--color-accent)" }}
            />
          ) : (
            <button
              onClick={onStartEdit}
              className="w-full text-left text-sm font-medium text-text-1 truncate"
            >
              {label.name}
            </button>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-1.5 text-text-3 active:text-danger transition-colors"
          style={{ minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Color Picker Drawer ────────────────────────────────────────────

function ColorPickerDrawer({
  currentHex,
  onSelect,
  onClose,
}: {
  currentHex: string;
  onSelect: (hex: string, eventColor: EventColor) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[1200]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        className="absolute left-0 right-0 bottom-0 bg-surface rounded-t-[20px]"
        style={{ boxShadow: "var(--shadow-elevated)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        <div className="px-5 pb-2">
          <h3 className="text-sm font-semibold text-text-1">Farbe wählen</h3>
        </div>

        {/* 5×3 Grid of color swatches */}
        <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-3">
            {COLOR_SWATCHES.map((swatch) => {
              const isSelected = swatch.hex === currentHex;
              return (
                <button
                  key={swatch.hex}
                  onClick={() => {
                    onSelect(swatch.hex, swatch.eventColor);
                  }}
                  className="aspect-square rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  style={{
                    backgroundColor: swatch.hex,
                    minWidth: 44,
                    minHeight: 44,
                    boxShadow: isSelected ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${swatch.hex}` : undefined,
                  }}
                >
                  {isSelected && (
                    <Check className="w-5 h-5" style={{ color: swatch.hex === "#1F2937" || swatch.hex === "#4B5563" || swatch.hex === "#92400E" ? "#fff" : "#fff" }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete Confirmation Modal ──────────────────────────────────────

function DeleteLabelConfirm({
  labelName,
  eventCount,
  firstLabelName,
  onConfirm,
  onCancel,
}: {
  labelName: string;
  eventCount: number;
  firstLabelName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[1200] flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={(e) => { e.stopPropagation(); onCancel(); }} />
      <motion.div
        className="relative w-full max-w-[320px] rounded-2xl p-6"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-elevated)" }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 400 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-text-1 text-center">
          Kategorie löschen?
        </h3>
        <p className="text-sm text-text-3 text-center mt-2">
          {eventCount > 0
            ? `Diese Kategorie wird von ${eventCount} ${eventCount === 1 ? "Termin" : "Terminen"} verwendet. Die Termine werden der Kategorie \u201e${firstLabelName}\u201c zugewiesen.`
            : `Kategorie \u201e${labelName}\u201c wirklich löschen?`}
        </p>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full bg-surface-2 text-text-2 text-sm font-semibold transition"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-full bg-danger text-white text-sm font-semibold transition"
          >
            Löschen
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Label Manager Screen ──────────────────────────────────────

export function LabelManagerScreen({
  labels: initialLabels,
  events,
  onSave,
  onClose,
}: {
  labels: CalendarLabel[];
  events: CalendarEvent[];
  onSave: (labels: CalendarLabel[], eventUpdates?: { eventId: string; label_id: string; label_hex: string; color: EventColor }[]) => void;
  onClose: () => void;
}) {
  const [labels, setLabels] = useState<CalendarLabel[]>(initialLabels);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [colorPickerLabel, setColorPickerLabel] = useState<string | null>(null);
  const [deleteLabel, setDeleteLabel] = useState<CalendarLabel | null>(null);
  const [newName, setNewName] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  // Back handlers for sub-drawers
  useBackHandler(!!colorPickerLabel, () => setColorPickerLabel(null));
  useBackHandler(!!deleteLabel, () => setDeleteLabel(null));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const modifiers = [restrictToVerticalAxis];

  // Persist changes
  const saveLabels = useCallback(
    (newLabels: CalendarLabel[], eventUpdates?: { eventId: string; label_id: string; label_hex: string; color: EventColor }[]) => {
      setLabels(newLabels);
      onSave(newLabels, eventUpdates);
    },
    [onSave]
  );

  // ── Drag end ─────────────────────────────────────────────────────
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = labels.findIndex((l) => l.id === active.id);
    const newIndex = labels.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(labels, oldIndex, newIndex);
    saveLabels(reordered);
  };

  // ── Color change ─────────────────────────────────────────────────
  const handleColorChange = (labelId: string, hex: string, eventColor: EventColor) => {
    const updated = labels.map((l) =>
      l.id === labelId ? { ...l, hex, color: eventColor } : l
    );
    saveLabels(updated);
    setColorPickerLabel(null);
  };

  // ── Name edit ────────────────────────────────────────────────────
  const handleNameEdit = (labelId: string, name: string) => {
    const updated = labels.map((l) =>
      l.id === labelId ? { ...l, name } : l
    );
    saveLabels(updated);
    setEditingId(null);
  };

  // ── Delete ───────────────────────────────────────────────────────
  const handleDeleteConfirm = () => {
    if (!deleteLabel || labels.length <= 1) return;

    const remaining = labels.filter((l) => l.id !== deleteLabel.id);
    const firstLabel = remaining[0];

    // Build event updates: reassign events using deleted label to firstLabel
    const eventUpdates = events
      .filter((e) => e.label_id === deleteLabel.id)
      .map((e) => ({
        eventId: e.id,
        label_id: firstLabel.id,
        label_hex: firstLabel.hex,
        color: firstLabel.color,
      }));

    saveLabels(remaining, eventUpdates);
    setDeleteLabel(null);
  };

  // ── Add new label ────────────────────────────────────────────────
  const handleAddLabel = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    // Pick a color that's least used
    const usedHexes = labels.map((l) => l.hex);
    const available = COLOR_SWATCHES.find((s) => !usedHexes.includes(s.hex)) || COLOR_SWATCHES[0];

    const newLabel: CalendarLabel = {
      id: `label-${generateId()}`,
      name: trimmed,
      color: available.eventColor,
      hex: available.hex,
    };

    saveLabels([...labels, newLabel]);
    setNewName("");
  };

  // Count events per label for delete warning
  const getEventCountForLabel = (label: CalendarLabel): number => {
    return events.filter((e) => e.label_id === label.id).length;
  };

  const currentPickerLabel = labels.find((l) => l.id === colorPickerLabel);

  return (
    <div className="contents">
      {/* Main content */}
      <div
        className="flex flex-col"
        style={{ height: "100dvh", background: "var(--zu-bg)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 flex-shrink-0"
          style={{
            height: 56,
            paddingTop: "env(safe-area-inset-top)",
            borderBottom: "1px solid var(--zu-border)",
            background: "var(--zu-bg)",
          }}
        >
          <button
            onClick={onClose}
            className="p-2 -ml-1 active:bg-surface-2 rounded-xl transition-colors"
            style={{ minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft className="w-5 h-5 text-text-1" />
          </button>
          <h1 className="text-base font-bold text-text-1 flex-1">
            Kategorien anpassen
          </h1>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={modifiers}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={labels.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {labels.map((label) => (
                <SortableLabelRow
                  key={label.id}
                  label={label}
                  isEditing={editingId === label.id}
                  onStartEdit={() => setEditingId(label.id)}
                  onFinishEdit={(name) => handleNameEdit(label.id, name)}
                  onColorClick={() => setColorPickerLabel(label.id)}
                  onDelete={() => setDeleteLabel(label)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add new label row */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: "1px solid var(--zu-border)" }}
          >
            <div className="flex-shrink-0 w-[20px]" /> {/* spacer for drag handle */}
            <Plus className="w-5 h-5 flex-shrink-0" style={{ color: "var(--color-accent)" }} />
            <input
              ref={newInputRef}
              type="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              placeholder="Kategorie hinzufügen\u2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddLabel();
                }
              }}
              className="flex-1 text-sm bg-transparent border-none outline-none p-0 m-0 text-text-1 placeholder:text-text-3"
              style={{ caretColor: "var(--color-accent)" }}
            />
            {newName.trim() && (
              <button
                onClick={handleAddLabel}
                className="flex-shrink-0 p-1.5 active:opacity-70 transition"
                style={{ color: "var(--color-accent)", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Check className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Color picker drawer */}
      <AnimatePresence>
        {colorPickerLabel && currentPickerLabel && (
          <ColorPickerDrawer
            currentHex={currentPickerLabel.hex}
            onSelect={(hex, eventColor) =>
              handleColorChange(colorPickerLabel, hex, eventColor)
            }
            onClose={() => setColorPickerLabel(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteLabel && (
          <DeleteLabelConfirm
            labelName={deleteLabel.name}
            eventCount={getEventCountForLabel(deleteLabel)}
            firstLabelName={
              labels.filter((l) => l.id !== deleteLabel.id)[0]?.name || ""
            }
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteLabel(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}