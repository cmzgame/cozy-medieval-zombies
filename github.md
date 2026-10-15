# github.md — the studio's infrastructure, and how work gets from an idea to `main`

**For any agent: START HERE, and before you change anything, ask Michael which role you hold.**

## 0. Your role: Primary or Secondary (ask first, every session)

Every session that works on either repository, the game or the wiki, **asks Michael at its start: "Am I Primary or Secondary, and what is my focus?"**, and changes nothing (no file, branch, commit, issue, label, or pull request) until he answers. Reading is fine before the answer. The answer holds for the whole session; if Michael changes it, the session follows.

- **Primary (exactly one at a time).** The studio's technical lead: reviews, approves, and merges every pull request into the game's `main`; watches each deploy; decides hotfixes and reverts; keeps `TODO.md`'s Status and `docs/02-decisions.md` honest. **The buck stops with Primary before it stops with Michael.** Primary still writes a lot of code, through pull requests like anyone. There is only ever one: if Michael names a new Primary, the old one becomes Secondary or stops.
- **Secondary (any number).** Each usually has a focus Michael names (bugs, the wiki, infrastructure, a feature, art), though it is not a fence. A Secondary works on branches and opens pull requests; **it never merges into the game's `main`.** It may review another Secondary's pull request with comments, and it reviews Primary's pull requests when Michael asks (section 4). The wiki work is a Secondary's, with one standing exception (section 9).

Then read the rest of this file for the infrastructure and the workflow, `CLAUDE.md` for the game's rules and code map, `TODO.md` for where work stands, and your queue (section 7).

**Status:** written 2026-10-15 at Michael's ask, his five answers folded in. It governs both repositories once the setup in section 12 is done; until then the agents follow it as far as the accounts allow (plain `git` for everything, pull requests opened in the browser by Michael or by `gh` once the accounts exist).

---

## 1. Why this exists

Michael directs several agents at once, and until now they talked through him: he pasted one session's message into another's. This moves every handoff onto GitHub, where it is written down, linked, and findable: **work is an issue, code is a pull request, review is comments and an approval on the pull request, and merging is Primary's.** Michael's message to any session becomes "work your queue". It is the shape a small game studio uses: trunk-based development (short branches off one always-playable `main`), every change through a reviewed pull request, automatic checks, every merge deployed.

## 2. The pieces

### The repositories

- **The game:** `michaeldippold/cozy-medieval-zombies`, checked out at `C:/Users/micha/Dev/cozy-medieval-zombies` (the main checkout; sessions work in worktrees under `.claude/worktrees/`, which the desktop app makes, one per session). Public.
- **The wiki:** `michaeldippold/cmz-wiki`, at `C:/Users/micha/Dev/cmz-wiki`; how it is kept is its own `CLAUDE.md`. Public; goes private when the game does.
- **The design agent's worktree:** `C:/Users/micha/Dev/cozy-medieval-zombies-art` on the branch `art-docs` (its tool cannot write under `.claude/`; `docs/27`).
- **On the infrastructure day** (`TODO.md`, "Before anything public"), both repositories move to the game's own GitHub organisation, private, and the agents' account (section 4) becomes a member of it.

### What `main` is

**A merge to `main` deploys to players.** `.github/workflows/deploy.yml` runs on every push to `main`: it deploys the relay and the server worlds to Fly (`flyctl deploy`, the app `cmz-relay`, stamped with the commit as the build id) and publishes the site to GitHub Pages stamped the same (`PAGES_FROM_ACTIONS` is on since 2026-10-15). A server world refuses a page of another build ("The game was updated"), and the wire refuses another `net.PROTOCOL`. So **`main` is always playable**: nothing half-done, nothing that breaks a friend's world, ever lands there. Friends play it the moment it merges.

### The environments

