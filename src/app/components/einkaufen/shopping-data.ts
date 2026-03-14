// ── Types ──────────────────────────────────────────────────────────
export interface ShoppingItem {
  id: string;
  name: string;
  store: string; // store id or "alle"
  category: string;
  is_checked: boolean;
  position: number;
  quantity: number;
  unit?: string | null; // null/"Stk." = pieces, "g", "kg", "ml", "L"
  household_id: string;
  manually_positioned?: boolean; // true if user dragged this item manually
}

export type StoreType = "supermarkt" | "drogerie" | "online" | "sonstige";

export interface StoreInfo {
  id: string;
  name: string;
  abbr: string;
  color: string;
  bgColor: string;
  domain?: string; // for Google Favicon service
  emoji?: string;
  type: StoreType;
}

// ── Stores ─────────────────────────────────────────────────────────
export const DEFAULT_STORES: StoreInfo[] = [
  { id: "aldi", name: "Aldi", abbr: "A", color: "#FFFFFF", bgColor: "#00457C", domain: "aldi-nord.de", type: "supermarkt" },
  { id: "edeka", name: "Edeka", abbr: "E", color: "#FFFFFF", bgColor: "#FFC300", domain: "edeka.de", type: "supermarkt" },
  { id: "kaufland", name: "Kaufland", abbr: "K", color: "#FFFFFF", bgColor: "#E30613", domain: "kaufland.de", type: "supermarkt" },
  { id: "rossmann", name: "Rossmann", abbr: "R", color: "#FFFFFF", bgColor: "#E2001A", domain: "rossmann.de", type: "drogerie" },
  { id: "dm", name: "DM", abbr: "dm", color: "#FFFFFF", bgColor: "#0070B8", domain: "dm.de", type: "drogerie" },
  { id: "lidl", name: "Lidl", abbr: "L", color: "#FFFFFF", bgColor: "#0050AA", domain: "lidl.de", type: "supermarkt" },
  { id: "netto", name: "Netto", abbr: "N", color: "#000000", bgColor: "#FFD700", domain: "netto-online.de", type: "supermarkt" },
  { id: "amazon", name: "Amazon", abbr: "az", color: "#FFFFFF", bgColor: "#FF9900", domain: "amazon.de", type: "online" },
  { id: "alle", name: "Alle", abbr: "🏠", color: "#D97706", bgColor: "#FEF3C7", type: "sonstige" },
];

// ── Google Favicon URL helper ──────────────────────────────────────
export function getLogoUrl(domain?: string): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// ── Store-specific categories ──────────────────────────────────────
export const SUPERMARKT_CATEGORIES = [
  "Obst & Gemüse",
  "Backwaren",
  "Fleisch & Wurst",
  "Milch & Käse",
  "Eier",
  "Nudeln & Reis",
  "Konserven",
  "Saucen & Gewürze",
  "Kaffee & Tee",
  "Müsli & Frühstück",
  "Tiefkühl",
  "Süßwaren & Snacks",
  "Getränke",
  "Veggie & Bio",
  "Haushalt & Reinigung",
  "Tiernahrung",
];

export const DROGERIE_CATEGORIES = [
  "Körperpflege",
  "Haarpflege",
  "Gesichtspflege",
  "Makeup & Kosmetik",
  "Mundhygiene",
  "Damenhygiene",
  "Babypflege",
  "Reinigungsmittel",
  "Waschmittel",
  "Papierprodukte",
  "Gesundheit & Medizin",
  "Vitamine & Nahrungsergänzung",
  "Foto & Technik",
  "Tiernahrung",
  "Lebensmittel & Snacks",
];

export const ONLINE_CATEGORIES = [
  "Elektronik",
  "Haushalt",
  "Lebensmittel",
  "Bücher & Medien",
  "Sport & Freizeit",
  "Kleidung",
  "Bürobedarf",
  "Spielzeug",
  "Garten",
  "Sonstiges",
];

export const SONSTIGE_CATEGORIES = ["Sonstiges"];

export function getCategoriesForStore(storeId: string, stores: StoreInfo[]): string[] {
  const store = stores.find((s) => s.id === storeId);
  if (!store) return SONSTIGE_CATEGORIES;
  switch (store.type) {
    case "supermarkt": return SUPERMARKT_CATEGORIES;
    case "drogerie": return DROGERIE_CATEGORIES;
    case "online": return ONLINE_CATEGORIES;
    default: return [...SUPERMARKT_CATEGORIES, ...DROGERIE_CATEGORIES.filter(c => !SUPERMARKT_CATEGORIES.includes(c)), "Sonstiges"];
  }
}

export function getCategoryIndex(category: string, storeId: string, stores: StoreInfo[]): number {
  const cats = getCategoriesForStore(storeId, stores);
  const idx = cats.indexOf(category);
  return idx >= 0 ? idx : cats.length; // unknown categories go last
}

// ── All unique categories across all store types ───────────────────
export function getAllCategories(): string[] {
  const all = new Set<string>();
  for (const c of SUPERMARKT_CATEGORIES) all.add(c);
  for (const c of DROGERIE_CATEGORIES) all.add(c);
  for (const c of ONLINE_CATEGORIES) all.add(c);
  for (const c of SONSTIGE_CATEGORIES) all.add(c);
  return Array.from(all);
}

// ── Common German grocery items — expanded ─────────────────────────
export interface GroceryTemplate {
  name: string;
  category: string;
}

