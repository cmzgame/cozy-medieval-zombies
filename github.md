# github.md — the studio's infrastructure, and how work gets from an idea to `main`

**Status: proposed 2026-10-15 by the planning agent at Michael's ask; not yet in force.** Parts need Michael's clicks in GitHub (marked **Michael**); the rest an agent can set up once he approves (the checklist at the end). Until it is approved, the process in `CLAUDE.md` stands.

**For any agent: START HERE.** Read this file for the infrastructure and the workflow, then `CLAUDE.md` for the game's rules and code map, then `TODO.md` for where work stands, then your queue (section 7). This file governs both repositories, the game and the wiki.

---

## 1. Why this exists

Michael directs several agents at once (a technical lead, coding agents, the wiki agent, a planning agent, the design agent), and until now they talked through him: he pasted one agent's message into another's session. This process moves every handoff onto GitHub, where it is written down, linked, and findable: **work is an issue, code is a pull request, review is comments on the pull request, and merging is the lead's.** Michael's message to any agent becomes "work your queue". It is the shape a small game studio uses: trunk-based development (short branches off one always-playable `main`), every change through a reviewed pull request, automatic checks, and every merge deployed.

## 2. The pieces

### The repositories

- **The game:** `michaeldippold/cozy-medieval-zombies`, checked out at `C:/Users/micha/Dev/cozy-medieval-zombies` (the main checkout; agents work in worktrees under `.claude/worktrees/`, one per session, which the desktop app makes). Public.
- **The wiki:** `michaeldippold/cmz-wiki`, at `C:/Users/micha/Dev/cmz-wiki`; how it is kept is its own `CLAUDE.md`. Public; goes private when the game does.
- **The design agent's worktree:** `C:/Users/micha/Dev/cozy-medieval-zombies-art` on the branch `art-docs` (its tool cannot write under `.claude/`; `docs/27`).

### What `main` is

**A merge to `main` deploys to players.** `.github/workflows/deploy.yml` runs on every push to `main`: it deploys the relay and the server worlds to Fly (`flyctl deploy`, the app `cmz-relay`, stamped with the commit as the build id) and, once the repository variable `PAGES_FROM_ACTIONS` is `true`, publishes the site to GitHub Pages stamped the same (until then Pages deploys from the branch, unstamped). A server world refuses a page of another build ("The game was updated"), and the wire refuses another `net.PROTOCOL`. So **`main` is always playable**: nothing half-done, nothing that breaks a friend's world, ever lands there. Friends play it the moment it merges.

### The environments

