# Zuhause App — Development Guidelines

## Projektübersicht
Deutsche Haushalts-Management PWA. Stack: React (Figma Make), Supabase (Auth/DB/Realtime), Vercel.
Akzentfarbe: `#F97316` (Orange). Alle UI-Texte auf **Deutsch**.

---

## 🥇 Oberstes Gebot: Mobile First

Diese App ist primär für **Android und iOS** gedacht. Sie muss auf beiden Plattformen gleich gut und gleich aussehen. Desktop/Tablet ist sekundär.

- Teste jeden neuen Screen mental auf einem 390px breiten Telefon
- Keine Hover-only Interaktionen als einzigen Weg — immer Touch-Alternative
- Finger-Tap-Targets minimum `44x44px`
- Kein Content darf hinter der System-Navigation oder Tastatur verschwinden
- Nutze `100dvh` statt `100vh` — iOS Safari rechnet die Adressleiste sonst falsch

---

## 📱 Tastatur & Viewport

### Kritische Regeln
- **Niemals** `window.innerHeight` für Keyboard-Offset — nutze `window.visualViewport.height`
- Lausche auf `window.visualViewport` resize für Keyboard-Erscheinen/Verschwinden
- Content oberhalb der Tastatur positionieren: `bottom: window.innerHeight - window.visualViewport.height`
- `position: fixed` Elemente (Drawers, FABs) müssen auf `visualViewport` reagieren

### Browser-Toolbar unterdrücken (3-Icon-Leiste auf Android Chrome)
Auf ALLEN Eingabefeldern in der gesamten App:
```jsx
autoComplete="off"
autoCorrect="off"
autoCapitalize="off"
spellCheck={false}
data-lpignore="true"
data-1p-ignore="true"
data-form-type="other"
```
Für numerische Eingaben: `type="tel"` statt `type="number"`
Für Suche: `type="search"` oder in `<form autoComplete="off">` wrappen
**Niemals** `inputMode` allein verwenden — kombiniere immer mit `autoComplete="off"`

---

## 👆 Touch & Gesten

### Long Press
- Immer mit `pointerdown` starten, Timer nach **500ms**
- Bei `pointermove` > **5px**: Timer abbrechen (verhindert Konflikt mit Scroll)
- `onContextMenu={e => e.preventDefault()}` auf Long-Press-Elementen
- `-webkit-touch-callout: none` + `user-select: none` auf Long-Press-Containern

### Drag & Drop
- Drag startet nach **200ms** Long Press **+** anschließende Bewegung > 5px
- Popover öffnet sich nur bei Long Press **ohne** Bewegung (500ms, kein pointermove)
- Niemals denselben Long-Press-Trigger für Drag und Popover teilen
- `restrictToVerticalAxis` Modifier immer bei Listen-Sortierung
- Beim Drag: Breite des gezogenen Elements via `getBoundingClientRect().width` fixieren
- Für horizontale Sortierung: `restrictToHorizontalAxis` + `restrictToParentElement`

### Swipe-Gesten
- Swipe-Erkennung immer mit Winkel-Check: unter 30° horizontal → Aktion, steiler → Scroll
- Swipe-Schwelle: mindestens **40px** horizontale Bewegung
- Swipe auf Listenpunkten zum Einrücken kollidiert mit Android-Gesten → **nicht verwenden**
- Stattdessen: Toolbar-Buttons über der Tastatur für Einrücken/Ausrücken

### Text-Selektion
- `user-select: none` nur auf interaktiven Handles/Buttons — niemals auf Text-Content
- Eingabefelder und `contentEditable`: `user-select: text !important`
- Beim Antippen eines editierbaren Textes: Cursor platzieren, **kein** Auto-Select des Wortes
- `caret-color: #F97316` für sichtbaren Cursor in allen Eingabefeldern

---

## 📝 Text-Editor (Listen-Modul)

### ContentEditable statt Input/Textarea
- Einen einzigen `<div contentEditable="true">` Container für die gesamte Seite
- Natives Browser-Verhalten für Pfeil-Navigation, Selektion, Copy/Paste

### Markdown Shortcuts
- Auf Mobile feuern `keydown` Events **nicht zuverlässig** → immer `input` Event nutzen
- Nach jedem `input` Event prüfen ob Zeilenanfang mit Trigger beginnt:
  - `- ` → Bullet-Liste (`<ul><li>`)
  - `1. ` → Nummerierte Liste (`<ol><li>`)
  - Trigger-Text entfernen nach Konvertierung

### Keyboard-Navigation
- `document.execCommand()` ist **deprecated** — niemals verwenden
- Listen-Einrückung manuell via DOM-Manipulation implementieren
- Tab/Shift+Tab für Einrückung auf Desktop
- Mobile Einrückung: Floating Toolbar über Tastatur mit → und ← Buttons

