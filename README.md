# Cozy Medieval Zombies (working title)

A cute isometric medieval village in the Habbo / early-2000s pixel style, overrun by the dead. One continuous map: walk from the square into the inn, look out its window, see what is coming. The art stays cute; the systems stay serious. Friends play together in one world, hosted in a browser or on the studio's server.

**Play it:** https://cmzgame.github.io/cozy-medieval-zombies/ · **How it works:** https://cmzgame.github.io/cmz-wiki/ (the wiki: every item, weapon, place, and rule, generated from the game's own data).

Plain HTML, CSS, and JavaScript with ES modules. Raw WebGL2 for the world, Canvas 2D to generate the dev art, DOM for the interface. No engine, no build step, no library; a small Node relay (`server/`) for friends. Started 2026-10-08 as the marriage of two earlier prototypes, `cozy-zombie-game` and `medieval-zombie-survival`, both kept as they were.

## Running it locally

```bash
python serve.py 8010
```

Then open http://localhost:8010 (`?map=square` for the old proving ground). ES modules do not load from `file://`. WASD to walk, Shift to sprint, the mouse to aim and swing; `E` opens and closes; Tab is the bag, `C` the character screen, `M` the map; the rest is on the wiki's Controls page.

## The repository

`src/` the game · `server/` the relay and the server worlds · `data/` everything the game reads · `tools/` the editors, the checks, the map generator · `docs/` the vision (`00`), the rulings (`02`), the specs, and `docs/README.md` the index of them. How the work is organised, for people and agents alike: `github.md`. The studio is `cmzgame`.
