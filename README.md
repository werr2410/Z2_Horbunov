# Obedové menu v okolí fakulty

Zadanie č. 2 z predmetu WEBTE1 (FEI STU, ZS 2026/2027). Autor: Andrii Horbunov.

Stránka načíta denné menu troch jedální v okolí fakulty, spracuje ho do jednotnej štruktúry a zobrazí podľa dňa v týždni. Beží výlučne na strane klienta (HTML, CSS, JavaScript).

## Zdroje dát

- Eat & Meet – https://eatandmeet.sk/
- FiitFood (FreeFood) – http://www.freefood.sk/menu/
- Jedáleň PriF UK (Delikanti) – https://www.delikanti.sk/

## Ako to funguje

- Stránky sa načítajú cez jQuery AJAX, spracujú sa pomocou `DOMParser` a selektorov. Každá reštaurácia má vlastnú parsovaciu funkciu v `Js/parsers.js`.
- Výsledok sú objekty `Dish` v jednom poli, uložené v `localStorage`. Ak sú uložené dáta z dnešného dňa, stránky sa znova nenačítavajú.
- Tlačidlo „Aktualizovať menu“ načíta dáta nanovo, tlačidlo „Vymazať uložené dáta“ ich zmaže z prehliadača.
- Prepínač „Lokálna kópia stránok“ načíta uložené kópie z priečinka `TemplatePages/` namiesto živých stránok.
- Chyba pri jednej reštaurácii nezabráni zobrazeniu ostatných.

## Štruktúra

- `index.html` – stránka
- `Style/Style.css` – vlastné štýly
- `Js/script.js` – načítanie, ukladanie, filtre a vykresľovanie
- `Js/parsers.js` – trieda `Dish` a parsery jednotlivých reštaurácií
- `Fonts/` – lokálne fonty
- `TemplatePages/` – lokálne kópie stránok reštaurácií

## Použitie AI

Pri práci som používal AI asistenta Claude (Anthropic). Pomáhal pri návrhu značkovania, JavaScriptu (parsery, ukladanie, filtre), úprave štýlov a kontrole chýb. Výsledný kód som skontroloval a viem ho vysvetliť.

## Licencie

Fonty (lokálne, `Fonts/`):

- Poppins – Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins), SIL Open Font License 1.1.
- Playwrite IT Trad – The Playwrite Project Authors (https://github.com/TypeTogether/Playwrite), SIL Open Font License 1.1.
- Plné znenie licencie OFL 1.1 je v `Fonts/OFL.txt` a na https://openfontlicense.org.

Knižnice (načítavané z CDN):

- Bootstrap 5.3.8 – licencia MIT
- Bootstrap Icons 1.11.3 – licencia MIT
- jQuery 3.7.1 – licencia MIT

Obsah menu patrí príslušným reštauráciám a jedálňam. Stránka ho len zobrazuje na študijné účely.