# Uno Club Tournament Director — v0.2.3

A separate first working tournament app. This is independent of the Uno Club Sign-Up, Shopping and informational apps.

## Running and publishing

This repository contains the tournament app source and prebuilt website files. Supabase continues to store shared tournament data.

- Install/build: `npm ci`, `npm test`, `npm run build`.
- The build updates root `index.html`, `app.js`, and `styles.css`, as well as ignored `dist/` output.
- GitHub Pages: in repository Settings → Pages, choose **Deploy from a branch**, **main**, **/ (root)**, then Save. The site address is displayed in that settings page after deployment.
- Commit the source and updated root website files together after each change. No dependency install is needed to serve the committed website files.
- The `.nojekyll` file tells Pages to serve these static files directly.
- Navigation, assets and the clock window use relative paths so this works from a GitHub repository subdirectory.

The home screen has Tournament Setup, Player Database, Tournament Registration, Tournament Management and Open Clock Display. Open Clock Display requests a separate browser window, which can be moved to an extended HDMI display. Phone and desktop use responsive management screens.

## Two data modes

- **Practice:** data is stored in localStorage in that browser and does not sync between devices. The home screen starts empty until players are registered.
- **Cloud:** sign in with the same Supabase data account on each device. This data account is separate from Supabase dashboard access. Accounts are created by the user through the explicit Create Data Account form; confirmation emails may be required. No player roster has been imported from another app. Cloud mode starts without player/tournament data and does not automatically import practice records.

The GitHub repository is public. The application uses Supabase Auth and row security to protect tournament data. Practice mode is browser-local. The publishable key in `src/config.mjs` is intentionally browser-safe. No privileged key or password is in the source. Supabase project: Tournament Director (`jtoeihxodhejqukezwpb`). It was restored from INACTIVE and the new `td_workspaces` table and RPCs were applied via the `tournament_director_base` migration. Existing projects were not modified.

## Persistence and concurrency

This first release saves one JSON document per organizer. That keeps an elimination, finishing position, payment, and clock change atomic across the base application. The database RPC uses an expected-version predicate; stale writes are rejected instead of silently overwriting another device. Realtime notifications and 2.5-second polling refresh the state. Clients reload after a conflict and require another explicit action. There are no background writes. The server-time RPC calibrates the monotonic browser clock.

Document storage is an initial implementation choice, not the earlier relational foundation ZIP being deployed unchanged. Data shape is versioned at schemaVersion 1; the database caps a workspace at 2 MB. A later relational migration should preserve stable player and tournament IDs when history grows. No secrets or production player data belong in test fixtures.

## Tournament behavior

- Multiple editable templates; each tournament copies its selected template. Existing tournaments are not changed by later template edits.
- Sample structure transcribed from the supplied photos: 28 playing rounds of 15 minutes; breaks of 5, 10 and 15 minutes after rounds 8, 16 and 24; chip-up reminders on the first two breaks. Ante values begin at playing round 7, but the sample defaults to Antes Off because the user requested optional antes. Big-blind and per-player modes are available.
- Buy-in is the full price paid, with an included dealer toke. Current sample defaults: $50 buy-in including a $10 dealer toke, 5,000 chips; $25 rebuy with no dealer toke and 5,000 chips through round 6; $90 add-on with 20,000 chips, initially disabled; 20% house percentage; payout 65/35. The house percentage applies to the paid entry money left after buy-in dealer tokes, plus paid rebuys and enabled add-ons. It is calculated once over the aggregate, rounded to the nearest cent, and snapshotted at finalization. Running prize estimates reserve that fee. An optional house contribution is added after that calculation.
- For example, 10 $50 buy-ins and four $25 rebuys collect $600. Dealer tokes are $100, the house base is $500, the house fee is $100, and prizes total $400. No dealer toke is charged on rebuys. Unpaid amounts are excluded and displayed separately. Percent payout rounding remainder goes to first place. Fixed payouts cannot exceed the paid pool when finalizing results.
- Each player has one registration per tournament. Rebuys are for players still active, with a cutoff and optional cap. One add-on per player. True re-entry is not implemented.
- Eliminations assign finishing position and support last-in-first-out undo. The number of required tables is calculated from remaining players and seats per table, rounded up. There is no fixed table-count setting. Existing occupied tables stay available until the organizer moves their players; Shuffle & Seat consolidates to the calculated count. Confirm Winner & Finish requires exactly one player left, snapshots actual prizes and financial settlement, and locks results. Stats include completed tournaments only.
- Clock starts from the actual Start action, preserves exact remaining time when paused, and derives subsequent levels from the saved deadline without per-second database writes. By default, entering/leaving a break pauses at the boundary until resumed. Auto-run through breaks can be selected. Refresh derives the correct current state. Network loss leaves the locally loaded clock running and blocks remote writes. Reliable control still needs connectivity, and computer sleep stops visible rendering until wake/recovery.

## Validation

