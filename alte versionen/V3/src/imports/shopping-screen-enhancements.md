erbessere den Einkaufen-Screen mit folgenden Änderungen:
Store-Logos:
Lade die echten Store-Logos dynamisch über die Brandfetch API: https://cdn.brandfetch.io/[domain]/w/400/h/400/logo mit folgenden Domains:

Aldi: aldi-nord.de
Edeka: edeka.de
Kaufland: kaufland.de
Rossmann: rossmann.de
DM: dm.de
Lidl: lidl.de
Netto: netto-online.de
Amazon: amazon.de

Zeige das Logo als kreisförmigen Avatar. Falls das Logo nicht lädt, zeige den ersten Buchstaben als Fallback.
Store-spezifische Kategorien:
Verwende je nach aktivem Store unterschiedliche Kategorien für die Sortierung:
Supermärkte (Aldi, Edeka, Kaufland, Lidl, Netto, Rewe):
Obst & Gemüse → Backwaren → Fleisch & Wurst → Milch & Käse → Eier → Nudeln & Reis → Konserven → Saucen & Gewürze → Kaffee & Tee → Müsli & Frühstück → Tiefkühl → Süßwaren & Snacks → Getränke → Haushalt & Reinigung → Tiernahrung
Drogerie (Rossmann, DM):
Körperpflege → Haarpflege → Gesichtspflege → Makeup & Kosmetik → Mundhygiene → Damenhygiene → Babypflege → Reinigungsmittel → Waschmittel → Papierprodukte → Gesundheit & Medizin → Vitamine & Nahrungsergänzung → Foto & Technik → Tiernahrung → Lebensmittel & Snacks
Online (Amazon):
Elektronik → Haushalt → Lebensmittel → Bücher & Medien → Sport & Freizeit → Kleidung → Bürobedarf → Spielzeug → Garten → Sonstiges
Alle / Sonstige Läden: Sonstiges
Artikeldatenbank — erheblich erweitert:
Obst & Gemüse: Äpfel, Birnen, Bananen, Orangen, Zitronen, Limetten, Erdbeeren, Heidelbeeren, Himbeeren, Trauben, Mango, Ananas, Avocado, Kiwi, Melone, Tomaten, Rispentomaten, Cherrytomaten, Gurke, Paprika (rot/gelb/grün), Zucchini, Aubergine, Brokkoli, Blumenkohl, Spinat, Rucola, Eisbergsalat, Feldsalat, Lauch, Sellerie, Fenchel, Karotten, Kartoffeln, Süßkartoffeln, Zwiebeln, Knoblauch, Ingwer, Pilze, Champignons, Radieschen, Kohlrabi, Rosenkohl, Wirsing
Backwaren: Toastbrot, Vollkornbrot, Baguette, Brötchen, Croissants, Laugenbrötchen, Tortillas, Pitabrot
Fleisch & Wurst: Hähnchenbrust, Hackfleisch (gemischt/Rind), Schweinefilet, Lachs, Thunfisch (Dose), Garnelen, Salami, Schinken, Hähnchenschenkel, Bratwurst, Leberwurst
Milch & Käse: Vollmilch, Fettarme Milch, Hafermilch, Mandelmilch, Sojamilch, Butter, Margarine, Joghurt (natur/Frucht), Griechischer Joghurt, Schmand, Crème fraîche, Sahne, Saure Sahne, Quark, Frischkäse, Mozzarella, Gouda, Parmesan, Emmentaler, Feta, Kefir, Skyr
Eier: Eier (6er/10er/12er)
Nudeln & Reis: Spaghetti, Fusilli, Penne, Rigatoni, Tagliatelle, Lasagneplatten, Basmati Reis, Jasmin Reis, Risotto Reis, Couscous, Bulgur, Quinoa, Polenta, Nudeln (Eiernudeln)
Konserven: Passierte Tomaten, Tomatenmark, Dosentomaten (gehackt), Kidneybohnen, Kichererbsen, Linsen (Dose), Mais, Erbsen, Champignons (Dose), Kokosmilch, Thunfisch (Dose), Sardinen, Oliven, Artischocken
Saucen & Gewürze: Salz, Pfeffer, Olivenöl, Sonnenblumenöl, Rapsöl, Essig, Sojasauce, Sriracha, Ketchup, Senf, Mayonnaise, Tomatensoße (Fertig), Pesto, Brühe (Gemüse/Hühner), Oregano, Basilikum, Thymian, Paprikapulver, Kreuzkümmel, Currypulver, Zimt, Vanille, Backpulver, Natron, Mehl, Zucker, Puderzucker, Paniermehl, Speisestärke
Kaffee & Tee: Kaffee (gemahlen/Bohnen), Espresso, Kaffeepads, Kaffeekapseln, Schwarztee, Grüntee, Kräutertee, Kamillentee, Pfefferminztee
Müsli & Frühstück: Haferflocken, Müsli, Cornflakes, Granola, Marmelade, Nutella, Honig, Ahornsirup
Tiefkühl: Tiefkühl-Erbsen, Tiefkühl-Spinat, Tiefkühl-Brokkoli, Fischstäbchen, Tiefkühl-Pizza, Eis (Vanille/Schoko), Tiefkühl-Pommes
Süßwaren & Snacks: Schokolade, Gummibärchen, Chips, Salzstangen, Cracker, Kekse, Waffeln, Riegel, Popcorn, Nüsse (gemischt/Cashews/Mandeln)
Getränke: Sprudelwasser, Stilles Wasser, Orangensaft, Apfelsaft, Multivitaminsaft, Cola, Fanta, Sprite, Eistee, Energydrink, Bier, Wein (Rot/Weiß), Sekt
Haushalt & Reinigung: Spülmittel, Spülmaschinentabs, Spülmaschinensalz, Waschmittel, Weichspüler, Allzweckreiniger, Badreiniger, WC-Reiniger, Küchenrolle, Toilettenpapier, Taschentücher, Müllbeutel, Gefrierbeutel, Alufolie, Frischhaltefolie, Schwämme, Scheuermilch, Backpapier
Tiernahrung: Katzenfutter (nass/trocken), Hundefutter (nass/trocken), Katzensnacks, Katzenstreu
Drogerie — Körperpflege: Duschgel, Shampoo, Spülung, Haarkur, Bodylotion, Deodorant, Rasierschaum, Rasierklingen, Wattepads, Wattestäbchen, Feuchttücher
Drogerie — Gesicht & Makeup: Gesichtsreinigung, Mizellenwasser, Tagescreme, Nachtcreme, Sonnencreme, Foundation, Mascara, Lippenstift, Concealer
Drogerie — Mundhygiene: Zahnbürste, Zahnpasta, Mundwasser, Zahnseide
Drogerie — Gesundheit: Paracetamol, Ibuprofen, Nasenspray, Hustensaft, Pflaster, Verbandsmaterial, Vitamine, Magnesium, Omega-3
Store hinzufügen Modal:
Wenn auf "+" getippt wird, öffnet ein Modal mit Suchleiste und Vorschlägen:
Rewe, Penny, Norma, Globus, Hit, Wasgau, Marktkauf, Combi, Toom Baumarkt, OBI, Bauhaus, Hornbach, Ikea, Mediamarkt, Saturn, Zalando, Otto, About You, Müller, Budnikowsky, Apotheke, Reformhaus
Falls nicht gefunden: "Eigenen Laden hinzufügen: [Eingabe]"