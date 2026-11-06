import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeAppearance } from '../core.js';

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
  const notifications = [];
  const event = () => ({ addListener() {} });
  globalThis.chrome = {
    storage: { local: {
      async get(keys) { if (typeof keys === 'string') keys = [keys]; return Object.fromEntries(keys.map((key) => [key, data[key]])); },
      async set(values) { Object.assign(data, values); }
    } },
    action: { async setBadgeText({ text }) { badge = text; }, async setBadgeBackgroundColor() {} },
    notifications: { async create(id, options) { notifications.push({ id, options }); }, onClicked: event(), async clear() {} },
    alarms: { onAlarm: event(), async create() {} },
    runtime: { onInstalled: event(), onStartup: event(), onMessage: { addListener(fn) { handler = fn; } } },
    tabs: { async create() {} }
  };
  let ids = ['old'];
  const sync = `<script>var js_global_sso_corpcode='T123';var js_global_sso_userid='1234';var js_global_sso_domainname='example.com';</script><script>url: "https://filemail31.zioyou.kr:443/Src/EaGetMail_PopList_Merak_Ajax"</script>`;
  const row = (id) => `<tr><td><input name="msguid" value="${id}"></td><td></td><td></td><td></td><td><a>동료</a></td><td><a>제목</a></td><td>오전 09:23</td></tr>`;
  globalThis.fetch = async (url) => {
    const value = String(url);
    let body = value.includes('/poplist?') ? sync : value.includes('filemail31.') ? 'inzentMailRefresh({})' : `<table id="tblMailList">${ids.map(row).join('')}</table>`;
    return { status: 200, ok: true, url: value, async text() { return body; } };
  };
  await import('../background.js');
  const send = (type) => new Promise((resolve) => handler({ target: 'background', type }, {}, resolve));
  await send('check');
  assert.equal(badge, '');
  ids = ['new-2', 'new-1', 'old'];
  await send('check');
  assert.equal(data.pendingCount, 2);
  assert.equal(badge, '2');
  assert.deepEqual(notifications.map((item) => item.id), ['new-mail:new-1', 'new-mail:new-2']);
  assert.ok(notifications.every((item) => item.options.type === 'basic' && item.options.message.includes('동료')));
  await send('check');
  assert.equal(badge, '2');
  assert.equal(notifications.length, 2);
  await send('popup-open');
  assert.equal(data.pendingCount, 0);
  assert.equal(badge, '');
  assert.equal(data.history.length, 2);
  ids = ['new-3', ...ids];
  await send('check');
  assert.equal(badge, '1');
  assert.equal(notifications[2].id, 'new-mail:new-3');
});
