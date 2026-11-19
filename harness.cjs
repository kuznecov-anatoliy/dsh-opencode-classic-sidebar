/* Offline harness: loads this bundle's static client module in Node with a fake
   React renderer, host globals and client services, then exercises the
   "add project" tile end to end (pick -> create -> select -> open a Session).

   Run: node harness.cjs
 */
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf8')

// --- fake React with a tiny hook engine -------------------------------------
let hookCursor = 0
let hookStore = []
let renderFn = null
const effects = []

function stateHook(initial) {
  const index = hookCursor++
  if (!(index in hookStore)) hookStore[index] = typeof initial === 'function' ? initial() : initial
  const set = (value) => {
    hookStore[index] = typeof value === 'function' ? value(hookStore[index]) : value
    if (typeof renderFn === 'function') renderFn()
  }
  return [hookStore[index], set]
}

const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props || {}), children: children.flat(Infinity).filter((child) => child !== undefined) } }
  },
  useState: stateHook,
  useMemo(factory) { return factory() },
  useCallback(fn) { return fn },
  useEffect(fn) { effects.push(fn) },
  useLayoutEffect(fn) { effects.push(fn) },
  useRef(initial) {
    const index = hookCursor++
    if (!(index in hookStore)) hookStore[index] = { current: initial }
    return hookStore[index]
  },
}

// --- fake host globals -------------------------------------------------------
const styleTags = []
let storage = {}
const documentStub = {
  documentElement: {
    lang: 'ru',
    hasAttribute: (name) => name === 'data-windows-titlebar',
  },
  querySelector: () => null,
  hidden: false,
  head: { appendChild(node) { styleTags.push(node) } },
  createElement() { return { dataset: {}, textContent: '', remove() {} } },
  addEventListener() {},
  removeEventListener() {},
}
const windowStub = {
  localStorage: {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value) },
    removeItem: (key) => { delete storage[key] },
  },
  setInterval: () => 0,
  clearInterval() {},
  setTimeout: () => 0,
  clearTimeout() {},
  addEventListener() {},
  removeEventListener() {},
  open() {},
  __ModuleLoader__: { load: (definition) => { captured = definition } },
}
let captured = null
globalThis.window = windowStub
globalThis.document = documentStub

// --- fake client services ----------------------------------------------------
const calls = {
  pick: 0,
  create: [],
  startSession: [],
  openSession: [],
  pin: [],
  unpin: [],
  archive: [],
  unarchive: [],
  fork: [],
  rename: [],
  remove: [],
  selectPanel: [],
  requests: [],
}
let pickedPath = 'C:\\Users\\Анатолий\\Desktop\\Новый проект'
globalThis.__DSH_DIRECTORY_PICKER__ = {
  pick: async () => { calls.pick += 1; return pickedPath },
}
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } },
  configurable: true,
})
globalThis.fetch = async (url, init) => {
  calls.requests.push({ url, body: init?.body })
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}

const uiWorkspaceStub = {
  openSession: (id) => { calls.openSession.push(id) },
  startSession: (id, options) => { calls.startSession.push([id, options]) },
  pickDirectory: async () => { throw new Error('route used instead of the desktop bridge') },
  pinSession: async (id) => { calls.pin.push(id) },
  unpinSession: async (id) => { calls.unpin.push(id) },
  archiveSession: async (id, options) => { calls.archive.push([id, options]) },
  unarchiveSession: async (id) => { calls.unarchive.push(id) },
  forkSession: async (id) => { calls.fork.push(id); return 's-child' },
}
const workspacesStub = {
  create: async (input) => {
    calls.create.push(input)
    return { workspaceId: 'ws-new', path: input.path, title: 'Новый проект', sessionIds: [] }
  },
  rename: async (id, title) => { calls.rename.push([id, title]) },
  delete: async (id) => { calls.remove.push(id) },
}

const layoutStub = { selectPanel: (id) => { calls.selectPanel.push(id) } }
const registered = new Map()
const ctxStub = {
  get: (name) => ({ uiWorkspace: uiWorkspaceStub, workspaces: workspacesStub, layout: layoutStub }[name]),
  effect: (fn) => { const cleanup = fn(); return () => { if (typeof cleanup === 'function') cleanup() } },
  slots: {
    inject: (name, callback) => callback(),
    register: (definition, component) => {
      registered.set(definition.name + (definition.id ? ':' + definition.id : ''), component)
      return () => {}
    },
  },
}

