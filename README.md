# asteroids

A remake of **Asteroids** (Atari, 1979) for the browser, on the
[svision](https://github.com/mitrenga/svision) library and its vector (SVG)
platform: the rocks, the saucers and the ship are drawn as lines of the
original's shapes through a model of the Digital Vector Generator, and the
game is a routine-by-routine port of the original program run in a worker
at the machine's frame rate, with its sound board modelled circuit by
circuit.

**Work in progress** (2026-11): the whole game plays — the menu with the
attract's rocks behind it, the waves, the saucers, hyperspace, the end of
the game with the initials and the high score table as on the machine,
the sound. Settings, an installable web app and the match against the
vector RAM of MAME are still to come. Not deployed yet.

## Running

`index.php` through `app/svision/php/main.php`: copy
`config/config.php.sample` to `config/config.php`; with `$devMode = true`
the sources in `app/` are served as they are, for a deploy build a bundle
with `svtool build` (`app/svision/tools/svtool help`). `app/svision` is a
symlink to a checkout of svision next to this project. The database
(`config/createDB.sql`) is optional: without it the high score is 0 and
the hall of fame is empty.

Controls: the left and right arrows rotate, the up arrow thrusts, Space
fires, the down arrow or Shift is hyperspace, N mutes the sound, Escape
leaves; a gamepad and the touch zones of the screen do the same.

The ROMs and the original sources the remake was made from are not in the
repository. `data/` holds the shapes, the font and the tables converted
from the ROM by `tools/rom2vectors.mjs` and `tools/rom2tables.mjs`;
`tools/regress.mjs` keeps fingerprints of the screens and the sounds.

## Licence

CC BY-NC-SA 4.0 — see [LICENSE.md](LICENSE.md).