export const GROCERY_DATABASE: GroceryTemplate[] = [
  // ── Obst & Gemüse ───────────────────────────────────────────────
  { name: "Äpfel", category: "Obst & Gemüse" },
  { name: "Birnen", category: "Obst & Gemüse" },
  { name: "Bananen", category: "Obst & Gemüse" },
  { name: "Orangen", category: "Obst & Gemüse" },
  { name: "Zitronen", category: "Obst & Gemüse" },
  { name: "Limetten", category: "Obst & Gemüse" },
  { name: "Clementinen", category: "Obst & Gemüse" },
  { name: "Mandarinen", category: "Obst & Gemüse" },
  { name: "Grapefruit", category: "Obst & Gemüse" },
  { name: "Pomelo", category: "Obst & Gemüse" },
  { name: "Erdbeeren", category: "Obst & Gemüse" },
  { name: "Heidelbeeren", category: "Obst & Gemüse" },
  { name: "Himbeeren", category: "Obst & Gemüse" },
  { name: "Brombeeren", category: "Obst & Gemüse" },
  { name: "Johannisbeeren", category: "Obst & Gemüse" },
  { name: "Stachelbeeren", category: "Obst & Gemüse" },
  { name: "Kirschen", category: "Obst & Gemüse" },
  { name: "Trauben", category: "Obst & Gemüse" },
  { name: "Pflaumen", category: "Obst & Gemüse" },
  { name: "Aprikosen", category: "Obst & Gemüse" },
  { name: "Pfirsiche", category: "Obst & Gemüse" },
  { name: "Nektarinen", category: "Obst & Gemüse" },
  { name: "Mango", category: "Obst & Gemüse" },
  { name: "Ananas", category: "Obst & Gemüse" },
  { name: "Avocado", category: "Obst & Gemüse" },
  { name: "Kiwi", category: "Obst & Gemüse" },
  { name: "Melone", category: "Obst & Gemüse" },
  { name: "Wassermelone", category: "Obst & Gemüse" },
  { name: "Papaya", category: "Obst & Gemüse" },
  { name: "Maracuja", category: "Obst & Gemüse" },
  { name: "Granatapfel", category: "Obst & Gemüse" },
  { name: "Feigen", category: "Obst & Gemüse" },
  { name: "Datteln", category: "Obst & Gemüse" },
  { name: "Tomaten", category: "Obst & Gemüse" },
  { name: "Rispentomaten", category: "Obst & Gemüse" },
  { name: "Cherrytomaten", category: "Obst & Gemüse" },
  { name: "Gurke", category: "Obst & Gemüse" },
  { name: "Paprika (rot)", category: "Obst & Gemüse" },
  { name: "Paprika (gelb)", category: "Obst & Gemüse" },
  { name: "Paprika (grün)", category: "Obst & Gemüse" },
  { name: "Chili", category: "Obst & Gemüse" },
  { name: "Zucchini", category: "Obst & Gemüse" },
  { name: "Aubergine", category: "Obst & Gemüse" },
  { name: "Brokkoli", category: "Obst & Gemüse" },
  { name: "Blumenkohl", category: "Obst & Gemüse" },
  { name: "Weißkohl", category: "Obst & Gemüse" },
  { name: "Rotkohl", category: "Obst & Gemüse" },
  { name: "Grünkohl", category: "Obst & Gemüse" },
  { name: "Rosenkohl", category: "Obst & Gemüse" },
  { name: "Wirsing", category: "Obst & Gemüse" },
  { name: "Pak Choi", category: "Obst & Gemüse" },
  { name: "Spinat", category: "Obst & Gemüse" },
  { name: "Babyspinat", category: "Obst & Gemüse" },
  { name: "Mangold", category: "Obst & Gemüse" },
  { name: "Rucola", category: "Obst & Gemüse" },
  { name: "Eisbergsalat", category: "Obst & Gemüse" },
  { name: "Feldsalat", category: "Obst & Gemüse" },
  { name: "Romanasalat", category: "Obst & Gemüse" },
  { name: "Endiviensalat", category: "Obst & Gemüse" },
  { name: "Chicorée", category: "Obst & Gemüse" },
  { name: "Lauch", category: "Obst & Gemüse" },
  { name: "Sellerie", category: "Obst & Gemüse" },
  { name: "Fenchel", category: "Obst & Gemüse" },
  { name: "Spargel", category: "Obst & Gemüse" },
  { name: "Artischocke", category: "Obst & Gemüse" },
  { name: "Karotten", category: "Obst & Gemüse" },
  { name: "Kartoffeln", category: "Obst & Gemüse" },
  { name: "Süßkartoffeln", category: "Obst & Gemüse" },
  { name: "Rote Beete", category: "Obst & Gemüse" },
  { name: "Pastinaken", category: "Obst & Gemüse" },
  { name: "Steckrüben", category: "Obst & Gemüse" },
  { name: "Topinambur", category: "Obst & Gemüse" },
  { name: "Zwiebeln", category: "Obst & Gemüse" },
  { name: "Rote Zwiebeln", category: "Obst & Gemüse" },
  { name: "Frühlingszwiebeln", category: "Obst & Gemüse" },
  { name: "Knoblauch", category: "Obst & Gemüse" },
  { name: "Ingwer", category: "Obst & Gemüse" },
  { name: "Pilze", category: "Obst & Gemüse" },
  { name: "Champignons", category: "Obst & Gemüse" },
  { name: "Pfifferlinge", category: "Obst & Gemüse" },
  { name: "Radieschen", category: "Obst & Gemüse" },
  { name: "Rettich", category: "Obst & Gemüse" },
  { name: "Kohlrabi", category: "Obst & Gemüse" },
  { name: "Mais (frisch)", category: "Obst & Gemüse" },
  { name: "Petersilie", category: "Obst & Gemüse" },
  { name: "Basilikum (frisch)", category: "Obst & Gemüse" },
  { name: "Koriander", category: "Obst & Gemüse" },
  { name: "Minze", category: "Obst & Gemüse" },
  { name: "Schnittlauch", category: "Obst & Gemüse" },
  { name: "Thymian (frisch)", category: "Obst & Gemüse" },
  { name: "Rosmarin (frisch)", category: "Obst & Gemüse" },

  // ── Backwaren ────────────────────────────────────────────────────
  { name: "Toastbrot", category: "Backwaren" },
  { name: "Vollkornbrot", category: "Backwaren" },
  { name: "Roggenbrot", category: "Backwaren" },
  { name: "Sauerteigbrot", category: "Backwaren" },
  { name: "Mehrkornbrot", category: "Backwaren" },
  { name: "Dinkelbrötchen", category: "Backwaren" },
  { name: "Baguette", category: "Backwaren" },
  { name: "Ciabatta", category: "Backwaren" },
  { name: "Focaccia", category: "Backwaren" },
  { name: "Brötchen", category: "Backwaren" },
  { name: "Schrippen", category: "Backwaren" },
  { name: "Mohnbrötchen", category: "Backwaren" },
  { name: "Laugenbrötchen", category: "Backwaren" },
  { name: "Brezel", category: "Backwaren" },
  { name: "Croissants", category: "Backwaren" },
  { name: "Hefezopf", category: "Backwaren" },
  { name: "Tortillas", category: "Backwaren" },
  { name: "Pitabrot", category: "Backwaren" },
  { name: "Naan-Brot", category: "Backwaren" },
  { name: "Fladenbrot", category: "Backwaren" },
  { name: "Hamburger Brötchen", category: "Backwaren" },
  { name: "Hot-Dog-Brötchen", category: "Backwaren" },
  { name: "Blätterteig", category: "Backwaren" },
  { name: "Hefeteig (fertig)", category: "Backwaren" },
  { name: "Kuchenteig (fertig)", category: "Backwaren" },
  { name: "Donuts", category: "Backwaren" },
  { name: "Muffins", category: "Backwaren" },

  // ── Fleisch & Wurst ──────────────────────────────────────────────
  { name: "Hähnchenbrust", category: "Fleisch & Wurst" },
  { name: "Hähnchenschenkel", category: "Fleisch & Wurst" },
  { name: "Putenbrust", category: "Fleisch & Wurst" },
  { name: "Hackfleisch (gemischt)", category: "Fleisch & Wurst" },
  { name: "Hackfleisch (Rind)", category: "Fleisch & Wurst" },
  { name: "Rindersteak", category: "Fleisch & Wurst" },
  { name: "Rinderbraten", category: "Fleisch & Wurst" },
  { name: "Gulasch (Rind)", category: "Fleisch & Wurst" },
  { name: "Schweinefilet", category: "Fleisch & Wurst" },
  { name: "Schweineschnitzel", category: "Fleisch & Wurst" },
  { name: "Schweinebauch", category: "Fleisch & Wurst" },
  { name: "Lammkeule", category: "Fleisch & Wurst" },
  { name: "Kalbsschnitzel", category: "Fleisch & Wurst" },
  { name: "Bratwurst", category: "Fleisch & Wurst" },
  { name: "Speck", category: "Fleisch & Wurst" },
  { name: "Salami", category: "Fleisch & Wurst" },
  { name: "Chorizo", category: "Fleisch & Wurst" },
  { name: "Schinken", category: "Fleisch & Wurst" },
  { name: "Kochschinken", category: "Fleisch & Wurst" },
  { name: "Pastrami", category: "Fleisch & Wurst" },
  { name: "Mortadella", category: "Fleisch & Wurst" },
  { name: "Fleischwurst", category: "Fleisch & Wurst" },
  { name: "Leberwurst", category: "Fleisch & Wurst" },
  { name: "Lachs", category: "Fleisch & Wurst" },
  { name: "Räucherlachs", category: "Fleisch & Wurst" },
  { name: "Kabeljau", category: "Fleisch & Wurst" },
  { name: "Forelle", category: "Fleisch & Wurst" },
  { name: "Dorade", category: "Fleisch & Wurst" },
  { name: "Tilapia", category: "Fleisch & Wurst" },
  { name: "Makrele", category: "Fleisch & Wurst" },
  { name: "Thunfisch (Dose)", category: "Fleisch & Wurst" },
  { name: "Garnelen", category: "Fleisch & Wurst" },
  { name: "Miesmuscheln", category: "Fleisch & Wurst" },
  { name: "Jakobsmuscheln", category: "Fleisch & Wurst" },
  { name: "Rollmops", category: "Fleisch & Wurst" },
  { name: "Matjes", category: "Fleisch & Wurst" },

  // ── Milch & Käse ─────────────────────────────────────────────────
  { name: "Vollmilch", category: "Milch & Käse" },
  { name: "Fettarme Milch", category: "Milch & Käse" },
  { name: "Laktosefreie Milch", category: "Milch & Käse" },
  { name: "Hafermilch", category: "Milch & Käse" },
  { name: "Mandelmilch", category: "Milch & Käse" },
  { name: "Sojamilch", category: "Milch & Käse" },
  { name: "Alpro Hafer-Drink", category: "Milch & Käse" },
  { name: "Alpro Mandel-Drink", category: "Milch & Käse" },
  { name: "Alpro Soja-Drink", category: "Milch & Käse" },
  { name: "Oatly Haferdrink", category: "Milch & Käse" },
  { name: "Oatly Barista", category: "Milch & Käse" },
  { name: "Butter", category: "Milch & Käse" },
  { name: "Margarine", category: "Milch & Käse" },
  { name: "Joghurt (natur)", category: "Milch & Käse" },
  { name: "Joghurt (Frucht)", category: "Milch & Käse" },
  { name: "Griechischer Joghurt", category: "Milch & Käse" },
  { name: "Müller Joghurt", category: "Milch & Käse" },
  { name: "Danone Joghurt", category: "Milch & Käse" },
  { name: "Activia", category: "Milch & Käse" },
  { name: "Actimel", category: "Milch & Käse" },
  { name: "Schmand", category: "Milch & Käse" },
  { name: "Crème fraîche", category: "Milch & Käse" },
  { name: "Sahne", category: "Milch & Käse" },
  { name: "Schlagsahne", category: "Milch & Käse" },
  { name: "Saure Sahne", category: "Milch & Käse" },
  { name: "Kondensmilch", category: "Milch & Käse" },
  { name: "Buttermilch", category: "Milch & Käse" },
  { name: "Kefir", category: "Milch & Käse" },
  { name: "Skyr", category: "Milch & Käse" },
  { name: "Quark", category: "Milch & Käse" },
  { name: "Frischkäse", category: "Milch & Käse" },
  { name: "Philadelphia", category: "Milch & Käse" },
  { name: "Boursin", category: "Milch & Käse" },
  { name: "Bresso", category: "Milch & Käse" },
  { name: "Mascarpone", category: "Milch & Käse" },
  { name: "Ricotta", category: "Milch & Käse" },
  { name: "Hüttenkäse", category: "Milch & Käse" },
  { name: "Schmelzkäse", category: "Milch & Käse" },
  { name: "Mozzarella", category: "Milch & Käse" },
  { name: "Gouda", category: "Milch & Käse" },
  { name: "Parmesan", category: "Milch & Käse" },
  { name: "Emmentaler", category: "Milch & Käse" },
  { name: "Feta", category: "Milch & Käse" },
  { name: "Brie", category: "Milch & Käse" },
  { name: "Camembert", category: "Milch & Käse" },
  { name: "Gruyère", category: "Milch & Käse" },
  { name: "Manchego", category: "Milch & Käse" },
  { name: "Pecorino", category: "Milch & Käse" },
  { name: "Edamer", category: "Milch & Käse" },

  // ── Eier ─────────────────────────────────────────────────────────
  { name: "Eier (6er)", category: "Eier" },
  { name: "Eier (10er)", category: "Eier" },
  { name: "Eier (12er)", category: "Eier" },
  { name: "Bio-Eier (6er)", category: "Eier" },
  { name: "Freilandeier (10er)", category: "Eier" },
  { name: "Wachteleier", category: "Eier" },

  // ── Nudeln & Reis ────────────────────────────────────────────────
  { name: "Spaghetti", category: "Nudeln & Reis" },
  { name: "Fusilli", category: "Nudeln & Reis" },
  { name: "Penne", category: "Nudeln & Reis" },
  { name: "Rigatoni", category: "Nudeln & Reis" },
  { name: "Tagliatelle", category: "Nudeln & Reis" },
  { name: "Farfalle", category: "Nudeln & Reis" },
  { name: "Linguine", category: "Nudeln & Reis" },
  { name: "Lasagneplatten", category: "Nudeln & Reis" },
  { name: "Eiernudeln", category: "Nudeln & Reis" },
  { name: "Spätzle", category: "Nudeln & Reis" },
  { name: "Gnocchi", category: "Nudeln & Reis" },
  { name: "Reisnudeln", category: "Nudeln & Reis" },
  { name: "Glasnudeln", category: "Nudeln & Reis" },
  { name: "Basmati Reis", category: "Nudeln & Reis" },
  { name: "Jasmin Reis", category: "Nudeln & Reis" },
  { name: "Risotto Reis", category: "Nudeln & Reis" },
  { name: "Vollkorn Reis", category: "Nudeln & Reis" },
  { name: "Couscous", category: "Nudeln & Reis" },
  { name: "Bulgur", category: "Nudeln & Reis" },
  { name: "Quinoa", category: "Nudeln & Reis" },
  { name: "Polenta", category: "Nudeln & Reis" },
  { name: "Linsen (rote)", category: "Nudeln & Reis" },
  { name: "Linsen (grüne)", category: "Nudeln & Reis" },
  { name: "Kichererbsen (trocken)", category: "Nudeln & Reis" },

  // ── Konserven ────────────────────────────────────────────────────
  { name: "Passierte Tomaten", category: "Konserven" },
  { name: "Tomatenmark", category: "Konserven" },
  { name: "Dosentomaten (gehackt)", category: "Konserven" },
  { name: "Kidneybohnen", category: "Konserven" },
  { name: "Weiße Bohnen", category: "Konserven" },
  { name: "Schwarze Bohnen", category: "Konserven" },
  { name: "Cannellini-Bohnen", category: "Konserven" },
  { name: "Kichererbsen", category: "Konserven" },
  { name: "Linsen (Dose)", category: "Konserven" },
  { name: "Mais", category: "Konserven" },
  { name: "Erbsen", category: "Konserven" },
  { name: "Champignons (Dose)", category: "Konserven" },
  { name: "Kokosmilch", category: "Konserven" },
  { name: "Sardinen", category: "Konserven" },
  { name: "Thunfisch (Dose, natur)", category: "Konserven" },
  { name: "Krabben (Dose)", category: "Konserven" },
  { name: "Lachsfilet (Dose)", category: "Konserven" },
  { name: "Anchovis", category: "Konserven" },
  { name: "Oliven", category: "Konserven" },
  { name: "Artischocken", category: "Konserven" },
  { name: "Kapern", category: "Konserven" },
  { name: "Rote Beete (Dose)", category: "Konserven" },
  { name: "Sauerkraut (Dose)", category: "Konserven" },
  { name: "Ananasscheiben", category: "Konserven" },
  { name: "Pfirsiche (Dose)", category: "Konserven" },
  { name: "Mandarin-Orangen (Dose)", category: "Konserven" },
  { name: "Gurkenscheiben (Eingelegte)", category: "Konserven" },

  // ── Saucen & Gewürze ─────────────────────────────────────────────
  { name: "Salz", category: "Saucen & Gewürze" },
  { name: "Meersalz", category: "Saucen & Gewürze" },
  { name: "Pfeffer", category: "Saucen & Gewürze" },
  { name: "Olivenöl", category: "Saucen & Gewürze" },
  { name: "Sonnenblumenöl", category: "Saucen & Gewürze" },
  { name: "Rapsöl", category: "Saucen & Gewürze" },
  { name: "Sesamöl", category: "Saucen & Gewürze" },
  { name: "Kokosöl", category: "Saucen & Gewürze" },
  { name: "Leinöl", category: "Saucen & Gewürze" },
  { name: "Kürbiskernöl", category: "Saucen & Gewürze" },
  { name: "Trüffelöl", category: "Saucen & Gewürze" },
  { name: "Essig", category: "Saucen & Gewürze" },
  { name: "Balsamico", category: "Saucen & Gewürze" },
  { name: "Weißweinessig", category: "Saucen & Gewürze" },
  { name: "Apfelessig", category: "Saucen & Gewürze" },
  { name: "Sojasauce", category: "Saucen & Gewürze" },
  { name: "Sojasoße (dunkel)", category: "Saucen & Gewürze" },
  { name: "Fischsauce", category: "Saucen & Gewürze" },
  { name: "Austernsoße", category: "Saucen & Gewürze" },
  { name: "Teriyakisoße", category: "Saucen & Gewürze" },
  { name: "Worcestersauce", category: "Saucen & Gewürze" },
  { name: "Tabasco", category: "Saucen & Gewürze" },
  { name: "Sriracha", category: "Saucen & Gewürze" },
  { name: "Wasabi", category: "Saucen & Gewürze" },
  { name: "Ketchup", category: "Saucen & Gewürze" },
  { name: "Senf", category: "Saucen & Gewürze" },
  { name: "Mayonnaise", category: "Saucen & Gewürze" },
  { name: "BBQ-Sauce", category: "Saucen & Gewürze" },
  { name: "Hollandaise", category: "Saucen & Gewürze" },
  { name: "Sahnesoße", category: "Saucen & Gewürze" },
  { name: "Bratensauce", category: "Saucen & Gewürze" },
  { name: "Béchamelsoße", category: "Saucen & Gewürze" },
  { name: "Tomatensoße (Fertig)", category: "Saucen & Gewürze" },
  { name: "Pesto", category: "Saucen & Gewürze" },
  { name: "Gemüsebrühe", category: "Saucen & Gewürze" },
  { name: "Hühnerbrühe", category: "Saucen & Gewürze" },
  { name: "Rinderbrühe", category: "Saucen & Gewürze" },
  { name: "Oregano", category: "Saucen & Gewürze" },
  { name: "Basilikum (getr.)", category: "Saucen & Gewürze" },
  { name: "Thymian (getr.)", category: "Saucen & Gewürze" },
  { name: "Rosmarin (getr.)", category: "Saucen & Gewürze" },
  { name: "Salbei", category: "Saucen & Gewürze" },
  { name: "Estragon", category: "Saucen & Gewürze" },
  { name: "Dill", category: "Saucen & Gewürze" },
  { name: "Majoran", category: "Saucen & Gewürze" },
  { name: "Petersilie (getr.)", category: "Saucen & Gewürze" },
  { name: "Fenchelsamen", category: "Saucen & Gewürze" },
  { name: "Paprikapulver", category: "Saucen & Gewürze" },
  { name: "Chilipulver", category: "Saucen & Gewürze" },
  { name: "Kreuzkümmel", category: "Saucen & Gewürze" },
  { name: "Korianderpulver", category: "Saucen & Gewürze" },
  { name: "Currypulver", category: "Saucen & Gewürze" },
  { name: "Kurkuma", category: "Saucen & Gewürze" },
  { name: "Ingwerpulver", category: "Saucen & Gewürze" },
  { name: "Knoblauchpulver", category: "Saucen & Gewürze" },
  { name: "Zwiebelpulver", category: "Saucen & Gewürze" },
  { name: "Zimt", category: "Saucen & Gewürze" },
  { name: "Muskat", category: "Saucen & Gewürze" },
  { name: "Nelken", category: "Saucen & Gewürze" },
  { name: "Kardamom", category: "Saucen & Gewürze" },
  { name: "Sternanis", category: "Saucen & Gewürze" },
  { name: "Lorbeerblatt", category: "Saucen & Gewürze" },
  { name: "Szechuanpfeffer", category: "Saucen & Gewürze" },
  { name: "Vanille", category: "Saucen & Gewürze" },
  { name: "Backpulver", category: "Saucen & Gewürze" },
  { name: "Natron", category: "Saucen & Gewürze" },
  { name: "Mehl", category: "Saucen & Gewürze" },
  { name: "Vollkornmehl", category: "Saucen & Gewürze" },
  { name: "Dinkelmehl", category: "Saucen & Gewürze" },
  { name: "Zucker", category: "Saucen & Gewürze" },
  { name: "Brauner Zucker", category: "Saucen & Gewürze" },
  { name: "Puderzucker", category: "Saucen & Gewürze" },
  { name: "Paniermehl", category: "Saucen & Gewürze" },
  { name: "Speisestärke", category: "Saucen & Gewürze" },
  { name: "Hefe (trocken)", category: "Saucen & Gewürze" },

  // ── Kaffee & Tee ─────────────────────────────────────────────────
  { name: "Kaffee (gemahlen)", category: "Kaffee & Tee" },
  { name: "Kaffee (Bohnen)", category: "Kaffee & Tee" },
  { name: "Espresso", category: "Kaffee & Tee" },
  { name: "Kaffeepads", category: "Kaffee & Tee" },
  { name: "Kaffeekapseln", category: "Kaffee & Tee" },
  { name: "Nescafé Classic", category: "Kaffee & Tee" },
  { name: "Nescafé Gold", category: "Kaffee & Tee" },
  { name: "Jacobs Krönung", category: "Kaffee & Tee" },
  { name: "Tchibo Feine Milde", category: "Kaffee & Tee" },
  { name: "Lavazza Crema e Gusto", category: "Kaffee & Tee" },
  { name: "Senseo Kaffeepads", category: "Kaffee & Tee" },
  { name: "Schwarztee", category: "Kaffee & Tee" },
  { name: "Grüntee", category: "Kaffee & Tee" },
  { name: "Kräutertee", category: "Kaffee & Tee" },
  { name: "Kamillentee", category: "Kaffee & Tee" },
  { name: "Pfefferminztee", category: "Kaffee & Tee" },
  { name: "Ingwertee", category: "Kaffee & Tee" },
  { name: "Kurkumatee", category: "Kaffee & Tee" },
  { name: "Rooibostee", category: "Kaffee & Tee" },
  { name: "Hibiskustee", category: "Kaffee & Tee" },
  { name: "Hagebuttentee", category: "Kaffee & Tee" },
  { name: "Chai Latte", category: "Kaffee & Tee" },
  { name: "Matcha", category: "Kaffee & Tee" },

  // ── Müsli & Frühstück ────────────────────────────────────────────
  { name: "Haferflocken", category: "Müsli & Frühstück" },
  { name: "Dinkelflocken", category: "Müsli & Frühstück" },
  { name: "Müsli", category: "Müsli & Frühstück" },
  { name: "Granola", category: "Müsli & Frühstück" },
  { name: "Porridge", category: "Müsli & Frühstück" },
  { name: "Cornflakes", category: "Müsli & Frühstück" },
  { name: "Kellogg's Cornflakes", category: "Müsli & Frühstück" },
  { name: "Kellogg's Frosties", category: "Müsli & Frühstück" },
  { name: "Kellogg's Smacks", category: "Müsli & Frühstück" },
  { name: "Chiasamen", category: "Müsli & Frühstück" },
  { name: "Leinsamen", category: "Müsli & Frühstück" },
  { name: "Marmelade", category: "Müsli & Frühstück" },
  { name: "Erdbeerkonfitüre", category: "Müsli & Frühstück" },
  { name: "Nutella", category: "Müsli & Frühstück" },
  { name: "Erdnussbutter", category: "Müsli & Frühstück" },
  { name: "Mandelmus", category: "Müsli & Frühstück" },
  { name: "Honig", category: "Müsli & Frühstück" },
  { name: "Ahornsirup", category: "Müsli & Frühstück" },
  { name: "Agavendicksaft", category: "Müsli & Frühstück" },
  { name: "Pfannkuchenmix", category: "Müsli & Frühstück" },

  // ── Tiefkühl ─────────────────────────────────────────────────────
  { name: "Tiefkühl-Erbsen", category: "Tiefkühl" },
  { name: "Tiefkühl-Spinat", category: "Tiefkühl" },
  { name: "Tiefkühl-Brokkoli", category: "Tiefkühl" },
  { name: "Tiefkühl-Blumenkohl", category: "Tiefkühl" },
  { name: "Tiefkühl-Gemüsemix", category: "Tiefkühl" },
  { name: "Tiefkühl-Erbsen & Karotten", category: "Tiefkühl" },
  { name: "Tiefkühl-Edamame", category: "Tiefkühl" },
  { name: "Tiefkühl-Rote Beete", category: "Tiefkühl" },
  { name: "Tiefkühl-Maiskölbchen", category: "Tiefkühl" },
  { name: "Tiefkühl-Früchtemix", category: "Tiefkühl" },
  { name: "Tiefkühl-Beeren", category: "Tiefkühl" },
  { name: "Tiefkühl-Mango", category: "Tiefkühl" },
  { name: "Tiefkühl-Pommes", category: "Tiefkühl" },
  { name: "Tiefkühl-Kroketten", category: "Tiefkühl" },
  { name: "Fischstäbchen", category: "Tiefkühl" },
  { name: "Iglo Fischstäbchen", category: "Tiefkühl" },
  { name: "Birds Eye Erbsen", category: "Tiefkühl" },
  { name: "Tiefkühl-Lachs", category: "Tiefkühl" },
  { name: "Tiefkühl-Garnelen", category: "Tiefkühl" },
  { name: "Tiefkühl-Hähnchen", category: "Tiefkühl" },
  { name: "Tiefkühl-Schnitzel", category: "Tiefkühl" },
  { name: "Tiefkühl-Maultaschen", category: "Tiefkühl" },
  { name: "Tiefkühl-Ravioli", category: "Tiefkühl" },
  { name: "Tiefkühl-Pizza", category: "Tiefkühl" },
  { name: "Dr. Oetker Pizza Mozzarella", category: "Tiefkühl" },
  { name: "Dr. Oetker Pizza Salami", category: "Tiefkühl" },
  { name: "Wagner Pizza", category: "Tiefkühl" },
  { name: "Freiberger Pizza", category: "Tiefkühl" },
  { name: "Tiefkühl-Croissants", category: "Tiefkühl" },
  { name: "Eis (Vanille)", category: "Tiefkühl" },
  { name: "Eis (Schoko)", category: "Tiefkühl" },
  { name: "Eis (Erdbeere)", category: "Tiefkühl" },
  { name: "Sorbet", category: "Tiefkühl" },
  { name: "Frozen Yogurt", category: "Tiefkühl" },
  { name: "Eis am Stiel", category: "Tiefkühl" },

  // ── Süßwaren & Snacks ────────────────────────────────────────────
  { name: "Schokolade", category: "Süßwaren & Snacks" },
  { name: "Milka", category: "Süßwaren & Snacks" },
  { name: "Milka Oreo", category: "Süßwaren & Snacks" },
  { name: "Ritter Sport", category: "Süßwaren & Snacks" },
  { name: "Ritter Sport Nuss", category: "Süßwaren & Snacks" },
  { name: "Lindt Schokolade", category: "Süßwaren & Snacks" },
  { name: "Lindt Lindor", category: "Süßwaren & Snacks" },
  { name: "Ferrero Rocher", category: "Süßwaren & Snacks" },
  { name: "Kinder Bueno", category: "Süßwaren & Snacks" },
  { name: "Kinder Riegel", category: "Süßwaren & Snacks" },
  { name: "Kinder Schoko-Bons", category: "Süßwaren & Snacks" },
  { name: "Twix", category: "Süßwaren & Snacks" },
  { name: "Snickers", category: "Süßwaren & Snacks" },
  { name: "Mars", category: "Süßwaren & Snacks" },
  { name: "Bounty", category: "Süßwaren & Snacks" },
  { name: "Kitkat", category: "Süßwaren & Snacks" },
  { name: "After Eight", category: "Süßwaren & Snacks" },
  { name: "Manner Waffelblätter", category: "Süßwaren & Snacks" },
  { name: "Haribo Goldbären", category: "Süßwaren & Snacks" },
  { name: "Haribo Tangfastics", category: "Süßwaren & Snacks" },
  { name: "Haribo Lakritz", category: "Süßwaren & Snacks" },
  { name: "Katjes", category: "Süßwaren & Snacks" },
  { name: "Trolli", category: "Süßwaren & Snacks" },
  { name: "Nimm2", category: "Süßwaren & Snacks" },
  { name: "Werther's Original", category: "Süßwaren & Snacks" },
  { name: "Gummibärchen", category: "Süßwaren & Snacks" },
  { name: "Fruchtgummi", category: "Süßwaren & Snacks" },
  { name: "Lakritz", category: "Süßwaren & Snacks" },
  { name: "Chips", category: "Süßwaren & Snacks" },
  { name: "Pringles", category: "Süßwaren & Snacks" },
  { name: "Lay's", category: "Süßwaren & Snacks" },
  { name: "Doritos", category: "Süßwaren & Snacks" },
  { name: "Salzstangen", category: "Süßwaren & Snacks" },
  { name: "Brezeln (Snack)", category: "Süßwaren & Snacks" },
  { name: "Cracker", category: "Süßwaren & Snacks" },
  { name: "Kekse", category: "Süßwaren & Snacks" },
  { name: "Leibniz Butterkekse", category: "Süßwaren & Snacks" },
  { name: "Oreo", category: "Süßwaren & Snacks" },
  { name: "Chips Ahoy", category: "Süßwaren & Snacks" },
  { name: "Waffeln", category: "Süßwaren & Snacks" },
  { name: "Riegel", category: "Süßwaren & Snacks" },
  { name: "Müsliriegel", category: "Süßwaren & Snacks" },
  { name: "Popcorn", category: "Süßwaren & Snacks" },
  { name: "Nüsse (gemischt)", category: "Süßwaren & Snacks" },
  { name: "Cashews", category: "Süßwaren & Snacks" },
  { name: "Mandeln", category: "Süßwaren & Snacks" },
  { name: "Erdnüsse", category: "Süßwaren & Snacks" },
  { name: "Walnüsse", category: "Süßwaren & Snacks" },
  { name: "Pistazien", category: "Süßwaren & Snacks" },
  { name: "Studentenfutter", category: "Süßwaren & Snacks" },
  { name: "Reiskuchen", category: "Süßwaren & Snacks" },
  { name: "Marzipan", category: "Süßwaren & Snacks" },

  // ── Getränke ─────────────────────────────────────────────────────
  { name: "Sprudelwasser", category: "Getränke" },
  { name: "Stilles Wasser", category: "Getränke" },
  { name: "Gerolsteiner", category: "Getränke" },
  { name: "Apollinaris", category: "Getränke" },
  { name: "Volvic", category: "Getränke" },
  { name: "Evian", category: "Getränke" },
  { name: "Orangensaft", category: "Getränke" },
  { name: "Apfelsaft", category: "Getränke" },
  { name: "Apfelschorle", category: "Getränke" },
  { name: "Multivitaminsaft", category: "Getränke" },
  { name: "Traubensaft", category: "Getränke" },
  { name: "Kirschsaft", category: "Getränke" },
  { name: "Tomatensaft", category: "Getränke" },
  { name: "Hohes C", category: "Getränke" },
  { name: "Granini", category: "Getränke" },
  { name: "Minute Maid", category: "Getränke" },
  { name: "Capri-Sonne", category: "Getränke" },
  { name: "Kokoswasser", category: "Getränke" },
  { name: "Smoothie", category: "Getränke" },
  { name: "Ingwershot", category: "Getränke" },
  { name: "Cola", category: "Getränke" },
  { name: "Coca-Cola", category: "Getränke" },
  { name: "Coca-Cola Zero", category: "Getränke" },
  { name: "Pepsi", category: "Getränke" },
  { name: "Fanta", category: "Getränke" },
  { name: "Sprite", category: "Getränke" },
  { name: "Mezzo Mix", category: "Getränke" },
  { name: "Fritz-Kola", category: "Getränke" },
  { name: "Club Mate", category: "Getränke" },
  { name: "Eistee", category: "Getränke" },
  { name: "Zitronenlimonade", category: "Getränke" },
  { name: "Energydrink", category: "Getränke" },
  { name: "Red Bull", category: "Getränke" },
  { name: "Monster Energy", category: "Getränke" },
  { name: "Bier", category: "Getränke" },
  { name: "Krombacher", category: "Getränke" },
  { name: "Veltins", category: "Getränke" },
  { name: "Warsteiner", category: "Getränke" },
  { name: "Bitburger", category: "Getränke" },
  { name: "Beck's", category: "Getränke" },
  { name: "Paulaner", category: "Getränke" },
  { name: "Erdinger", category: "Getränke" },
  { name: "Weizenbier", category: "Getränke" },
  { name: "Radler", category: "Getränke" },
  { name: "Alkoholfreies Bier", category: "Getränke" },
  { name: "Rotwein", category: "Getränke" },
  { name: "Weißwein", category: "Getränke" },
  { name: "Rosé", category: "Getränke" },
  { name: "Sekt", category: "Getränke" },
  { name: "Prosecco", category: "Getränke" },
  { name: "Champagner", category: "Getränke" },

  // ── Veggie & Bio ─────────────────────────────────────────────────
  { name: "Tofu (natur)", category: "Veggie & Bio" },
  { name: "Tofu (geräuchert)", category: "Veggie & Bio" },
  { name: "Tofu (Seide)", category: "Veggie & Bio" },
  { name: "Tempeh", category: "Veggie & Bio" },
  { name: "Seitan", category: "Veggie & Bio" },
  { name: "Soja-Schnetzel", category: "Veggie & Bio" },
  { name: "Beyond Meat Burger", category: "Veggie & Bio" },
  { name: "Garden Gourmet Schnitzel", category: "Veggie & Bio" },
  { name: "Rügenwalder Veggie Mortadella", category: "Veggie & Bio" },
  { name: "Rügenwalder Veggie Aufschnitt", category: "Veggie & Bio" },
  { name: "Rügenwalder Veggie Bratwurst", category: "Veggie & Bio" },
  { name: "Vegane Butter", category: "Veggie & Bio" },
  { name: "Veganer Käse", category: "Veggie & Bio" },
  { name: "Vegane Sahne", category: "Veggie & Bio" },
  { name: "Alnatura Joghurt", category: "Veggie & Bio" },
  { name: "Alnatura Müsli", category: "Veggie & Bio" },
  { name: "Linsen-Burger", category: "Veggie & Bio" },
  { name: "Kichererbsen-Burger", category: "Veggie & Bio" },

  // ── Haushalt & Reinigung ─────────────────────────────────────────
  { name: "Spülmittel", category: "Haushalt & Reinigung" },
  { name: "Fairy Spülmittel", category: "Haushalt & Reinigung" },
  { name: "Pril", category: "Haushalt & Reinigung" },
  { name: "Frosch Spülmittel", category: "Haushalt & Reinigung" },
  { name: "Spülmaschinentabs", category: "Haushalt & Reinigung" },
  { name: "Spülmaschinensalz", category: "Haushalt & Reinigung" },
  { name: "Waschmittel", category: "Haushalt & Reinigung" },
  { name: "Persil", category: "Haushalt & Reinigung" },
  { name: "Ariel", category: "Haushalt & Reinigung" },
  { name: "Weichspüler", category: "Haushalt & Reinigung" },
  { name: "Lenor Weichspüler", category: "Haushalt & Reinigung" },
  { name: "Trocknertücher", category: "Haushalt & Reinigung" },
  { name: "Allzweckreiniger", category: "Haushalt & Reinigung" },
  { name: "Mr. Proper", category: "Haushalt & Reinigung" },
  { name: "Badreiniger", category: "Haushalt & Reinigung" },
  { name: "WC-Reiniger", category: "Haushalt & Reinigung" },
  { name: "WC-Ente", category: "Haushalt & Reinigung" },
  { name: "Domestos", category: "Haushalt & Reinigung" },
  { name: "Glasreiniger", category: "Haushalt & Reinigung" },
  { name: "Entkalker", category: "Haushalt & Reinigung" },
  { name: "Backofenreiniger", category: "Haushalt & Reinigung" },
  { name: "Abflussreiniger", category: "Haushalt & Reinigung" },
  { name: "Febreze", category: "Haushalt & Reinigung" },
  { name: "Lufterfrischer", category: "Haushalt & Reinigung" },
  { name: "Scheuermilch", category: "Haushalt & Reinigung" },
  { name: "Vileda Wischmopp", category: "Haushalt & Reinigung" },
  { name: "Küchenrolle", category: "Haushalt & Reinigung" },
  { name: "Toilettenpapier", category: "Haushalt & Reinigung" },
  { name: "Taschentücher", category: "Haushalt & Reinigung" },
  { name: "Müllbeutel", category: "Haushalt & Reinigung" },
  { name: "Gefrierbeutel", category: "Haushalt & Reinigung" },
  { name: "Ziploc-Beutel", category: "Haushalt & Reinigung" },
  { name: "Alufolie", category: "Haushalt & Reinigung" },
  { name: "Frischhaltefolie", category: "Haushalt & Reinigung" },
  { name: "Backpapier", category: "Haushalt & Reinigung" },
  { name: "Schwämme", category: "Haushalt & Reinigung" },
  { name: "Einweghandschuhe", category: "Haushalt & Reinigung" },
  { name: "Staubsaugerbeutel", category: "Haushalt & Reinigung" },

  // ── Tiernahrung ─────────────────────────────────────────────────
  { name: "Katzenfutter (nass)", category: "Tiernahrung" },
  { name: "Katzenfutter (trocken)", category: "Tiernahrung" },
  { name: "Hundefutter (nass)", category: "Tiernahrung" },
  { name: "Hundefutter (trocken)", category: "Tiernahrung" },
  { name: "Katzensnacks", category: "Tiernahrung" },
  { name: "Hundesnacks", category: "Tiernahrung" },
  { name: "Katzenstreu", category: "Tiernahrung" },
  { name: "Vogelfutter", category: "Tiernahrung" },
  { name: "Kaninchenfutter", category: "Tiernahrung" },

  // ── Drogerie — Körperpflege ──────────────────────────────────────
  { name: "Duschgel", category: "Körperpflege" },
  { name: "Nivea Duschgel", category: "Körperpflege" },
  { name: "Dove Duschgel", category: "Körperpflege" },
  { name: "Axe Duschgel", category: "Körperpflege" },
  { name: "Seife", category: "Körperpflege" },
  { name: "Flüssigseife", category: "Körperpflege" },
  { name: "Shampoo", category: "Körperpflege" },
  { name: "Head & Shoulders", category: "Körperpflege" },
  { name: "Pantene Shampoo", category: "Körperpflege" },
  { name: "Schauma Shampoo", category: "Körperpflege" },
  { name: "Garnier Shampoo", category: "Körperpflege" },
  { name: "L'Oréal Shampoo", category: "Körperpflege" },
  { name: "Spülung", category: "Körperpflege" },
  { name: "Haarkur", category: "Körperpflege" },
  { name: "Haarspray", category: "Körperpflege" },
  { name: "Haargel", category: "Körperpflege" },
  { name: "Haarwax", category: "Körperpflege" },
  { name: "Bodylotion", category: "Körperpflege" },
  { name: "Nivea Bodylotion", category: "Körperpflege" },
  { name: "Körpercreme", category: "Körperpflege" },
  { name: "Handcreme", category: "Körperpflege" },
  { name: "Deodorant", category: "Körperpflege" },
  { name: "Axe Deodorant", category: "Körperpflege" },
  { name: "Rexona Deodorant", category: "Körperpflege" },
  { name: "Deo-Stick", category: "Körperpflege" },
  { name: "Rasierschaum", category: "Körperpflege" },
  { name: "Rasierklingen", category: "Körperpflege" },
  { name: "Gillette Rasierer", category: "Körperpflege" },
  { name: "Venus Rasierer", category: "Körperpflege" },
  { name: "Einwegrasierer", category: "Körperpflege" },
  { name: "Aftershave", category: "Körperpflege" },
  { name: "Wattepads", category: "Körperpflege" },
  { name: "Wattestäbchen", category: "Körperpflege" },
  { name: "Feuchttücher", category: "Körperpflege" },
  { name: "Nagelfeile", category: "Körperpflege" },
  { name: "Nagelknipser", category: "Körperpflege" },

  // ── Drogerie — Gesicht & Makeup ──────────────────────────────────
  { name: "Gesichtsreinigung", category: "Gesichtspflege" },
  { name: "Mizellenwasser", category: "Gesichtspflege" },
  { name: "Tagescreme", category: "Gesichtspflege" },
  { name: "Nachtcreme", category: "Gesichtspflege" },
  { name: "Augencreme", category: "Gesichtspflege" },
  { name: "Gesichtsmaske", category: "Gesichtspflege" },
  { name: "Serum", category: "Gesichtspflege" },
  { name: "Sonnencreme", category: "Gesichtspflege" },
  { name: "Garnier Tagescreme", category: "Gesichtspflege" },
  { name: "Nivea Tagescreme", category: "Gesichtspflege" },
  { name: "Foundation", category: "Makeup & Kosmetik" },
  { name: "Mascara", category: "Makeup & Kosmetik" },
  { name: "Lippenstift", category: "Makeup & Kosmetik" },
  { name: "Concealer", category: "Makeup & Kosmetik" },
  { name: "Lippgloss", category: "Makeup & Kosmetik" },
  { name: "Eyeliner", category: "Makeup & Kosmetik" },
  { name: "Lidschatten", category: "Makeup & Kosmetik" },
  { name: "Highlighter", category: "Makeup & Kosmetik" },
  { name: "Make-up Entferner", category: "Makeup & Kosmetik" },

  // ── Drogerie — Mundhygiene ───────────────────────────────────────
  { name: "Zahnbürste", category: "Mundhygiene" },
  { name: "Elektrische Zahnbürste", category: "Mundhygiene" },
  { name: "Oral-B Zahnbürste", category: "Mundhygiene" },
  { name: "Zahnpasta", category: "Mundhygiene" },
  { name: "Colgate Zahnpasta", category: "Mundhygiene" },
  { name: "Blend-a-med", category: "Mundhygiene" },
  { name: "Mundwasser", category: "Mundhygiene" },
  { name: "Zahnseide", category: "Mundhygiene" },
  { name: "Interdentalbürsten", category: "Mundhygiene" },
  { name: "Zungenreiniger", category: "Mundhygiene" },

  // ── Drogerie — Damenhygiene ──────────────────────────────────────
  { name: "Binden", category: "Damenhygiene" },
  { name: "Tampons", category: "Damenhygiene" },
  { name: "Slipeinlagen", category: "Damenhygiene" },
  { name: "Menstruationstasse", category: "Damenhygiene" },
  { name: "Intimwaschlotion", category: "Damenhygiene" },

  // ── Drogerie — Gesundheit ────────────────────────────────────────
  { name: "Paracetamol", category: "Gesundheit & Medizin" },
  { name: "Ibuprofen", category: "Gesundheit & Medizin" },
  { name: "Aspirin", category: "Gesundheit & Medizin" },
  { name: "Nasenspray", category: "Gesundheit & Medizin" },
  { name: "Hustensaft", category: "Gesundheit & Medizin" },
  { name: "Halstabletten", category: "Gesundheit & Medizin" },
  { name: "Erkältungstee", category: "Gesundheit & Medizin" },
  { name: "Pflaster", category: "Gesundheit & Medizin" },
  { name: "Verbandsmaterial", category: "Gesundheit & Medizin" },
  { name: "Desinfektionsmittel", category: "Gesundheit & Medizin" },
  { name: "Fieberthermometer", category: "Gesundheit & Medizin" },
  { name: "Wärmflasche", category: "Gesundheit & Medizin" },
  { name: "Augentropfen", category: "Gesundheit & Medizin" },
  { name: "Antihistaminikum", category: "Gesundheit & Medizin" },

  // ── Drogerie — Vitamine ──────────────────────────────────────────
  { name: "Vitamine", category: "Vitamine & Nahrungsergänzung" },
  { name: "Vitamin C", category: "Vitamine & Nahrungsergänzung" },
  { name: "Vitamin D", category: "Vitamine & Nahrungsergänzung" },
  { name: "Vitamin B12", category: "Vitamine & Nahrungsergänzung" },
  { name: "Magnesium", category: "Vitamine & Nahrungsergänzung" },
  { name: "Zink", category: "Vitamine & Nahrungsergänzung" },
  { name: "Eisen", category: "Vitamine & Nahrungsergänzung" },
  { name: "Folsäure", category: "Vitamine & Nahrungsergänzung" },
  { name: "Biotin", category: "Vitamine & Nahrungsergänzung" },
  { name: "Omega-3", category: "Vitamine & Nahrungsergänzung" },
  { name: "Kollagen", category: "Vitamine & Nahrungsergänzung" },
  { name: "Protein-Pulver", category: "Vitamine & Nahrungsergänzung" },
  { name: "Kreatin", category: "Vitamine & Nahrungsergänzung" },
  { name: "Melatonin", category: "Vitamine & Nahrungsergänzung" },
  { name: "Ashwagandha", category: "Vitamine & Nahrungsergänzung" },
  { name: "Probiotika", category: "Vitamine & Nahrungsergänzung" },
];

