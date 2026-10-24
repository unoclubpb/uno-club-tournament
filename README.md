# Uno Club Tournament Director — v0.3.24

A separate first working tournament app. This is independent of the Uno Club Sign-Up, Shopping and informational apps.

## Running and publishing

This repository contains the tournament app source and prebuilt website files. Supabase continues to store shared tournament data.

- Install/build: `npm ci`, `npm test`, `npm run build`.
- The build updates root `index.html`, `app.js`, and `styles.css`, as well as ignored `dist/` output.
- GitHub Pages: in repository Settings → Pages, choose **Deploy from a branch**, **main**, **/ (root)**, then Save. The site address is displayed in that settings page after deployment.
- Commit the source and updated root website files together after each change. No dependency install is needed to serve the committed website files.
- The `.nojekyll` file tells Pages to serve these static files directly.
- Navigation, assets and the clock window use relative paths so this works from a GitHub repository subdirectory.

The home screen has Tournament Setup, Player Database, Tournament Registration, Tournament Management, Tournament Remote and Open Clock Display. Open Clock Display requests a separate browser window, which can be moved to an extended HDMI display. Phone and desktop use responsive management screens.

## Account access and storage

The app requires a Tournament Director account. Create an account on the opening screen, confirm the email if prompted, and sign in with the same account on the computer and phone. Existing Supabase dashboard access is separate from this app account. The app keeps the signed-in session between visits through Supabase Auth. There is no practice mode or browser-only editing. All changes use authenticated Supabase saves; failed saves retain the previous state and report an error. Signing out clears the displayed workspace and returns to sign-in.

Existing browser records from earlier versions are read only for transfer. On the first sign-in to an empty account, the complete browser document is saved online with its original internal IDs, tournament references, structures, payments and history. The original browser backup is retained. If the account already contains data, a **Bring over saved data** action merges new records without replacing existing ones, assigns unused visible numbers to incoming players, and rejects conflicting names or differing versions before saving anything. A successful transfer is marked on that browser so it does not repeat. No roster is imported from other Uno Club apps.

The GitHub repository is public. The browser publishable key in `src/config.mjs` is intentionally browser-safe; no privileged key or password is in the source. Supabase project: Tournament Director (`jtoeihxodhejqukezwpb`). Owner row security and atomic expected-version saves protect each account.

## Persistence and concurrency

This first release saves one JSON document per organizer. That keeps an elimination, finishing position, payment, and clock change atomic across the base application. The database RPC uses an expected-version predicate; stale writes are rejected instead of silently overwriting another device. Realtime notifications and 2.5-second polling refresh the state. Clients reload after a conflict and require another explicit action. There are no background writes. The server-time RPC calibrates the monotonic browser clock.

Document storage is an initial implementation choice, not the earlier relational foundation ZIP being deployed unchanged. Data shape is versioned at schemaVersion 1; the database caps a workspace at 2 MB. A later relational migration should preserve stable player and tournament IDs when history grows. No secrets or production player data belong in test fixtures.

## Tournament behavior

- Multiple editable templates; each tournament copies its selected template. Existing tournaments are not changed by later template edits.
- Sample structure transcribed from the supplied photos: 28 playing rounds of 15 minutes; breaks of 5, 10 and 15 minutes after rounds 8, 16 and 24; chip-up reminders on the first two breaks. Ante values begin at playing round 7, but the sample defaults to Antes Off because the user requested optional antes. Big-blind and per-player modes are available.
- Buy-in is the full price paid, with an included dealer toke. Sample defaults: $50 buy-in including $10 dealer toke, 5,000 chips; $25 rebuy with no dealer toke; optional add-on; 20% configured tournament fee; 65/35 payouts. The fee applies only to net initial entries after dealer tokes, rounded to the nearest whole dollar. Rebuys, add-ons and house contributions do not attract this fee.
- Ten $50 buy-ins and four $25 rebuys collect $600: net entries $400, dealer tokes $100, rebuy revenue $100, tournament fee $80, dealer payout $100 and prize pool $420. The summary shows dealer collection and payment separately. Add-on revenue gets its own ledger line when applicable. All displayed amounts and newly configured money use whole dollars. Percentage and ICM odd dollars go to lower positions first; fixed payouts must exactly balance when saved or finalized.
- Payouts supports a configurable first-place guarantee amount and registered-player threshold, saved with each structure and copied to its tournaments. Existing structures retain the $1,000-at-10 defaults. The option can be selected before registration; below the configured count it pays two places at 65/35. At the threshold it guarantees the entered minimum, switching automatically to 65/35 when that pays more. Required guarantee funding is explicitly included as additional house contribution, recalculated while open and snapshotted on completion.
- Each player has one registration per tournament. Rebuys are recorded as an editable tournament total, starting at zero, rather than attached to players. The Management Rebuy button becomes available when the break immediately following the final rebuy level begins; without that break, it becomes available after the final rebuy level. It stays available until the tournament is completed. Saving replaces the previous count. Add-ons remain limited to one per player. True re-entry is not implemented.
- Eliminations assign finishing position and support last-in-first-out undo. The number of required tables is calculated from remaining players and seats per table, rounded up. There is no fixed table-count setting. Existing occupied tables remain visible until explicitly combined. Seat Players assigns only unseated players; Combine Tables closes higher-numbered tables without moving people already at surviving tables. The final table offers keeping seats or redrawing unlocked players. Confirm Winner & Finish requires exactly one player left, snapshots actual prizes and financial settlement, and locks results. Player stats include completed tournament counts, wins and finishing history only. Individual costs and net results are not tracked. Accepted ICM agreements save the participating player IDs, final chip counts and agreed payouts, retain previous eliminations, stop the clock and mark completion by ICM chop. No point system is implemented.
- Clock starts from the actual Start action, preserves exact remaining time when paused, and derives subsequent levels from the saved deadline without per-second database writes. By default, entering/leaving a break pauses at the boundary until resumed. Auto-run through breaks can be selected. Refresh derives the correct current state. Network loss leaves the locally loaded clock running and blocks remote writes. Reliable control still needs connectivity, and computer sleep stops visible rendering until wake/recovery.

