# imperial-bridge

A Claude Code mod that opens a live pane in the Claude desktop app: the command bridge of an Imperial-class Star Destroyer. Grand Admiral Thrawn stands at the viewport end of the raised walkway; the imperial agents (subagents) work at consoles in the two crew pits.

- Stations: each agent type has a console labelled with its rank (Imperial Engineer, Viper Probe Droid, ISB Agent, Imperial Architect, Science Officer, Inquisitor, Stormtrooper, Stormtrooper Sergeant, Imperial Officer, ISB Major, Imperial Bureaucrat). Any other subagent type takes the spare station and is labelled with its own name.
- Order: on spawn, the station lights up, a dotted link runs from Thrawn to it, and the console readout shows `THRAWN → <RANK>` with the brief's `description` and the first line of its `prompt`. While any agent works, the viewport shows hyperspace; otherwise a planet.
- Work: the console flickers and its plate shows the current tool (name plus the first 40 characters of a Bash command or a file name, cut to 30 on the plate). Each running instance of a type is a lit operator at its station, and the plate shows `x2`, `x3`.
- Report: the link runs back to Thrawn for 3 seconds and the readout shows `<RANK> → THRAWN` with the first lines of the report and the duration. Aborted runs show in alert red with `SIGNAL LOST`.
- Models: each plate carries a badge per running instance (HAIKU cyan, SONNET amber, OPUS red); a quiet station shows its default model dimmed. A model stronger than the roster default is an escalation: its badge turns solid with an upward chevron and the plate reads `ESCALATED`. Thrawn carries an `OPUS` marker. Readouts and log name the model after the rank, such as `THRAWN → ISB AGENT #1 [HAIKU]`.
- Log: the console below the viewport lists the last 8 transmissions, newest first.
- Power reserves: the console below the log shows the subscription limits as gauges: `REACTOR CORE` (5-hour limit), `FLEET CYCLE` (weekly limit) and `IMPERIAL TREASURY` (spend limit, only when the account has one). Each shows the percent used, the reset in local time (`19:29`, or `Fri 21:15` for the weekly and spend limits) and a countdown (`in 2h 14m`, `in 3d 4h`). The gauge turns amber from 70% and red from 90%. Before the first measurement it reads `AWAITING TELEMETRY`; once a measurement reports no limit (accounts without a subscription limit) it reads `NO LIMIT REPORTED`. A limit of another kind shows as a gauge under its own name. The terminal surface adds one `Usage:` line.

The scene is one vector SVG (no image, no font, no URL) drawn in perspective from a camera model (`hooks/projection.ts`). The latest drawing is about 110 KB at most, under the 131,072 character limit of the `Svg` element.

## Screenshots

Working, with a hyperspace viewport and the order and report consoles:

![Three stations at work](docs/screenshots/working.jpg)

Idle, waiting for orders:

![All stations standing by](docs/screenshots/idle.jpg)

Report received from a station:

![A report on its way back to Thrawn](docs/screenshots/reporting.jpg)

Aborted run, in alert red:

![An aborted run, signal lost](docs/screenshots/aborted.jpg)

Every station busy:

![Every station busy](docs/screenshots/busy.jpg)

Power reserves, with the 5-hour and weekly limits:

![The power reserves console](docs/screenshots/usage.jpg)

## Install

From GitHub:

```
claude plugin marketplace add olivierapex/imperial-bridge
claude plugin install imperial-bridge@imperial-bridge
```

## Load it

For this session, the mod folder is linked at `~/.claude/dev-mods/<session id>/imperial-bridge`. Claude Code asks once to enable hot reloading; accept it.

From a local clone:

```
claude plugin marketplace add <path to the clone>
claude plugin install imperial-bridge@imperial-bridge
```

Open the pane with `/bridge`. It also opens on the first agent spawn.

## Inputs

Events consumed. The plugin also calls `$.session.usage()` (not an event) to read the rate-limit windows (`five_hour`, `seven_day`, `spend_limit`) on `session.start` and `ui.open`; a failed read is logged to the debug log and never blocks them.

