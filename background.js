import { compareInbox, compareBoard, DEFAULT_FILTERS, BOARD_URL, boardPostUrl, mailNotification, todayMail, todayBoard, seoulToday, badgeAppearance } from './core.js';
import { parseInbox, parseNoticeBoard, parseSyncParameters } from './parser.bundle.js';

const INBOX = 'https://ep.inzent.com:1204/email/DocList?FolderCode=-1';
const HOME = 'https://ep.inzent.com:1204/';
const SYNC_PAGE = 'https://ep.inzent.com:1204/email/poplist?isMain=Y';
const SYNC_API = 'https://filemail31.zioyou.kr:443/Src/EaGetMail_PopList_Merak_Ajax';
const ALARM = 'check-inbox';
let running;
let queue = Promise.resolve();
let navigationCheckPending;
let navigationCheckRequested = false;

function enqueue(work) {
  const task = queue.then(work);
  queue = task.catch(() => {});
  return task;
}

async function notify(id, title, message) {
  await chrome.notifications.create(id, { type: 'basic', iconUrl: 'icon.png', title, message });
}

async function notifyMail(messages) {
  for (const message of [...messages].reverse()) {
    await chrome.notifications.create(`new-mail:${message.id}`, mailNotification([message]));
  }
}

async function setStatus(status, extra = {}) {
  await chrome.storage.local.set({ status, checkedAt: Date.now(), ...extra });
  await refreshBadge();
}

async function refreshBadge() {
  const { status, pendingCount } = await chrome.storage.local.get(['status', 'pendingCount']);
  const badge = badgeAppearance(status, pendingCount);
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
  await chrome.action.setBadgeText({ text: badge.text });
}

async function accountHash(account) {
  if (!account) return '';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(account));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function check() {
  const state = await chrome.storage.local.get(['seenIds', 'trackedIds', 'accountHash', 'filters', 'loginNotified', 'boardSeenIds']);
  try {
    const syncPage = await fetch(SYNC_PAGE, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (syncPage.status === 401) return await loginRequired(state);
    if (!syncPage.ok) throw new Error('http');
    const params = parseSyncParameters(await syncPage.text(), syncPage.url);
    if (params.type === 'login') return await loginRequired(state);
    if (params.type !== 'ok') throw new Error('format');
    const syncUrl = new URL(SYNC_API);
    syncUrl.search = new URLSearchParams({ CorpCode: params.corp, UserID: params.user, DomainName: params.domain, callback: 'inzentMailRefresh', _: String(Date.now()) });
    const syncResponse = await fetch(syncUrl, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!syncResponse.ok || !/^\s*inzentMailRefresh\s*\(/.test(await syncResponse.text())) throw new Error('sync');
    const response = await fetch(INBOX, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (response.status === 401) return await loginRequired(state);
    if (!response.ok) throw new Error('http');
    const html = await response.text();
    const result = parseInbox(html, response.url);
    if (result?.type === 'login') return await loginRequired(state);
    if (result?.type !== 'ok') throw new Error('format');
    const hash = await accountHash(result.account);
    const switched = Boolean(hash && state.accountHash && hash !== state.accountHash);
    const filters = state.filters || DEFAULT_FILTERS;
    const history = todayMail(result.messages, filters);
    const { fresh, ids, uncertain, trackedIds } = compareInbox(switched ? undefined : state.seenIds, result.messages, filters, switched ? [] : (state.trackedIds || state.seenIds || []));
    // Save before notification so overlapping triggers and worker restarts do not repeat it.
    await setStatus(uncertain ? 'uncertain' : 'ok', {
      seenIds: ids, trackedIds, accountHash: hash || state.accountHash || '', loginNotified: false,
      history, ...(switched ? { pendingCount: 0, boardSeenIds: null, boardHistory: [] } : {})
    });
    if (fresh.length) {
      await notifyMail(fresh);
      const { pendingCount } = await chrome.storage.local.get('pendingCount');
      const count = Number.isSafeInteger(pendingCount) && pendingCount > 0 ? pendingCount : 0;
      await chrome.storage.local.set({ pendingCount: Math.min(count + fresh.length, 1000000) });
      await refreshBadge();
    }
    await checkBoard(switched ? undefined : state.boardSeenIds);
  } catch (error) {
    await setStatus('error', { errorKind: error?.message === 'format' ? 'format' : 'network' });
  }
}

async function checkBoard(previous) {
  try {
    const response = await fetch(BOARD_URL, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('http');
    const result = parseNoticeBoard(await response.text(), response.url);
    if (result.type !== 'ok') throw new Error('format');
    const today = todayBoard(result.items);
    const { fresh, trackedIds } = compareBoard(previous, result.items);
    const newToday = fresh.filter((item) => item.date === seoulToday());
    await chrome.storage.local.set({ boardHistory: today, boardSeenIds: trackedIds, boardStatus: 'ok' });
    for (const item of [...newToday].reverse()) {
      await notify(`new-board:${item.id}`, '새 전사공지가 등록되었습니다', item.subject);
    }
    if (newToday.length) {
      const { pendingCount } = await chrome.storage.local.get('pendingCount');
      const count = Number.isSafeInteger(pendingCount) && pendingCount > 0 ? pendingCount : 0;
      await chrome.storage.local.set({ pendingCount: Math.min(count + newToday.length, 1000000) });
      await refreshBadge();
    }
  } catch {
    await chrome.storage.local.set({ boardStatus: 'error' });
  }
}

async function loginRequired(state) {
  await setStatus('login');
  if (!state.loginNotified) {
    await chrome.storage.local.set({ loginNotified: true });
    await notify('login-required', '그룹웨어 로그인이 필요합니다', '다시 로그인하면 메일 확인이 재개됩니다.');
  }
}

function checkOnce() {
  if (!running) running = enqueue(check).finally(() => { running = null; });
  return running;
}

function checkAfterGroupwareLoad() {
  navigationCheckRequested = true;
  if (!navigationCheckPending) {
    navigationCheckPending = enqueue(async () => {
      do {
        navigationCheckRequested = false;
        const { status } = await chrome.storage.local.get('status');
        if (status === 'login' || status === 'error') await check();
      } while (navigationCheckRequested);
    }).finally(() => { navigationCheckPending = null; });
  }
  return navigationCheckPending;
}

async function setup() {
  await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  await checkOnce();
}
chrome.runtime.onInstalled.addListener(() => { void setup(); });
chrome.runtime.onStartup.addListener(() => { void setup(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) void checkOnce(); });
chrome.notifications.onClicked.addListener(async (id) => {
  if (id === 'new-mail' || id.startsWith('new-mail:') || id === 'login-required' || /^new-board:\d+$/.test(id)) {
    let url = id === 'login-required' ? HOME : INBOX;
    if (/^new-board:\d+$/.test(id)) {
      const { boardHistory = [] } = await chrome.storage.local.get('boardHistory');
      const item = boardHistory.find((entry) => entry.id === id.slice(10));
      url = item ? boardPostUrl(item) : BOARD_URL;
    }
    void chrome.tabs.create({ url });
    void chrome.notifications.clear(id);
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'background') return;
  let task;
  if (message.type === 'check') task = checkOnce();
  else if (message.type === 'groupware-loaded') {
    let url;
    try { url = new URL(sender.url); } catch { return; }
    if (url.origin !== 'https://ep.inzent.com:1204') return;
    task = checkAfterGroupwareLoad();
  }
  else if (message.type === 'popup-open') task = enqueue(async () => {
    await chrome.storage.local.set({ pendingCount: 0 });
    await refreshBadge();
  });
  else return;
  task.then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
  return true;
});
