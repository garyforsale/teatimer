# Gōng Fū Tea Timer

Časovač pro čajový obřad **gōng fū chá** — louhování po louhování, s gongem na konci každého nálevu.

**Aplikace:** https://garyforsale.github.io/teatimer/

## Co umí

- **9 přednastavených čajů** (zelený, bílý, žlutý, oolongy, červený, shēng a shóu pǔ’ěr, dān cóng) s teplotou vody, gramáží a časy jednotlivých louhování
- **Přepočet gramáže** podle velikosti tvého gaiwanu / konvičky
- **Oplach** lístků u čajů, kterým prospívá (lze vypnout)
- **±5 s** k právě běžícímu louhování, **„Ještě jedno louhování“** na konci sezení
- **Vlastní čaje** (vzorec „první čas + přírůstek“ nebo vlastní seznam časů) a úprava přednastavených
- **Deník** — dokončená sezení s hodnocením a poznámkou
- Přesný časovač (nezpožďuje se na pozadí ani při zamčeném telefonu), obnovení rozpracovaného sezení po zavření stránky
- Zvuk i v tichém režimu iPhonu, vibrace, oznámení na pozadí, ovládání ze zamčené obrazovky
- Displej nezhasne, dokud je časovač otevřený
- **Funguje offline** a jde přidat na plochu (PWA) · tmavý i světlý motiv · klávesové zkratky

## Přidání na plochu (iPhone)

V Safari otevři aplikaci → **Sdílet** → **Přidat na plochu**.

## Klávesy

`mezerník` start/pauza · `←` `→` předchozí/další louhování · `R` znovu · `+` `−` ±5 s · `Esc` zpět

## Vývoj

Čistě statické soubory, žádný build — stačí je nahrát na GitHub Pages.

- `index.html` — celá aplikace (HTML, CSS, JS)
- `sw.js` — service worker pro offline režim; **při změně zvuků nebo ikon zvyš `VERSION`**
- `sounds/`, `icons/`, `manifest.webmanifest`

Lokálně: `python3 -m http.server` a otevřít `http://localhost:8000`.

Data (nastavení, vlastní čaje, deník) se ukládají jen v prohlížeči (`localStorage`).
