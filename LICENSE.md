# Licence

**Asteroids remake** — © 2026 Libor Mitrenga. Work in progress.

## The remake

Everything written for this remake — the application in `app/`, the tools
in `tools/`, the server scripts in `db/` and the documentation — is
licensed under **Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International (CC BY-NC-SA 4.0)**. The full text is in [LICENSE](LICENSE);
a summary is at <https://creativecommons.org/licenses/by-nc-sa/4.0/>.

In short: you may copy, change and share it for non-commercial purposes,
as long as you credit the author and share your changes under the same
licence.

## The original game

*Asteroids* (1979) is a game by Atari, Inc. The name and the game are the
property of their rights holders (today Atari Interactive, Inc.). This
remake is an independent, non-commercial study of the original program;
it is not endorsed by or affiliated with Atari.

- The **ROMs, the original source code, the manuals and the disassemblies**
  the remake was made from are **not part of this repository**
  (`sources/`, ignored by git). Nothing here replaces them.
- The files in `data/` (`shapes.json`, `font.json`, `tables.json`) are
  conversions of the shape, font and table data of the original ROM made by
  `tools/rom2vectors.mjs` and `tools/rom2tables.mjs`. The rights to that
  data remain with its holders; it is included only as far as the remake
  needs it to draw and play, and it will be removed on their request.

## Third parties

- The **svision** library (`app/svision`, a symlink to a separate
  repository) has its own licence, CC BY-NC-SA 4.0 as well.
- The sound board (`app/soundBoard.js`) and the discrete-circuit blocks of
  svision it uses were written after the sound model of **MAME**
  (`asteroid_a.cpp`, `disc_*.hxx`); MAME is distributed under the GPL-2.0
  or later and the BSD-3-Clause licence.
