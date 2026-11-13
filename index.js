/**
 * Host half: the account-balance route behind the sidebar footer chip.
 *
 * Credentials live only on the Host side (the browser cannot read the API key
 * and cannot call `deepseekAccount`), so the balance is read here and handed to
 * the Client half through the exact `connection` fetch route.
 *
 * Read order: the built-in DeepSeek account (when signed in, no key needed) →
 * the API key from the environment or stored credentials. When neither yields
 * a number the state is reported honestly instead of inventing one.
 *
 * Ported from the `dsh-rail` plugin (MIT) while removing its rail layout: the
 * chip, the day-spend bookkeeping and the route contract stay the same so the
 * "spent today / total" numbers survive the switch.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const BALANCE_PATH = '/api/dsh-sidebar-suite/balance'
const REFRESH_PATH = '/api/dsh-sidebar-suite/balance/refresh'
/**
 * Session rename has no Client service: the shipped dialog lives inside the
 * browser this plugin replaces. The route is that missing verb, and nothing else.
 */
const SESSION_RENAME_PATH = '/api/dsh-sidebar-suite/session-rename'
/** Balance moves slowly; reuse a reading within 30s so refresh clicking cannot hammer upstream. */
const CACHE_MS = 30_000
const API_KEY_REF = 'DEEPSEEK_API_KEY'
const API_URL = 'https://api.deepseek.com/user/balance'
const VERSION = '0.1.0'

export const inject = ['connection']

/**
 * Today's baseline: the first reading of the day is "the balance this day
 * started with". A positive difference is money spent today; a negative one is a
 * top-up or a bonus. The baseline persists under DSH_HOME so a restart keeps the
 * same numbers, and a date change rolls the day over.
 */
const dayState = {
  key: '',
  upBase: null,
  grBase: null,
  spent: 0,
  upSum: 0,
  grSum: 0,
  /** Sum of finished days; today's `spent` is added at display time to avoid double counting. */
  totalSpent: 0,
  /** First local date key we recorded, shown as the "since" note. */
  since: '',
}

function homeDir() {
  const home = process.env.DSH_HOME === undefined || process.env.DSH_HOME === '' ? join(homedir(), '.dsh') : process.env.DSH_HOME
  return home
}

/** Current state file: the plugin-private directory under DSH_HOME. */
function stateFile() {
  return join(homeDir(), 'dsh-sidebar-suite', 'day-spend.json')
}

/** Earlier plugins kept the same bookkeeping: read once to keep the history. */
function legacyStateFiles() {
  return [
    join(homeDir(), 'dsh-projects-rail', 'day-spend.json'),
    join(homeDir(), 'dsh-rail', 'day-spend.json'),
  ]
}

function parseSaved(saved) {
  if (saved !== null && typeof saved === 'object' && typeof saved.key === 'string' && Number.isFinite(Number(saved.upBase)) && Number.isFinite(Number(saved.grBase))) {
    return {
      key: saved.key,
      upBase: Number(saved.upBase),
      grBase: Number(saved.grBase),
      spent: Number.isFinite(Number(saved.spent)) ? Number(saved.spent) : 0,
      upSum: Number.isFinite(Number(saved.upSum)) ? Number(saved.upSum) : 0,
      grSum: Number.isFinite(Number(saved.grSum)) ? Number(saved.grSum) : 0,
      /* totalSpent holds finished days only; today's spent is added once on display. */
      totalSpent: Number.isFinite(Number(saved.totalSpent)) ? Number(saved.totalSpent) : 0,
      since: typeof saved.since === 'string' && saved.since !== '' ? saved.since : saved.key,
    }
  }
  return null
}