## Validation

- Node scenario tests cover delayed starts, pause/resume, catch-up, break boundaries, last level, template isolation, optional antes, payments, payouts, eliminations, undo, seating, completion and stable player identities.
- jsdom scenarios exercise home visibility, player add/edit/duplicate checks, phone persistence, permanent IDs, registration, separate clock-window requests, clock start, automatic pre/post-rebuy layout transitions and account updates. Supabase Auth and data calls are stubbed; these tests cover the signed-out gate, session restoration, email confirmation, sign-out, local-record import, save failures and stale-write retry, but do not prove hosted email delivery or cross-device Realtime delivery.
- `backend/verify-rls.sql` passed against hosted Supabase. It runs inside a rolled-back transaction and tests create/update, stale revisions, owner reassignment, cross-user reads/writes and anonymous denial. Security Advisor returned no lints.
- Hosted desktop and phone layouts were inspected through the connected browser. Automated tests stub hosted Auth and saves; real two-device delivery, extended HDMI display behavior and alert audio still need an on-device check.

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

## v0.2.4 home navigation

Non-clock pages have a single Home button in the main navigation row, also visible on phones. Removed the redundant Overview text, Main menu button beside the clock action, and top-right Home button. The club logo remains a normal home link. The separate clock window retains its own Home control.

## v0.2.5 numeric player IDs

Players display sequential IDs starting at **001**, with leading zeroes to a minimum of three digits. Existing records receive numbers in their stored creation order. The visible number is permanent through name changes and archival, and archived numbers are not reused. Player profiles and list searches use these numbers; registration search accepts them too. Internal UUIDs and tournament history references remain unchanged.

Practice records upgrade when loaded and persist with the next save. The cloud integrity trigger backfills existing records, preserves numbers omitted by older clients, rejects duplicate or changed numbers, and assigns the next number to unnumbered records. Atomic expected-version saves prevent concurrent devices from committing duplicate assignments. Numbering is per workspace. The installed trigger passed rolled-back tests for sequence assignment, invalid/duplicate number rejection, rename/reordering/archival, older-client saves and stable history references, alongside the existing identity checks.

## v0.2.6 registration scrolling

Tournament Registration fills the available viewport. Available and registered players scroll inside independently sized regions while search, payment selection and navigation remain in place. Filtering resets only the available-player list's scroll; its region no longer shrinks with result count. Registration rerenders retain list scroll, payment selection and focused search/caret. Phones switch between Find a player and Registered lists. Dynamic viewport sizing follows the phone keyboard; short viewports compact the header and summary to leave room for search and results. Other pages retain normal document scrolling.

## v0.2.7 normal account-based use

Removed practice mode and sample-event shortcuts. The opening screen requires sign-in or account creation, and normal screens always use Supabase. Existing browser data transfers to an empty account after sign-in, with a guarded merge option if the account already has records. The app retains the old browser copy and never falls back to local editing on connection or save failure. Sign-out clears the displayed workspace. Auth state callbacks defer API work outside the callback to avoid SDK deadlocks. Database policies and existing workspace storage remain unchanged.

Release validation: 38 automated scenarios passed, including the cloud-only gate, initial import, existing-account merge, conflicts and failed saves. The hosted project is active; email signup is enabled with confirmation required; database checks reject anonymous reads/writes and saves without a signed-in identity. Security Advisor returned no lints. The Supabase dashboard requires a separate login, and automatic browser approval rejected starting that login through GitHub. The email redirect allowlist was therefore not inspected or changed. After confirming email, return to the app and sign in if the email link does not reopen it. End-to-end email delivery and a real two-device session still require the organizer's first account setup; no account or password was created on their behalf.

## v0.2.8 fixed home screen

The signed-in home page fills the available viewport, with no document or menu scrolling. All five menu buttons share the remaining space below the header and optional Current Tournament card. The desktop retains its three-plus-two grid; phones use five compact stacked buttons. Short viewports remove menu descriptions and secondary tournament summary values to retain visible actions. The Current Tournament name truncates within the card and exposes its full name on hover. Shared visual viewport sizing follows window changes; registration retains its independently scrolling lists. Other pages and the signed-out screen retain their existing layouts.

## v0.2.9 registration layout