// --- workspace / session fixtures -------------------------------------------
const workspaceRow = {
  workspaceId: 'ws1',
  path: 'C:\\Users\\Анатолий\\Desktop\\РК',
  title: 'РК',
  sessionIds: ['s1', 's2'],
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-13T00:00:00Z',
}
const workspaceState = { items: [workspaceRow], archivedSessionIds: [], pinnedSessionIds: [] }
const sessionState = {
  byId: {
    s1: {
      id: 's1',
      displayTitle: 'Сессия 1',
      updatedAt: Date.now() - 60_000,
      retainedBy: { mainView: 1 },
      origin: 'user',
    },
    s2: {
      id: 's2',
      displayTitle: 'Старая сессия',
      updatedAt: Date.now() - 3_600_000,
      retainedBy: { mainView: 0 },
      origin: 'user',
    },
  },
}
const statusMap = new Map()

const props = {
  wide: true,
  useWorkspaces: (selector) => selector(workspaceState),
  useSessions: (selector) => selector(sessionState),
  useSessionStatus: (selector) => selector(statusMap),
  useSessionRetainInfo: (selector) => selector(new Map()),
  usePanelInfo: (selector) => selector({}),
  useSessionAccess: () => true,
  useRemoteAccess: () => true,
  hooks: {},
}

// --- boot the bundle ---------------------------------------------------------
eval(source)
if (captured === null) throw new Error('bundle did not register')
const plugin = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})
plugin.apply(ctxStub)
const ProjectsRail = registered.get('sidebar.workspaces')
if (typeof ProjectsRail !== 'function') throw new Error('sidebar.workspaces occupant not registered')

// --- render ------------------------------------------------------------------
let tree = null
const render = () => {
  hookCursor = 0
  let node = ProjectsRail(props)
  // Resolve function components the way a renderer would.
  while (node !== null && typeof node === 'object' && typeof node.type === 'function') {
    node = node.type(node.props)
  }
  tree = node
  if (typeof tree !== 'object' || tree === null) throw new Error('render returned nothing')
}
renderFn = render
render()

function walk(node, visit) {
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  if (node === null || typeof node !== 'object') return
  visit(node)
  walk(node.props?.children, visit)
}
function findByClass(root, className) {
  let found = null
  walk(root, (node) => { if (found === null && String(node.props?.className ?? '').split(' ').includes(className)) found = node })
  return found
}
function findAllByClass(root, className) {
  const found = []
  walk(root, (node) => { if (String(node.props?.className ?? '').split(' ').includes(className)) found.push(node) })
  return found
}

const assert = (condition, message) => { if (!condition) throw new Error('FAIL: ' + message) }

const addTile = findByClass(tree, 'dpr-project-add')
assert(addTile !== null, 'add tile is rendered')
assert(addTile.props.disabled === false || addTile.props.disabled === undefined, 'add tile starts enabled')
assert(String(addTile.props.title).length > 0, 'add tile has a tooltip')

const pathLine = findByClass(tree, 'dpr-path')
const pathText = Array.isArray(pathLine.props.children) ? pathLine.props.children.join('') : pathLine.props.children
assert(pathLine !== null && pathText === '~\\Desktop\\РК', 'header shows the ~ path: ' + String(pathText))
assert(findByClass(tree, 'dpr-head-main') !== null, 'header has a title row')

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

