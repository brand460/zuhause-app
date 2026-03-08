Baue den Kochen-Screen. Alle Texte auf Deutsch.
Layout:
Zwei Bereiche von oben nach unten — Wochenplaner oben (fixe Höhe, nicht scrollbar), Kochbuch darunter (scrollbar).

WOCHENPLANER:
Eine horizontale scrollbare Reihe mit Tagen: heute −3 Tage bis heute +7 Tage (11 Tage total). Beim ersten Laden ist heute zentriert sichtbar. Jeder Tag zeigt:

Wochentag-Kürzel + Datum klein darüber
Ein Rezept-Card darunter: Rezeptbild (rounded-xl, object-cover) + Titel darunter
Falls kein Rezept: leeres Card mit "+" Icon
Heute ist hervorgehoben (orangener Border)

Long Press auf ein belegtes Card öffnet Popover mit:

"Rezept ändern" → öffnet Rezept-Auswahl
"Verschieben" → öffnet Tag-Auswahl (horizontale scrollbare Liste der 11 Tage, bereits belegte Tage ausgegraut)
"Löschen" (text-red-500) → Confirmation und dann löschen

Antippen eines leeren Tages öffnet Bottom Sheet:

"Rezept auswählen" → durchsuchbare Rezeptliste
"Freitext" → Textfeld (z.B. "Restaurant", "Reste")

Zutaten-Transfer:
Nach Rezept-Auswahl sofort Modal:
"Zutaten zur Einkaufsliste hinzufügen?"

Alle Zutaten als Checkboxen (alle angehakt)
"Zu welchem Laden?" — Dropdown mit aktiven Stores
Buttons: "Überspringen" und "Hinzufügen"
Gewählte Zutaten werden in shopping_items gespeichert


KOCHBUCH:
Header "Kochbuch" + "+" Button.
Horizontale scrollbare Filter-Chips:
Alle · Asiatisch · Mexikanisch · Vegetarisch · Vegan · Baby & Kleinkind · Backen · Schnell (unter 30 Min) · Favoriten
Suchleiste "Rezepte oder Zutaten suchen..." — durchsucht Titel und Zutaten.
2-spaltiger Card-Grid:

Rezeptbild (aspect-square, rounded-xl, object-cover)
Titel (text-sm font-medium)
Zubereitungszeit + Kategorie-Badge (text-xs text-gray-400)
Favoriten-Herz oben rechts (orange wenn aktiv)


REZEPT HINZUFÜGEN:
Bottom Sheet mit:

"URL einfügen" — für Website, TikTok oder Instagram
"Manuell erstellen"
"Foto hochladen"

URL-Import via Claude API:
Nach URL-Eingabe zeige Lade-Spinner und rufe claude-sonnet-4-20250514 auf:
System-Prompt:
Du bist ein Rezept-Extraktor. Extrahiere aus dem folgenden Web-Inhalt ein Rezept als JSON:
{
  "title": "",
  "description": "",
  "prep_time_minutes": null,
  "cook_time_minutes": null,
  "servings": null,
  "ingredients": [{"name": "", "quantity": "", "unit": ""}],
  "steps": [{"position": 1, "description": ""}],
  "image_url": null,
  "categories": [],
  "source_url": ""
}
Felder die du nicht finden kannst setzt du auf null. Antworte NUR mit dem JSON.
Nach Extraktion: öffne direkt den Edit-Modus mit allen gefundenen Feldern vorausgefüllt. Felder die null sind werden mit orangem Border und dem Hinweis "Bitte ergänzen" markiert.

REZEPT-DETAILSEITE:
Öffnet als neuer Screen beim Antippen einer Card.

Großes Rezeptbild oben (volle Breite, aspect-video) mit Zurück-Button und Stift-Icon
Titel (text-2xl font-bold)
Sterne-Rating (1–5, antippbar) + Kategorie-Badges
Zubereitungszeit + Portionen-Scaler (− Zahl +, alle Mengen skalieren automatisch)
Original-Link falls vorhanden (klickbar)
Abschnitt "Zutaten" — skalierte Mengenliste
Button "Zutaten zur Einkaufsliste" → öffnet Zutaten-Modal
Abschnitt "Zubereitung" — nummerierte Schritte
Abschnitt "Kommentare" — Freitextfeld

Edit-Modus: Stift-Icon → alle Felder editierbar, Auto-Save nach 500ms.

DATEN:
Bestehende Tabellen: recipes, recipe_ingredients, recipe_steps, meal_plan.
Neue Felder:

recipes: rating (integer), comment (text), is_favorite (boolean default false), categories (jsonb array default '[]')
meal_plan: free_text (text), recipe_id (nullable)

household_id = 'dev-household' für jetzt.
Supabase Realtime auf meal_plan.