export function findGroceryTemplate(name: string, customTemplates?: GroceryTemplate[]): GroceryTemplate | undefined {
  const found = GROCERY_DATABASE.find(
    (g) => g.name.toLowerCase() === name.toLowerCase()
  );
  if (found) return found;
  return customTemplates?.find(
    (g) => g.name.toLowerCase() === name.toLowerCase()
  );
}

export function searchGroceries(query: string, storeId: string, stores: StoreInfo[], customTemplates?: GroceryTemplate[]): GroceryTemplate[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const store = stores.find((s) => s.id === storeId);
  const cats = store ? getCategoriesForStore(storeId, stores) : null;

  // Merge custom + built-in, deduplicate by lowercase name
  // Custom templates come first so they have priority
  const seen = new Set<string>();
  const customSet = new Set<string>();
  const all: GroceryTemplate[] = [];
  if (customTemplates) {
    for (const g of customTemplates) {
      const key = g.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); all.push(g); customSet.add(key); }
    }
  }
  for (const g of GROCERY_DATABASE) {
    const key = g.name.toLowerCase();
    if (!seen.has(key)) { seen.add(key); all.push(g); }
  }

  // Filter matching items
  const matches = all.filter((g) =>
    g.name.toLowerCase().includes(q)
  );

  // Sort: custom items first, then by store category match
  matches.sort((a, b) => {
    const aCustom = customSet.has(a.name.toLowerCase()) ? 0 : 1;
    const bCustom = customSet.has(b.name.toLowerCase()) ? 0 : 1;
    if (aCustom !== bCustom) return aCustom - bCustom;
    if (cats) {
      const catSet = new Set(cats);
      const aIn = catSet.has(a.category) ? 0 : 1;
      const bIn = catSet.has(b.category) ? 0 : 1;
      return aIn - bIn;
    }
    return 0;
  });

  return matches.slice(0, 10);
}