- Node scenario tests cover delayed starts, pause/resume, catch-up, break boundaries, last level, template isolation, optional antes, payments, payouts, eliminations, undo, seating, completion and stable player identities.
- jsdom scenarios exercise home visibility, player add/edit/duplicate checks, phone persistence, permanent IDs, registration, separate clock-window requests, clock start, automatic pre/post-rebuy layout transitions and cross-window practice updates. Auth is stubbed; these tests do not prove hosted sign-in or Realtime delivery.
- `backend/verify-rls.sql` passed against hosted Supabase. It runs inside a rolled-back transaction and tests create/update, stale revisions, owner reassignment, cross-user reads/writes and anonymous denial. Security Advisor returned no lints.
- Rendered browser QA was blocked by browser access restrictions. Real-device sign-in, email confirmation, cross-device delivery, pop-up/fullscreen behavior, visual layout on Windows/TV and iPhone, and alert audio still require a practice run.

## v0.1.2 compatibility

Older saved templates/tournaments are normalized on read without background cloud writes. Existing recorded payment totals and completed settlement totals are preserved. Unmodified starter template pricing becomes the requested $50/$10 default for future tournaments; existing event payments keep their recorded amounts. The corrected financial rules apply to open tournaments. The database document schema remains version 1 with financeVersion 2 inside settings, so no table/policy migration is needed.

## Next iterations

Adjust layout after feedback; confirm club login/staff access preferences; optional shared player database integration; payment undo and corrected results; late-registration/re-entry rules; stronger data audit history; full tournament structures for other games; exports and long-term history scaling. These are future work, not hidden working buttons in this version.


## GitHub migration — v0.1.2

Copied from the working v0.1.1 source at the user’s request. The previous hosted copy remains available until the user switches to the GitHub Pages address. This repository is the source to use for future GitHub edits. No `.openai/hosting.json`, runtime data, passwords, private API keys or Site publishing credentials were copied. The browser publishable key is intentionally included and is protected by database RLS. Local practice data from the old website address does not automatically move to a different website address. Shared data remains in the same Supabase project and uses the same data account.

## v0.2.0 approved screens

- The home page uses the approved dark navy and gold five-button layout. It has no greeting and no tournament summary for empty drafts. Current Tournament appears after the first registration (or clock start), remains for an active event, and hides when completed. Saved structures and empty tournament drafts do not trigger it.
- The player database is separate from tournament registration. Records have an immutable UUID, unique name, optional phone (up to 40 characters), notes, archived flag and completed tournament history. Search covers names, IDs and phones. Renames preserve the UUID and all existing tournament references. Names ignore capitalization and repeated/leading/trailing whitespace. Archived names remain reserved. No shared-name bypass exists.
- Cloud uniqueness and player reference checks run in the database trigger defined in `backend/player-integrity.sql`, alongside existing owner RLS and expected-version saves. This file must be applied after `backend/schema.sql` for a fresh installation. `backend/verify-player-data.sql` verifies database behavior in a rolled-back transaction. The trigger was applied to the existing Tournament Director project; no test records were retained.
- The TV clock before rebuys close shows players remaining and static **Rebuys Open / Through Level N**. It hides rebuy counts, add-ons, prize pool and payouts. After the cutoff it shows players remaining, a smaller rebuy total underneath, prize pool and payouts. It changes at the clock boundary without requiring a save or reload, including when the browser catches up after being inactive. Disabled rebuys use the post-rebuy layout. A break immediately after the last rebuy level remains open for rebuys; prizes appear when the next playing round begins.
- Existing setup, registration and management functions are retained for the next design iterations. No other Uno Club app or roster was changed.

## v0.2.1 structure and cutoff changes

- Cutoff labels read **Last round before rebuys end** and **Last round before add-on ends**. The immediately following break, if present, is included for both. Cutoffs do not extend to breaks later in the schedule.
- On the final rebuy playing round, the TV sidebar says **Final Rebuy Round** in red, with **Rebuys remain open during the following break** when applicable. During that break it says **Rebuys Open / Rebuys close when this break ends**. Earlier rounds say **Through Level N / Includes the following break** if applicable. All phases update on timer ticks, including catch-up after an inactive tab; prizes stay hidden until closure.
- Break duration inputs have minimum 1 and step 1 minute, and saving rejects fractional break lengths. Existing running clocks are not silently rounded.
- **Game for all playing levels / Copy game to all levels** applies the entered game to playing rows only. Individual rows can still differ for mixed tournaments. Save the structure to retain the copied names. New playing rows inherit the most recent playing row's game.
- Automated coverage includes payment acceptance during the break and rejection afterward for both purchase types, paused and automatically advancing break boundaries, no-break cutoffs, final-round and break clock messages, timer-only display transitions, whole-minute spinner behavior/validation and common-game copying with mixed-game edits preserved.

## v0.2.2 saved structure cards

Saved structures use a compact two-column grid capped at 760px, with tighter spacing and two-by-two action buttons. Regular phone widths also show two cards across; screens narrower than 360px use one column for readability. Card titles retain their 20px type size. Structure values and actions are preserved.

## v0.2.3 starting chips entry

Starting chips is a typed numeric-keyboard text field without spinner arrows. It displays comma-separated thousands on load and while typing or pasting, retaining the caret during edits. Settings save the underlying whole number, including after level-editor actions. Invalid, fractional, zero and unsafe integer values are rejected.