The context header shows the current tournament name as plain text instead of a dropdown. If a browser has no valid selection, the app opens the active tournament, falling back to the latest draft or saved event. Registration uses a full-height left player-search panel beside a right column with summary metrics above Registered Players. The page stays fixed and each roster scrolls independently. On phones, the Find a player panel uses the available height; the Registered tab groups the metrics above its roster. The duplicate tournament name below the registration page title was removed.


## v0.3.0 registration and tournament rebuy totals

Removed the registration payment checkbox, Paid/Owes controls, per-player rebuy controls and player money statistics. Registering assumes payment. Finishing a tournament retains places, winner and event financial settlement without assigning player winnings. Points are deferred.

Management has one Rebuy button. It enables at the start of the break after the final rebuy playing level, including when the clock automatically pauses on entering that break. If no break follows, it enables when that playing level ends. The dialog initially shows zero, accepts typing and minus/plus steps, and reopens with the saved total. Every save replaces that total, so late rebuys and corrections can be entered during the break or afterward, until completion. The total updates the prize pool and chip count; no dealer toke is taken from rebuys.

Older per-player rebuy rows are consolidated once into the tournament count on read and saved with the next action. Player IDs, entry references and completed event settlements are preserved. Existing open-event registrations are treated as paid. No database schema change is required: the aggregate count is stored in the existing authenticated workspace JSON.

Validation: 45 automated scenarios pass, including cutoff-break enablement on timer ticks, repeated total replacement during the break, input bounds, migration without double counting, assumed-paid registration, removed money statistics and existing clock/account behavior. `backend/verify-rebuy-data.sql` checks the new JSON shape against the installed player-integrity trigger inside a rolled-back transaction.


## v0.3.1 fixed setup and player database pages

Tournament Setup and Player Database fill the available viewport without document scrolling. Setup keeps its heading and actions fixed while the saved-structure grid scrolls. Editing a structure scrolls the settings panel while Save and Cancel remain available outside that scroll region. Player Database keeps its heading, Add player, search and archive filter fixed; only the names/IDs list scrolls. Player detail forms and history use an internal content region. Compact layouts handle phone keyboards and short screens. Filtering resets only the player list, and cloud refresh retains its position, search focus and caret. Structure editing actions retain the settings panel's scroll position.

The existing automated scenarios, plus player-list focus/scroll refresh coverage, pass. Layout checks use the hosted desktop and phone screens.


## v0.3.2 full-width saved structures

Removed the 760px cap and two-column desktop limit from saved structures. Cards fill the workspace with four columns at widths of 1200px and above, three at 900–1199px, two at 360–899px, and one below 360px. The fixed page and independently scrolling saved-structure region are retained.


## v0.3.3 fixed player profiles

Archived player profiles show `(Archived)` after the name in the heading, without changing the saved name or permanent identity. Restoring the player removes that heading suffix. Profiles keep the page and details form fixed, with equally tall details/history panels. Only the history entries scroll; the history heading stays visible. Phone panels stack at equal heights, with compact fields and a Details/History switch when a phone keyboard leaves less than 480px of height. History scroll position survives profile rerenders.


## v0.3.4 last played and full-width notes

Player details show Phone number and a read-only Last played date on the same row, with Notes spanning both columns underneath. Last played comes from the latest dated tournament referencing the player's permanent ID that has started or completed; registration-only drafts do not count. It shows Not yet when no qualifying tournament exists, including for newly added players. Editing or archiving a player does not change that derived date. Compact phone profiles use their existing Details/History switch below 800px of height so all fields remain visible without page/form scrolling.


## v0.3.5 phone validation and red archive labels

Optional player phone numbers accept exactly ten digits or the matching `###-###-####` form. Ten plain digits automatically format; letters, extra or missing digits, country codes and other separators are rejected. The same rule applies to add/edit forms, player-save actions and the installed Supabase player-integrity trigger, which also normalizes plain digits before storage. No existing phone numbers needed correction at deployment. Profile `(Archived)` and player-list `Archived` labels are red.


## v0.3.6 seats managed at the tables

Seats per table is configured under Tournament Management → Tables & seats, with an Apply seats action. Removed it from reusable structure and tournament setup forms. Capacity stays per event, accepts 2–12 seats and updates displayed seats and calculated table count. Changing capacity retains valid assignments; players occupying removed seat numbers move into free seats, preferring tables with fewer players. Eliminated players keep their results, and undo never restores an unavailable seat.

The seating screen distinguishes capacity from occupancy, shows players seated at each table and previews the balanced distribution. Shuffle & seat uses the existing round-robin algorithm: 12 players at nine-seat tables use two tables with six players each; 13 use seven and six. It only moves players when explicitly applied; table count is derived from remaining players rather than configured in setup.


## v0.3.7 readable seats and manual drag moves

Seat numbers use large circular badges. Drag a seated player with a mouse, pen or touch, or select a player and then choose the destination seat. The existing Move menu also supports occupied seats. Empty destinations move directly; occupied destinations offer Swap players or Slide players down, with a preview and Cancel.

