import test from 'node:test';
import assert from 'node:assert/strict';

test('로그인 화면 이동 직후 확인하고, 진행 중인 만료 확인이 있어도 다시 시도한다', async () => {
  const data = {};
  let handler;
  let fetches = 0;
  let releaseFirst;
  const initialFetch = new Promise((resolve) => { releaseFirst = resolve; });
  const event = () => ({ addListener() {} });
  globalThis.chrome = {
    storage: { local: {
      async get(keys) { if (typeof keys === 'string') keys = [keys]; return Object.fromEntries(keys.map((key) => [key, data[key]])); },
      async set(values) { Object.assign(data, values); }
    } },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    notifications: { async create() {}, onClicked: event(), async clear() {} },
    alarms: { onAlarm: event(), async create() {} },
    runtime: { onInstalled: event(), onStartup: event(), onMessage: { addListener(fn) { handler = fn; } } },
    tabs: { async create() {} }
  };
  const sync = `<script>var js_global_sso_corpcode='T123';var js_global_sso_userid='1234';var js_global_sso_domainname='example.com';</script><script>url: "https://filemail31.zioyou.kr:443/Src/EaGetMail_PopList_Merak_Ajax"</script>`;
  globalThis.fetch = async (url) => {
    const value = String(url);
    fetches++;
    if (fetches === 1) {
      await initialFetch;
      return { status: 200, ok: true, url: value, async text() { return '<input type="password">'; } };
    }
    const body = value.includes('/poplist?') ? sync : value.includes('filemail31.') ? 'inzentMailRefresh({})' : '<table id="tblMailList"></table>';
    return { status: 200, ok: true, url: value, async text() { return body; } };
  };
  await import('../background.js');
  const send = (type, sender = {}) => new Promise((resolve) => handler({ target: 'background', type }, sender, resolve));
  const checking = send('check');
  await new Promise((resolve) => setImmediate(resolve));
  const navigating = send('groupware-loaded', { url: 'https://ep.inzent.com:1204/main/default' });
  releaseFirst();
  await checking;
  await navigating;
  assert.equal(data.status, 'ok');
  assert.equal(fetches, 4);
  await send('groupware-loaded', { url: 'https://ep.inzent.com:1204/email/DocList' });
  assert.equal(fetches, 4, '정상 연결 중에는 매 화면 이동마다 메일을 다시 조회하지 않는다');
});
