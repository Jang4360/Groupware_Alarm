import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeAppearance, seoulToday } from '../core.js';

test('숫자 배지는 새 알림 수를 표시하며 99개 초과는 99+로 표시한다', () => {
  assert.equal(badgeAppearance('ok', 2).text, '2');
  assert.equal(badgeAppearance('login', 100).text, '99+');
  assert.equal(badgeAppearance('ok', 0).text, '');
  assert.equal(badgeAppearance('login', 0).text, '!');
});

test('새 메일 건수를 누적하고 팝업을 열면 숫자를 지운다', async () => {
  const data = {};
  let badge = '';
  let handler;
  let notificationClick;
  const notifications = [];
  const openedTabs = [];
  const event = () => ({ addListener() {} });
  globalThis.chrome = {
    storage: { local: {
      async get(keys) { if (typeof keys === 'string') keys = [keys]; return Object.fromEntries(keys.map((key) => [key, data[key]])); },
      async set(values) { Object.assign(data, values); }
    } },
    action: { async setBadgeText({ text }) { badge = text; }, async setBadgeBackgroundColor() {} },
    notifications: { async create(id, options) { notifications.push({ id, options }); }, onClicked: { addListener(fn) { notificationClick = fn; } }, async clear() {} },
    alarms: { onAlarm: event(), async create() {} },
    runtime: { onInstalled: event(), onStartup: event(), onMessage: { addListener(fn) { handler = fn; } } },
    tabs: { async create(options) { openedTabs.push(options.url); } }
  };
  let ids = ['old'];
  let boardIds = ['1'];
  const sync = `<script>var js_global_sso_corpcode='T123';var js_global_sso_userid='1234';var js_global_sso_domainname='example.com';</script><script>url: "https://filemail31.zioyou.kr:443/Src/EaGetMail_PopList_Merak_Ajax"</script>`;
  const row = (id) => `<tr><td><input name="msguid" value="${id}"></td><td></td><td></td><td></td><td><a>동료</a></td><td><a>제목</a></td><td>오전 09:23</td></tr>`;
  globalThis.fetch = async (url) => {
    const value = String(url);
    const boardRows = boardIds.map((id) => `<tr><td>${id}</td><td></td><td><a href="javascript:goView(${id});">공지 ${id}</a></td><td>작성자</td><td>${seoulToday().replaceAll('/', '.')} 09:00</td></tr>`).join('');
    let body = value.includes('/poplist?') ? sync : value.includes('filemail31.') ? 'inzentMailRefresh({})' : value.toLowerCase().includes('/bbs/bbslist') ? `<table>${boardRows}</table>` : `<table id="tblMailList">${ids.map(row).join('')}</table>`;
    return { status: 200, ok: true, url: value, async text() { return body; } };
  };
  await import('../background.js');
  const send = (type) => new Promise((resolve) => handler({ target: 'background', type }, {}, resolve));
  await send('check');
  assert.equal(badge, '');
  assert.equal(data.boardHistory.length, 1, '최초 조회에서 오늘 공지를 표시한다');
  assert.equal(notifications.length, 0, '기존 공지는 새 알림을 보내지 않는다');
  ids = ['new-2', 'new-1', 'old'];
  boardIds = ['2', '1'];
  await send('check');
  assert.equal(data.pendingCount, 3);
  assert.equal(badge, '3');
  assert.deepEqual(notifications.map((item) => item.id), ['new-mail:new-1', 'new-mail:new-2', 'new-board:2']);
  await notificationClick('new-board:2');
  const opened = new URL(openedTabs[0]);
  assert.equal(opened.pathname, '/bbs/BbsView');
  assert.equal(JSON.parse(atob(opened.searchParams.get('csrf'))).DocNo, '2');
  assert.ok(notifications.slice(0, 2).every((item) => item.options.type === 'basic' && item.options.message.includes('동료')));
  await send('check');
  assert.equal(badge, '3');
  assert.equal(notifications.length, 3);
  await send('popup-open');
  assert.equal(data.pendingCount, 0);
  assert.equal(badge, '');
  assert.equal(data.history.length, 3, '설치 전에 오늘 도착한 메일도 목록에 표시한다');
  ids = ['new-3', ...ids];
  await send('check');
  assert.equal(badge, '1');
  assert.equal(notifications[3].id, 'new-mail:new-3');
});