### Tabellen
- Long Press auf Handles kollidiert mit Android Text-Selektion → **Double Tap** verwenden
- Spalten-/Zeilen-Handles: schmaler grauer Rahmen (8px), `user-select: none`
- Datenzellen bleiben vollständig editierbar

---

## 🛒 Einkaufen-Modul

### Artikel-Suche
- Suchfeld: `type="search"`, `autoComplete="off"`, alle Anti-Autofill Attribute
- Chips und Suchergebnisse: `onPointerDown={e => e.preventDefault()}` damit Tastatur bleibt
- Wenn Suchfeld leer + Chip antippen → Item hinzufügen, Tastatur bleibt geschlossen
- Wenn Suchfeld hat Text + Ergebnis antippen → hinzufügen, leeren, Fokus bleibt

### Kategorie-Drawer
- Öffnet über der Tastatur: `position: fixed`, `bottom: visualViewport.height`
- `touch-action: none` auf Backdrop (verhindert App-Scroll)
- Fokus sofort auf Suchfeld: `setTimeout(() => ref.current?.focus(), 100)`
- Elemente hinter Drawer: `pointer-events: none` + `aria-hidden="true"`
- Drawer hat fixe Höhe `40vh`, intern scrollbar

### App-Hintergrund / Visibility
- Bei `document.visibilitychange` → wenn `visible`: Liste neu laden + Supabase Realtime neu verbinden
- `window.focus` Event als zweiten Trigger
- Verhindert leere Liste nach App-Wechsel oder Entsperren

### Item-Interaktion
- Item-Name ist direkt antippbar und editierbar (kein separates Modal)
- Abhak-Animation: grüner Flash → nach unten fliegen in "Erledigt" Container
- Beim Editieren: nur `shopping_items.name` ändern, `global_items` bleibt unverändert

---

## 📅 Kalender-Modul

### Drum-Roll Picker
- 5 Räder: Tag | Monat | Jahr | Stunde | Minute
- Touch-draggable, kein nativer `<input type="date">`
- Default: heute 12:00 Uhr Start, 13:00 Uhr Ende

---

## 🗂️ Listen-Modul (Sidebar)

### Seiten-Hierarchie
- Chevron-Platz wird **pro Geschwister-Gruppe** reserviert (gleicher `parent_id`)
- Prüfe ob irgendeine Seite in der Gruppe Kinder hat → alle reservieren Platz
- Feste Breiten: Drag-Handle 20px, Chevron 20px, Rest für Emoji+Titel
- Einrückung: `depth * 36px`
- Unterseiten nur sichtbar wenn aufgeklappt (Standard: zugeklappt)

### Drag & Drop Sidebar
- Trennlinie als Preview (nicht springende Items)
- Oberes/unteres Drittel einer Zeile → Trennlinie (gleiche Ebene)
- Mittleres Drittel → Highlight (wird Unterseite)
- Trennlinie startet bei `targetDepth * 36px` (nicht vom linken Rand)

---

## 🍳 Kochen-Modul

### Wochenplaner
- Zeigt heute −3 bis +7 Tage (11 Tage total)
- Heute beim Laden zentriert
- Long Press auf belegtem Tag → Popover: Ändern / Verschieben / Löschen
- Rezept verschieben: Tag-Auswahl aus scrollbarer Liste

### Rezept-Import (Claude API)
- Model: `claude-sonnet-4-20250514`
- Fehlende Felder auf `null` setzen, nicht erfinden
- Nach Import: direkt Edit-Modus öffnen
- `null`-Felder mit orangem Border + "Bitte ergänzen" markieren
- API Key via `import.meta.env.VITE_ANTHROPIC_API_KEY` — **nicht** in Supabase speichern

---

## 🗄️ Supabase

### Realtime
- **Alle Datenquellen in der App müssen Supabase Realtime-Subscriptions nutzen.** Die App soll an jeder Stelle live wirken — Änderungen eines Nutzers erscheinen sofort bei allen anderen ohne Reload. Orientiere dich immer an der bestehenden Shopping-Listen-Implementierung als Referenz.
- Subscription bei `visibilitychange` neu aufbauen
- Alle Realtime-Keys: `shopping:*`, `recipes:*`, `meal_plan:*`, `calendar_events:*`, `calendar_labels:*`, `custom_pages:*`, `custom_blocks:*`
- KV-Tabelle `kv_store_2a26506b` als Realtime-Quelle (filter by `key`)
- Eigene Änderungen mit 300ms Debounce um Echo zu vermeiden
- Subscriptions sauber beenden bei Unmount / Tab-Wechsel via `supabase.removeChannel()`
- Shared Hook: `useKvRealtime(keys, onRemoteChange)` in `/src/app/components/use-kv-realtime.ts`