- **Local:** `python serve.py 8010` serves the game (no build step: ES modules straight from the folder; the app's preview names it `medieval`, and `medieval-second` on 8011); `node server/relay.js 8012` a local relay (`relay`); `node C:/Users/micha/Dev/cmz-wiki/serve.js` the built wiki on 8020 (`wiki`). Two-tab multiplayer tests use `?nosave&relay=none` (`CLAUDE.md`, testing).
- **Production:** the site on GitHub Pages; the relay and the server worlds on Fly (`wss://cmz-relay.fly.dev`, region `ord`, one 512 MB shared machine that stops when idle and wakes on a join); the wiki on its own Pages site (`michaeldippold.github.io/cmz-wiki`).

### Storage

- **A world played in a browser** lives in that browser: the records in IndexedDB (database `cmz`, store `worlds`), the index, identities, and settings in localStorage (`src/save.js`, `src/identities.js`, `src/settings.js`). Clearing site data loses it. Saves keep each chunk's saved form so a save costs what changed.
- **A server world** lives on Fly's volume `cmz_data` mounted at `/data`: `/data/worlds/<id>/save.json.gz`, with `rolling/` (a copy at most every ten minutes, three kept), `daily/` (seven kept), and a `crash-<time>.json.gz` beside the last good save if the process threw; Fly snapshots the whole volume daily, kept seven days. The relay starts one Node process per world (`server/world.js`), holds it when it empties, and stops it after a spell empty and saved.
- **Secrets:** `FLY_API_TOKEN` is a GitHub repository secret (a deploy token for `cmz-relay`); `CREATOR_KEY` is a Fly secret. Neither is in any file. Only Michael adds or changes a secret.

### Build tools

None. The game is plain HTML, CSS, and JavaScript with ES modules; `package.json` exists only for Fly's Node image; the relay and the server have no dependencies; the wiki's generator has none. **If a build step is ever added, this section names it, the command that runs it, and what CI checks.** The only stamping today is the build id (`src/build.js`, written by the deploy).

## 3. The tools on the machine

All agents run on Michael's Windows machine with: **git** 2.38, **gh** 2.100 (the GitHub command line), **node** 22 with **npm** 10, **python** 3.13, **flyctl** 0.4 (`fly`), and **docker** 28. Shells: Git Bash and PowerShell 5.1.

The project's own commands (details in `CLAUDE.md`, "Testing"): `node --check <file>` on every touched module; `node tools/check.js` (the headless checks); `node tools/world.js` (the whole world under Node and its determinism hash; `--roundtrip` proves the save); `python -I tools/validate-data.py`; `await __game.check("<name>")` in the browser pane (sync, players, save, worlds, craft, wear, sleep, water, and the rest under `tools/checks/`); `python -I tools/mapgen/valley.py` regenerates the valley. For the wiki: `node sync.js`, `node census/census.js`, `node build.js --check` in `cmz-wiki`.

`fly` is for reading (logs, status, releases) with Michael's say; deploying is the workflow's job, never a person's or an agent's by hand.

## 4. Who is who on GitHub (read this before using `gh`)

There are two identities on the machine, and they are not the same:

- **`git` pushes as `michaeldippold`**, Michael's own account, over HTTPS through Git Credential Manager. Every branch push and every merge done with plain `git` works, with full rights, and is recorded as Michael's.
- **`gh` is logged in as `writeplaintext`**, a second account whose token can only **read** these repositories. With it an agent can open issues and pull requests and comment (anyone can, on a public repository), but cannot add labels, merge, assign, approve a pull request in a way that counts, change settings, or start workflows. That is why agents keep reporting "no permission" while their pushes go through.

**Proposed: `writeplaintext` becomes the studio's agent account** (**Michael**: add it as a collaborator with **Write** on both repositories, and give its token read and write on contents, issues, pull requests, and actions for both). Then every agent acts as `writeplaintext` on GitHub, and **Michael (`michaeldippold`) is the one human**: his approval on a pull request is the only one GitHub counts, because GitHub never lets a pull request's author approve it, and every agent's pull request is authored by the same agent account. [Optionally, also store `writeplaintext` in Git Credential Manager so pushes stop being recorded as Michael's; then the history says plainly which work was agents' and which his.]

**Because every agent is one account, every agent signs what it writes on GitHub**: a pull request's body, a comment, a review, an issue end with a line naming the role, for example `— lead`, `— coder (farming)`, `— wiki`, `— planner`, `— design`. An @mention does not notify anyone (it would mention the agent itself); the labels are the routing (section 6).

## 5. The roles

- **Michael** (`michaeldippold`): the director. Makes rulings, plays the builds, approves what needs a human (section 8, step 6), owns the repository settings, the secrets, and Fly. Answers questions left for him under the label `needs-michael`.
- **The technical lead** (a coding agent): reviews and merges every pull request into the game's `main`, and is the release manager: watches each deploy, decides hotfixes and reverts. Keeps `TODO.md`'s Status and the decisions log honest. Writes code too, through pull requests like anyone, reviewed by Michael or a second coding agent.
- **Coding agents:** build features and fixes on branches, one issue at a time, by the rules in `CLAUDE.md` (the multiplayer checklist, the specs).
- **The wiki agent:** keeps `cmz-wiki` true to the game's `main`, runs the census, adds bugs it finds to `docs/bugs.md`, and reviews every game pull request labelled `needs-wiki` for what the wiki must change.
- **The planning agent:** scopes work into `docs/` specs and turns them into issues; never merges code.
- **The design agent:** delivers art and its own docs on `art-docs`, through a pull request like anyone else (`docs/27` is the checklist the lead reviews it by).

## 6. Where work lives: issues, labels, milestones

**The game repository's issues are the one task tracker, for both repositories.** An issue about the wiki is filed in the game's tracker with the label `repo:wiki`; the wiki repository's own issues are only Michael's Verify stamps (`cmz-wiki/CLAUDE.md`).

An issue is one piece of work an agent can finish in one pull request: what, why (a link to the doc or ruling), what done looks like (the acceptance), and the guest's side if it touches the world. Big work (a spec like `docs/33`) becomes one issue per build step, linked from the spec.

**Labels** (proposed set; an agent creates them once `writeplaintext` can):

- **Type:** `bug`, `feature`, `docs`, `art`, `chore` (infrastructure, tooling), `hotfix`.
- **Area:** `area:combat`, `area:multiplayer`, `area:world`, `area:items`, `area:building`, `area:ui`, `area:server`, `area:wiki`.
- **Repo:** `repo:wiki` (the work is in `cmz-wiki`).
- **Who has it (the queues):** `agent:lead`, `agent:coder`, `agent:wiki`, `agent:planner`, `agent:design`. An issue or pull request carries exactly one of these: whose move it is.
- **Status:** `ready` (scoped, can be picked up), `in-progress`, `needs-review`, `changes-requested`, `approved`, `needs-michael` (blocked on a ruling or an approval), `needs-wiki` (a game pull request whose wiki update is not done), `needs-repro` (a bug not yet reproduced), `blocked` (waiting on another issue, named in it).

**Milestones** are the big items in `TODO.md`: "Big pass step 4: farming", "The map (docs/33)", "Talk (docs/34)", "Bugs from the census", and so on. A milestone's page on GitHub shows its open and closed issues, which is the progress bar `TODO.md` now keeps by hand.

**`docs/bugs.md` stays** for the wiki census's batches (the lead's habits for it hold: new lines under Open only, on the latest `main`; check Fixed and Closed first). When an agent picks a line up to fix, it opens an issue for it (label `bug`, linking the line), and the line moves to Fixed with the merged pull request.