Sliding inserts the player and shifts consecutive occupants toward larger seat numbers until the first empty seat, accounting for the source seat becoming vacant at the same table. It never shifts past the configured last seat; a full target run disables sliding with an explanation while a valid swap remains available. Only affected seats change. Cross-table swaps and slides are supported; an unseated player can use an empty seat or a valid slide, but cannot swap someone into an unseated position. Completed events, invalid seats and eliminated players are blocked.

Each move is validated and saved atomically with the existing expected-version cloud save. If another device changes the workspace during a selection or confirmation, the move requires reviewing the latest seating. Drag cancellation, drops outside seats and dropping back onto the original seat do not save. Pointer dragging highlights its target and scrolls the management page near the viewport edges; ordinary page scrolling remains available outside player handles.

Validation: automated domain and UI scenarios cover unique seat assignments, all valid swaps/insertion directions across multiple capacities, full-table overflow, cross-table changes, occupied-seat confirmation, failed saves, stale data, cancellation, pointer gestures and edge scrolling. Pointer events are simulated in jsdom; no production seating or test players are changed by these checks.


## v0.3.8 separate seating, table consolidation and protected seats

Seat Players assigns unseated players across available tables, preferring the least occupied. It becomes Seat Remaining Players after the first player is seated and disables when everyone has a seat. Existing seated players stay put. Combine Tables is enabled when an occupied table can close; the lowest-numbered tables remain open. Only players from closing tables and any unseated players move into vacant seats, preferring the least occupied surviving table. It does not shuffle players or rebalance seats already held at surviving tables.

When forming the final table (Table 1), confirmation offers Keep existing seats or Redraw all seats. Keeping seats preserves Table 1 assignments; redrawing randomizes unlocked players around its locked seats. Any lock at a closing table blocks both choices, identifying the table and seat to unlock first. A lock is never transferred to another table automatically.

Each occupied seat has a Lock in seat button that turns red and reads Locked. Press again to unlock. Locks are saved on tournament entries through the existing atomic, expected-version workspace save, shared between devices and retained after reopening the app. They protect against direct moves, swaps, insertion slides, redraws and capacity reductions. Eliminating a player releases the seat; undo restores the lock only if the original seat is still available. Completed events remain locked.

Validation: 83 automated tests cover balanced initial seating, preservation of seated players, three-to-two and four-to-two merges, both final-table choices, multiple fixed seats, lock conflicts and unlock recovery, saved-lock reloads, manual movement protection, elimination undo, canceled dialogs, stale confirmations and failed saves with explicit retry. UI checks use jsdom fixtures and do not alter production players or tournaments.


## v0.3.9 touch scrolling and explicit movement mode

Removed the three explanatory paragraphs above the tables, retaining the drag/select instruction. A Move Players toggle beside that instruction starts off and turns green when enabled. Manual drag, select-and-place, Move and Assign seat controls require this mode. Off mode allows ordinary browser touch scrolling over player names without pointer capture or drag interception. Seat Players, Combine Tables and seat locks keep their separate controls.

Turning movement off cancels any selection or drag. It stays on through consecutive saves in the same tables view, but resets off when leaving the view, switching tournaments, completing the tournament or reopening the app. Movement mode is local to the screen, not a saved tournament setting. Locked players remain protected while movement is enabled.

Validation: all 88 automated tests pass. New scenarios cover removed copy, default-off mouse/touch gestures without prevented scrolling or captured pointers, green enabled state, cancellation during touch dragging, repeated moves, navigation resets and reopening. Existing manual moves, locks, stale-data checks and cloud save-failure scenarios still pass. Touch gestures are simulated in jsdom; physical iPad scrolling has not been tested here.


## v0.3.10 one clock-window button in management

Removed the duplicate Open TV clock button beside the Tournament Management title. Open clock window remains in the tournament bar below the top banner and uses the same existing clock popup action. Verified with the existing navigation/clock-window UI scenarios at both root and GitHub Pages subdirectory paths and a production build.


## v0.3.11 pinned management header and menu

Tournament Management groups the Uno Club banner, current tournament/clock-window bar and navigation in one sticky header. All content beneath the menu scrolls normally, including the management title, clock controls, tabs and table listings. The header follows its actual responsive height without hardcoded row offsets; other pages retain their existing layouts.

Player dragging uses the visible content boundary beneath that header for upward edge scrolling and rejects destinations covered by the header. The Move Players toggle and seat locks retain their existing protections. Existing navigation and seating tests pass, including a touch-drag scenario that scrolls just below the pinned menu and refuses to drop through it. No saved player or tournament data changes are needed.


## v0.3.12 consolidated page banners, management sidebar and clock controls

The clock toolbar (Home, cloud status, Sound and Full screen) fades out after three seconds without activity, even when a mouse rests over the screen. Mouse/pointer movement, touch, scrolling, keyboard use, focus, full-screen changes and viewport changes reveal it and restart the delay. Hidden controls are inert and removed from accessibility navigation until revealed. The round number stays in place underneath.

Clock ticks and cloud rerenders preserve the idle deadline and do not reveal the toolbar. Reopening the clock starts with visible controls. This is local display behavior and never writes tournament data. Automated checks cover idle timing, wake events, focus, toolbar replacement, returning to the clock, continued ticking, remote updates and functioning Sound/Full screen actions. Touch and full-screen interactions are simulated rather than tested on a physical iPad.