// ── Quick-add suggestions per store ────────────────────────────────
const QUICK_SUGGESTIONS_MAP: Record<string, string[]> = {
  alle: ["Vollmilch", "Toastbrot", "Eier (10er)", "Butter", "Bananen", "Tomaten", "Gouda", "Basmati Reis"],
  aldi: ["Vollmilch", "Toastbrot", "Eier (10er)", "Butter", "Bananen", "Spaghetti", "Basmati Reis", "Joghurt (natur)"],
  edeka: ["Äpfel", "Gouda", "Rotwein", "Eisbergsalat", "Hähnchenbrust", "Olivenöl", "Baguette", "Sahne"],
  kaufland: ["Kartoffeln", "Hackfleisch (gemischt)", "Bier", "Chips", "Sprudelwasser", "Müsli", "Mehl", "Eier (10er)"],
  rossmann: ["Shampoo", "Zahnpasta", "Duschgel", "Taschentücher", "Waschmittel", "Toilettenpapier", "Bodylotion", "Deodorant"],
  dm: ["Shampoo", "Zahnpasta", "Duschgel", "Spülmittel", "Waschmittel", "Müllbeutel", "Sonnencreme", "Tagescreme"],
  lidl: ["Vollmilch", "Toastbrot", "Eier (10er)", "Bananen", "Penne", "Passierte Tomaten", "Basmati Reis", "Kaffee (gemahlen)"],
  netto: ["Vollmilch", "Butter", "Stilles Wasser", "Toastbrot", "Joghurt (natur)", "Gouda", "Apfelsaft", "Cola"],
  amazon: ["Kaffee (Bohnen)", "Grüntee", "Haferflocken", "Müsli", "Olivenöl", "Kokosmilch", "Quinoa"],
};

