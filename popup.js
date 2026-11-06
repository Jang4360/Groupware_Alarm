void chrome.runtime.sendMessage({ target: 'background', type: 'popup-open' }).catch(() => {});
const $ = (id) => document.getElementById(id);
const statusText = { ok: '연결 정상', login: '연결 끊김', error: '연결 끊김', uncertain: '확인 범위 초과' };
async function render() {
  const state = await chrome.storage.local.get(['status', 'checkedAt', 'history']);
  $('status').textContent = statusText[state.status] || '확인 중';
  $('dot').className = `dot ${state.status || ''}`;
  $('login').hidden = !['login', 'error'].includes(state.status);
  $('status').title = state.status === 'error' ? '네트워크 또는 그룹웨어 응답을 확인해 주세요.' : state.status === 'uncertain' ? '메일 목록이 크게 바뀌어 새 메일을 판별하지 못했습니다.' : '';
  const list = $('history');
  list.replaceChildren();
  if (!state.history?.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = '아직 받은 알림이 없습니다.';
    list.append(empty);
    return;
  }
  for (const mail of state.history) {
    const card = document.createElement('button');
    card.className = 'mail-card';
    card.type = 'button';
    const sender = document.createElement('span');
    sender.className = 'mail-sender';
    sender.textContent = mail.sender;
    const subject = document.createElement('span');
    subject.className = 'mail-subject';
    subject.textContent = mail.subject || '(제목 없음)';
    const header = document.createElement('span');
    header.className = 'mail-header';
    const date = document.createElement('span');
    date.className = 'mail-date';
    if (mail.mailDate?.date && mail.mailDate?.time) {
      const day = document.createElement('span');
      day.className = 'mail-day';
      day.textContent = mail.mailDate.date;
      const time = document.createElement('span');
      time.className = 'mail-time';
      time.textContent = mail.mailDate.time;
      date.append(day, time);
    } else {
      date.textContent = '시간 정보 없음';
    }
    header.append(sender, date);
    card.append(header, subject);
    card.addEventListener('click', () => {
      const url = new URL('https://ep.inzent.com:1204/email/DocView');
      if (mail.csrf && /^[A-Za-z0-9+/=_-]{1,1024}$/.test(mail.csrf)) {
        url.search = new URLSearchParams({ csrf: mail.csrf, FolderCode: '-1', PageNo: '1', PageSize: '30', isUnRead: 'A', SortedColumn: 'RegDate', AscDesc: 'DESC', Receiver: '' });
      } else {
        url.pathname = '/email/DocList';
        url.search = '?FolderCode=-1';
      }
      void chrome.tabs.create({ url: url.href });
    });
    if (!mail.csrf) card.title = '메일 연결 정보를 찾지 못해 받은편지함을 엽니다.';
    list.append(card);
  }
}
await render();
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.status || changes.history)) void render(); });
$('check').addEventListener('click', async () => {
  $('check').disabled = true;
  $('status').textContent = '확인 중';
  try { await chrome.runtime.sendMessage({ target: 'background', type: 'check' }); } finally { await render(); $('check').disabled = false; }
});
$('open').addEventListener('click', () => chrome.tabs.create({ url: 'https://ep.inzent.com:1204/email/DocList?FolderCode=-1' }));
$('login').addEventListener('click', () => chrome.tabs.create({ url: 'https://ep.inzent.com:1204/' }));