Main Setup, Player Database, Registration and Management page titles now sit centered in the main banner, with their actions on the right beside account status. Removed the duplicate page-heading rows and Run the Room label. Structure editors keep their editing context in the banner and their save/cancel controls; player profiles keep the player name and red Archived status visible there with Back to players. Home retains its existing header and menu layout.

Below the management clock controls, a vertical sidebar contains Players, Tables & Seats, Payouts and Financial Summary. The selected section appears in the adjacent right pane, with an active button highlight, accessible panel labels and keyboard arrow/Home/End navigation. Responsive widths keep the sidebar on the left on phones as well; seat rows put the player name above the manual Move and Lock controls when the right pane is narrow. The pinned top banner, current tournament bar and primary navigation remain in place.

Validation: 96 automated tests pass, including the new banner actions and sidebar section/keyboard navigation plus the paused clock-toolbar timing and touch-wake tests. Production build and whitespace checks pass. No production workspace rows are edited by these checks.


## v0.3.13 whole-dollar accounting, guarantee and accepted ICM agreements

Financial Summary now uses the requested ordered ledger with green collections, red fee/dealer deductions and a final prize total. The configured fee is applied only to initial net entries, superseding the earlier fee-on-rebuys rule for open events. A conditional Add-ons row keeps existing add-on revenue accounted for. Existing completed settlements and historical cent-valued records retain their stored values; they are never rewritten on read.

Payouts uses radio choices for Percentage of Prize Pool, Fixed Dollar Amounts and $1,000 Guaranteed to First Place. The guarantee is disabled before 10 registrations (eliminated entrants still count), and selecting it saves a two-place 65/35 schedule with a first-place floor. Every live amount derives from the same financial calculation used by Summary, metrics and the TV clock. Required additional house funding appears explicitly in House Contribution and guarantee notices; it is a funding commitment that decreases as other revenue covers the minimum, while any manually configured contribution stays fixed. Completion freezes the actual funding and final payout schedule.

Percentage payouts are floored to whole dollars, with residual dollars assigned from the lowest paid place upward. The guarantee computes first as max($1,000, floor(65% of pool to dollars)) and second as pool minus first. Fixed amounts are validated against the exact funded pool before saving/finalizing; later revenue changes explicitly flag an imbalance rather than silently changing fixed awards. All new money inputs reject fractional-dollar values. The fee itself rounds to the nearest whole dollar.

Management → Payouts → ICM Chop accepts positive whole chip counts for every remaining player, calculates standard Malmuth–Harville ICM equities, and lets the organizer adjust the resulting whole-dollar agreement. The exact subset algorithm supports 2–20 remaining players. Odd dollars go one at a time to lower chip-order participants (registration order breaks equal-stack ties). Payouts reserved for already eliminated paid places are excluded from the chop and retained. Acceptance checks current workspace version, identities, chips, whole-dollar amounts and exact funding, then saves the agreement and completes the tournament in one existing atomic cloud write. Canceled dialogs and failed/stale saves never finish the event.

ICM participants retain no invented finishing place or winner. Their chip order is stored separately for later use, and profiles label the result ICM chop. Previous eliminations keep their original places and records. No points, ranking rules or points calculations are added. Accepted payouts and final chips are visible in the completed Payouts pane; the TV clock uses participant names for chop awards.

Validation includes the $420 ledger example, configurable fee percentages, all guarantee examples and boundaries, required funding, fixed-payout mismatches, lower-place rounding, exact ICM comparisons against independent finishing-order enumeration, completion snapshots, earlier eliminations, canceled and failed/stale acceptance, and tenth-registration eligibility without lost writes. `backend/verify-settlement-data.sql` passed against the installed Supabase player-integrity trigger using only temporary rows and a rolled-back transaction. Production players and tournament rows are not rewritten by deployment or tests. UI tests simulate touch/full-screen behavior; physical iPad validation remains manual.

