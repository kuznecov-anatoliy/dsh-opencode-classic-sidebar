/**
 * Client half: the DSH sidebar region, redrawn as two panes.
 *
 *   [ projects ] [ sessions of the selected project ]
 *
 * The shipped WorkspaceBrowser occupies the single `sidebar.workspaces` slot
 * with priority 0. SlotCore sorts a cell's entries by priority ascending and the
 * outlet renders the first one, so this entry registers with priority -1 and
 * becomes the active occupant. It therefore owns the whole region: the data
 * comes from the slot's own standard props (`useWorkspaces`, `useSessions`),
 * and navigation goes through the public Client service `uiWorkspace`.
 *
 * What the region carries:
 *   - project tiles with live markers and a stable per-project hue, the selected
 *     project's Sessions under a header naming the project and its `~` path, a
 *     new-chat button, an "add project" tile running the Host folder dialog
 *     through the same path the shipped browser uses, and the actions the
 *     shipped browser had: a Session row menu (pin, rename, fork, copy id,
 *     archive/restore), a project menu (rename, delete), and an archive view that
 *     keeps archived Sessions reachable. Search, drag order and multi-select are
 *     not implemented. Because owning the region hides the shipped search/list,
 *     the rail always offers an "All" cell: every non-archived Session stays
 *     reachable no matter which project is selected.
 *   - the global panel buttons (Plugins, Schedules), moved from the sidebar nav
 *     list into the Windows caption strip beside the application menu (the list
 *     is hidden under `html[data-windows-titlebar]` only, so other platforms
 *     keep it);
 *   - the account balance chip above the Settings/account row.
 */