| Name | Required | Description | Default | Type |
| --- | --- | --- | --- | --- |
| `session.start` | yes | Registers the `/bridge` command, then reads the limits once | none | event |
| `command.run` (`bridge`) | yes | Opens the pane | none | event |
| `ui.open` (`imperial-bridge`) | yes | After the pane opens: reads the limits once and starts a 60-second countdown refresh | none | event |
| `ui.close` (`imperial-bridge`) | yes | Stops the countdown refresh | none | event |
| `agent.spawn` | yes | Creates an instance, logs the event, opens the pane on the first spawn, starts the redraw timer | none | event |
| `tool.call` | yes | Records the current tool of the instance named by `agentId` | none | event |
| `turn.complete` | yes | Marks the instance reported or aborted, with its duration | none | event |
| `session.measure` | yes | Replaces the limits with `rateLimits` and refreshes the rate-limit windows after each turn and when a limit moves | none | event |
| `ui.render` (`Pane`) | yes | Draws the bridge (desktop) or the event lines (terminal) | none | event |

## Outputs

| Name | Required | Description | Default | Type |
| --- | --- | --- | --- | --- |
| `imperial-bridge` pane | yes | The bridge scene (SVG) with the order, report and log consoles | none | pane |
| usage window | yes | The power reserves console: percent used, reset time and countdown per limit, `AWAITING TELEMETRY` before the first measurement, or `NO LIMIT REPORTED` | `AWAITING TELEMETRY` | SVG console |
| `/bridge` | yes | Slash command that opens the pane | none | command |

The pane draws the SVG scene on the desktop surface; the terminal surface shows the event lines and a `Usage:` line.

## Development

```
claude plugin validate .
claude plugin test .
tsc -p .   # once the engine has written .claude-plugin/types/
```

Preview the scene with sample data (idle, working, reporting, aborted, models, every station busy, long log, usage and high usage). The files are written to `preview/`, which is git-ignored; open them in a browser:

```
node --import ./tools/resolve-typescript.mjs tools/render-preview.ts
```

| File | Role |
| --- | --- |
| `hooks/scene.ts` | Assembles the drawing: definitions, links, header |
| `hooks/backdrop.ts` | Windows, space, hall, walkway, Thrawn |
| `hooks/stations.ts` | Station layout, consoles, operators, rank plates |
| `hooks/models.ts` | Model badges, escalation test, Thrawn's OPUS marker |
| `hooks/transmissions.ts` | Order, report and log consoles, the shared console screen and layout |
| `hooks/usage.ts` | Power reserves console and the percent, reset and countdown formatting |
| `hooks/projection.ts` | The camera: metres to screen pixels |
| `hooks/svg.ts` | Palette, text, deterministic randomness, pseudo-Aurebesh glyphs |

The timer ticks every 400 ms and stops when no instance is working or fading.

## Troubleshooting

| Problem | Solution |
| --- | --- |
| `tsc` is not installed | Install TypeScript (`npm install typescript`) and run it with the `tsconfig.json` from the header of the plugin-authoring `claude-code.d.ts`, kept outside the mod folder, until the engine has written `.claude-plugin/types/`. |
| `claude plugin test` reports `no hooks module to load` | `hooks/hooks.json` must name an existing module in `modules`. |
| `no implementation for turn.complete` in a test | A test answers each event the plugin passes on with `on(...)`; `turn.complete` must return `{ text }`. |
| `$.ui.mount: Pane imperial-bridge is mounted ... already` in a test | Call `ui.unmount()` after each drawing, or use another `requestId`. |
| The `Svg` element does not draw in the terminal | The terminal element table has no `Svg`; the pane falls back to the event lines. |
| Console text is `[object Object]` or black | A colour was passed as an object instead of a string; the readouts use `Accent` objects, take `.bright` or `.dim`. |
| A rank is missing or misspelled on a plate | `ROSTER` in `hooks/bridge.ts` must match the agent names; the roster test lists the expected ranks. |
| Text in the drawing is mirrored on one side | A face on the right of the walkway must run its local x axis from far to near (see `drawScreen` in `hooks/stations.ts`). |
| Plates overlap in the far rows | Rows are spaced evenly on screen, not in metres (`depthAtScreenRow`); raise `LAST_ROW_SCREEN` spacing rather than moving rows by hand. |
| `node tools/render-preview.ts` cannot find `./bridge` | The sources import each other without extensions; run it with `--import ./tools/resolve-typescript.mjs`. |
| Idle operators looked like ghosts | Transparency shows the floor through the figure; use darker solid fills for idle operators. |
| The scene tilts or crops after changing the camera | `CAMERA` in `hooks/projection.ts` drives the windows, rows and Thrawn together; re-check the window top (`WINDOW_TOP`) and the first and last row positions after any change. |