function readFileQuiet(path) {
  try {
    return parseSaved(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    /* Missing, unreadable or malformed all mean "no baseline yet". */
    return null
  }
}

function readPersisted() {
  const own = readFileQuiet(stateFile())
  if (own !== null) return own
  // Continuity across the switch from the earlier plugins: their file is read,
  // then rewritten here.
  for (const file of legacyStateFiles()) {
    const saved = readFileQuiet(file)
    if (saved !== null) return saved
  }
  return null
}

function persistState(state) {
  try {
    mkdirSync(dirname(stateFile()), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify(state), 'utf8')
  } catch {
    // Failing to persist only degrades the day-spend history, never the balance itself.
  }
}

function localDayKey(now) {
  return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate()
}

function stampDaySpend(value) {
  const up = Number.parseFloat(String(value.toppedUp ?? ''))
  const gr = Number.parseFloat(String(value.granted ?? ''))
  if (!Number.isFinite(up) || !Number.isFinite(gr)) return

  const key = localDayKey(new Date())
  let dirty = false
  if (dayState.key !== key || !Number.isFinite(dayState.upBase) || !Number.isFinite(dayState.grBase)) {
    const saved = readPersisted()
    dayState.key = key
    if (saved !== null && saved.key === key) {
      dayState.upBase = saved.upBase
      dayState.grBase = saved.grBase
      dayState.spent = saved.spent
      dayState.upSum = saved.upSum
      dayState.grSum = saved.grSum
      dayState.totalSpent = saved.totalSpent
      dayState.since = saved.since
    } else {
      /* New day: fold the finished day into the total, then take a new baseline. */
      dayState.totalSpent = saved === null ? 0 : saved.totalSpent + saved.spent
      dayState.since = saved === null ? key : saved.since
      dayState.upBase = up
      dayState.grBase = gr
      dayState.spent = 0
      dayState.upSum = 0
      dayState.grSum = 0
    }
    dirty = true
  }

  // Diff after restoring too: the persisted baseline may be stale (spent while stopped).
  const upDelta = dayState.upBase - up
  if (Math.abs(upDelta) > 0.0001) {
    if (upDelta > 0) dayState.spent += upDelta
    else dayState.upSum += -upDelta
    dayState.upBase = up
    dirty = true
  }
  const grDelta = dayState.grBase - gr
  if (Math.abs(grDelta) > 0.0001) {
    if (grDelta > 0) dayState.spent += grDelta
    else dayState.grSum += -grDelta
    dayState.grBase = gr
    dirty = true
  }

  if (dirty) {
    persistState({
      // v is the state-file format version, so later fields can migrate instead of resetting.
      v: 3,
      key: dayState.key,
      upBase: dayState.upBase,
      grBase: dayState.grBase,
      spent: dayState.spent,
      upSum: dayState.upSum,
      grSum: dayState.grSum,
      totalSpent: dayState.totalSpent,
      since: dayState.since,
    })
  }

  /* Book only the balance deltas: the old dsh-usage ledger is no longer written
     by anything, so reading it would only show stale numbers. */
  value.spentToday = dayState.spent.toFixed(2)
  value.toppedUpToday = dayState.upSum.toFixed(2)
  value.grantedToday = dayState.grSum.toFixed(2)
  value.totalSpent = (dayState.totalSpent + dayState.spent).toFixed(2)
  value.totalSince = dayState.since
  /* Only after at least one full date does "total" differ from "today". */
  value.totalHasHistory = dayState.since !== '' && dayState.since !== dayState.key
}

/** Cache and in-flight de-duplication live at module scope: one instance per profile. */
/** Top-up URL from the host account state (DeepSeek platform); remembered once seen. */
let knownTopUpUrl = null

let cachedValue = null
let cachedAt = 0
let inflight = null

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/** `timezoneOffsetSeconds` is the offset from UTC in seconds (east of UTC is positive). */
function timezoneOffsetSeconds() {
  return -new Date().getTimezoneOffset() * 60
}

function clientMetadata() {
  return {
    version: VERSION,
    locale: 'zh-CN',
    timezoneOffsetSeconds: timezoneOffsetSeconds(),
  }
}

function pickWallet(wallets, preferred) {
  const list = Array.isArray(wallets) ? wallets : []
  return list.find((wallet) => wallet && wallet.currency === preferred) ?? list[0] ?? null
}

function amountOf(raw) {
  const value = Number.parseFloat(String(raw ?? ''))
  return Number.isFinite(value) ? value : 0
}

function walletCurrency(primary, bonus) {
  return primary?.currency ?? bonus?.currency ?? 'CNY'
}

/** Built-in account: only `credential-stored` goes further; otherwise report signed-out. */
async function fromAccount(ctx) {
  const account = ctx.get('deepseekAccount')
  if (account === undefined) return { state: 'unavailable' }

  let view
  try {
    view = await account.getState()
  } catch (error) {
    return { state: 'error', message: describe(error) }
  }
  if (view === null || view === undefined) return { state: 'unavailable' }
  // The top-up link is independent of the sign-in state: hand it out even when signed out.
  const link = view.links === undefined || view.links === null ? undefined : view.links.topUpUrl
  if (typeof link === 'string' && /^https:\/\//.test(link)) knownTopUpUrl = link
  if (view.status !== 'credential-stored') return { state: 'signed-out' }

  const result = await account.getBalance(clientMetadata())
  if (result === null) return { state: 'signed-out' }
  if (result.status === 'failed') return { state: 'error', message: 'Account balance query failed' }

  const toppedUp = pickWallet(result.value, 'CNY')
  const granted = pickWallet(result.bonusWallets, toppedUp?.currency ?? 'CNY')
  if (toppedUp === null && granted === null) return { state: 'error', message: 'Account returned no wallets' }

  const toppedUpValue = amountOf(toppedUp?.balance)
  const grantedValue = amountOf(granted?.balance)
  return {
    state: 'ready',
    source: 'account',
    currency: walletCurrency(toppedUp, granted),
    total: (toppedUpValue + grantedValue).toFixed(2),
    toppedUp: toppedUpValue.toFixed(2),
    granted: grantedValue.toFixed(2),
    at: Date.now(),
  }
}

/** API-key fallback: environment first, then the host credential store; the plaintext stays in-process. */
async function fromApiKey(ctx) {
  let key = (process.env[API_KEY_REF] ?? '').trim()
  if (key === '') {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      try {
        const resolved = await credentials.resolve(API_KEY_REF)
        key = (resolved?.value ?? '').trim()
      } catch {
        // This rung missed; keep falling through rather than reporting an error.
      }
    }
  }
  if (key === '') return { state: 'signed-out' }

  // Without a timeout a hung fetch would pin `inflight` and the chip would stay on "reading".
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(10_000)
    : undefined
  const response = await fetch(API_URL, {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) return { state: 'error', message: `Balance API returned ${response.status}` }

  const payload = await response.json()
  const infos = Array.isArray(payload?.balance_infos) ? payload.balance_infos : []
  const info = infos.find((entry) => entry?.currency === 'CNY') ?? infos[0] ?? null
  if (info === null) return { state: 'error', message: 'Balance API returned no wallet' }

  return {
    state: 'ready',
    source: 'key',
    currency: info.currency ?? 'CNY',
    total: amountOf(info.total_balance).toFixed(2),
    toppedUp: amountOf(info.topped_up_balance).toFixed(2),
    granted: amountOf(info.granted_balance).toFixed(2),
    at: Date.now(),
  }
}

/** Account first; when it yields no number, try the key, and report the more informative failure. */
async function readBalance(ctx) {
  let primary
  try {
    primary = await fromAccount(ctx)
  } catch (error) {
    primary = { state: 'error', message: describe(error) }
  }
  if (primary.state === 'ready') return primary

  let fallback
  try {
    fallback = await fromApiKey(ctx)
  } catch (error) {
    fallback = { state: 'error', message: describe(error) }
  }
  if (fallback.state === 'ready') return fallback
  if (primary.state === 'signed-out' || primary.state === 'unavailable') return fallback
  return primary
}

async function snapshot(ctx, force) {
  const fresh = force !== true && cachedValue !== null && Date.now() - cachedAt < CACHE_MS
  if (fresh) return cachedValue
  if (inflight === null) {
    inflight = readBalance(ctx)
      .then((value) => {
        if (value.state === 'ready') {
          stampDaySpend(value)
          cachedValue = value
          cachedAt = Date.now()
        }
        if (knownTopUpUrl !== null) value.topUpUrl = knownTopUpUrl
        return value
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** Read one JSON body without trusting its shape. */
async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: BALANCE_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => json(await snapshot(ctx, false)),
      }),
    'sidebar-suite: balance route',
  )

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: REFRESH_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async () => json(await snapshot(ctx, true)),
      }),
    'sidebar-suite: balance refresh route',
  )

  // Rename one Session: the only verb the rail needs from the Host API that the
  // Client service catalog does not expose.
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: SESSION_RENAME_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const payload = await readJson(request)
          const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
          const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
          if (sessionId === '' || title === '') {
            return json({ ok: false, error: 'sessionId and title are required' }, 400)
          }
          const controller = ctx.get('sessionController')
          if (controller === undefined) {
            return json({ ok: false, error: 'the Session controller is unavailable' }, 503)
          }
          try {
            const value = await controller.rename({ sessionId, title })
            return json({ ok: true, title: value?.title ?? title })
          } catch (error) {
            return json({ ok: false, error: describe(error) }, 500)
          }
        },
      }),
    'sidebar-suite: session rename route',
  )
}
