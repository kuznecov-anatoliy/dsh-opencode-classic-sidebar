# OpenCode classic sidebar for DeepSeek Harness

`dsh-opencode-classic-sidebar` brings the **classic, pre-redesign OpenCode sidebar
layout** to the DSH Web UI: a narrow column of project tiles on the left, the
selected project's sessions next to it, the global panel buttons in the Windows
caption strip, and an account balance chip.

"Classic" means the OpenCode sidebar as it looked before its redesign — the layout
this bundle reproduces. It is an independent plugin: it copies a layout, not
OpenCode's code, and is not affiliated with the OpenCode project.

![The sidebar: project column with live markers, the project header with its path, the New session bar and the session list](assets/sidebar-overview.png)

Top to bottom in that screenshot: the **project column** — **All**, then one tile
per project (the project open in the main view wears a ring and a blue pulse),
then the **+** tile — the **project header** with the session count, the project
**…** menu, the archive toggle and the shortened `~` path of the workspace, the
**New session** bar, and the **session list** of the selected project with the
open session filled in. The brand row is gone; the window caption strip with the
**Plugins** and **Schedules** buttons sits above the cropped area.

## Install

```
dsh plugin add kuznecov-anatoliy/dsh-opencode-classic-sidebar
```

Restart DSH after installing. Remove it with
`dsh plugin remove dsh-opencode-classic-sidebar`; the shipped workspace browser
comes back.

## What it does

- **Project column** — one tile per workspace (initials, tooltip), the first tile
  **All** lists every non-archived session of every project. Tiles keep a stable
  hue hashed from the workspace id, and are colour-coded against the theme. The
  **+** tile adds a project through the native folder dialog and opens a fresh
  session in it.
- **New session** — a full-width button in the gap between the project name and
  its session list, so a chat starts next to the project it starts in. The
  shipped bar above the column is hidden while the column is expanded; the
  collapsed rail keeps the shipped New-session control.
- **Brand removed** — the logo row no longer shows the DeepSeek Harness mark or
  wordmark: only the collapse toggle stays (it sits in the caption strip on
  Windows), which also gives the column that much more height.
- **Session list of the selected project** — title and relative time; pinned
  sessions lead; the session shown in the main view is filled in.
- **Markers** — a ring on the tile that holds the session open in the main view, a
  blue pulse while a session of that project runs, a faster red pulse when a
  session waits for your answer (approval or question), a green dot for a
  finished session you have not looked at yet. Only project tiles carry a dot:
  the **All** tile is a filter over every project, so it stays bare and keeps the
  summed hints in its tooltip.
- **Session actions** — the **…** button on a hovered row or a right click opens
  the row menu: pin/unpin, rename, fork, copy id, archive. Archived sessions are
  restored from the archive view, not deleted.
- **Project actions** — right click on a tile or the **…** in the project header:
  rename, or delete the workspace from the registry (the folder on disk is kept).
- **Archive view** — a toggle in the project header lists archived sessions of
  every project, each with a restore action.
- **Panel buttons** — on Windows the Plugins and Schedules buttons move from the
  sidebar navigation list into the caption strip beside the application menu;
  the navigation list is hidden there. On other platforms the shipped list stays.
- **Balance chip** — remaining balance, plus spent today and in total, above the
  settings row. Click opens the top-up page, Shift+click forces a refresh. The
  numbers come from the signed-in DeepSeek account, or from `DEEPSEEK_API_KEY`
  when there is no account.

## Layout and limits

- The bundle occupies the single `sidebar.workspaces` slot with `priority: -1`,
  which shadows the shipped workspace browser at priority 0. The region is
  therefore owned by this bundle: search, drag ordering and multi-select from the
  shipped browser are not reimplemented, and the **All** tile keeps every session
  reachable without the shipped search.
- Sessions are archived, never deleted — the harness API has no session delete.
- Renaming a session goes through a small Host route
  (`POST /api/dsh-opencode-classic-sidebar/session-rename`) that calls
  `sessionController.rename`, because the shipped rename dialog belongs to the
  browser this bundle replaces. If that internal service is unavailable the
  action reports a failure instead of pretending to succeed.
- The shipped sidebar chrome (brand row, New-session row) is replaced through the
  stable seams of the shell — the `[data-slot="..."]` anchors, `data-window-drag`
  on the logo row and `data-platform`/`data-windows-titlebar` on the document
  element — never through the shipped CSS-module hashes. A future sidebar
  redesign can drop that cosmetic override; it cannot break the list itself.
- Requires DeepSeek Harness `>=0.2.2-rc.1 <0.3.0`.

## Development

`node harness.cjs` loads `client.js` in Node with a fake React renderer and fake
Client services, then exercises the whole flow: creating a project through the
folder dialog, the session and project menus, the archive view, the rename route,
the caption-strip panel buttons and the injected stylesheet.

## License

MIT