## 7. Your queue (how an agent starts a session)

When Michael says "work your queue", or at the start of any session:

1. `git fetch origin`, and read `TODO.md`'s Status block and the newest entries at the top of `docs/02-decisions.md`.
2. Your open work: `gh issue list --label agent:<role> --state open` and `gh pr list --label agent:<role>` (the lead also `gh pr list --label needs-review`; the wiki agent also `gh pr list --label needs-wiki`).
3. **Pull requests first** (a review waiting, or changes requested on yours), then issues labelled `ready`, oldest first unless an issue says otherwise.
4. Anything you cannot decide goes to Michael: comment with the question and the options (a recommendation first), set `needs-michael`, and move on to the next thing. Michael's own queue is that label: [issues and pull requests needing Michael](https://github.com/michaeldippold/cozy-medieval-zombies/issues?q=is%3Aopen+label%3Aneeds-michael).

Nothing notifies an agent; every session starts by reading its queue. That is the whole of "no pasting".

## 8. The workflow: from an issue to `main`

### 1. Pick it up

Comment `Taking this. — <role>`, set `in-progress` and your `agent:` label. If the work has no issue, open one first (it is the record of why).

### 2. Branch

From the latest `origin/main`, never from another branch: `git fetch origin && git switch -c <role>/<issue>-<slug> origin/main`, for example `coder/57-farm-tilling`, `wiki/61-sync-fireball`, `lead/64-ci-checks`. One branch per issue. In a desktop-app session, your worktree's branch is your branch; name it this way when you start. **Never commit to `main` directly**, in either repository (the one exception: the wiki agent's routine syncs, section 9).

### 3. Build

By `CLAUDE.md`: the multiplayer checklist (every change works for a guest in the same commit), the spec's build order, small commits with plain messages in the house style. Keep the branch fresh: merge `origin/main` into it whenever `main` moves under you, and always before asking for review. Push the branch early (`git push -u origin <branch>`); a pushed branch is visible to the lead and safe from a lost session.

### 4. Prove it

Before review, the author runs and records: `node --check` on every touched module; `node tools/check.js`; `node tools/world.js` (and `--roundtrip` if the save or the world changed), with the hash; `python -I tools/validate-data.py`; the spec's acceptance and the relevant `check()`s in the pane; for anything a guest touches, the two-tab test with `check("sync")` and the bytes it added to a frame. **The wiki:** either a pull request in `cmz-wiki` updating the pages the change touches, or the label `needs-wiki` so the wiki agent does it, or, for a change no player can see, one line in the pull request saying so.

### 5. Open the pull request

`gh pr create --base main --title "<the change in plain words>" --body-file <file>` (or as a draft with `--draft` while it is still moving, for early comments). The body, from the template (`.github/pull_request_template.md`, to be added):