ICM model reference: [Near-Exact Computation of Independent Chip Model Placement Probabilities for Thousands of Players, section 1](https://arxiv.org/abs/2610.06028). The implemented small-field subset algorithm is independently tested against direct finish-order enumeration.


## v0.3.14 payout editor and table controls

Tournament Management → Payouts asks “How many places are paid?” directly below Current Prize Pool. Prize Format and the vertical place list share two equal-width columns on tablet and desktop; they stack on narrow phones. Each place has its own percentage or whole-dollar input. Changing the count or format retains unsaved allocations while editing; the guarantee remains a two-place schedule. The management pane no longer uses the comma-separated amount field or duplicate payout squares. Structure defaults retain their existing editor. Existing total validation, lower-place rounding, guarantee funding, accounting and accepted ICM results remain in place.

Tables & Seats provides Eliminate beside each seated or unseated player, using the same confirmation, recorded finishing place and undo process as the Players pane. Elimination releases seats and locks, updates remaining players and preserves the player database. The last remaining player and completed results cannot be eliminated from these controls. Seats per table accepts only whole numbers from 2 through 10 in both the input and domain validation; its button reads Apply. Gold table headers show the table number on the left and occupied-seat count on the right. Existing saved seating is not rewritten on load.

Validation: 120 automated tests pass, including individual payout inputs and mode/count changes, guarantee and ICM regressions, confirmed/canceled seated and unseated eliminations, lock restoration on undo, completed-result protection, the ten-seat maximum and header contents. Deployment updates static app files only; no player, tournament or database migration is performed.


## v0.3.15 remote TV display and seating chart

Tournament Management keeps TV Display controls in its pinned header area, available from the phone while scrolling any management section. Full Clock shows the existing full tournament clock; Clock + Seating shows a compact clock banner above all current tables, numbered seats and player names. The active mode is highlighted. Before the tournament starts the TV automatically shows the seating chart alone, with Full Clock available after the start. Starting the tournament defaults to Clock + Seating. Pause/resume, level changes, eliminations, seat moves, combinations and completion preserve the chosen mode afterward.

The mode is stored on the tournament as tvDisplayMode using the existing owner-protected atomic workspace save. Realtime changes update the separate TV window; the existing 2.5-second polling fallback recovers missed events. The mode action leaves the saved clock object, deadline, seating and finances unchanged. Failed or conflicting saves retain the confirmed choice and show the existing error/retry behavior. No schema or production data migration is needed.

On the computer, open the clock window and move it to the HDMI-connected extended TV screen. Sign into the same tournament account on the phone to operate Tournament Management. The TV window receives the saved mode and current assignments automatically. Browser full screen and sound remain controls on the TV window, with their existing inactivity hiding. Refresh already-open app windows once after this release to load the new controls; subsequent mode and seating changes update without a refresh.

One, two or three tables use one, two or three columns. The chart fills the TV viewport without scrolling, with extra grid rows available for larger events. Long names wrap and fit their available seat row without truncation. Unseated players appear in an Awaiting seat assignment section. Resizing or entering full screen refits the text. Empty seats remain visible, and table capacity/assignments come from the same tournament records as Tables & Seats.

Validation: 129 automated tests pass, including independent phone/TV sessions receiving mode and seating changes, unchanged clock deadlines, start defaults, persistent selections, paused/completed events, failure handling, table combinations, renames, and long-name fitting. Headless Chromium checks passed for pre-start and running layouts with one/two/three tables at 1280×720, 1920×1080, 3840×2160 and 1024×768 (24 layouts), including complete long names and no viewport scrolling. A 390×844 phone check verified pinned controls and remote switching/elimination without TV navigation or deadline changes. backend/verify-tv-display-data.sql passed the installed storage trigger using temporary rows inside a rolled-back transaction. Physical TV/iPad testing remains available to the organizer.


## v0.3.16 consolidated tournament controls

The existing saved-structure system now supports the first-place guarantee before registration. The guarantee remains selected while inactive below ten registrations, uses 65/35 below the threshold, and activates its minimum/funded house contribution at ten. Eliminated entrants still count as registered. Standard percentage structures never acquire a guarantee. Setup uses individual payout rows with Number of Places Paid and editable defaults: 100; 65/35; 50/30/20; 45/30/15/10; or 100 followed by zeros for five or more places. Saved edits survive structure reuse. The obsolete comma-separated payout field is removed.

During play, expanding the paid places snapshots the current dollar awards and adds zero-dollar places. Manual percentage edits are converted to whole-dollar Custom Payouts when saved. Replacing an automatic/guaranteed arrangement requires confirmation, and drafts never change the official schedule before Save Payouts. Automatic house funding carried into a custom agreement remains explicit in House Contribution. Custom awards stay fixed when revenue changes, with exact balance validation and an explicit Recalculate automatic payouts action. Recalculation restores the automatic source and releases any carried automatic funding rather than double-counting it; it remains a draft until saved. Active payout agreements are edited through Management, with setup settings preserving their existing values.

Summary retains the shared seven-line accounting calculation and uses the configured fee on net initial entries. Dealer collection and dealer payout remain separate; the $420 example and historical settlements are unchanged. The tab is Summary and its heading is Tournament Summary. Footer explanations are removed. The Rebuy button matches the main clock button width, turns green when recording is permitted, and has no description underneath. Current Prize Pool is above the right payout list, in a distinct color and matching prize-amount size. Monetary entry fields format thousands and accept whole dollars; percentage fields retain decimal support. ICM equity, lower-position dollar rounding, negotiated payouts, acceptance/completion, final chips and previous eliminations remain intact. No points system is added.

TV mode controls sit directly before Open Clock Window in the pinned tournament banner and wrap on narrow phones. Mode changes continue to synchronize to the separate TV without changing clock deadlines, and full-screen state survives render/mode changes. The seating-only pre-start view and Clock + Seating start default remain, with subsequent view changes manual. The seating chart continues to fit one/two/three table columns without scrolling. Table headers use gold, with large black TABLE numbers and a smaller occupied-seat count.

Explicit Combine Tables now balances every surviving table, keeping existing seats wherever possible and giving Table 1 the extra player in odd two-table fields. Locked seats are preserved; impossible balanced combinations stop with an unlock message and no partial moves. Eliminations never move another player. An imbalance of at least two players between occupied tables shows the requested balancing alert, without naming a player to move. Individual Undo Elimination buttons replace the global undo button and identify the player in confirmation. Restoration uses the recorded table/seat/lock and recomputes the remaining elimination finishes. Occupied or removed original seats block restoration. Older eliminations without a recorded seat require explicit confirmation to restore as unseated; completed history remains locked.

Tournament Setup → Clock Appearance provides four countdown styles (solid, separate minute/second colors, gradient, stripes), clock-only color pickers, presets, a preview, preferred defaults for new tournaments, and Restore Original. Per-tournament appearance overrides synchronize to both TV layouts without changing the rest of the app. Monetary amounts are centered within their TV sections. Existing tournaments keep their original appearance unless explicitly changed.

### Automatic TV window launch — PENDING WINDOWS HARDWARE VERIFICATION

Open Clock Window still opens/reuses a separate named browser window immediately from the click. Where supported, Window Management permission enables detection of the external display, positioning at its available bounds and remembering the preferred display locally on that computer. A supported fullscreen popup request and the Fullscreen API attempt full-screen entry. The main app window remains independent. If Chrome blocks placement or entry, the TV window offers Place TV & Enter Full Screen; when placement is unavailable, move that window to the TV first. No mirroring or desktop shortcut is required.

**Pending:** verify initial permission prompts, remembered display selection, placement and automatic fullscreen on the organizer’s actual Windows Chrome + wireless HDMI extended second display. Browser/mock checks do not count as this hardware verification. The fallback UI and Open Clock Window tooltip retain this status. APIs used: [Window Management](https://developer.chrome.com/docs/capabilities/web-apis/window-management), [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen), and the [fullscreen popup feature proposal](https://github.com/w3c/window-management/blob/main/EXPLAINER_fullscreen_popups.md). Unsupported or rejected requests preserve the ordinary clock window and its manual full-screen control.

### Validation

154 automated tests pass. New coverage includes saved guarantees through eligibility changes, editable setup defaults, funded custom schedules and format toggles, manual edits after recalculation, 12–18 player combinations with Table 1 receiving the odd player, elimination alerts without seat movement, specific-player undo and occupied-seat conflicts, appearance defaults/overrides, duplicate monitor labels, rejected browser permissions, and protecting an unidentified main display from automatic fullscreen. Existing accounting, clock, cloud conflict/retry, player identity, phone, seating/lock, completed-history and ICM tests continue to pass.

Headless Chromium checks cover 24 pre-start/running seating layouts at 720p, 1080p, 4K and 1024×768; Management at 320/390/768/1280 widths; custom payout drafting and saving; all four appearance styles in both TV modes; matching Rebuy/Pause widths; pinned banner access; individual elimination/undo updates on TV; and preserved document fullscreen/deadlines during remote view changes. No uncaught browser errors were observed.

The optional repeatable browser check is tests/browser-check.mjs. It uses a local in-memory cloud fixture and never connects to production. Supply PLAYWRIGHT_MODULE and CHROME_EXECUTABLE when Playwright/browser binaries are outside the project installation; QA_OUTPUT_DIR controls optional screenshots. Normal npm test does not require a browser.

backend/verify-consolidated-data.sql passed the installed storage trigger using only temporary rows in a rolled-back transaction, including guarantee structures, custom funding metadata, preferred clock colors, original elimination seats and completed history. This release requires no schema migration and does not rewrite production workspaces.


## v0.3.17 clock box and table-action labels

Tournament Management splits its clock panel into equal-width columns: countdown/blinds on the left, clock controls and Rebuy on the right. The main clock button and Rebuy still match in width within their half of the panel. The split remains side by side at phone widths, with smaller controls and type to avoid overflow.

The TV seating chart retains empty seat numbers and leaves their player-name area blank. The shared table action says Combine Tables when the displayed table count can be reduced; otherwise it says Balance Tables. Its dialog, confirmation button and success message use the same distinction. Both actions reuse the existing balanced seating planner and preserve locked seats. Final-table seat retention/redraw options remain available when closing tables to form the final table. No seating or tournament records are changed by deployment.

Validation: 155 automated tests pass, including balancing without closing tables, four-to-three combinations and blank TV seat names with seat numbers preserved. Browser checks verify equal readout/control column widths and matching Rebuy/main-clock widths at 320, 390, 768 and 1280 pixels, alongside existing TV layouts, payout/color controls, synchronization and fullscreen persistence. Automatic placement/fullscreen on the actual Windows wireless HDMI setup remains pending hardware verification.


## v0.3.18 in-app elimination confirmation

- Players and Tables & Seats open an app dialog naming the player and finishing place, with Cancel and Confirm Elimination buttons.
- No elimination is saved until confirmed. If another device changes the tournament while the dialog is open, the organizer must reopen it to confirm the current place.
- Failed saves leave the dialog available for retry; existing elimination recording, seat release, balancing alerts, undo and player records are preserved.


## v0.3.19 configurable first-place guarantees

- Replace the fixed guarantee choice with editable whole-dollar and registered-player fields in Setup and Management: "$___ Guaranteed to First Place with ___ players."
- Store both terms with saved structures and tournaments. Before the threshold, use two paid places at 65/35; at or above it, apply the configured first-place minimum with any required house contribution. Existing records without these fields retain $1,000 at 10 players.
- Preserve agreed custom payouts and their original automatic guarantee terms when switching back through Recalculate automatic payouts. Active guarantee changes require Save Payouts and confirmation.
- Align radio buttons with their choices and keep the editable guarantee controls usable on phones.
- Validation: 161 automated tests; browser checks cover configurable controls, radio alignment and overflow at 320, 390, 768 and 1280 pixels, plus existing TV, seating, custom payout and fullscreen synchronization checks. Actual Windows wireless HDMI placement/fullscreen remains pending hardware verification.


## v0.3.20 clear obsolete device copies

- The old browser-data import notice now includes Clear old device copy, with an in-app confirmation.
- Clearing removes only the legacy tournament document key from the current browser. It does not call the cloud save RPC, remove sign-in credentials or alter online players, structures, tournaments or history.
- The current online account must be loaded and connected before clearing. Cancellation, storage errors and lost connections preserve the old copy.


## v0.3.21 Tournament Remote

- Home and the main navigation now open Tournament Remote for the active event. This additional phone interface provides a large live clock, one Pause Clock/Resume Clock control, vertical gold table lists, and the shared payout/ICM editor with direct Clock back navigation.
- Remote eliminations use the authenticated `td_remote_elimination` RPC. A server timestamp starts a 5,000 ms Undo window; pending players keep their row, seat and active status with no provisional finishing place. Their metadata and idempotent request receipts live in the existing tournament document.
- `backend/tournament-remote.sql` adds owner-scoped invoker RPCs, a private deadline finalizer and document guards. Existing auth/RLS and `td_save_workspace` remain in use. Apply this SQL after the base schema and player integrity SQL before publishing a build using Remote. It is already installed on the Tournament Director project.
- A private pg_cron worker checks deadlines every second independently of open browsers. Undo eligibility ends at the exact server deadline; due results are then published through the existing Realtime channel and polling fallback. Processing resumes after a database interruption without a second elimination or a reset Undo deadline. No unsaved offline elimination is presented as successful.
- Server guards reject changing a pending player's entry, occupying their reserved seat, completing a tournament with pending eliminations, or editing server-managed request metadata. Normal non-conflicting clock, player and payout work stays available. Row locks serialize Remote actions, deadline finalization and document saves; request IDs prevent duplicate starts or finalizations after a retry/lost acknowledgement.
- Finalization records the actual deadline, finishing place, elimination order and original seat, then frees the seat and updates the existing balancing warning without moving anyone. Management retains its confirmed individual Undo Elimination after the Remote window, including occupied-seat protection.
- Payouts, guarantees, custom agreements, whole-dollar formatting and ICM use the same existing functions/forms. ICM acceptance waits for pending eliminations to resolve. Accepted chops stop the clock and preserve earlier eliminations and chip/payout records. No tournament points were added.
- Validation: 170 automated tests; rolled-back database tests verify the 5,000 ms boundary, duplicate receipts/finalization, server worker writes, reserved-seat guards and owner isolation. Browser checks cover phone layouts, shared Pause/Resume, Undo, finalization with the Remote page closed, TV/Management updates, table balance warnings, payouts and navigation. The production workspace hash and record counts remained unchanged during deployment. Windows wireless HDMI positioning/fullscreen remains pending hardware testing.
- Cron log retention deletes only this feature's job logs older than one day; it does not remove tournament or player records.


## v0.3.22 Remote colors

- Remote Pause Clock is red while running; Resume Clock is green while paused. The main Eliminate Player action is red and Payouts / ICM is green.
- The Remote clock shares the tournament's TV clock appearance: background, timer style/colors, current/next blinds, level and other text. Solid, separate, gradient and stripe countdowns use the same appearance helper/CSS behavior, including live cloud updates without changing the clock deadline.


## v0.3.23 clock appearance per saved structure

- Each structure editor includes Clock Appearance with a preview and the existing presets, full color pickers and four countdown styles. Use for This Structure updates the draft; Save structure persists it with that structure's levels and payouts. Canceling the appearance dialog or structure editor does not save color changes.
- New tournaments snapshot their selected structure's appearance for both TV and Tournament Remote. Duplicating a structure copies its appearance; editing either copy or changing preferred defaults never changes an existing tournament's clock.
- Older structures without an appearance retain the previous preferred-default fallback until saved, at which point their own appearance is stored. The separate current-tournament override and preferred-default controls remain available.


## v0.3.24 clock controls inside tournament setup

- Remove the separate Clock Appearance button from the Saved structures heading. Each structure and each individual tournament editor now contains its own Clock Appearance section and preview.
- Structure colors remain a draft until Save structure; tournament colors remain a draft until Save tournament settings. Updating a running tournament's appearance preserves its actual clock state/deadline, payouts, players and saved source structure.
- The Create a tournament dialog also contains a collapsed Clock Appearance (optional) section. Leave it untouched to inherit the chosen structure/default colors, or customize only that new tournament. Choosing another structure refreshes the inherited appearance.
- All three locations reuse the same presets, full color controls, countdown styles and previews. Preferred defaults are available inside the editor's appearance dialog, with no separate outside setup control.
- Validation: 176 automated tests plus browser creation/editing flows and inherited TV/Remote colors.