- **Local:** `python serve.py 8010` serves the game with no build step (the app's preview calls it `medieval`; `medieval-second` on 8011); `node server/relay.js 8012` a local relay (`relay`); `node C:/Users/micha/Dev/cmz-wiki/serve.js` the built wiki on 8020 (`wiki`). Two-tab multiplayer tests use `?nosave&relay=none` (`CLAUDE.md`, testing).
- **Production:** the site on GitHub Pages; the relay and the server worlds on Fly (`wss://cmz-relay.fly.dev`, region `ord`, one 512 MB shared machine that stops when idle and wakes on a join); the wiki on its own Pages site (`michaeldippold.github.io/cmz-wiki`).

### Storage

- **A world played in a browser** lives in that browser: the records in IndexedDB (database `cmz`, store `worlds`), the index, identities, and settings in localStorage (`src/save.js`, `src/identities.js`, `src/settings.js`). Clearing site data loses it. A save keeps each chunk's saved form, so it costs what changed.
- **A server world** lives on Fly's volume `cmz_data` at `/data`: `/data/worlds/<id>/save.json.gz`, with `rolling/` (a copy at most every ten minutes, three kept), `daily/` (seven kept), and a `crash-<time>.json.gz` beside the last good save if the process threw; Fly snapshots the whole volume daily, kept seven days. The relay runs one Node process per world (`server/world.js`), holds it when it empties, and stops it after a spell empty and saved.
- **Secrets:** `FLY_API_TOKEN` is a GitHub repository secret (a deploy token for `cmz-relay`); `CREATOR_KEY` is a Fly secret. Neither is in any file. **Only Michael adds or changes a secret, a repository setting, or anything on Fly.**

### Build tools

None. Plain HTML, CSS, and JavaScript with ES modules; `package.json` exists only for Fly's Node image; the relay, the server, and the wiki's generator have no dependencies. **If a build step is ever added, this section names it, the command that runs it, and what CI checks.** The only stamping today is the build id (`src/build.js`, written by the deploy).

## 3. The tools on the machine

Every session runs on Michael's Windows machine with **git** 2.38, **gh** 2.100 (the GitHub command line), **node** 22 with **npm** 10, **python** 3.13, **flyctl** 0.4 (`fly`), and **docker** 28, in Git Bash or PowerShell 5.1.

The project's commands (details in `CLAUDE.md`, "Testing"): `node --check <file>` on every touched module; `node tools/check.js` (the headless checks); `node tools/world.js` (the whole world under Node and its determinism hash; `--roundtrip` proves the save); `python -I tools/validate-data.py`; `await __game.check("<name>")` in the browser pane (sync, players, save, worlds, craft, wear, sleep, water, and the rest under `tools/checks/`); `python -I tools/mapgen/valley.py` regenerates the valley. For the wiki: `node sync.js`, `node census/census.js`, `node build.js --check` in `cmz-wiki`.

`fly` is for reading (logs, status, releases) with Michael's say; deploying is the workflow's job, never a session's by hand.

## 4. Who is who on GitHub

**Two GitHub accounts, one per side of a review, and no other.** GitHub never lets a pull request's author approve it, so the two roles use two accounts and every approval counts:

- **Michael's account, `michaeldippold`:** Michael himself in the browser, and **Primary** in its sessions. Primary's approval of a Secondary's pull request is a real GitHub approval.
- **The agents' account** (a new account for this game alone, named on the setup day, for example `cmz-studio-bot`; written `<bot>` below): **every Secondary** in its sessions. A Secondary's pull request is authored by `<bot>`, so Primary can approve it; Primary's own pull request is authored by `michaeldippold`, so a Secondary (as `<bot>`) can approve it.
- **No other account touches these repositories.** In particular `writeplaintext`, which is logged in to `gh` on this machine for other work, is never used for this game (Michael, 2026-10-15: the businesses may part ways, and neither belongs in the other's history).

**How a session acts as its account:** both accounts are logged in to `gh` once (`gh auth login`, section 12), with `michaeldippold` active. **Primary** uses `gh` as it is. **A Secondary** runs every `gh` command with the bot's token in the environment for that one command, never printed or written anywhere: `GH_TOKEN="$(gh auth token --user <bot>)" gh pr create …` in Git Bash (`$env:GH_TOKEN = gh auth token --user <bot>; gh …; Remove-Item Env:GH_TOKEN` in PowerShell). **Never** run `gh auth switch`: it changes the account for every session on the machine. Check before writing: `gh api user --jq .login` (with the token for a Secondary) must print your role's account.

**Pushes:** plain `git` over HTTPS, through Git Credential Manager, which pushes as `michaeldippold` for every session today. A pull request's author is whoever opens it in `gh`, not whoever pushed the branch, so the approval rule works either way. [Optional: a Secondary pushes as `<bot>` with `git -c credential.username=<bot> push`, once the bot's credential is stored, so the history also separates the agents' pushes from Michael's.]

**Every agent signs what it writes on GitHub** (a pull request's body, a comment, a review, an issue) with a last line naming its role and focus, `— Primary`, `— Secondary (wiki)`, `— Secondary (farming)`, because two people share each account (Michael and Primary share his; the Secondaries share the bot). An @mention notifies no one useful; labels are the routing (section 6).

**The wiki's Verify button** stamps a page when an issue is opened by the wiki repository's owner. Primary's `gh` is that owner, so it is a rule, not a lock: **no agent ever opens a Verify issue.** Verifying is Michael's word that he checked a page.

## 5. The roles in practice

- **Michael:** rulings, playtests, approvals on anything labelled `needs-michael` (section 8), the settings, the secrets, Fly. His own queue is the label `needs-michael`.
- **Primary:** section 0; reviews every pull request into the game's `main`, approves and merges it, watches the deploy; the release manager.
- **Secondaries, by focus:** feature work and fixes by the rules in `CLAUDE.md`; bugs (reproducing `docs/bugs.md`'s entries into issues, then fixing them); the wiki (`cmz-wiki/CLAUDE.md`); infrastructure (this file, the workflows, CI); planning (scoping into `docs/` specs and issues); art (the design agent on `art-docs`, its pull requests reviewed by Primary against `docs/27`).

## 6. Where work lives: issues, labels, milestones, `docs/bugs.md`

**The game repository's issues are the one task tracker, for both repositories.** An issue about the wiki carries `repo:wiki`; the wiki repository's own issues are only Michael's Verify stamps.

An issue is one piece of work a session can finish in one pull request: what, why (a link to the doc or ruling), what done looks like, and the guest's side if it touches the world. Big work (a spec like `docs/33`) becomes one issue per build step, linked from the spec.

**`docs/bugs.md` is the holding place for unverified bugs** (Michael, 2026-10-15): anything a session suspects but has not reproduced goes there, under Open, as a new line on the latest `main` (check Fixed and Closed first, so nothing closed comes back). It is gone through now and then: **once a bug is reproduced, the one who reproduced it opens an issue** (label `bug`, the steps to see it, linking the line) and moves the line to the file's "Became issues" section with the issue's number. A line that will not reproduce, or is intended, moves to Closed with a word why. Only reproduced bugs are worked as issues.

**Labels** (created at setup):

- **Type:** `bug`, `feature`, `docs`, `art`, `chore` (infrastructure, tooling), `hotfix`.
- **Area:** `area:combat`, `area:multiplayer`, `area:world`, `area:items`, `area:building`, `area:ui`, `area:server`, `area:wiki`.
- **Repo:** `repo:wiki` (the work is in `cmz-wiki`).
- **Whose move it is:** `for:primary`, `for:secondary` (any free Secondary may take it, by its focus), `for:michael` is `needs-michael` below.
- **Status:** `ready` (scoped, can be picked up), `in-progress`, `needs-review`, `changes-requested`, `needs-michael` (blocked on a ruling or an approval), `needs-wiki` (a merged or merging game change whose wiki update is not done), `blocked` (waiting on another issue, named in it).

**Milestones** are the big items in `TODO.md`: "Big pass step 4: farming", "The map (docs/33)", "Talk (docs/34)", "Bugs", and so on; a milestone's page shows its progress.

## 7. Your queue (how a session starts, after its role)

When Michael says "work your queue", or at the start of any session once the role is confirmed:

1. `git fetch origin`; read `TODO.md`'s Status block and the newest entries at the top of `docs/02-decisions.md`.
2. **Primary:** `gh pr list --label needs-review` (pull requests waiting for review), then `gh issue list --label for:primary`, then the open deploy runs (`gh run list --workflow deploy.yml --limit 5`).
3. **A Secondary:** your own open pull requests first (`gh pr list --author <bot>`: a review may be waiting with changes requested), then `gh issue list --label for:secondary --label ready` filtered to your focus (add `--label area:…`), oldest first. The wiki Secondary also `gh pr list --label needs-wiki`.
4. Anything you cannot decide goes to Michael: a comment with the question and the options (a recommendation first), the label `needs-michael`, and on to the next thing. Michael's queue: [open items needing Michael](https://github.com/michaeldippold/cozy-medieval-zombies/issues?q=is%3Aopen+label%3Aneeds-michael).

Nothing notifies a session; every session starts by reading its queue. That is the whole of "no pasting".

## 8. The workflow: from an issue to `main`

### 1. Pick it up

Comment `Taking this. — <role>`, set `in-progress`. Work with no issue gets one first (it is the record of why).

### 2. Branch

From the latest `origin/main`, never from another branch: `git fetch origin && git switch -c <role>/<issue>-<slug> origin/main`, for example `secondary/57-farm-tilling`, `secondary/61-wiki-fireball`, `primary/64-ci-checks`. One branch per issue. **Nobody commits to the game's `main` directly**; Primary changes it only by merging a reviewed pull request.

### 3. Build

By `CLAUDE.md`: the multiplayer checklist (every change works for a guest in the same commit), the spec's build order, small commits with plain messages in the house style. Keep the branch fresh: merge `origin/main` into it whenever `main` moves, and always before asking for review. Push early (`git push -u origin <branch>`): a pushed branch is visible to Primary and safe from a lost session.

### 4. Prove it

Before review, the author runs and records: `node --check` on every touched module; `node tools/check.js`; `node tools/world.js` (and `--roundtrip` if the save or the world changed), with the hash; `python -I tools/validate-data.py`; the spec's acceptance and the relevant `check()`s in the pane; for anything a guest touches, the two-tab test with `check("sync")` and the bytes it added to a frame. **The wiki** (`CLAUDE.md`, the wiki is part of shipping): a pull request in `cmz-wiki` for the pages the change touches, or the label `needs-wiki` so the wiki Secondary does it, or, for a change no player can see, one line saying so.

### 5. Open the pull request

`gh pr create --base main --title "<the change in plain words>" --body-file <file>` (a Secondary with the bot's token, section 4), or `--draft` while it is still moving, for early comments. The body, from `.github/pull_request_template.md` (added at setup):

- **What and why**, with `Closes #<issue>` (GitHub closes the issue when the pull request merges).
- **How it was proved**: the commands and their output, the checks' counts, screenshots or a short clip for anything visible.
- **The guest's side**: the six points of `CLAUDE.md`'s multiplayer rule, each answered.
- **The wiki**: the `cmz-wiki` pull request, or `needs-wiki`, or "no player-visible change".
- **Risks**: the save format, `net.PROTOCOL`, the deploy, anything a merge would break for a friend mid-game.
- Signed; labelled `needs-review` and `for:primary`.

### 6. Review

**The discussion happens on the pull request**, never in a chat. The reviewer reads the diff (`gh pr view <n>`, `gh pr diff <n>`), checks it out in its own worktree (`gh pr checkout <n>`), runs the proofs itself, and plays it where the change can be seen. It comments on lines of the diff (in the browser, or `gh api repos/{owner}/{repo}/pulls/<n>/comments` for a line) and ends with one review:

- `gh pr review <n> --approve --body "…  — Primary"`: a real approval; or
- `gh pr review <n> --request-changes --body "…  — Primary"`: the author answers **each** comment (a fix in a new commit, or a reply saying why not), pushes, and asks again with `needs-review`. **No force-pushing a branch once review has begun**: new commits only, so the review's history stays readable.

**Who reviews whom:** Primary reviews every Secondary's pull request. **Primary's own pull requests** are reviewed and approved by a Secondary Michael names for it (as `<bot>`), or by Michael in the browser for anything `needs-michael` (Michael cannot approve a pull request his own account opened, so for those he comments "Approved. — Michael" and Primary merges on it). A Secondary may comment on another Secondary's pull request; only Primary's approval sends a Secondary's work to `main`.

**What needs Michael too** (label `needs-michael`; Primary does not merge without his word in the pull request): a change to a ruling or anything `docs/00` decides; the save format, `net.PROTOCOL`, or anything that can break an existing world; the deploy, the server's storage, secrets, or the workflows; the rig's numbers and the drawing rules (`CLAUDE.md`, "Implementing from a spec", item 4); deleting a doc or a feature; anything Primary is unsure of.

### 7. Merge (Primary)

When the review is approved (and Michael's word given where needed), the checks are green, the branch is fresh with `main`, and the wiki is done or labelled: Primary merges with a **merge commit** whose message is the house style's summary of what landed, as the log already reads ("Merge … reviewed: …"): `gh pr merge <n> --merge --delete-branch --subject "…" --body "…"`. Then:

- **Watch the deploy:** `gh run watch` (or `gh run list --workflow deploy.yml`); the relay's front page names the new build.
- The issue closes itself (`Closes #`); Primary ticks `TODO.md`, logs any ruling in `docs/02`, and moves a fixed `docs/bugs.md` line where it belongs.
- `needs-wiki` stays on the merged pull request until the wiki Secondary's sync clears it.

### 8. When something goes wrong in production

- **Revert first, fix second.** A merge that breaks the game for players is undone at once with a revert pull request (`git revert -m 1 <merge commit>` on a branch, label `hotfix`), merged by Primary without waiting for the usual review; the fix comes after, through the normal flow. **Never force-push `main`; never rewrite its history.**
- A **hotfix** takes the normal path with the review kept short; Primary may merge its own hotfix with Michael told in the pull request.
- Fly keeps its previous releases (`fly releases`); rolling the server back by hand is Michael's call.

### 9. Releases and tags

`main` deploys continuously, so a tag is a bookmark: when Michael plays a build with friends, or before a risky merge, Primary tags it (`git tag playtest-2026-10-15 && git push origin playtest-2026-10-15`, later semantic versions such as `v0.4.0`) and writes a release from the merged pull requests (`gh release create <tag> --generate-notes`). The wiki's Updates page names the tag it describes. When the game ships on Steam (`docs/35`), tags become the release line.

## 9. The wiki repository under the same process

- **Changes by anyone but the wiki Secondary** go through a pull request in `cmz-wiki`, reviewed by the wiki Secondary (it knows `WRITING.md` and the census) and merged by it.
- **The wiki Secondary's routine syncs** (snapshot, census, pages corrected for what merged, an Updates entry) are pushed to the wiki's `main` directly (Michael, 2026-10-15): the wiki describes what already merged, its build fails loudly on anything wrong, and a bad page is fixed in minutes. Larger wiki changes (a new page kind, the generator, the templates) go through a pull request Primary or Michael reads.
- **A game pull request and its wiki pull request** are linked both ways; the wiki one merges right after the game one (the wiki describes `main`, and its Sources name the merged commit).

## 10. Checks and protection

**CI on every pull request** (to add at setup): `.github/workflows/ci.yml` in the game, on pull requests and pushes to branches: `node --check` on every `.js` under `src/`, `server/`, and `tools/`; `node tools/check.js`; `node tools/world.js` and `--roundtrip` (the hash printed for the reviewer to compare with the pull request's claim); `python -I tools/validate-data.py`. The wiki's workflow already builds on every push; add `pull_request` to its triggers. The browser-only checks (`check("sync")` and the rest) stay the author's and the reviewer's in the pane: CI cannot open the game's window.

**Branch protection on the game's `main`** (Michael, Settings → Branches): require a pull request, **require one approving review** (now possible, since the two roles are two accounts), require the CI checks to pass, require the branch to be up to date, block force-pushes and deletion. Michael keeps the admin's bypass for emergencies (a revert when no reviewer is free). On the wiki's `main`: block force-pushes and deletion only, so the wiki Secondary's syncs still push (section 9).

## 11. What changed in the other process notes

- `CLAUDE.md`: "Start here" now opens with the role question and this file; "Implementing from a spec", item 6, opens a pull request instead of pushing to `main`; the testing and multiplayer rules stay where they are and this file links to them.
- `docs/bugs.md`: the holding place for unverified bugs; reproduced ones become issues (section 6).
- `docs/27` (the design agent's `art-docs`): its work comes in as a pull request from `art-docs`, reviewed by Primary against `docs/27`'s checklist, instead of a direct `git merge`.
- `docs/31-multiplayer/08` (the rules every change follows): unchanged; the pull request template asks its six points.
- The wiki's `CLAUDE.md`: the role question at its top, and section 9's rule.
- The long-lived branches (`engine-upgrade`, `claude/multiplayer-architecture-planning-0fde9c`, `claude/project-docs-review-fd625e`): merged and deleted, or turned into pull requests, so `main` and short branches are all there is.

## 12. Setting it up, in order

1. **Michael:** create the agents' account for this game alone (its own email, ideally the game's, so it moves with the game on the infrastructure day), and add it as a collaborator with **Write** on both repositories.
2. **Michael, at the machine:** `gh auth login` as `michaeldippold` and again as the bot (both stay logged in; `michaeldippold` active); [optionally sign the bot in to Git Credential Manager too]. Leave `writeplaintext` alone or log it out of `gh` (`gh auth logout --user writeplaintext`); this game never uses it.
3. **A Secondary (infrastructure):** create the labels and milestones; add `.github/pull_request_template.md`, two issue templates (a task, a reproduced bug), and `.github/workflows/ci.yml`; add `pull_request` to the wiki's workflow; open them as pull requests for Primary.
4. **Michael:** branch protection on both repositories (section 10).
5. **A Secondary (planning):** turn `TODO.md`'s open work into issues under their milestones, each with `for:primary` or `for:secondary` and `ready` where it is scoped.
6. **Everyone:** from then on, the role question, then "work your queue".

## 13. Decided (Michael, 2026-10-15)

1. **Accounts:** a new bot account for the agents; Michael's account for Michael and Primary; never `writeplaintext`.
2. **Pushes:** plain `git`, as today [the bot's credential for Secondaries' pushes optional].
3. **Roles:** Primary (one, reviews and merges, codes too) and Secondary (many, a focus each), confirmed with Michael at the start of every session before anything is changed.
4. **`docs/bugs.md`:** the holding place for unverified bugs, gone through now and then; a reproduced bug becomes an issue.
5. **The wiki Secondary's syncs:** pushed to the wiki's `main` directly; larger wiki changes by pull request.
