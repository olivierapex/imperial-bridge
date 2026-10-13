# imperial-bridge

A Claude Code mod that opens a live, animated pane in the Claude desktop app. Grand Admiral Thrawn (the main session) sits in the centre; the imperial agents (subagents) sit on a ring around him. Each agent type is a station on the ring. Every running instance of a type is its own numbered satellite around its station, so several Stormtroopers or probe droids can work at once.

- Spawn: the station lights up, a beam runs from Thrawn to the instance's satellite, captioned with the brief's `description`.
- Work: the satellite shows the current tool (name plus the first 40 characters of a Bash command or a file name) and the elapsed time. The station shows a count when more than one instance is active.
- Report: a green beam runs back to Thrawn, the satellite shows `reported` and the duration, then fades after about 10 seconds. Aborted runs are red.
- Colours: haiku cyan, sonnet amber, opus red.
- Under the map: the last 8 events (time, agent, event, caption).

Agent types arrive as `galacticempire:<name>`. Any other subagent type appears as an extra station. Before a type has run, its station shows the model from its agent file; after a spawn, the model the spawn reports.

## Load it

For this session, the mod folder is linked at `~/.claude/dev-mods/<session id>/imperial-bridge`. Claude Code asks once to enable hot reloading; accept it.

Later, from the repository:

```
claude plugin marketplace add ~/data/project/imperial-bridge
claude plugin install imperial-bridge
```

Open the pane with `/bridge`. It also opens on the first agent spawn.

## Inputs

Events consumed.

| Name | Required | Description | Default | Type |
| --- | --- | --- | --- | --- |
| `session.start` | yes | Registers the `/bridge` command | none | event |
| `command.run` (`bridge`) | yes | Opens the pane | none | event |
| `agent.spawn` | yes | Creates an instance, logs the event, opens the pane on the first spawn, starts the redraw timer | none | event |
| `tool.call` | yes | Records the current tool of the instance named by `agentId` | none | event |
| `turn.complete` | yes | Marks the instance reported or aborted, with its duration | none | event |
| `ui.render` (`Pane`) | yes | Draws the map and the event lines | none | event |

## Outputs

| Name | Required | Description | Default | Type |
| --- | --- | --- | --- | --- |
| `imperial-bridge` pane | yes | The map (SVG) and the last 8 events | none | pane |
| `/bridge` | yes | Slash command that opens the pane | none | command |

The pane draws the SVG map on the desktop surface; the terminal surface shows the event lines only.

## Development

```
claude plugin validate .
claude plugin test .
tsc -p .   # once the engine has written .claude-plugin/types/
```

The timer ticks every 400 ms and stops when no instance is working or fading.

## Troubleshooting

| Problem | Solution |
| --- | --- |
| `tsc` is not installed | Install TypeScript (`npm install typescript`) and run it with the `tsconfig.json` from the header of the plugin-authoring `claude-code.d.ts`, kept outside the mod folder, until the engine has written `.claude-plugin/types/`. |
| `claude plugin test` reports `no hooks module to load` | `hooks/hooks.json` must name an existing module in `modules`. |
| `no implementation for turn.complete` in a test | A test answers each event the plugin passes on with `on(...)`; `turn.complete` must return `{ text }`. |
| `$.ui.mount: Pane imperial-bridge is mounted ... already` in a test | Call `ui.unmount()` after each drawing, or use another `requestId`. |
| The `Svg` element does not draw in the terminal | The terminal element table has no `Svg`; the pane falls back to the event lines. |