### RLS
- Alle Tabellen haben RLS aktiviert
- Zugriff nur wenn `household_id` mit `household_members` übereinstimmt
- `create_household()` als `security definer` Funktion (umgeht Chicken-and-Egg)

### Dev-Modus
- `household_id = 'dev-household'` während Entwicklung
- Auth vor Go-Live aktivieren

### Globale Artikel-Datenbank
- `global_items`: `name`, `category`, `times_used`, `created_by_household_id`
- Eigene Artikel sofort in der Suche sichtbar
- `times_used` erhöhen bei erneutem Hinzufügen
- RLS: Lesen für alle, Schreiben nur für authentifizierte User

---

## 🎨 Design-System

### Farben
- Primär: `#F97316` (Orange-500)
- Hover: `bg-orange-50`
- Aktiv/Selected: `bg-orange-100`
- Gefahr/Löschen: `text-red-500`
- Borders: `#e5e7eb` (gray-200)
- Text primär: `text-gray-900`
- Text sekundär: `text-gray-400`

### Komponenten
- Popovers: `rounded-xl shadow-lg p-2`, Optionen `py-3 px-4 text-sm hover:bg-gray-50 rounded-lg`
- Confirmation Dialogs: alles zentriert (`text-center`), Buttons `flex justify-center gap-3`
- Drawers/Bottom Sheets: `rounded-t-2xl`, Handle-Bar oben
- Badges/Counter: orangener Kreis, weiße Zahl, `text-xs`

### Popover-Positionierung
- Immer `getBoundingClientRect()` des Trigger-Elements nutzen
- Prüfen ob Popover rechts/unten überläuft → nach links/oben ausweichen
- Mindestabstand: `16px` zu allen Bildschirmrändern
- `z-index: 50` oder höher
- `min-width: 192px`, `white-space: nowrap`

---

## ⚙️ Globale CSS-Regeln

```css
html, body {
  overscroll-behavior: none;
}

#root {
  height: 100dvh;
  overflow: hidden;
  position: fixed;
  width: 100%;
}

* {
  -webkit-user-select: none;
  user-select: none;
}

input, textarea, [contenteditable] {
  -webkit-user-select: text;
  user-select: text;
}

/* Scrollbars verstecken */
* {
  scrollbar-width: none;
}
*::-webkit-scrollbar {
  display: none;
}
```

---

## 🐛 Bekannte Bug-Patterns & Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Liste leer nach App-Wechsel | WebSocket-Verbindung getrennt | `visibilitychange` + `focus` Event → neu laden |
| Tastatur schiebt Content | `100vh` statt `100dvh` | Immer `dvh` verwenden |
| Long Press öffnet Browser-Menü | Kein `contextmenu` prevent | `onContextMenu={e => e.preventDefault()}` |
| Drag und Popover gleichzeitig | Gleicher Trigger | Drag bei Bewegung, Popover nur ohne Bewegung |
| Markdown Shortcuts auf Mobile | `keydown` nicht zuverlässig | `input` Event verwenden |
| Browser-Toolbar (3 Icons) erscheint | Fehlende Anti-Autofill Attribute | Alle `autoComplete="off"` etc. Attribute setzen |
| Cursor in Checkbox unsichtbar | Kein `caret-color` gesetzt | `caret-color: #F97316` |
| Popover abgeschnitten | Absolute Positionierung ohne Overflow-Check | `getBoundingClientRect()` + Overflow-Logik |
| Swipe-Einrücken kollidiert mit Android | OS-Gesten haben Priorität | Toolbar-Buttons über Tastatur statt Swipe |
| Text wird beim Antippen selektiert | Browser Auto-Select | Cursor platzieren ohne Select |
| Kategorie-Drawer Fokus falsch | Fokus bleibt auf Hintergrund-Input | `setTimeout(() => ref.focus(), 100)` |
| API Key in Supabase Secrets | Falscher Speicherort | `import.meta.env.VITE_ANTHROPIC_API_KEY` in Vercel |

---

## 📦 Dependencies

- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` — Drag & Drop
- `@emoji-mart/react` + `@emoji-mart/data` — vollständiger Emoji-Picker
- `@supabase/supabase-js` — Datenbank + Auth + Realtime
- `lucide-react` — Icons (niemals Emoji als Icon-Ersatz in UI-Elementen)
- `react-helmet-async` — PWA Meta-Tags

---

## 🚀 Deploy-Workflow

1. Export ZIP aus Figma Make
2. Alle Dateien zu GitHub pushen (`github.com/brand460/zuhause-app`)
3. Vercel deployed automatisch in 1–2 Minuten
4. Env Vars in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ANTHROPIC_API_KEY`