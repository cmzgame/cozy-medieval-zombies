<!-- github.md, section 8.5. Every heading answered; "none" is an answer. Sign the last line with your role. -->

## What and why

Closes #

## How it was proved

<!-- The commands and their output: node --check, node tools/check.js, node tools/world.js (the hashes) and --roundtrip
if the save or the world changed, python -I tools/validate-data.py, the spec's acceptance, the check()s in the pane;
screenshots or a short clip for anything visible. -->

## The guest's side

<!-- CLAUDE.md's multiplayer rule, each point: (1) runs in the world's step on the host; (2) a guest does it through
the same path; (3) what it changes reaches a guest (the save, the frame); (4) world state in the sync check; (5)
per-player state on the player, time from loop.simTime, chance from rng; (6) tried in two tabs, check("sync"),
the bytes it adds to a frame. Or: no world change. -->

## The wiki

<!-- The cmz-wiki pull request, or the label needs-wiki, or "no player-visible change". -->

## Risks

<!-- The save format, net.PROTOCOL, the deploy, anything a merge breaks for a friend mid-game. Or: none. -->

— <Primary | Secondary (focus)>