window.__ModuleLoader__.load({
  id: 'dsh-opencode-classic-sidebar',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const STORAGE_KEY = 'dsh-opencode-classic-sidebar:selected:v1'
    const ALL = '@all'

    const CSS = `
.dpr-root {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: row;
  min-width: 0;
  min-height: 0;
  max-height: 100cqh;
  overflow: hidden;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  /* The band between a 40px project tile and the Session titles next to it.
     Left alone it was 14px (4px of strip centering inside the 52px column plus
     the row's own 8px of padding), which read as the two columns touching. The
     pane grew it 5x (70px), then -25% (52.5px), -10% (47.25px) and -10% again
     (42.5px), so 28.5px of padding carries the difference. */
  --dpr-pane-inset: 28.5px;
}
.dpr-strip {
  flex: none;
  width: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 16px between the 40px tiles: the strip read as a solid wall of squares at
     4px, and OpenCode-style columns keep a clear seam between projects. The
     seam is doubled from the first 8px because the tiles still blurred into a
     vertical bar at that spacing. */
  gap: 16px;
  padding: 4px 2px 8px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}
.dpr-strip::-webkit-scrollbar { display: none; }
.dpr-project {
  flex: none;
  position: relative;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}
.dpr-project[data-all] {
  font-size: 10px;
  letter-spacing: 0.04em;
}
/* Adding a project sits after the tiles, dressed as an empty slot: a dashed
   outline reads as "room for one more" rather than as another project. */
.dpr-project-add {
  /* A little more air than the tile gap above it: the dashed slot is not a
     project, and at the doubled 16px seam it needs 8px on top to stay apart. */
  margin-top: 8px;
  border: 1px dashed var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
}
.dpr-project-add:hover {
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
.dpr-project-add:disabled {
  opacity: 0.45;
  cursor: default;
}
.dpr-project:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dpr-project[aria-current='true'] {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
.dpr-project[aria-current='true']::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
}
.dpr-project:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  outline-offset: -2px;
}
/* The project holding the session shown in the main view: a permanent, quiet
   ring, so "where I am working" is visible without looking at the list. */
.dpr-project[data-live] {
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  color: var(--dsw-alias-label-primary);
}
/* One hue per project, derived from its id and stable across sessions, so the
   column becomes a landmark map instead of a wall of identical tiles. Red is
   left out on purpose: it already means "waits for your answer". Light values
   sit on the body, dark ones on the theme attribute, exactly like the shipped
   token sheets. */
:root {
  --dpr-tone-0: #3b5bdb;
  --dpr-tone-1: #6d3fc4;
  --dpr-tone-2: #b3266b;
  --dpr-tone-3: #c2410c;
  --dpr-tone-4: #9a6700;
  --dpr-tone-5: #2b8a3e;
  --dpr-tone-6: #0b7285;
}
body[data-ds-dark-theme] {
  --dpr-tone-0: #7f9cff;
  --dpr-tone-1: #b197fc;
  --dpr-tone-2: #f783ac;
  --dpr-tone-3: #ffa066;
  --dpr-tone-4: #e8b93c;
  --dpr-tone-5: #69db7c;
  --dpr-tone-6: #46d3d8;
}
[data-dpr-tone='0'] { --dpr-tile-ink: var(--dpr-tone-0); }
[data-dpr-tone='1'] { --dpr-tile-ink: var(--dpr-tone-1); }
[data-dpr-tone='2'] { --dpr-tile-ink: var(--dpr-tone-2); }
[data-dpr-tone='3'] { --dpr-tile-ink: var(--dpr-tone-3); }
[data-dpr-tone='4'] { --dpr-tile-ink: var(--dpr-tone-4); }
[data-dpr-tone='5'] { --dpr-tile-ink: var(--dpr-tone-5); }
[data-dpr-tone='6'] { --dpr-tile-ink: var(--dpr-tone-6); }
.dpr-project[data-dpr-tone] {
  color: var(--dpr-tile-ink);
  background: color-mix(in srgb, var(--dpr-tile-ink) 12%, transparent);
}
.dpr-project[data-dpr-tone]:hover {
  color: var(--dpr-tile-ink);
  background: color-mix(in srgb, var(--dpr-tile-ink) 18%, transparent);
}
.dpr-project[data-dpr-tone][aria-current='true'] {
  color: var(--dpr-tile-ink);
  background: color-mix(in srgb, var(--dpr-tile-ink) 24%, transparent);
  border-color: color-mix(in srgb, var(--dpr-tile-ink) 50%, transparent);
}
.dpr-project[data-dpr-tone][aria-current='true']::before {
  background: var(--dpr-tile-ink);
}
.dpr-project[data-dpr-tone][data-live] {
  color: var(--dpr-tile-ink);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--dpr-tile-ink) 65%, transparent);
}
.dpr-project[data-dpr-tone]:focus-visible {
  outline-color: var(--dpr-tile-ink);
}
/* The per-project tag in the "All sessions" list borrows the same hue, so a row
   can be traced back to its tile without reading the title. */
.dpr-tag[data-dpr-tone] {
  color: var(--dpr-tile-ink);
}
/* Status markers on a tile: a pulsing dot (work in progress), a red dot
   (a Session in this project waits for an answer) and a green dot (a Session
   finished while another one was open). */
.dpr-marker {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  pointer-events: none;
}
.dpr-marker[data-kind='run'] {
  right: 3px;
  bottom: 3px;
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  animation: dpr-pulse 1.1s ease-in-out infinite;
}
.dpr-marker[data-kind='attention'] {
  right: 1px;
  top: 1px;
  width: 7px;
  height: 7px;
  background: var(--dsw-alias-state-error-primary, #c0392b);
  animation: dpr-pulse-attention 0.55s ease-in-out infinite;
}
.dpr-marker[data-kind='unread'] {
  right: 2px;
  top: 2px;
  background: var(--dsw-alias-state-success-primary, #3fb950);
}
@keyframes dpr-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.6); }
  50% { opacity: 1; transform: scale(1); }
}
/* A request for the user outranks ordinary progress: faster, harder pulse in
   red, so an approval or a question can be told apart from work at a glance. */
@keyframes dpr-pulse-attention {
  0%, 100% { opacity: 0.5; transform: scale(0.75); }
  50% { opacity: 1; transform: scale(1.2); }
}
@media (prefers-reduced-motion: reduce) {
  .dpr-marker[data-kind='run'],
  .dpr-marker[data-kind='attention'] {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
/* The row currently shown in the main view, and the row that waits for you. */
.dpr-row {
  position: relative;
}
/* The open Session wears the hover fill one step stronger (the theme's pressed
   tone is the same paint at a higher alpha), so "where I am" reads at a glance
   without hunting for the bolder title. Hover keeps that fill. */
.dpr-row[data-current] {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dpr-dot[data-kind='attention'] {
  width: 8px;
  height: 8px;
  background: var(--dsw-alias-state-error-primary, #c0392b);
  animation: dpr-pulse-attention 0.55s ease-in-out infinite;
}
.dpr-dot[data-kind='run'] {
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  animation: dpr-pulse 1.1s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .dpr-dot[data-kind='run'],
  .dpr-dot[data-kind='attention'] {
    animation: none;
    opacity: 1;
  }
}
.dpr-pane {
  flex: 1 1 auto;
  min-width: 0;
  /* The band to the project tiles lives on the pane, so the project name above
     and every Session row shift together instead of the header drifting away
     from the list. */
  padding-left: var(--dpr-pane-inset);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.dpr-head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 2px 6px 8px 4px;
}
.dpr-head-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
/* Where the project actually lives, the way an editor labels a folder. */
.dpr-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary);
  direction: ltr;
  unicode-bidi: plaintext;
}
/* A refused "add project" keeps its reason under the header instead of a dead click. */
.dpr-error {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-state-error-primary);
}
.dpr-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* A step above the session rows: the header names the whole list, so it reads
     as a heading instead of matching the row text under it. */
  font-size: 14px;
  line-height: 18px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dpr-count {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dpr-action {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.dpr-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
/* New session, moved from the shipped bar above the column into the gap under
   the project name: the shipped row is hidden while this pane is on screen, so
   starting a chat happens where the project it starts in is named. Contour only
   (the theme fill would outshout the list), 32px like a two-row control. The
   header's own 8px of bottom padding plus 16px here is the 24px that keeps the
   bar off the project name — three times the 8px it had at first. */
.dpr-new {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  margin: 16px 4px 10px 0;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dpr-new:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dpr-new:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  outline-offset: -2px;
}
.dpr-new-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dpr-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  /* 6px between 30px rows: the list breathes like the original browser's
     session column instead of stacking as one solid block. Grown by half from
     the original 4px, so the rows read as separate sessions at a glance. */
  gap: 6px;
  /* The breath between the project header and its Sessions now belongs to the
     New-session bar above; what is left here keeps the first row off the bar's
     bottom edge. The gap sits on the list alone, so the project column keeps
     starting at the very top of the region. */
  padding: 2px 4px 8px 0;
  scrollbar-width: thin;
}
.dpr-row {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
}
.dpr-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dpr-row[data-current]:hover {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
}
.dpr-tag {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-tertiary);
  min-width: 18px;
}
.dpr-row-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.dpr-row-time {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dpr-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-primary, #3fb950);
}
/* The row's trailing slot is a relative time until you touch the row, then the
   actions button — the same trade the shipped browser makes. */
.dpr-row-more {
  display: none;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.dpr-row:hover .dpr-row-time,
.dpr-row:focus-within .dpr-row-time {
  display: none;
}
.dpr-row:hover .dpr-row-more,
.dpr-row:focus-within .dpr-row-more {
  display: inline-flex;
}
.dpr-row-more:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dpr-row:focus-visible {
  outline: 2px solid var(--dsw-alias-border-l2);
  outline-offset: -2px;
}
.dpr-pin {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary);
}
.dpr-notice {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-state-success-primary, #3fb950);
}
.dpr-action[aria-pressed='true'] {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-label-primary);
}
/* Actions popover, anchored to the press point and kept inside the viewport. */
.dpr-menu {
  box-sizing: border-box;
  position: fixed;
  z-index: 1000;
  min-width: 176px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 8px 24px rgb(0 0 0 / 22%);
}
.dpr-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.dpr-menu-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dpr-menu-item[data-danger='true'] {
  color: var(--dsw-alias-state-error-primary, #c0392b);
}
.dpr-menu-item[data-danger='true']:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c0392b) 12%, transparent);
}
.dpr-menu-sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l1);
}
/* Rename / delete dialog: a small centered sheet above the whole GUI. */
.dpr-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 32%);
}
.dpr-dialog {
  box-sizing: border-box;
  width: min(320px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 16px 40px rgb(0 0 0 / 30%);
  font-size: 13px;
}
.dpr-dialog-title {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dpr-dialog-body {
  color: var(--dsw-alias-label-secondary);
  line-height: 1.45;
}
.dpr-dialog-subject {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dpr-input {
  box-sizing: border-box;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
}
.dpr-input:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  outline-offset: -1px;
}
.dpr-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.dpr-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dpr-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dpr-btn[data-primary='true'] {
  background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  border-color: transparent;
  color: #fff;
}
.dpr-btn[data-danger='true'] {
  background: var(--dsw-alias-state-error-primary, #c0392b);
  border-color: transparent;
  color: #fff;
}
.dpr-btn[data-primary='true']:hover,
.dpr-btn[data-danger='true']:hover {
  filter: brightness(1.08);
}
.dpr-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dpr-empty {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
/* Shipped sidebar chrome above our column is replaced by this bundle's own
   header: the brand band and the shipped New-session bar both go away. Their
   CSS-module class names are build hashes, so the overrides ride the seams the
   shell guarantees — the [data-slot="<key>"] anchors (display: contents divs),
   data-window-drag on the logo row and data-sidebar-toggle on the collapse
   control. */
/* The brand is gone. Its two slots stop painting, and off macOS the wrapper that
   held them is hidden as well: on Windows the brand doubles as a New Session
   button, and an empty one would leave an invisible click target in the row. The
   macOS rail reuses the mark slot inside the toggle, so the wrapper rule is
   scoped away from darwin; the anchor rule alone is enough there. */
[data-slot='sidebar.brand.mark'],
[data-slot='sidebar.brand.name'] {
  display: none;
}
html:not([data-platform='darwin']) [data-window-drag]:has([data-slot='sidebar.brand.mark']) > :has([data-slot='sidebar.brand.mark']) {
  display: none;
}
/* Windows: the toggle is position: fixed over the caption strip (the shipped
   collapsed state already relies on exactly that), so the logo band collapses to
   zero height and the column moves up by its 40px. On macOS the toggle stays in
   flow, so there the row keeps its height and only the brand disappears. */
html[data-windows-titlebar] [data-window-drag]:has([data-slot='sidebar.brand.mark']) {
  height: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
}
/* The shipped New-session bar moves into the project header. While the pane is on
   screen its row is emptied; in the collapsed rail the pane is not rendered, so
   the row survives and the rail keeps a way to start a chat. */
:has(.dpr-pane) > :has(> [data-slot='sidebar.session.action']) {
  display: none;
}
/* What is left of the New session slot (the rail) keeps only its contour: the
   fill drops to whatever sidebar surface sits behind it, so the control reads as
   an outline next to the list instead of the brightest one in the column. */
[data-slot='sidebar.session.action'] button {
  background: transparent;
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
[data-slot='sidebar.session.action'] button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
`

    /* Footer balance chip: ported from the removed dsh-rail plugin, restyled with
       its own attribute names so the two could never collide mid-migration. */
    const BALANCE_CSS = `
[data-dpr-balance] {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  /* The list slot renders straight into the footer action bar (a flex row):
     take a whole row and sort before the other actions, so the chip sits just
     above the Settings/account row. */
  flex: 0 0 100%;
  order: -1;
  width: 100%;
  height: 28px;
  margin: 2px 0 4px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  flex-wrap: wrap;
  row-gap: 2px;
  transition: background-color 0.12s ease;
}
@media (hover: hover) {
  [data-dpr-balance]:hover {
    background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  }
}
[data-dpr-balance]:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
[data-dpr-balance][data-loading='true'] {
  opacity: 0.6;
}
[data-dpr-balance-dot] {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-label-tertiary, #8a8f98);
  transition: background-color 0.12s ease;
}
[data-dpr-balance][data-tone='warn'] [data-dpr-balance-dot] {
  background: var(--dsw-alias-state-warn-primary, #d68a1f);
}
[data-dpr-balance][data-tone='low'] [data-dpr-balance-dot] {
  background: var(--dsw-alias-state-error-primary, #c0392b);
}
[data-dpr-balance][data-tone='muted'] [data-dpr-balance-dot] {
  background: var(--dsw-alias-state-idle-primary, #b6b6b6);
}
@media (prefers-reduced-motion: reduce) {
  [data-dpr-balance],
  [data-dpr-balance-dot] {
    transition: none;
  }
}
[data-dpr-balance-symbol] {
  flex: none;
  font-size: 11px;
  opacity: 0.75;
}
[data-dpr-balance-amount] {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-primary);
}
[data-dpr-balance][data-tone='warn'] [data-dpr-balance-amount] {
  color: var(--dsw-alias-state-warn-primary);
}
[data-dpr-balance][data-tone='low'] [data-dpr-balance-amount] {
  color: var(--dsw-alias-state-error-primary);
}
[data-dpr-balance][data-tone='muted'] [data-dpr-balance-amount] {
  color: var(--dsw-alias-label-tertiary);
}
/* Three tiers: balance (main reading) | hairline | metrics (label + value, right aligned). */
[data-dpr-balance-sep] {
  flex: none;
  align-self: center;
  width: 1px;
  height: 10px;
  margin: 0 8px;
  background: var(--dsw-alias-border-l2, var(--dsw-alias-label-tertiary));
  opacity: 0.5;
}
[data-dpr-balance-metrics] {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  margin-left: auto;
}
[data-dpr-balance-metric] {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  min-width: 0;
  white-space: nowrap;
}
[data-dpr-balance-metric-label] {
  flex: none;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0;
  color: var(--dsw-alias-label-tertiary);
}
[data-dpr-balance-delta],
[data-dpr-balance-total] {
  flex: none;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
}
`

    const BALANCE_URL = '/api/dsh-opencode-classic-sidebar/balance'
    const BALANCE_REFRESH_URL = '/api/dsh-opencode-classic-sidebar/balance/refresh'
    /**
     * Session rename has no Client service: the shipped dialog belongs to the
     * browser we replaced. The Host half exposes the tiny route behind it.
     */
    const SESSION_RENAME_URL = '/api/dsh-opencode-classic-sidebar/session-rename'
    /** Balance moves slowly; a minute between polls is plenty (focus also refreshes). */
    const BALANCE_POLL_MS = 60_000
    /** Below these values the chip turns amber, then red. */
    const BALANCE_WARN_AT = 50
    const BALANCE_LOW_AT = 10

    /** Client services resolved lazily: the section can render before they exist. */
    let pluginCtx = null

    function service(name) {
      if (pluginCtx === null) return undefined
      try {
        return pluginCtx.get(name)
      } catch (error) {
        return undefined
      }
    }

    function insertStyles() {
      const tag = document.createElement('style')
      tag.dataset.projectsRail = ''
      tag.textContent = CSS + BALANCE_CSS + TOPBAR_CSS
      document.head.appendChild(tag)
      return tag
    }

    function isRu() {
      return (document.documentElement.lang || 'en').toLowerCase().startsWith('ru')
    }

    function strings() {
      return isRu()
        ? {
          newChat: 'Новый чат',
          newSession: 'Новая сессия',
          noSessions: 'Пока нет сессий',
          all: 'Все',
          allProjects: 'Все сессии',
          empty: 'Нет проектов',
          waiting: 'ждёт ответа',
          unread: 'есть непрочитанное',
          working: 'идёт работа',
          addProject: 'Добавить проект',
          addFailed: 'Не удалось добавить проект',
          alreadyAdded: 'Этот проект уже добавлен',
          menu: 'Действия',
          rename: 'Переименовать',
          pin: 'Закрепить',
          unpin: 'Открепить',
          fork: 'Форк',
          copyId: 'Копировать ID',
          archive: 'В архив',
          restore: 'Восстановить',
          deleteProject: 'Удалить проект',
          archiveView: 'Архив',
          archiveViewHint: 'Показать архивные сессии',
          leaveArchive: 'Выйти из архива',
          archivedEmpty: 'В архиве пусто',
          sessionRenameTitle: 'Переименовать сессию',
          projectRenameTitle: 'Переименовать проект',
          deleteProjectTitle: 'Удалить проект?',
          deleteProjectBody: 'Проект исчезнет из списка вместе с сессиями. Папка на диске останется.',
          save: 'Сохранить',
          cancel: 'Отмена',
          delete: 'Удалить',
          renamed: 'Готово: переименовано',
          pinned: 'Закреплено',
          unpinned: 'Откреплено',
          archived: 'Убрано в архив',
          restored: 'Восстановлено',
          idCopied: 'ID скопирован',
          projectDeleted: 'Проект удалён',
          actionFailed: 'Не удалось выполнить действие',
          archiveBusy: 'Нельзя архивировать: в сессии идёт работа',
        }
        : {
          newChat: 'New chat',
          newSession: 'New session',
          noSessions: 'No sessions yet',
          all: 'All',
          allProjects: 'All sessions',
          empty: 'No projects',
          waiting: 'waiting for you',
          unread: 'unread result',
          working: 'working',
          addProject: 'Add project',
          addFailed: 'Could not add the project',
          alreadyAdded: 'This project is already added',
          menu: 'Actions',
          rename: 'Rename',
          pin: 'Pin',
          unpin: 'Unpin',
          fork: 'Fork',
          copyId: 'Copy ID',
          archive: 'Archive',
          restore: 'Restore',
          deleteProject: 'Delete project',
          archiveView: 'Archive',
          archiveViewHint: 'Show archived sessions',
          leaveArchive: 'Leave the archive',
          archivedEmpty: 'The archive is empty',
          sessionRenameTitle: 'Rename session',
          projectRenameTitle: 'Rename project',
          deleteProjectTitle: 'Delete this project?',
          deleteProjectBody: 'The project and its sessions leave the list. The folder on disk stays.',
          save: 'Save',
          cancel: 'Cancel',
          delete: 'Delete',
          renamed: 'Renamed',
          pinned: 'Pinned',
          unpinned: 'Unpinned',
          archived: 'Archived',
          restored: 'Restored',
          idCopied: 'ID copied',
          projectDeleted: 'Project deleted',
          actionFailed: 'The action failed',
          archiveBusy: 'Cannot archive while the session is working',
        }
    }

    /** Footer chip strings: kept next to the project strings, same language rule. */
    function balanceStrings() {
      return isRu()
        ? {
          checking: 'Читаю баланс…',
          signedOut: 'Не выполнен вход',
          signedOutHint: 'Нет доступного аккаунта DeepSeek или API-ключа. Войдите или добавьте ключ в настройках.',
          unavailable: 'Баланс недоступен',
          updated: 'Обновлено',
          toppedUp: 'Пополнено',
          granted: 'Бонус',
          hint: 'Нажмите, чтобы обновить',
          hintTopUp: 'Нажмите, чтобы пополнить (Shift+клик — обновить)',
          today: 'Сегодня потрачено',
          toppedUpToday: 'Пополнено сегодня',
          grantedToday: 'Бонус сегодня',
          total: 'Всего',
          since: 'с',
          todayLabel: 'Сегодня',
          totalLabel: 'Всего',
        }
        : {
          checking: 'Reading balance…',
          signedOut: 'Not signed in',
          signedOutHint: 'No DeepSeek account or API key is available. Sign in or add a key in Settings.',
          unavailable: 'Balance unavailable',
          updated: 'Updated',
          toppedUp: 'Topped up',
          granted: 'Granted',
          hint: 'Click to refresh',
          hintTopUp: 'Click to top up (Shift+click to refresh)',
          today: 'Spent today',
          toppedUpToday: 'Topped up today',
          grantedToday: 'Granted today',
          total: 'Total',
          since: 'since',
          todayLabel: 'Today',
          totalLabel: 'Total',
        }
    }

    function currencySymbol(currency) {
      return currency === 'USD' ? '$' : '¥'
    }

    function formatAmount(raw) {
      const value = Number.parseFloat(String(raw ?? ''))
      if (!Number.isFinite(value)) return '—'
      return value.toLocaleString(isRu() ? 'ru-RU' : 'zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }

    function balanceTone(raw) {
      const value = Number.parseFloat(String(raw ?? ''))
      if (!Number.isFinite(value)) return 'ok'
      if (value < BALANCE_LOW_AT) return 'low'
      if (value < BALANCE_WARN_AT) return 'warn'
      return 'ok'
    }

    function clockOf(at) {
      const date = new Date(Number(at) || Date.now())
      const pad = (value) => String(value).padStart(2, '0')
      return pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    /** Two letters from the project title, for the 40px tile. */
    function initialsOf(workspace) {
      const title = (workspace.title || workspace.path || '').trim()
      if (title.length === 0) return '??'
      const words = title.split(/[\s_\-./\\]+/).filter((word) => word.length > 0)
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
      return title.slice(0, 2).toUpperCase()
    }

    /** Path identity for "is this folder already a project?" on this platform. */
    function normalizePath(path) {
      if (typeof path !== 'string') return ''
      return path.trim().replace(/[\\/]+$/, '').toLowerCase()
    }

    /** How many hues the tile palette offers; the CSS defines --dpr-tone-<n>. */
    const TILE_TONES = 7

    /**
     * Stable hue index of one project. The id never changes, so a project keeps
     * its colour across restarts and reorders — the point of the palette.
     */
    function toneOf(workspace) {
      const seed = String(workspace.workspaceId ?? workspace.path ?? '')
      let hash = 0
      for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) % 1_000_003
      }
      return hash % TILE_TONES
    }

    /**
     * The Host folder dialog. The desktop shell exposes a bridge that the
     * shipped directory-picker package prefers too; the route is the fallback
     * for browser clients.
     */
    async function pickFolder(uiWorkspace) {
      const bridge = globalThis.__DSH_DIRECTORY_PICKER__
      if (bridge !== undefined && bridge !== null && typeof bridge.pick === 'function') {
        return bridge.pick()
      }
      return uiWorkspace.pickDirectory()
    }

    /**
     * A Workspace path as the eye reads it: the home prefix becomes `~`
     * (`C:\Users\Me\Desktop\РК` -> `~\Desktop\РК`) and a path too long for the
     * narrow column keeps its deepest segments, dropping the middle ones. The
     * full path stays in the tooltip, so nothing is lost.
     */
    function prettyPath(path) {
      if (typeof path !== 'string') return ''
      let text = path.trim().replace(/[\\/]+$/, '')
      if (text.length === 0) return ''
      const home = [
        /^[A-Za-z]:[\\/](?:Users|users)[\\/][^\\/]+/,
        /^[A-Za-z]:[\\/]Documents and Settings[\\/][^\\/]+/i,
        /^\/(?:Users|home)\/[^/]+/,
      ]
      for (const pattern of home) {
        if (pattern.test(text)) {
          text = '~' + text.slice(text.match(pattern)[0].length)
          break
        }
      }
      const BUDGET = 38
      if (text.length <= BUDGET) return text
      const separator = text.includes('\\') ? '\\' : '/'
      const parts = text.split(/[\\/]/).filter((part) => part.length > 0)
      if (parts.length < 3) return text
      const prefix = parts[0] + separator + '…' + separator
      let room = BUDGET - prefix.length
      const tail = []
      for (let index = parts.length - 1; index >= 1; index -= 1) {
        const part = parts[index]
        const cost = part.length + (tail.length === 0 ? 0 : 1)
        if (cost > room) break
        tail.unshift(part)
        room -= cost
      }
      if (tail.length === 0) return text
      return prefix + tail.join(separator)
    }

    /** Relative age, coarse on purpose: the rail shows rhythm, not timestamps. */
    function ageOf(updatedAt) {
      if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return ''
      const delta = Date.now() - updatedAt
      if (delta < 60_000) return isRu() ? 'сейчас' : 'now'
      const minutes = Math.floor(delta / 60_000)
      if (minutes < 60) return minutes + (isRu() ? ' м' : 'm')
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return hours + (isRu() ? ' ч' : 'h')
      const days = Math.floor(hours / 24)
      if (days < 30) return days + (isRu() ? ' д' : 'd')
      return Math.floor(days / 30) + (isRu() ? ' мес' : 'mo')
    }

    function readStored() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) ?? null
      } catch (error) {
        return null
      }
    }

    function writeStored(value) {
      try {
        if (value === null) window.localStorage.removeItem(STORAGE_KEY)
        else window.localStorage.setItem(STORAGE_KEY, value)
      } catch (error) {
        /* A blocked storage only costs the remembered selection. */
      }
    }

    /** Non-archived, non-subagent rows of one workspace, newest first. */
    function rowsOf(workspace, list, archivedSet) {
      const rows = []
      for (const sessionId of workspace.sessionIds ?? []) {
        if (archivedSet.has(sessionId)) continue
        const row = list.byId[sessionId]
        if (row === undefined || row === null) continue
        if (row.origin === 'subagent') continue
        rows.push(row)
      }
      rows.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      return rows
    }

    /** Every reachable session, whichever workspace it belongs to. */
    function allRows(workspaces, list, archivedSet) {
      const seen = new Set()
      const rows = []
      for (const workspace of workspaces) {
        for (const row of rowsOf(workspace, list, archivedSet)) {
          if (seen.has(row.id)) continue
          seen.add(row.id)
          rows.push(row)
        }
      }
      rows.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      return rows
    }

    /** Archived, non-subagent rows of every workspace, newest first. */
    function archivedRows(workspaces, list, archivedSet) {
      const seen = new Set()
      const rows = []
      for (const workspace of workspaces) {
        for (const sessionId of workspace.sessionIds ?? []) {
          if (!archivedSet.has(sessionId) || seen.has(sessionId)) continue
          const row = list.byId[sessionId]
          if (row === undefined || row === null || row.origin === 'subagent') continue
          seen.add(sessionId)
          rows.push(row)
        }
      }
      rows.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      return rows
    }

    /** Pinned Sessions lead in the Host's pin order; the rest keep newest-first. */
    function orderRows(rows, pinnedIds) {
      if (!Array.isArray(pinnedIds) || pinnedIds.length === 0) return rows
      const rank = new Map()
      pinnedIds.forEach((sessionId, index) => { rank.set(sessionId, index) })
      const pinned = []
      const rest = []
      for (const row of rows) {
        if (rank.has(row.id)) pinned.push(row)
        else rest.push(row)
      }
      pinned.sort((left, right) => rank.get(left.id) - rank.get(right.id))
      return pinned.concat(rest)
    }

    /** The project holding the freshest session: the best guess at "where I am". */
    function freshestWorkspaceId(workspaces, list, archivedSet) {
      let best = null
      let bestAt = -1
      for (const workspace of workspaces) {
        for (const row of rowsOf(workspace, list, archivedSet)) {
          const at = row.updatedAt ?? 0
          if (at > bestAt) {
            bestAt = at
            best = workspace.workspaceId
          }
        }
      }
      return best
    }

    function plusGlyph() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', {
          d: 'M8 3v10M3 8h10',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          fill: 'none',
        }))
    }

    /** 16px line glyphs for menus and row affordances; currentColor keeps them themed. */
    const GLYPHS = {
      more: 'M4 8h.01M8 8h.01M12 8h.01',
      pin: 'M6 3h4v3.5l2 2.5H4l2-2.5V3ZM8 9v4',
      rename: 'M3.5 12.5l1-3 6.5-6.5 2.5 2.5-6.5 6.5-3.5 1Z',
      fork: 'M5 3v6a2 2 0 0 0 2 2h4M11 3v9M9 12l2 2 2-2',
      copy: 'M6.5 6.5h6v6h-6v-6ZM9.5 6.5v-3h-6v6h3',
      archive: 'M3 4h10v3H3V4Zm1 3v6h8V7M6.5 9h3',
      restore: 'M3 7a5 5 0 1 1 1.6 4.4M3 3.5V7h3.5',
      trash: 'M3 5h10M6.5 5V3.5h3V5M5 5l.8 8h4.4L11 5',
    }

    function glyph(kind, size) {
      const path = GLYPHS[kind] ?? GLYPHS.more
      return h('svg', { width: size ?? 14, height: size ?? 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', {
          d: path,
          stroke: 'currentColor',
          strokeWidth: kind === 'more' ? 2 : 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          fill: 'none',
        }))
    }

    /** Clipboard write; a blocked clipboard only costs the confirmation. */
    async function copyText(value) {
      try {
        await navigator.clipboard.writeText(value)
        return true
      } catch (error) {
        console.error('[opencode-classic] clipboard write failed', error)
        return false
      }
    }

    /**
     * One tile marker, by precedence: a request for the user (red, fast pulse)
     * beats work in progress (blue pulse) beats an unread completion (green).
     * Only a project tile wears one: it names a single project, so the dot has
     * one owner. The "All" tile deliberately stays bare (see its call site).
     */
    function tileMarkers(state) {
      if (state.attention) {
        return [h('span', { key: 'attention', className: 'dpr-marker', 'data-kind': 'attention', 'aria-hidden': true })]
      }
      if (state.running) {
        return [h('span', { key: 'run', className: 'dpr-marker', 'data-kind': 'run', 'aria-hidden': true })]
      }
      if (state.unread) {
        return [h('span', { key: 'unread', className: 'dpr-marker', 'data-kind': 'unread', 'aria-hidden': true })]
      }
      return []
    }

    function Pane(props) {
      const text = strings()
      const workspaces = props.useWorkspaces((state) => state.items)
      const archived = props.useWorkspaces((state) => state.archivedSessionIds)
      const list = props.useSessions((state) => state)
      /**
       * Per-Session UI facts: running, a pending interaction, an unread
       * completion. Falls back to a null source when the slot does not supply
       * the standard hook, keeping the hook call position stable.
       */
      const useStatus = typeof props.useSessionStatus === 'function'
        ? props.useSessionStatus
        : () => null
      const statusMap = useStatus((state) => state)

      const items = Array.isArray(workspaces) ? workspaces : []
      const archivedSet = React.useMemo(() => new Set(archived ?? []), [archived])
      const workspaceById = React.useMemo(() => {
        const map = new Map()
        for (const workspace of items) map.set(workspace.workspaceId, workspace)
        return map
      }, [items])

      /** Project tag per session id, for the "all sessions" list: text plus hue. */
      const tagBySession = React.useMemo(() => {
        const map = new Map()
        for (const workspace of items) {
          const entry = { tag: initialsOf(workspace), tone: String(toneOf(workspace)) }
          for (const sessionId of workspace.sessionIds ?? []) {
            if (!map.has(sessionId)) map.set(sessionId, entry)
          }
        }
        return map
      }, [items])

      // Scroll handoff with the sidebar viewport, when the slot supplies it.
      const scroller = (() => {
        try {
          const factory = props.hooks?.sectionScroller
          return typeof factory === 'function' ? factory() : null
        } catch (error) {
          return null
        }
      })()

      /** The Session shown in the main view: ui-session's main binding, mapped onto the list. */
      const liveSessionId = React.useMemo(() => {
        const byId = list.byId ?? {}
        for (const id of Object.keys(byId)) {
          const row = byId[id]
          if (row !== undefined && (row.retainedBy?.mainView ?? 0) > 0) return id
        }
        return null
      }, [list])

      const liveWorkspaceId = React.useMemo(() => {
        if (liveSessionId === null) return null
        for (const workspace of items) {
          if ((workspace.sessionIds ?? []).includes(liveSessionId)) return workspace.workspaceId
        }
        return null
      }, [liveSessionId, items])

      /**
       * Status facts of one project: whether anything runs there, whether a
       * Session waits for the user, and whether a completion stayed unread.
       * Archived and subagent Sessions are invisible here too, so they cannot
       * decorate a tile.
       */
      const statusOfWorkspace = React.useCallback((workspace) => {
        const state = { running: false, attention: false, unread: false }
        if (statusMap == null) return state
        for (const sessionId of workspace.sessionIds ?? []) {
          if (archivedSet.has(sessionId)) continue
          const row = list.byId[sessionId]
          if (row === undefined || row === null || row.origin === 'subagent') continue
          const status = statusMap == null ? undefined : statusMap.get(sessionId)
          if (status === undefined) continue
          if (status.running === true) state.running = true
          // A permission request or a question always counts as attention, even
          // for the Session you are looking at: the task stops until you answer,
          // and that must not look like ordinary progress.
          if (status.pendingInteraction !== undefined) state.attention = true
          if (status.completionUnread === true) state.unread = true
        }
        return state
      }, [statusMap, archivedSet, list])

      const allStatus = React.useMemo(() => {
        const total = { running: false, attention: false, unread: false }
        for (const workspace of items) {
          const state = statusOfWorkspace(workspace)
          total.running = total.running || state.running
          total.attention = total.attention || state.attention
          total.unread = total.unread || state.unread
        }
        return total
      }, [items, statusOfWorkspace])

      /** Tooltip/accessible label with the status hints appended. */
      const decoratedLabel = (base, state) => {
        const hints = []
        if (state.attention) hints.push(text.waiting)
        else if (state.unread) hints.push(text.unread)
        if (state.running) hints.push(text.working)
        return hints.length === 0 ? base : base + ' — ' + hints.join(', ')
      }

      const [stored, setSelected] = React.useState(readStored)
      /** Add-project flow: the native picker is modal, so the tile waits for it. */
      const [adding, setAdding] = React.useState(false)
      const [addError, setAddError] = React.useState('')
      /** Row/project menu: a fixed popover anchored at the click point. */
      const [menu, setMenu] = React.useState(null)
      /** Modal dialog: session rename, project rename, or project delete. */
      const [dialog, setDialog] = React.useState(null)
      const [pending, setPending] = React.useState(false)
      /** Transient confirmation line under the header. */
      const [notice, setNotice] = React.useState('')
      /** The archive view lists archived Sessions instead of the selection. */
      const [archivedOnly, setArchivedOnly] = React.useState(false)
      const menuRef = React.useRef(null)
      const pinnedIds = props.useWorkspaces((state) => state.pinnedSessionIds)
      const pinnedSet = React.useMemo(
        () => new Set(Array.isArray(pinnedIds) ? pinnedIds : []),
        [pinnedIds],
      )

      // A remembered cell survives restarts, but never wins over deleted data.
      const selection = React.useMemo(() => {
        if (stored === ALL) return ALL
        if (stored !== null && workspaceById.has(stored)) return stored
        const freshest = freshestWorkspaceId(items, list, archivedSet)
        return freshest ?? items[0]?.workspaceId ?? null
      }, [stored, workspaceById, items, list, archivedSet])

      const active = selection === ALL || selection === null
        ? null
        : workspaceById.get(selection) ?? null

      const sessions = React.useMemo(() => {
        if (archivedOnly) return archivedRows(items, list, archivedSet)
        if (selection === ALL) return orderRows(allRows(items, list, archivedSet), pinnedIds)
        if (active === null) return []
        return orderRows(rowsOf(active, list, archivedSet), pinnedIds)
      }, [archivedOnly, selection, active, items, list, archivedSet, pinnedIds])

      const openSession = React.useCallback((sessionId) => {
        const uiWorkspace = service('uiWorkspace')
        if (uiWorkspace === undefined) return
        try {
          uiWorkspace.openSession(sessionId)
        } catch (error) {
          console.error('[opencode-classic] openSession failed', error)
        }
      }, [])

      const choose = React.useCallback((value, workspace) => {
        setSelected(value)
        writeStored(value)
        // Picking a project or "All" always means "leave the archive view".
        setArchivedOnly(false)
        // Opening the freshest session of the chosen project is the agreed
        // behaviour; the "All" cell only filters.
        if (workspace === undefined) return
        const newest = rowsOf(workspace, list, archivedSet)[0]
        if (newest !== undefined) openSession(newest.id)
      }, [list, archivedSet, openSession])

      const startSession = React.useCallback(() => {
        const uiWorkspace = service('uiWorkspace')
        if (uiWorkspace === undefined) return
        const workspaceId = active?.workspaceId ?? freshestWorkspaceId(items, list, archivedSet) ?? undefined
        try {
          uiWorkspace.startSession(workspaceId)
        } catch (error) {
          console.error('[opencode-classic] startSession failed', error)
        }
      }, [active, items, list, archivedSet])

      /**
       * Add a project the way the shipped browser does it: the Host's native
       * folder dialog picks a directory, the Workspace registry adopts it, and
       * a fresh Session opens in it. An already-known folder is not an error —
       * it just selects the project that already points there.
       */
      const addProject = React.useCallback(async () => {
        setAddError('')
        const uiWorkspace = service('uiWorkspace')
        const workspaceService = service('workspaces')
        if (uiWorkspace === undefined || workspaceService === undefined) return
        setAdding(true)
        try {
          const picked = await pickFolder(uiWorkspace)
          if (typeof picked !== 'string' || picked.trim().length === 0) return
          const wanted = normalizePath(picked)
          const known = items.find((workspace) => normalizePath(workspace.path) === wanted)
          if (known !== undefined) {
            choose(known.workspaceId, known)
            return
          }
          const created = await workspaceService.create({ path: picked })
          if (created === undefined || created === null || created.workspaceId === undefined) {
            setAddError(text.addFailed)
            return
          }
          setSelected(created.workspaceId)
          writeStored(created.workspaceId)
          uiWorkspace.startSession(created.workspaceId, { clearPreviousDraft: false })
        } catch (error) {
          console.error('[opencode-classic] add project failed', error)
          setAddError(text.addFailed)
        } finally {
          setAdding(false)
        }
      }, [items, choose, text])

      // A confirmation line is a receipt, not a message: it clears itself.
      React.useEffect(() => {
        if (notice === '') return undefined
        const timer = window.setTimeout(() => { setNotice('') }, 2600)
        return () => { window.clearTimeout(timer) }
      }, [notice])

      // The popover closes on an outside press or Escape, like a native menu.
      React.useEffect(() => {
        if (menu === null) return undefined
        const onPress = (event) => {
          if (menuRef.current !== null && menuRef.current.contains(event.target)) return
          setMenu(null)
        }
        const onKey = (event) => { if (event.key === 'Escape') setMenu(null) }
        document.addEventListener('mousedown', onPress)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onPress)
          document.removeEventListener('keydown', onKey)
        }
      }, [menu])

      /** Open the actions popover at the click point, kept inside the viewport. */
      const openMenu = React.useCallback((event, descriptor) => {
        if (event !== null && typeof event.preventDefault === 'function') event.preventDefault()
        if (event !== null && typeof event.stopPropagation === 'function') event.stopPropagation()
        let x = 0
        let y = 0
        if (event !== null && typeof event.clientX === 'number' && event.clientX > 0) {
          x = event.clientX
          y = event.clientY
        } else {
          const rect = event?.currentTarget?.getBoundingClientRect?.()
          x = rect === undefined ? 12 : rect.left
          y = rect === undefined ? 12 : rect.bottom
        }
        const width = 210
        const height = descriptor.kind === 'projectMenu' ? 120 : 260
        const left = Math.max(8, Math.min(x, (window.innerWidth || 1280) - width))
        const top = Math.max(8, Math.min(y, (window.innerHeight || 800) - height))
        setMenu({ ...descriptor, left, top })
      }, [])

      /** Every menu action lands here: pick the service call by item kind. */
      const runAction = React.useCallback(async (action) => {
        setMenu(null)
        const uiWorkspace = service('uiWorkspace')
        if (uiWorkspace === undefined) return
        try {
          if (action.kind === 'pin') {
            await uiWorkspace.pinSession(action.id)
            setNotice(text.pinned)
          } else if (action.kind === 'unpin') {
            await uiWorkspace.unpinSession(action.id)
            setNotice(text.unpinned)
          } else if (action.kind === 'archive') {
            await uiWorkspace.archiveSession(action.id, { stopActivity: false })
            setNotice(text.archived)
          } else if (action.kind === 'restore') {
            await uiWorkspace.unarchiveSession(action.id)
            setNotice(text.restored)
          } else if (action.kind === 'fork') {
            const child = await uiWorkspace.forkSession(action.id)
            if (typeof child === 'string' && child !== '') openSession(child)
          } else if (action.kind === 'copyId') {
            const copied = await copyText(String(action.id))
            setNotice(copied ? text.idCopied : text.actionFailed)
          } else if (action.kind === 'renameSession') {
            setDialog({ kind: 'session', id: action.id, value: action.title ?? '' })
          } else if (action.kind === 'renameProject') {
            setDialog({ kind: 'project', id: action.id, value: action.title ?? '' })
          } else if (action.kind === 'deleteProject') {
            setDialog({ kind: 'deleteProject', id: action.id, value: action.title ?? '' })
          }
        } catch (error) {
          console.error('[opencode-classic] action failed', error)
          setNotice(action.kind === 'archive' && action.running === true ? text.archiveBusy : text.actionFailed)
        }
      }, [openSession, text])

      /** Rename/delete dialog submit. */
      const submitDialog = React.useCallback(async () => {
        if (dialog === null || pending) return
        const title = typeof dialog.value === 'string' ? dialog.value.trim() : ''
        if (dialog.kind !== 'deleteProject' && title === '') return
        setPending(true)
        try {
          if (dialog.kind === 'session') {
            const response = await fetch(SESSION_RENAME_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ sessionId: dialog.id, title }),
            })
            if (!response.ok) throw new Error('session rename returned ' + response.status)
            setNotice(text.renamed)
          } else {
            const workspaceService = service('workspaces')
            if (workspaceService === undefined) throw new Error('workspaces service is missing')
            if (dialog.kind === 'project') {
              await workspaceService.rename(dialog.id, title)
              setNotice(text.renamed)
            } else {
              await workspaceService.delete(dialog.id)
              if (stored === dialog.id) {
                setSelected(null)
                writeStored(null)
              }
              setNotice(text.projectDeleted)
            }
          }
          setDialog(null)
        } catch (error) {
          console.error('[opencode-classic] dialog action failed', error)
          setNotice(text.actionFailed)
        } finally {
          setPending(false)
        }
      }, [dialog, pending, stored, text])

      if (workspaces === undefined || workspaces === null) {
        return h('div', { className: 'dpr-empty' }, text.empty)
      }

      const strip = h('div', { className: 'dpr-strip' },
        // No status dot on purpose: "All" is a filter over every project, not a
        // project of its own, so a dot on it would point at nothing. The tooltip
        // still carries the summed hints for whoever wants them.
        h('button', {
          key: ALL,
          type: 'button',
          className: 'dpr-project',
          'data-all': '',
          title: decoratedLabel(text.allProjects, allStatus),
          'aria-label': decoratedLabel(text.allProjects, allStatus),
          'aria-current': selection === ALL ? 'true' : undefined,
          onClick: () => { choose(ALL, undefined) },
        }, text.all),
        items.map((workspace) => {
          const current = active !== null && workspace.workspaceId === active.workspaceId
          const state = statusOfWorkspace(workspace)
          const wherePath = prettyPath(workspace.path)
          const label = decoratedLabel(wherePath === '' ? workspace.title : workspace.title + ' — ' + wherePath, state)
          return h('button', {
            key: workspace.workspaceId,
            type: 'button',
            className: 'dpr-project',
            title: label,
            'data-dpr-tone': String(toneOf(workspace)),
            'data-live': workspace.workspaceId === liveWorkspaceId ? 'true' : undefined,
            'aria-label': label,
            'aria-current': current ? 'true' : undefined,
            onClick: () => { choose(workspace.workspaceId, workspace) },
            onContextMenu: (event) => {
              openMenu(event, { kind: 'projectMenu', id: workspace.workspaceId, title: workspace.title })
            },
          }, initialsOf(workspace), tileMarkers(state))
        }),
        h('button', {
          key: '@add',
          type: 'button',
          className: 'dpr-project dpr-project-add',
          title: text.addProject,
          'aria-label': text.addProject,
          'aria-busy': adding ? 'true' : undefined,
          disabled: adding,
          onClick: () => { void addProject() },
        }, plusGlyph()))

      const heading = archivedOnly
        ? text.archiveView
        : selection === ALL ? text.allProjects : (active === null ? text.empty : active.title)
      const fullPath = active === null || typeof active.path !== 'string' ? '' : active.path
      const where = archivedOnly || active === null ? '' : prettyPath(active.path)
      const head = h('div', { className: 'dpr-head' },
        h('div', { className: 'dpr-head-main' },
          h('span', { className: 'dpr-title', title: heading }, heading),
          h('span', { className: 'dpr-count' }, String(sessions.length)),
          active !== null && !archivedOnly
            ? h('button', {
              type: 'button',
              className: 'dpr-action',
              title: text.menu,
              'aria-label': text.menu,
              onClick: (event) => {
                openMenu(event, { kind: 'projectMenu', id: active.workspaceId, title: active.title })
              },
            }, glyph('more', 16))
            : null,
          h('button', {
            type: 'button',
            className: 'dpr-action',
            title: archivedOnly ? text.leaveArchive : text.archiveViewHint,
            'aria-label': archivedOnly ? text.leaveArchive : text.archiveView,
            'aria-pressed': archivedOnly ? 'true' : 'false',
            onClick: () => { setArchivedOnly((current) => !current) },
          }, glyph('archive', 16)),
          h('button', {
            type: 'button',
            className: 'dpr-action',
            title: text.newChat,
            'aria-label': text.newChat,
            onClick: startSession,
          }, plusGlyph())),
        where === '' ? null : h('div', { className: 'dpr-path', title: fullPath }, where),
        notice === '' ? null : h('div', { className: 'dpr-notice', role: 'status' }, notice),
        addError === '' ? null : h('div', { className: 'dpr-error', role: 'alert', title: addError }, addError))

      /** One menu source for a Session row: its live status decides the wording. */
      const openSessionMenu = (event, row) => {
        const status = statusMap == null ? undefined : statusMap.get(row.id)
        openMenu(event, {
          kind: 'sessionMenu',
          id: row.id,
          title: row.displayTitle,
          running: row.running === true || (status !== undefined && status.running === true),
          archived: archivedOnly,
        })
      }

      const rows = sessions.length === 0
        ? [h('div', { key: 'empty', className: 'dpr-empty' }, archivedOnly ? text.archivedEmpty : text.noSessions)]
        : sessions.map((row) => {
          const status = statusMap == null ? undefined : statusMap.get(row.id)
          const attention = status !== undefined && status.pendingInteraction !== undefined
          const running = row.running === true || (status !== undefined && status.running === true)
          const unread = status !== undefined && status.completionUnread === true
          const kind = attention ? 'attention' : running ? 'run' : unread ? 'unread' : null
          const hint = kind === 'attention' ? text.waiting : kind === 'run' ? text.working : kind === 'unread' ? text.unread : null
          const tag = selection === ALL || archivedOnly ? tagBySession.get(row.id) : undefined
          const pinned = pinnedSet.has(row.id) && !archivedOnly
          return h('div', {
            key: row.id,
            className: 'dpr-row',
            role: 'button',
            tabIndex: 0,
            title: hint === null ? row.displayTitle : row.displayTitle + ' — ' + hint,
            'data-current': row.id === liveSessionId ? 'true' : undefined,
            'data-archived': archivedOnly ? 'true' : undefined,
            onClick: () => { openSession(row.id) },
            onKeyDown: (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              openSession(row.id)
            },
            onContextMenu: (event) => { openSessionMenu(event, row) },
          },
          kind === null ? null : h('span', { className: 'dpr-dot', 'data-kind': kind, 'aria-hidden': true }),
          pinned ? h('span', { className: 'dpr-pin', 'aria-hidden': true }, glyph('pin', 11)) : null,
          tag === undefined ? null : h('span', { className: 'dpr-tag', 'data-dpr-tone': tag.tone }, tag.tag),
          h('span', { className: 'dpr-row-title' }, row.displayTitle),
          h('span', { className: 'dpr-row-time' }, ageOf(row.updatedAt)),
          h('button', {
            type: 'button',
            className: 'dpr-row-more',
            title: text.menu,
            'aria-label': text.menu,
            onClick: (event) => { openSessionMenu(event, row) },
          }, glyph('more', 14)))
        })

      /** The popover's items, by target: a Session row or a project tile/header. */
      const menuItemsFor = () => {
        if (menu === null) return []
        if (menu.kind === 'projectMenu') {
          return [
            { kind: 'renameProject', label: text.rename, icon: 'rename' },
            { separator: true },
            { kind: 'deleteProject', label: text.deleteProject, icon: 'trash', danger: true },
          ]
        }
        const items = []
        if (menu.archived !== true) {
          items.push(pinnedSet.has(menu.id)
            ? { kind: 'unpin', label: text.unpin, icon: 'pin' }
            : { kind: 'pin', label: text.pin, icon: 'pin' })
        }
        items.push({ kind: 'renameSession', label: text.rename, icon: 'rename' })
        if (menu.archived !== true) items.push({ kind: 'fork', label: text.fork, icon: 'fork' })
        items.push({ kind: 'copyId', label: text.copyId, icon: 'copy' })
        items.push({ separator: true })
        items.push(menu.archived === true
          ? { kind: 'restore', label: text.restore, icon: 'restore' }
          : { kind: 'archive', label: text.archive, icon: 'archive' })
        return items
      }

      const menuNode = menu === null ? null : h('div', {
        className: 'dpr-menu',
        role: 'menu',
        ref: menuRef,
        style: { left: menu.left + 'px', top: menu.top + 'px' },
      },
      menuItemsFor().map((item, index) => item.separator === true
        ? h('div', { key: 'sep' + index, className: 'dpr-menu-sep', role: 'separator' })
        : h('button', {
          key: item.kind + index,
          type: 'button',
          role: 'menuitem',
          className: 'dpr-menu-item',
          'data-danger': item.danger === true ? 'true' : undefined,
          onClick: (event) => {
            event.stopPropagation()
            void runAction({
              kind: item.kind,
              id: menu.id,
              title: menu.title,
              running: menu.running,
              archived: menu.archived,
            })
          },
        }, glyph(item.icon, 14), h('span', {}, item.label))))

      const dialogNode = dialog === null ? null : h('div', {
        className: 'dpr-dialog-backdrop',
        onClick: () => { if (!pending) setDialog(null) },
      },
      h('div', {
        className: 'dpr-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        onClick: (event) => { event.stopPropagation() },
        onKeyDown: (event) => {
          if (event.key === 'Escape' && !pending) setDialog(null)
        },
      },
      h('div', { className: 'dpr-dialog-title' },
        dialog.kind === 'session'
          ? text.sessionRenameTitle
          : dialog.kind === 'project' ? text.projectRenameTitle : text.deleteProjectTitle),
      dialog.kind === 'deleteProject'
        ? h('div', { className: 'dpr-dialog-body' }, text.deleteProjectBody)
        : h('input', {
          className: 'dpr-input',
          type: 'text',
          value: dialog.value,
          autoFocus: true,
          onChange: (event) => {
            const value = event.target.value
            setDialog((current) => (current === null ? current : { ...current, value }))
          },
          onKeyDown: (event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            void submitDialog()
          },
        }),
      dialog.kind === 'deleteProject'
        ? h('div', { className: 'dpr-dialog-subject', title: dialog.value }, dialog.value)
        : null,
      h('div', { className: 'dpr-dialog-actions' },
        h('button', {
          type: 'button',
          className: 'dpr-btn',
          onClick: () => { if (!pending) setDialog(null) },
        }, text.cancel),
        h('button', {
          type: 'button',
          className: 'dpr-btn',
          'data-primary': dialog.kind === 'deleteProject' ? undefined : 'true',
          'data-danger': dialog.kind === 'deleteProject' ? 'true' : undefined,
          disabled: pending || (dialog.kind !== 'deleteProject' && dialog.value.trim() === ''),
          onClick: () => { void submitDialog() },
        }, dialog.kind === 'deleteProject' ? text.delete : text.save))))

      const bindScroller = React.useCallback((element) => {
        if (element === null || scroller === null) return
        try {
          scroller.bindScrollerRef?.(element)
        } catch (error) {
          /* Scroll handoff is a nicety; a failure must not blank the region. */
        }
      }, [scroller])

      // The shipped New-session bar is hidden while this pane renders (see the
      // [data-slot="sidebar.session.action"] rules): the button belongs here,
      // under the project name, above the Sessions it starts next to.
      const newSessionBar = h('button', {
        type: 'button',
        className: 'dpr-new',
        title: text.newSession,
        'aria-label': text.newSession,
        onClick: startSession,
      }, plusGlyph(), h('span', { className: 'dpr-new-label' }, text.newSession))

      const pane = h('div', { className: 'dpr-pane' },
        head,
        newSessionBar,
        h('div', { className: 'dpr-list', ref: bindScroller }, rows))

      // The collapsed rail is 56px by contract: only the strip fits there.
      const narrow = props.wide === false
      // Menus and dialogs are viewport-fixed, so they mount beside the panes.
      return h('div', { className: 'dpr-root' }, strip, narrow ? null : pane, menuNode, dialogNode)
    }

    /** The standard props are the slot contract; a missing pair is a contract change. */
    function ProjectsRail(props) {
      if (typeof props.useWorkspaces !== 'function' || typeof props.useSessions !== 'function') {
        console.error('[opencode-classic] props missing useWorkspaces/useSessions')
        return null
      }
      return h(Pane, props)
    }

    /**
     * Sidebar-footer account balance chip.
     *
     * The number comes from the Host route `/api/dsh-opencode-classic-sidebar/balance`
     * (credentials never reach the browser). A click opens the DeepSeek top-up
     * page when the host reported one, Shift+click forces a refresh, and the
     * chip also polls once a minute and on window focus.
     */
    function BalanceChip() {
      const t = balanceStrings()
      const [snapshot, setSnapshot] = React.useState(null)
      const [pending, setPending] = React.useState(true)
      const [failure, setFailure] = React.useState(null)

      const load = React.useCallback(async (force) => {
        setPending(true)
        try {
          const response = await fetch(force ? BALANCE_REFRESH_URL : BALANCE_URL, {
            method: force ? 'POST' : 'GET',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
          if (!response.ok) throw new Error('HTTP ' + response.status)
          const next = await response.json()
          setSnapshot(next)
          setFailure(null)
        } catch (error) {
          setFailure(error instanceof Error ? error.message : String(error))
        } finally {
          setPending(false)
        }
      }, [])

      React.useEffect(() => {
        let alive = true
        const tick = () => {
          if (!alive) return
          if (typeof document !== 'undefined' && document.hidden) return
          void load(false)
        }
        void load(false)
        const timer = window.setInterval(tick, BALANCE_POLL_MS)
        const onFocus = () => tick()
        const onVisible = () => {
          if (typeof document !== 'undefined' && !document.hidden) tick()
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          alive = false
          window.clearInterval(timer)
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [load])

      const ready = snapshot !== null && snapshot.state === 'ready'
      const symbol = ready ? currencySymbol(snapshot.currency) : '¥'
      let text = '—'
      let tone = 'muted'
      /* A top-up link from the host means a click tops up; otherwise it refreshes. */
      const topUpUrl = snapshot !== null && typeof snapshot.topUpUrl === 'string' && /^https:\/\//.test(snapshot.topUpUrl)
        ? snapshot.topUpUrl
        : null
      let label = t.checking

      if (ready) {
        text = formatAmount(snapshot.total)
        tone = balanceTone(snapshot.total)
        label = [
          t.updated + ' ' + clockOf(snapshot.at),
          t.toppedUp + ' ' + symbol + formatAmount(snapshot.toppedUp),
          t.granted + ' ' + symbol + formatAmount(snapshot.granted),
        ].join(' · ')
      } else if (snapshot !== null && snapshot.state === 'signed-out') {
        text = t.signedOut
        label = t.signedOutHint
      } else if (snapshot !== null && snapshot.state === 'error') {
        label = String(snapshot.message ?? failure ?? t.unavailable)
      } else if (failure !== null) {
        label = failure
      }
      if (ready) label = label + '\n' + (topUpUrl === null ? t.hint : t.hintTopUp)
      /* Screen readers need the numbers, not the "click to refresh" hint. */
      const accessible = label.split('\n')[0]

      /* The right-hand numbers are today's balance drop (top-ups never make it
         negative) and the running total; nothing is shown for a zero day. */
      const spent = ready ? Number.parseFloat(String(snapshot.spentToday ?? '')) : Number.NaN
      const gained = ready ? Number.parseFloat(String(snapshot.toppedUpToday ?? '')) : Number.NaN
      const grantedToday = ready ? Number.parseFloat(String(snapshot.grantedToday ?? '')) : Number.NaN
      const totalSpent = ready ? Number.parseFloat(String(snapshot.totalSpent ?? '')) : Number.NaN
      const totalSince = ready && typeof snapshot.totalSince === 'string' ? snapshot.totalSince : ''
      const spentVisible = Number.isFinite(spent) && spent >= 0.005
      const spentText = spentVisible ? spent.toFixed(2) : null
      const totalVisible = Number.isFinite(totalSpent) && totalSpent >= 0.005
      const totalText = totalVisible ? totalSpent.toFixed(2) : null
      const hasMetrics = spentVisible || totalVisible
      if (ready && Number.isFinite(spent)) {
        label = label + '\n' + t.today + ' ' + spent.toFixed(2)
        if (Number.isFinite(gained) && gained >= 0.005) label = label + '\n' + t.toppedUpToday + ' +' + gained.toFixed(2)
        if (Number.isFinite(grantedToday) && grantedToday >= 0.005) label = label + '\n' + t.grantedToday + ' +' + grantedToday.toFixed(2)
        if (Number.isFinite(totalSpent)) {
          const since = totalSince === '' ? '' : ' (' + t.since + ' ' + totalSince + ')'
          label = label + '\n' + t.total + ' ' + symbol + totalSpent.toFixed(2) + since
        }
      }

      return h('button', {
        type: 'button',
        'data-dpr-balance': '',
        'data-tone': tone,
        'data-loading': pending && snapshot === null ? 'true' : 'false',
        title: label,
        'aria-label': accessible,
        onClick: (event) => {
          // Shift+click forces a refresh; the plain click spends itself on the top-up page.
          if (event !== undefined && event.shiftKey === true) {
            void load(true)
            return
          }
          if (topUpUrl === null) {
            void load(true)
            return
          }
          try {
            window.open(topUpUrl, '_blank', 'noopener,noreferrer')
          } catch {
            void load(true)
          }
        },
      },
      h('span', { 'data-dpr-balance-dot': '' }),
      h('span', { 'data-dpr-balance-symbol': '' }, symbol),
      h('span', { 'data-dpr-balance-amount': '' }, text),
      hasMetrics ? h('span', { 'data-dpr-balance-sep': '', 'aria-hidden': 'true' }) : null,
      hasMetrics
        ? h('span', { 'data-dpr-balance-metrics': '' },
          spentText === null
            ? null
            : h('span', { 'data-dpr-balance-metric': '' },
              h('span', { 'data-dpr-balance-metric-label': '' }, t.todayLabel),
              h('span', { 'data-dpr-balance-delta': '' }, spentText)),
          totalText === null
            ? null
            : h('span', { 'data-dpr-balance-metric': '' },
              h('span', { 'data-dpr-balance-metric-label': '' }, t.totalLabel),
              h('span', { 'data-dpr-balance-total': '' }, totalText)))
        : null)
    }

    /* ------------------------------------------------ panel buttons in the strip */

    /*
     * The global panel buttons (Plugins, Schedules) belong to the shipped
     * sidebar nav list. The project column takes that region's vertical space, so
     * this half moves the buttons into the Windows caption strip, right beside
     * the application menu, and hides the shipped list: moved, never duplicated.
     *
     * The strip is a real DOM row: the desktop preload marks the document with
     * `data-windows-titlebar` and publishes `--dsh-windows-titlebar-height`, and
     * the app menu itself is a fixed-position element at `[data-windows-menu]`.
     * This row measures that menu and sits just to its right, so it follows the
     * menu when the language changes.
     */
    const TOPBAR_CSS = `
[data-dss-panels] {
  position: absolute;
  top: 0;
  height: var(--dsh-windows-titlebar-height, 40px);
  display: flex;
  align-items: center;
  gap: 2px;
  z-index: 5;
  -webkit-app-region: no-drag;
  pointer-events: auto;
}
[data-dss-panels] > button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: default;
  white-space: nowrap;
}
[data-dss-panels] > button:hover,
[data-dss-panels] > button[aria-current='page'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dss-panels] > button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe));
  outline-offset: -2px;
}
/* The panel buttons live in the caption strip now: drop the sidebar's list.
   Scoped to the Windows strip, so other platforms keep the shipped list. */
html[data-windows-titlebar] [data-sidebar-scrollport] > nav {
  display: none !important;
}
`

    /** Panel id -> label, matching the shipped sidebar entries. */
    const PANELS = [
      { id: 'plugins', ru: 'Плагины', en: 'Plugins' },
      { id: 'schedules', ru: 'Расписания', en: 'Schedules' },
    ]
    const GAP_AFTER_MENU = 8
    const FALLBACK_ANCHOR = 56 + GAP_AFTER_MENU

    function panelLabel(panel) {
      return isRu() ? panel.ru : panel.en
    }

    /** Left edge of this row: right after the app menu, following its width. */
    function useMenuAnchor() {
      const [left, setLeft] = React.useState(FALLBACK_ANCHOR)

      React.useEffect(() => {
        let disposed = false
        let retry = 0
        let observer = null

        const measure = () => {
          const host = document.querySelector('[data-windows-menu]')
          if (host === null) return false
          const right = host.getBoundingClientRect().right
          if (right > 0) setLeft(Math.round(right + GAP_AFTER_MENU))
          return true
        }

        const bind = () => {
          const host = document.querySelector('[data-windows-menu]')
          if (host === null) return false
          measure()
          if (typeof ResizeObserver === 'function') {
            observer = new ResizeObserver(() => { measure() })
            observer.observe(host)
          }
          return true
        }

        if (!bind()) {
          retry = window.setInterval(() => {
            if (disposed) return
            if (bind()) {
              window.clearInterval(retry)
              retry = 0
            }
          }, 300)
        }

        // Menu labels follow the application language, and therefore its width.
        const langObserver = new MutationObserver(() => { measure() })
        langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
        window.addEventListener('resize', measure)
        const giveUp = window.setTimeout(() => {
          if (retry !== 0) {
            window.clearInterval(retry)
            retry = 0
          }
        }, 20_000)

        return () => {
          disposed = true
          if (retry !== 0) window.clearInterval(retry)
          window.clearTimeout(giveUp)
          if (observer !== null) observer.disconnect()
          langObserver.disconnect()
          window.removeEventListener('resize', measure)
        }
      }, [])

      return left
    }

    function PanelToolbar(props) {
      const usePanelInfo = props.usePanelInfo
      const active = typeof usePanelInfo === 'function'
        ? usePanelInfo((info) => info.activePanelId)
        : null
      const left = useMenuAnchor()

      const select = (id) => {
        const layout = service('layout')
        if (layout === undefined || layout === null) return
        try {
          // A second click on the open panel returns to the conversation.
          layout.selectPanel(active === id ? null : id)
        } catch (error) {
          console.error('[opencode-classic] panel selection failed', error)
        }
      }

      return h('div', {
        'data-dss-panels': '',
        role: 'toolbar',
        'aria-label': isRu() ? 'Инструменты' : 'Tools',
        style: { left: left + 'px' },
      }, PANELS.map((panel) => h('button', {
        key: panel.id,
        type: 'button',
        title: panelLabel(panel),
        'aria-current': active === panel.id ? 'page' : undefined,
        onClick: () => { select(panel.id) },
      }, panelLabel(panel))))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          pluginCtx = ctx
          ctx.effect(() => {
            const tag = insertStyles()
            return () => { tag.remove() }
          }, 'opencode-classic: styles')
          // SlotCore sorts a cell's entries by priority ascending and the outlet
          // renders the first: lower than the shipped 0 wins the election.
          ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
            name: 'sidebar.workspaces',
            priority: -1,
          }, ProjectsRail))
          // The same seat and order the removed dsh-rail chip used: a full row
          // above the Settings/account row.
          ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'opencode-classic-balance',
            order: -10,
          }, BalanceChip))
          // Windows only: elsewhere the caption strip does not exist and the
          // sidebar keeps its own panel list, which TOPBAR_CSS leaves alone.
          if (document.documentElement.hasAttribute('data-windows-titlebar')) {
            ctx.slots.inject('shell.overlay', () => ctx.slots.register({
              name: 'shell.overlay',
              id: 'opencode-classic-panels',
              order: 200,
            }, PanelToolbar))
          }
        } catch (error) {
          console.error('[opencode-classic] apply failed', error)
        }
      },
    }
  },
})
