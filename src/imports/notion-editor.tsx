Baue den Listen-Screen als Notion-ähnlichen Editor. Alle Texte auf Deutsch.
Layout — Responsive:

Mobile: Header mit Hamburger-Icon links öffnet Sidebar als Drawer von links. Content-Area füllt gesamte Breite. Zurück-Button im Header wenn eine Seite geöffnet ist.
Tablet/Desktop: Feste Sidebar links (240px) + Content-Area rechts.

Sidebar — Seitennavigation:

Oben eine Suchleiste "Seiten durchsuchen..." die Seiten-Titel und Inhalte durchsucht
Darunter "+" Button zum Erstellen einer neuen Seite
Seiten als Liste mit Emoji + Titel
Unterseiten eingerückt und ein-/ausklappbar (Pfeil-Icon)
Beliebig tiefe Verschachtelung
Aktive Seite hervorgehoben (bg-orange-50 text-orange-600)
Long Press auf Seite zeigt Optionen: "Umbenennen", "Emoji ändern", "Unterseite erstellen", "Löschen"
Drag & Drop zum Umsortieren (@dnd-kit/sortable)

Content-Area — Block-Editor:

Oben: großes Emoji (tippbar → Emoji-Picker) + Seiten-Titel als großes Textfeld (text-2xl font-bold)
Darunter: Block-Liste
Beim Fokussieren einer Zeile erscheint links ein "+" Icon und Drag-Handle
Enter erstellt neuen Text-Block darunter
Backspace auf leerem Block löscht ihn
Auto-Save nach 500ms Pause (debounce) via Supabase upsert
Blöcke per Drag & Drop umsortierbar (@dnd-kit/sortable)

"+" Block-Menü:
Kleines Popup mit:

📝 Text — normaler Absatz
✅ To-Do — Checkbox, bei Abhaken durchgestrichen
🔢 Nummerierte Liste — automatisch nummeriert

Überschrift 1 — text-xl font-bold


Überschrift 2 — text-lg font-semibold


Überschrift 3 — text-base font-semibold

— Trennlinie — <hr border-gray-200>
🔗 Link — URL + Anzeigetext, klickbar

Suche:
Die Suchleiste in der Sidebar durchsucht sowohl Seiten-Titel als auch Block-Inhalte. Treffer werden hervorgehoben. Bei Tippen auf ein Ergebnis öffnet sich die Seite und scrollt zum gefundenen Block.
Standard-Seiten beim ersten Start:
Erstelle folgende Beispielseiten mit passendem Emoji und je einem leeren Text-Block:

🏠 Haushalt
✈️ Reise & Urlaub
🎬 Filme & Serien
🎁 Geschenkideen
🧳 Packlisten
💭 Gedanken
✅ Langzeit To-Dos

Daten:
Seiten in custom_pages: household_id, title, icon, parent_id, position.
Blöcke in custom_blocks: page_id, type, content, is_checked, position.
Nutze household_id = 'dev-household' für jetzt.
Styling:
Konsistent mit dem Rest der App — Tailwind CSS, orange Akzentfarbe, rounded-xl für Cards, keine sichtbaren Scrollbars.