- **What and why**, with `Closes #<issue>` (GitHub closes the issue when the pull request merges).
- **How it was proved**: the commands above and their output, the checks' counts, screenshots or a short clip for anything you can see.
- **The guest's side**: the six points of `CLAUDE.md`'s multiplayer rule, each answered.
- **The wiki**: the `cmz-wiki` pull request's link, or `needs-wiki`, or "no player-visible change".
- **Risks**: the save format, `net.PROTOCOL`, the deploy, anything a merge would break for a friend mid-game.
- Signed `— <role>`, labelled `needs-review` and `agent:lead`.

### 6. Review

**This is how the discussion happens:** on the pull request, not in anyone's chat. The lead reads the diff (`gh pr view <n>`, `gh pr diff <n>`), checks it out in its own worktree (`gh pr checkout <n>`), runs the proofs itself, and plays it where the change can be seen. It comments on lines of the diff (in the browser, or `gh api repos/{owner}/{repo}/pulls/<n>/comments` for a comment on a line) and leaves one summary review (`gh pr review <n> --comment --body "..."`), ending in a verdict:

- `Approved. — lead`, with the label `approved`; or
- `Changes requested. — lead`, with `changes-requested` and the queue label back to the author's role. The author answers **each** comment (a fix in a new commit, or a reply saying why not), pushes, and puts `needs-review` back. **No force-pushing a branch once review has begun**: new commits only, so the review's history stays readable.

**What needs Michael's approval as well** (label `needs-michael`; he approves in the browser as `michaeldippold`, which is the one approval GitHub counts): a change to a ruling or anything `docs/00` decides; the save format, `net.PROTOCOL`, or anything that can break an existing world; the deploy, the server's storage, secrets, or the workflows; the rig's numbers and the drawing rules (`CLAUDE.md`, "Implementing from a spec", item 4); deleting a doc or a feature; anything the lead is unsure of. Everything else the lead approves alone.

When the lead writes code, a second coding agent or Michael reviews it the same way; nobody merges their own pull request into the game's `main` unreviewed.

### 7. Merge (the lead)