;(async () => {
  // 1. A brand-new folder: pick -> create -> select -> start a fresh Session.
  addTile.props.onClick()
  await tick()
  assert(calls.pick === 1, 'the desktop bridge opened the folder dialog')
  assert(calls.create.length === 1, 'one Workspace was created')
  assert(calls.create[0].path === pickedPath, 'the created Workspace uses the picked path')
  assert(calls.startSession.length === 1, 'a fresh Session opened in the new Workspace')
  assert(calls.startSession[0][0] === 'ws-new', 'the fresh Session targets the new Workspace')
  assert(storage['dsh-opencode-classic-sidebar:selected:v1'] === 'ws-new', 'the new project became the remembered selection')

  // 2. Cancelling the dialog is a no-op.
  pickedPath = null
  addTile.props.onClick()
  await tick()
  assert(calls.pick === 2, 'second click opened the dialog')
  assert(calls.create.length === 1, 'a cancelled dialog creates nothing')

  // 3. Picking a folder that is already a project selects it instead of failing.
  pickedPath = 'c:\\users\\АНАТОЛИЙ\\desktop\\рк\\'
  addTile.props.onClick()
  await tick()
  assert(calls.create.length === 1, 'no duplicate Workspace for a known folder')
  assert(storage['dsh-opencode-classic-sidebar:selected:v1'] === 'ws1', 'the known project became selected')
  assert(calls.openSession.includes('s1'), 'its freshest Session opened')

  // 4. Palette: a tile carries a stable hue; "All" and "add" stay neutral, and
  //    the row tag in the "All sessions" list borrows the project hue.
  const toneTiles = findAllByClass(tree, 'dpr-project').filter((node) => node.props['data-dpr-tone'] !== undefined)
  assert(toneTiles.length === 1, 'exactly one project tile carries a tone, got ' + toneTiles.length)
  const toneValue = Number(toneTiles[0].props['data-dpr-tone'])
  assert(Number.isInteger(toneValue) && toneValue >= 0 && toneValue < 7, 'the tone is inside the palette')
  assert(findByClass(tree, 'dpr-project-add').props['data-dpr-tone'] === undefined, 'the add tile stays neutral')
  const allTile = findAllByClass(tree, 'dpr-project').find((node) => node.props['data-all'] !== undefined)
  assert(allTile !== undefined && allTile.props['data-dpr-tone'] === undefined, 'the All tile stays neutral')
  render()
  const rerendered = findAllByClass(tree, 'dpr-project').find((node) => node.props['data-dpr-tone'] !== undefined)
  assert(rerendered.props['data-dpr-tone'] === String(toneValue), 'the tone is stable across renders')
  allTile.props.onClick()
  const rowTag = findByClass(tree, 'dpr-tag')
  assert(rowTag !== null && rowTag.props['data-dpr-tone'] === String(toneValue), 'the row tag borrows the project hue')

  // 5. Only the injected styles are ours; nothing threw during mounting.
  assert(styleTags.length === 1, 'one style tag injected')
  assert(styleTags[0].textContent.includes('.dpr-project-add'), 'add-tile CSS shipped')
  assert(styleTags[0].textContent.includes('--dpr-tone-6'), 'the tile palette shipped')
  // Shipped sidebar chrome overrides ride stable seams (Slot anchors and data
  // attributes), never the hashed CSS-module classes: the brand band is dropped
  // through the logo row, and the rail's New-session control loses its fill.
  assert(
    styleTags[0].textContent.includes("[data-window-drag]:has([data-slot='sidebar.brand.mark'])"),
    'the brand is dropped through the logo row seam',
  )
  assert(
    styleTags[0].textContent.includes("[data-slot='sidebar.session.action'] button"),
    'the New-session control is reached through its Slot anchor',
  )
  assert(
    /\[data-slot='sidebar\.session\.action'\] button \{[^}]*background: transparent/.test(styleTags[0].textContent),
    'the New-session fill drops to the sidebar surface',
  )

  // 6. Row actions: right-click and the "..." button open the same menu.
  const press = (x, y) => ({ preventDefault() {}, stopPropagation() {}, clientX: x, clientY: y })
  const menuLabels = () => findAllByClass(tree, 'dpr-menu-item').map((item) => String(item.props.children[1]?.props?.children ?? ''))
  const menuItem = (label) => findAllByClass(tree, 'dpr-menu-item').find((item) => String(item.props.children[1]?.props?.children ?? '') === label)
  const buttonByTitle = (title) => findAllByClass(tree, 'dpr-action').find((node) => node.props.title === title)

  allTile.props.onClick()
  render()
  const firstRow = findAllByClass(tree, 'dpr-row')[0]
  assert(firstRow.props.onContextMenu !== undefined, 'a row exposes a context menu')
  assert(firstRow.props.children.some((child) => child !== null && String(child.props?.className ?? '').includes('dpr-row-more')), 'a row has a "..." button')
  firstRow.props.onContextMenu(press(40, 300))
  assert(menuLabels().includes('Закрепить'), 'the session menu offers Pin')
  assert(menuLabels().includes('Переименовать'), 'the session menu offers Rename')
  assert(menuLabels().includes('Форк'), 'the session menu offers Fork')
  assert(menuLabels().includes('Копировать ID'), 'the session menu offers Copy ID')
  assert(menuLabels().includes('В архив'), 'the session menu offers Archive')
  menuItem('Закрепить').props.onClick(press(40, 300))
  await tick()
  assert(calls.pin.length === 1 && calls.pin[0] === 's1', 'Pin reached uiWorkspace.pinSession')
  assert(String(findByClass(tree, 'dpr-notice')?.props?.children ?? '') === 'Закреплено', 'the notice confirms Pin')

  // 7. Copy ID and rename the Session through the Host route.
  findAllByClass(tree, 'dpr-row')[0].props.onContextMenu(press(40, 300))
  menuItem('Копировать ID').props.onClick(press(40, 300))
  await tick()
  assert(String(findByClass(tree, 'dpr-notice')?.props?.children ?? '') === 'ID скопирован', 'the notice confirms Copy ID')

  findAllByClass(tree, 'dpr-row')[0].props.onContextMenu(press(40, 300))
  menuItem('Переименовать').props.onClick(press(40, 300))
  const input = findByClass(tree, 'dpr-input')
  assert(input !== null, 'the rename dialog opened')
  input.props.onChange({ target: { value: 'Новое имя' } })
  findAllByClass(tree, 'dpr-btn').find((node) => node.props['data-primary'] === 'true').props.onClick()
  await tick()
  const renameRequest = calls.requests.find((request) => String(request.url).endsWith('/session-rename'))
  assert(renameRequest !== undefined, 'the session rename went to the Host route')
  assert(String(renameRequest.body).includes('Новое имя'), 'the route carries the new title')

  // 8. Archive view lists archived Sessions and restores them.
  workspaceState.archivedSessionIds = ['s2']
  render()
  assert(findAllByClass(tree, 'dpr-row').length === 1, 'archived Sessions stay out of the project list, got ' + findAllByClass(tree, 'dpr-row').map((row) => row.props.title).join('|'))
  const archiveToggle = buttonByTitle('Показать архивные сессии')
  assert(archiveToggle !== undefined && archiveToggle.props['aria-pressed'] === 'false', 'the archive toggle is offered')
  archiveToggle.props.onClick()
  render()
  const archivedRow = findAllByClass(tree, 'dpr-row')[0]
  assert(archivedRow !== undefined && archivedRow.props['data-archived'] === 'true', 'the archive view shows archived rows')
  archivedRow.props.onContextMenu(press(40, 300))
  assert(!menuLabels().includes('Закрепить'), 'archived Sessions are not pinned from the archive')
  menuItem('Восстановить').props.onClick(press(40, 300))
  await tick()
  assert(calls.unarchive.length === 1 && calls.unarchive[0] === 's2', 'Restore reached uiWorkspace.unarchiveSession')
  buttonByTitle('Выйти из архива').props.onClick()
  render()
  findAllByClass(tree, 'dpr-row')[0].props.onContextMenu(press(40, 300))
  menuItem('В архив').props.onClick(press(40, 300))
  await tick()
  assert(calls.archive.length === 1 && calls.archive[0][0] === 's1', 'Archive reached uiWorkspace.archiveSession')

  // 9. Project actions: right-click on the tile and the header "..." menu.
  const projectTile = findAllByClass(tree, 'dpr-project').find((node) => node.props['data-dpr-tone'] !== undefined)
  projectTile.props.onClick()
  render()
  projectTile.props.onContextMenu(press(20, 180))
  assert(menuLabels().includes('Удалить проект'), 'the project menu offers Delete')
  assert(menuLabels().includes('Переименовать'), 'the project menu offers Rename')
  menuItem('Переименовать').props.onClick(press(20, 180))
  const projectInput = findByClass(tree, 'dpr-input')
  projectInput.props.onChange({ target: { value: 'Новое имя проекта' } })
  findAllByClass(tree, 'dpr-btn').find((node) => node.props['data-primary'] === 'true').props.onClick()
  await tick()
  assert(calls.rename.length === 1 && calls.rename[0][1] === 'Новое имя проекта', 'Rename reached workspaces.rename')

  // The header menu is the same popover for the open project.
  buttonByTitle('Действия').props.onClick(press(160, 60))
  menuItem('Удалить проект').props.onClick(press(160, 60))
  const danger = findAllByClass(tree, 'dpr-btn').find((node) => node.props['data-danger'] === 'true')
  assert(danger !== undefined, 'deleting a project asks for confirmation')
  danger.props.onClick()
  await tick()
  assert(calls.remove.length === 1 && calls.remove[0] === 'ws1', 'Delete reached workspaces.delete')
  assert(storage['dsh-opencode-classic-sidebar:selected:v1'] === undefined, 'the deleted project stopped being remembered')

  // 10. The merged half: panel buttons in the Windows caption strip.
  assert(registered.has('shell.overlay:opencode-classic-panels'), 'the caption-strip toolbar is registered')
  const mergedCss = styleTags[0].textContent
  assert(mergedCss.includes('[data-dss-panels]'), 'toolbar CSS shipped in the same stylesheet')
  assert(
    mergedCss.includes('html[data-windows-titlebar] [data-sidebar-scrollport] > nav'),
    'the shipped panel list is hidden only on Windows',
  )
  const PanelToolbar = registered.get('shell.overlay:opencode-classic-panels')
  hookCursor = 0
  const toolbar = PanelToolbar({
    usePanelInfo: (selector) => selector({ activePanelId: 'plugins' }),
  })
  assert(toolbar.props['data-dss-panels'] === '' && toolbar.props.role === 'toolbar', 'the toolbar is a labelled row')
  const panelButtons = toolbar.props.children
  assert(panelButtons.length === 2, 'two panel buttons, got ' + panelButtons.length)
  assert(
    panelButtons[0].props.title === 'Плагины' && panelButtons[0].props['aria-current'] === 'page',
    'the open panel is marked',
  )
  panelButtons[1].props.onClick()
  assert(
    calls.selectPanel.length === 1 && calls.selectPanel[0] === 'schedules',
    'selecting a panel reached the layout service',
  )
  hookCursor = 0
  const reopened = PanelToolbar({
    usePanelInfo: (selector) => selector({ activePanelId: 'schedules' }),
  })
  reopened.props.children[1].props.onClick()
  assert(calls.selectPanel.length === 2 && calls.selectPanel[1] === null, 'a second click returns to the conversation')

  // 11. Status dots: a project tile wears one, the "All" tile never does.
  workspaceState.archivedSessionIds = []
  statusMap.set('s1', { running: true })
  statusMap.set('s2', { running: false, pendingInteraction: undefined, completionUnread: true })
  render()
  const markersOf = (node) => {
    const found = []
    walk(node, (child) => {
      if (String(child.props?.className ?? '').split(' ').includes('dpr-marker')) found.push(child)
    })
    return found
  }
  const tileOfAll = () => findAllByClass(tree, 'dpr-project').find((node) => node.props['data-all'] !== undefined)
  const tileOfProject = () => findAllByClass(tree, 'dpr-project').find((node) => node.props['data-dpr-tone'] !== undefined)
  assert(markersOf(tileOfAll()).length === 0, 'the All tile shows no status dot')
  const runningMarkers = markersOf(tileOfProject())
  assert(
    runningMarkers.length === 1 && runningMarkers[0].props['data-kind'] === 'run',
    'a project tile still shows work in progress',
  )
  assert(String(tileOfAll().props.title).includes('идёт работа'), 'the All tile keeps the hint in its tooltip')

  // A pending question outranks running work on the project tile, and the All
  // tile still stays bare: the dot it used to borrow pointed at no project.
  statusMap.set('s2', { running: false, pendingInteraction: {}, completionUnread: false })
  render()
  const attentionMarkers = markersOf(tileOfProject())
  assert(
    attentionMarkers.length === 1 && attentionMarkers[0].props['data-kind'] === 'attention',
    'attention outranks a running Session',
  )
  assert(markersOf(tileOfAll()).length === 0, 'the All tile stays bare while a project waits for an answer')

  // 12. The shipped chrome is replaced: the brand band is gone and the
  //     New-session bar now lives between the project header and the list.
  const paneNode = findByClass(tree, 'dpr-pane')
  assert(paneNode !== null, 'the pane is rendered')
  const paneChildren = paneNode.props.children.filter((child) => child !== null && child !== undefined)
  assert(paneChildren[1]?.props?.className === 'dpr-new', 'the New-session bar sits under the project header')
  assert(String(paneChildren[2]?.props?.className).includes('dpr-list'), 'the bar sits above the session list')
  const sessionsBefore = calls.startSession.length
  findByClass(tree, 'dpr-new').props.onClick()
  assert(calls.startSession.length === sessionsBefore + 1, 'the bar starts a Session')
  const chromeCss = styleTags[0].textContent
  assert(
    chromeCss.includes(":has(> [data-slot='sidebar.session.action'])"),
    'the shipped New-session row is hidden while the pane renders',
  )
  assert(chromeCss.includes(':has([data-slot=\'sidebar.brand.mark\'])'), 'the brand is dropped but the toggle survives')
  assert(chromeCss.includes('html[data-windows-titlebar] [data-window-drag]'), 'the Windows logo band collapses')

  console.log('harness OK')
  console.log(JSON.stringify({
    pick: calls.pick,
    created: calls.create.length,
    startSession: calls.startSession,
    opened: calls.openSession,
    pinned: calls.pin,
    archived: calls.archive.map((entry) => entry[0]),
    unarchived: calls.unarchive,
    renamed: calls.rename,
    removed: calls.remove,
    requests: calls.requests.map((request) => request.url),
    stored: storage['dsh-opencode-classic-sidebar:selected:v1'],
    pathLine: pathLine.props.children,
  }, null, 2))
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})






