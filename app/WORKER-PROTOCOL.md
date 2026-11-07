# Protokol model ↔ worker (R-007, tvar z battlezone)

Worker je `app/gameWorker.js` slepený za běhu z ES modulů (`svision/js/moduleWorker.js`:
seznam v `MainModel.WORKER_SOURCES`, tytéž soubory v `config/compile.json`
`standalone`). Stejná třída `GameWorker` se importuje pod Node do nástrojů
(`tools/regress.mjs`, později `tools/matchvectors.mjs`) — bez časovače,
snímek po snímku přes `tick`.

Tick = **1 herní snímek originálu = 4 NMI = 4·12·4096/12 096 000 s = 16,25 ms
(61,52 Hz)** (notes 1; pevný krok, akumulátor podle `performance.now()`, po
probuzení záložky se nedohání víc než 8 snímků). Obraz se posílá po každé
dávce ticků (poslední snímek); `tick` v headless režimu ho pošle vždy.

**Stav AS-M6:** worker je slepený z `svision/js/platform/vector/atari/avg.js`,
`dvg.js`, `playfield.js`, `game.js` a `gameWorker.js`; každý tick spustí
jeden snímek `Game.tick(actions)` (přepis hlavní smyčky originálu: `CHKST`,
`UPDATE`, `GETINT`, `SCORES`, `FIRE`, `HYPER`, `MOVE`, `ENEMY`, `MOTION`,
`COLIDE`, `SOUNDS`, `RAND`, `NEWAST`) a stav, který vrátí, složí
`Playfield` z dat ROM (`init.data`). Konec hry (AS-M6) hraje hra sama
jako stroj — GAME OVER, iniciály (kvalifikované skóre bez jména hráče),
tabulka — a hlásí ho zprávami níže; po `gameOverDone` worker přestane
tikat.
Bez dat (nástroj bez `data/*.json`) kreslí rám hrací plochy (`VEC:TEST1`).
`sounds` ve `frame` jsou události, které snímek spustil (`Game.events`:
`fire`, `saucerFire`, `explosionXX` s bajtem `LEXPSND` — `3F` velký kámen
nebo velký talíř, `FF` střední kámen nebo malý talíř, `BF` malý kámen, `3E`
loď po hyperspace —, `thumpHigh`/`thumpLow`, `extraLife`, `soundsOff` =
`INIT1` na konci hry; hrany LS259 jako `thrustOn`/`thrustOff` a
`saucerLarge`/`saucerSmall`/`saucerOff`); stav latch registrů, jak by je
`SOUNDS` zapsal, je `Game.outputs`. Model je hraje přes `audioManager.js`
nad `soundBoard.js` (AS-M7): jednorázové zvuky jako vzorky, thrust a talíř
jako smyčky mezi hranami.

## model → worker

| zpráva | význam |
|---|---|
| `{id:'init', seed, data, attract, backdrop?, hiScore, hiScores?, playerName?, headless?, setup?}` | `seed` = seed mulberry32 (`GameWorker.seededSource`, bajtový zdroj náhody; hra z něj naseeduje 16bitový posuvný registr `POLYH:POLYL` originálu, notes 12, a jinou náhodu nemá); `data` = `{shapes, font, tables}` z `data/*.json` (`rom2vectors`, `rom2tables`); `attract` = demo; `backdrop` = attract jako pozadí menu (jen objekty: žádné texty, copyright ani tabulka, `PUSH START` ne; `MenuModel` od 2026-11-07, zvuk nehraje); `hiScores` = `[{score, name}]` síň slávy serveru = tabulka stroje `HSCORE`/`INITL` (BCD, první tři písmena jména), bez ní jen `hiScore` s prázdnými iniciálami; `playerName` = jméno hráče (prázdné = při kvalifikaci se zadávají iniciály; známé se vyplní bez ptaní); `headless` = bez hodin, jen `tick`; `setup(game)` = jen nástroje, stav před prvním tikem. Hra začíná hned |
| `{id:'controls', action, value}` | stav jedné akce: `left`/`right` (otáčení; na obrazovce iniciál mění písmeno), `thrust`, `fire`, `hyperspace` (na obrazovce iniciál potvrzuje písmeno — drženo 3 snímky) |
| `{id:'letter', key}` | obrazovka iniciál: písmeno/číslice z klávesnice nastaví aktuální iniciálu, `'Enter'` ji potvrdí (zkratka remaku; rotate a hyperspace fungují jako na stroji) |
| `{id:'pause'}` / `{id:'continue'}` | hodiny běží, snímky ne |
| `{id:'reset'}` | zastaví a zahodí hru |
| `{id:'tick'}` | headless: přesně jeden snímek + `frame` |

## worker → model

| zpráva | význam |
|---|---|
| `{id:'frame', tick, score, lives, gameOver, screen, initials, sounds[], notify[], segments: Float32Array, state?}` | `segments` = úsečky snímku po pěticích `x1, y1, x2, y2, intensity` v **jednotkách DVG** (X 0–1023, Y 128–895, y nahoru; `GameWorker.unpack`); model je kreslí přes `DVG.appendTo` (`y = 895 − y`, bod = krátká širší čára); `sounds` = jména událostí zvuku, které snímek spustil (výše); `screen` = `'game'` / `'initials'` (`GETINT`) / `'table'` (`SCORES`); `initials` = `{letters, index}` na obrazovce iniciál (tři znaky, mezera = prázdná); `gameOver` = sekvence konce hry dohrála (worker přestane tikat); `notify` = zprávy níže, které worker po snímku pošle; `state` jen headless: `{tick, scene}` (`scene` = stav playfieldu, jak ho vrátil `Game.tick`) |
| `{id:'gameOver', score, name, qualified}` | snímek po poslední explozi (`UPDATE`): `name` = jméno hráče (model skóre hned uloží), `false` = skóre se kvalifikovalo a stroj se ptá na iniciály, `''` = nekvalifikovalo bez jména (neukládá se); `qualified` = dostalo se do tabulky. Hra běží dál jako attract stroje (kameny, talíř; pak tabulka) |
| `{id:'initials', name}` | iniciály zadané (nebo timeout `FRAME+1`, ~66 s); model uloží skóre s nimi |
| `{id:'gameOverDone'}` | interval tabulky vypršel (nebo by s prázdnou tabulkou začal): worker přestal tikat, model se vrátí do menu |