export function getQuickSuggestions(storeId: string): string[] {
  return QUICK_SUGGESTIONS_MAP[storeId] || QUICK_SUGGESTIONS_MAP.alle;
}

// ── Store suggestions for the Add Store modal ──────────────────────
export interface StoreSuggestion {
  name: string;
  domain?: string;
  type: StoreType;
  bgColor: string;
  emoji?: string;
}

export const STORE_SUGGESTIONS: StoreSuggestion[] = [
  { name: "Rewe", domain: "rewe.de", type: "supermarkt", bgColor: "#CC071E" },
  { name: "Penny", domain: "penny.de", type: "supermarkt", bgColor: "#CD1719" },
  { name: "Norma", domain: "norma-online.de", type: "supermarkt", bgColor: "#E30613" },
  { name: "Globus", domain: "globus.de", type: "supermarkt", bgColor: "#004B93" },
  { name: "Hit", domain: "hit.de", type: "supermarkt", bgColor: "#E2001A" },
  { name: "Wasgau", domain: "wasgau.de", type: "supermarkt", bgColor: "#009640" },
  { name: "Marktkauf", domain: "marktkauf.de", type: "supermarkt", bgColor: "#FDDA24" },
  { name: "Combi", domain: "combi.de", type: "supermarkt", bgColor: "#E30613" },
  { name: "K+K", domain: "klaas-und-kock.de", type: "supermarkt", bgColor: "#E30613" },
  { name: "Markant", domain: "markant-online.de", type: "supermarkt", bgColor: "#004B93" },
  { name: "Eiskönig", domain: "eiskoenig.eu", type: "supermarkt", bgColor: "#0077C8" },
  { name: "Getränke Hoffmann", domain: "getraenke-hoffmann.de", type: "supermarkt", bgColor: "#003D7A" },
  { name: "Coop", domain: "coop.ch", type: "supermarkt", bgColor: "#E3000F" },
  { name: "Albert Heijn", domain: "ah.nl", type: "supermarkt", bgColor: "#00A0E2" },
  { name: "Jumbo", domain: "jumbo.com", type: "supermarkt", bgColor: "#FFC917" },
  { name: "SPAR", domain: "spar.de", type: "supermarkt", bgColor: "#00843D" },
  { name: "Toom Baumarkt", domain: "toom.de", type: "sonstige", bgColor: "#E30613" },
  { name: "OBI", domain: "obi.de", type: "sonstige", bgColor: "#FF6600" },
  { name: "Bauhaus", domain: "bauhaus.info", type: "sonstige", bgColor: "#E30613" },
  { name: "Hornbach", domain: "hornbach.de", type: "sonstige", bgColor: "#FF6600" },
  { name: "Ikea", domain: "ikea.com", type: "sonstige", bgColor: "#0058A3" },
  { name: "Mediamarkt", domain: "mediamarkt.de", type: "online", bgColor: "#DF0000" },
  { name: "Saturn", domain: "saturn.de", type: "online", bgColor: "#F37A1F" },
  { name: "Zalando", domain: "zalando.de", type: "online", bgColor: "#FF6900" },
  { name: "Otto", domain: "otto.de", type: "online", bgColor: "#E30613" },
  { name: "About You", domain: "aboutyou.de", type: "online", bgColor: "#000000" },
  { name: "Müller", domain: "mueller.de", type: "drogerie", bgColor: "#E30017" },
  { name: "Douglas", domain: "douglas.de", type: "drogerie", bgColor: "#0B2545" },
  { name: "Apotheke", type: "sonstige", bgColor: "#F3F4F6", emoji: "💊" },
];

// ── ID generator ───────────────────────────────────────────────────
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
