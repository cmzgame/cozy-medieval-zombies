# 31.07 — The questions for Michael

Defaults in brackets, in the house style. An answer is a ruling for `02` under the day's date; a default left standing is a ruling too. The first four decide the shape; the rest are the game's rules with more than one person in it and can wait for the tier that needs them.

## The shape

1. **Listen server, dedicated server, or both through one world module?** `04` recommends both through one module (the hybrid): the authority written once, run in the host's page on a Tuesday night and in a Node process for a valley that persists. The listen server alone is the smaller build and the smaller promise; the dedicated server alone makes single player depend on a process. [**Both, one module.** It is the only one where single player exercises the multiplayer code every evening.]

2. **Is a Node process acceptable in the repo?** The game is plain HTML, CSS, and JS with no build step, no framework, and `serve.py` for files. A WebSocket server is not in Python's standard library; it is a hundred and fifty lines by hand or the `ws` package from npm in Node, which the repo already uses for `node tools/check.js`. [**Node, and the dependency decision at tier 4:** a hand-written handshake keeps the repo's "no package.json" law; `ws` is the pragmatic choice if the handshake proves fiddly. Neither touches the game's own code.]

3. **How many?** The design target sets the atlas, the HUD, and the join screen; the ceiling sets the counts in the step. [**Four as the target, eight as the ceiling.** Four fit in the atlas's free rows today; eight need the second page `23` already scheduled.]

4. **When?** `06` says: the big pass as specced, with the six habits; then the save system; then tier 0; the rest when single player is finished, as ruled. The alternative is to pull tier 0 forward (it is saves plus the split `23a` wanted) and let the pass land on a world that is already apart from its window. [**After the pass, saves first, tier 0 next;** pull tier 0 forward only if the pass's step 2 (sleep, the time scale) or its station queues turn out to be easier to write against a world module than against `main.js`.]

## The rules

5. **Sleep with a veto: everyone or nobody?** `03` lays out (a) everyone in bed, (b) a majority, (c) each alone. [(a). It is law 6 as written with more voters.]

6. **Pause: never with a guest connected?** Escape opens a local menu over a running world; alone, as today. [Yes. Pausing a friend's game is not a thing.]

7. **Shared sight: none?** No party vision, no minimap, no friend-through-walls. [None. Sight is the game.]

8. **Friendly fire: none?** Swings pass through players as through villagers; arrows and spears land beside, never in. [None in 1.0, by the villagers' precedent; a sandbox setting later if the fantasy is wanted.]

9. **Chat: the log and bubbles, within sight only?** A typed line is a `say`: a bubble over your head, a line in every log that could see you. No global channel. [Yes. It keeps chat a thing that happens in the world, and it makes shouting across the square a decision.]

10. **Ownership: none?** Any chest, any body, any dropped bag, anyone's. No locks, no trade window. [None. Zomboid's rule, and the game has no coin.]

11. **Death with friends: the next survivor at once, the body a zombie in your clothes with your things?** As `02` ruled for single player (2026-10-08) and the parent built. [Yes, and the dead player sees what their body sees until they take a new survivor.]

12. **The world with nobody in it: stopped?** A dedicated server with no player connected does not run the clock. [Stopped. The sim runs only where a player is, which with no player is nowhere; fires and crops are where you left them, as the law "things run out because you used them" wants.]

13. **The host's rules bind the guests?** Zombie aggro, survival, free building, multi-hit, combat testing, the square's surface, and the data files are the authority's; a guest's settings screen shows them read-only. [Yes.]

14. **The dev console on the authority only?** `give`, `teleport`, the clock keys, `giveKit` for the host alone; a guest's `__game` reads its replica. [Yes.]

15. **Names over heads?** For players within sight, placed like the speech bubble, with a setting to hide them. [Yes, on by default.]

16. **The identity screen now, in single player?** The creation screen pinned in `02` (look, hair, facial hair, the painted layers) with a name, kept as a setting, editable from the pause menu. It is the one screen that travels, and single player wants it anyway. [Yes, as item 30, whenever the character art lands; it does not wait for multiplayer.]

17. **Reconnect grace: two minutes?** A dropped player's character stands where it was for the grace period, then the dead may have it. [Two minutes, a tunable.]

18. **The wire in JSON?** Plain objects, readable in the console, the house style; a binary snapshot only if a profile ever asks. [JSON.]

19. **Voice: never in 1.0?** The browser could carry it (WebRTC audio) with the same signalling the relay provides. [Not in 1.0; nothing forecloses it; the text log is the chat.]

20. **Where does the relay run?** (2026-10-13, after the two-browser test: the GitHub Pages site is the client, so the relay must be reachable from it as `wss://`, which means TLS.) The choices: a free hosting tier that gives TLS and a stable name for nothing (Fly, Render, Glitch, and the like; the process sleeps when idle and wakes on the first connection, which costs the host a few seconds); Michael's own machine with a tunnel (`cloudflared`, `ngrok`) that gives the TLS name, up only while he runs it; a cheap box later. [The relay's address a constant in `net.js` the Pages build carries, overridable by `?relay=`; a free tier first, since nothing of his stays on when he closes the laptop and a sleeping relay costs only a wait at the first join.]
