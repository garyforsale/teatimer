# Gōng Fū Chá

Český gongfu časovač navržený výhradně pro iPhone (Safari nebo ikona na ploše). Statická aplikace bez účtu, backendu, analytiky a runtime závislostí. Devět původních čajových profilů a jejich časy zůstávají zachované.

## Co umí

- Čajová sbírka pro ovládání palcem s hledáním bez diakritiky a oblíbenými čaji.
- Vlastní uložené recepty, jejich úprava a smazání; nulový přírůstek času je podporovaný.
- Přesný odpočet podle cílového času, pauza, ruční přechod na další nálev a úprava času po pěti sekundách.
- Obnovení přípravy po reloadu. Přeskočený nálev se nepočítá jako dokončený.
- Přepočet množství lístků podle objemu nádoby 50–1 000 ml.
- Deník posledních 30 příprav s poznámkami a opakováním receptu.
- Zvukové upozornění, přepínač zvuku a Screen Wake Lock, pokud ho zařízení dovolí.
- Instalace na plochu a offline režim po prvním úplném načtení.
- Ovládání klávesnicí, popsané ovládací prvky, nativní dialogy a respektování omezených animací.

Všechny osobní údaje zůstávají v `localStorage` daného prohlížeče. Vymazání dat webu smaže sbírku i deník. Změny se promítají mezi otevřenými kartami; karta ovládající odpočet spravuje upozornění.

## Na iPhonu

Otevřete publikovanou HTTPS adresu v Safari. Přes Sdílet → Přidat na plochu lze aplikaci používat samostatně. Spodní navigace přepíná sbírku, časovač a deník. Aktivní odpočet zůstává zachován při přepínání obrazovek.

Rozhraní respektuje bezpečné okraje displeje a home indikátor. Úvodní obrázek je pouze ve sbírce; při přípravě je ovládání časovače vidět ihned.

## Spuštění

Z kořene repozitáře:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Otevřete `http://127.0.0.1:4173`. ES moduly a service worker potřebují HTTP/HTTPS; samotné otevření `index.html` přes `file://` nestačí.

## Testy

Node.js 20 nebo novější, bez instalace balíčků:

```sh
node --test tests/engine.test.mjs
```

Testy pokrývají přesný čas při uspání stránky, pauzu, obnovení, ruční navigaci, skutečná dokončení, reset, úpravy času a poškozená data úložiště.

Před vydáním také ověřte v prohlížeči: výběr → spuštění → pauza → pokračování → dokončení → další nálev; vlastní recept s přírůstkem 0; deník a jeho poznámku po reloadu; změnu čaje během běhu; mobilní zobrazení; a reload bez sítě po aktivaci service workeru.

## Soubory

- `index.html`, `styles.css`: rozhraní a responzivní vzhled.
- `app.js`: čajové profily, vykreslení, úložiště, deník, zvuky a ovládání.
- `engine.mjs`: samostatné testovatelné jádro časovače.
- `sw.js`, `manifest.webmanifest`, `assets/`: offline aplikace, ikony a lokální média.

## Nasazení na GitHub Pages

Publikujte kořen repozitáře. Všechny cesty jsou relativní, aplikace funguje i pod `/teatimer/`. Není potřeba build.

**Při každém vydání změňte `CACHE_VERSION` v `sw.js`.** Celý shell se ukládá jako jedna verze. Nový service worker čeká na zavření starých karet, aby se během louhování nenačetla jiná verze aplikace. Po zavření všech karet a novém otevření se načte aktualizace. Neúplná sada souborů se nenainstaluje.

## Omezení prohlížečů

Odpočet se po návratu z pozadí přepočítá podle uloženého času. Prohlížeč ale může na pozadí pozastavit JavaScript i zvuk. Pro včasné upozornění nechte aplikaci v popředí a telefon odemčený. Po reloadu může zvuk vyžadovat nové uživatelské gesto. PWA ani tichá zvuková smyčka negarantují alarm při zamčeném telefonu; chování v tichém režimu je potřeba ověřit na skutečném iPhonu.

Čajové časy a teploty jsou výchozí profily, ne univerzální předpis. Řiďte se konkrétním čajem a vlastní chutí.

## Vizuální asset

`assets/tea-still-life.webp` vznikl vestavěným Imagegenem pro tento projekt. Zadání: přirozená redakční fotografie celadonového gaiwanu, šálku jantarového oolongu a několika lístků na béžovém lnu, měkké odpolední světlo, slonová kost a tlumená zelená, bez textu a log. Zvukové soubory pocházejí z původní verze aplikace.