When the review is approved (and Michael's too where needed), the checks are green, the branch is fresh with `main`, and the wiki is done or labelled: the lead merges with a **merge commit** whose message is the house style's summary of what landed, as the log already reads ("Merge … reviewed: …"): `gh pr merge <n> --merge --delete-branch` once `writeplaintext` can, or by `git` until then. Then:

- **Watch the deploy:** `gh run watch` (or `gh run list --workflow deploy.yml`), and the relay's front page names the new build.
- The issue closes itself (`Closes #`); the lead ticks `TODO.md`, moves a fixed `docs/bugs.md` line to Fixed with the pull request, and logs any ruling in `docs/02`.
- If the wiki was labelled `needs-wiki`, the label stays on the merged pull request until the wiki agent's sync clears it.

### 8. When something goes wrong in production

- **Revert first, fix second.** A merge that breaks the game for players is undone at once with a revert pull request (`gh pr create` from `git revert -m 1 <merge commit>`, label `hotfix`), merged by the lead without waiting; the fix comes after, through the normal flow. **Never force-push `main`; never rewrite its history.**
- A **hotfix** (label `hotfix`) takes the normal path with the review kept short; the lead may merge its own hotfix with Michael told in the pull request.
- Fly keeps its previous releases (`fly releases`); rolling the server back by hand is Michael's call.

### 9. Releases and tags

`main` deploys continuously, so a tag is a bookmark, not a gate: when Michael plays a build with friends, or before a risky merge, the lead tags it (`git tag playtest-2026-10-15 && git push origin playtest-2026-10-15`, or later semantic versions `v0.4.0`) and writes a GitHub Release from the merged pull requests (`gh release create <tag> --generate-notes`). The wiki's Updates page names the tag it describes. When the game ships on Steam (`docs/35`), tags become the release line.

## 9. The wiki repository under the same process

- **Changes by anyone but the wiki agent** go through a pull request in `cmz-wiki`, reviewed by the wiki agent (it knows `WRITING.md` and the census).
- **The wiki agent's own routine syncs** (snapshot, census, pages corrected for what merged, an Updates entry) may be pushed to the wiki's `main` directly, because the wiki describes what already merged, its build fails loudly on anything wrong (`build.js --check` in its workflow), and a bad page is fixed in minutes. A larger wiki change (a new page kind, the generator, the templates) goes through a pull request the lead or Michael reads.
- **A game pull request and its wiki pull request** are linked both ways; the wiki one merges right after the game one (the wiki describes `main`, and its Sources name the merged commit).

## 10. Checks on every pull request (proposed CI)

To add (an agent, once approved): `.github/workflows/ci.yml` in the game, on every pull request and every push to a branch:

- `node --check` on every `.js` under `src/`, `server/`, and `tools/`;
- `node tools/check.js`;
- `node tools/world.js` and `node tools/world.js --roundtrip` (the hash printed for the reviewer to compare with the pull request's claim);
- `python -I tools/validate-data.py`.

The wiki's workflow already builds on every push; add `pull_request` to its triggers so a wiki pull request is built before it merges. The browser-only checks (`check("sync")` and the rest) stay the author's and the reviewer's to run in the pane: CI cannot open the game's window.

**Branch protection on `main`** (**Michael**, in each repository's Settings → Branches): require a pull request before merging, require the CI checks to pass, and block force-pushes and deletion. **Do not** require an approving review: agents cannot give one that counts (section 4), so it would block every agent merge; the lead's review and Michael's approval on `needs-michael` pull requests are the rule by practice. Michael keeps the admin's right to bypass for emergencies.

## 11. What changes in `CLAUDE.md` and the other process notes

A scan of the docs found the process spread across these, which this file replaces or points to once approved:

- `CLAUDE.md`, "Implementing from a spec", item 6: "pushes to `origin main`" becomes "opens a pull request (`github.md`, section 8)". Its testing and multiplayer rules stay where they are; this file links to them.
- `CLAUDE.md`, "Start here every session": a first item, "read `github.md`".
- `CLAUDE.md`, the wiki rule (the wiki is part of shipping): unchanged; section 8, step 4, is where it happens.
- `docs/27` (the design agent's worktree and `art-docs`): "Bring its work in: `git merge art-docs`" becomes a pull request from `art-docs` reviewed by the lead against `docs/27`'s checklist.
- `docs/31-multiplayer/08` (the rules every change follows): unchanged; the pull request template asks its six points.
- `docs/bugs.md`: unchanged; section 6 says how a line becomes an issue.
- The wiki's `CLAUDE.md`: its sync gains section 9's rule for pull requests.
- The long-lived branches (`engine-upgrade`, `claude/multiplayer-architecture-planning-0fde9c`, `claude/project-docs-review-fd625e`): merged and deleted, or each turned into a pull request, so `main` and short branches are all there is.

## 12. Setting it up, in order

1. **Michael:** approve this proposal (and say which of the bracketed options you want).
2. **Michael:** add `writeplaintext` as a collaborator with Write on both repositories, and give its token read and write on contents, issues, pull requests, and actions for both (or tell the agents to use another account). [Optionally store `writeplaintext` in Git Credential Manager for pushes.]
3. **An agent:** create the labels and milestones (`gh label create …`, `gh api … /milestones`), the pull request template, two issue templates (a task, a bug), and `ci.yml`; update `CLAUDE.md`, `docs/27`, and the wiki's `CLAUDE.md` as in section 11; open it all as one pull request for Michael.
4. **Michael:** branch protection on both `main`s (section 10); `PAGES_FROM_ACTIONS` set to `true` when the game's site should deploy from Actions.
5. **The planning agent:** turn `TODO.md`'s open work into issues under their milestones (the farming step, the map, talk, the open bugs), each with an `agent:` label and `ready` where it is scoped.
6. **Everyone:** from then on, "work your queue".

## 13. Questions for Michael

- **One agent account, or one per role?** One (`writeplaintext`) is enough with signed comments; separate accounts per role would let agents approve each other's pull requests for real, at the cost of a token per session.
- **Pushes as you or as the agent account?** [Agent account, so the history separates your commits from theirs.]
- **Who reviews the lead's own code?** [A second coding agent, or you for anything `needs-michael`.]
- **Issues for everything, or `docs/bugs.md` kept for the census?** [Kept, as section 6.]
- **The wiki agent's direct pushes for syncs** (section 9): allowed, or pull requests for everything?
