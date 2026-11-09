import { parse } from 'parse5';

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value || '';
function* descendants(node) {
  for (const child of node.childNodes || []) {
    yield child;
    yield* descendants(child);
  }
}
function find(node, predicate) {
  for (const child of descendants(node)) if (predicate(child)) return child;
}
function text(node) {
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes || []).map(text).join('');
}

export function parseSyncParameters(html, url) {
  const doc = parse(html);
  if (/(?:login|logon|signin)/i.test(url) || find(doc, (node) => node.tagName === 'input' && attr(node, 'type').toLowerCase() === 'password')) return { type: 'login' };
  const scripts = [...descendants(doc)].filter((node) => node.tagName === 'script' && !attr(node, 'src')).map(text).join('\n');
  const read = (key) => scripts.match(new RegExp(`\\b${key}\\s*=\\s*['\"]([a-zA-Z0-9.-]+)['\"]`))?.[1];
  const corp = read('js_global_sso_corpcode');
  const user = read('js_global_sso_userid');
  const domain = read('js_global_sso_domainname');
  if (!corp || !user || !domain || !scripts.includes('https://filemail31.zioyou.kr:443/Src/EaGetMail_PopList_Merak_Ajax')) return { type: 'unknown' };
  return { type: 'ok', corp, user, domain };
}

// Parse as data only: site scripts and event handlers never enter a browser DOM.
export function parseInbox(html, url) {
  const doc = parse(html);
  if (/(?:login|logon|signin)/i.test(url) || find(doc, (node) =>
    (node.tagName === 'input' && attr(node, 'type').toLowerCase() === 'password') ||
    (node.tagName === 'iframe' && /login/i.test(attr(node, 'src'))) ||
    (node.tagName === 'form' && /login/i.test(attr(node, 'action'))))) return { type: 'login' };
  const table = find(doc, (node) => node.tagName === 'table' && attr(node, 'id') === 'tblMailList');
  if (!table) return { type: 'unknown' };
  const rows = [...descendants(table)].filter((node) => node.tagName === 'tr');
  const messages = [];
  for (const row of rows) {
    const input = find(row, (node) => node.tagName === 'input' && attr(node, 'name') === 'msguid');
    if (!input) continue;
    const cells = (row.childNodes || []).filter((node) => node.tagName === 'td' || node.tagName === 'th');
    const sender = cells[4] && find(cells[4], (node) => node.tagName === 'a');
    const subject = cells[5] && find(cells[5], (node) => node.tagName === 'a');
    const params = new URLSearchParams(subject ? attr(subject, 'data-pmt') : '');
    const csrf = params.get('csrf') || '';
    messages.push({ id: attr(input, 'value').trim(), sender: sender ? text(sender).trim() : '', subject: subject ? text(subject).trim() : '', csrf: /^[A-Za-z0-9+/=_-]{1,1024}$/.test(csrf) ? csrf : '', dateText: cells[6] ? text(cells[6]).trim() : '' });
  }
  if (messages.some((item) => !item.id || !item.sender) || new Set(messages.map((item) => item.id)).size !== messages.length) return { type: 'unknown' };
  const accountNode = find(doc, (node) => node.tagName === 'a' && attr(node, 'href').includes('UserInfo_Edit'));
  return { type: 'ok', messages, account: accountNode ? text(accountNode).trim() : '' };
}

// The board list uses javascript:goView(id), including on pinned posts. Parse it as text only.
export function parseNoticeBoard(html, url) {
  const doc = parse(html);
  if (/(?:login|logon|signin)/i.test(url) || find(doc, (node) => node.tagName === 'input' && attr(node, 'type').toLowerCase() === 'password')) return { type: 'login' };
  const items = [];
  const ids = new Set();
  for (const node of descendants(doc)) {
    if (node.tagName !== 'a') continue;
    const href = attr(node, 'href');
    const matchId = href.match(/^javascript:\s*goView\(\s*(\d+)\s*\)\s*;?$/i);
    if (!matchId) continue;
    const id = matchId[1];
    const title = text(node).replace(/\s+/g, ' ').trim();
    if (!/^\d+$/.test(id || '') || !title || ids.has(id)) continue;
    let container = node.parentNode;
    while (container && container.tagName !== 'tr') container = container.parentNode;
    if (!container) continue;
    const cells = (container.childNodes || []).filter((child) => child.tagName === 'td');
    const titleIndex = cells.findIndex((cell) => find(cell, (child) => child === node));
    if (titleIndex < 0) continue;
    const sender = cells[titleIndex + 1] ? text(cells[titleIndex + 1]).trim() : '';
    const dateText = cells[titleIndex + 2] ? text(cells[titleIndex + 2]).replace(/\s+/g, ' ').trim() : '';
    const match = dateText.match(/^(\d{2}|\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!match) continue;
    let [, year, month, day, hour, minute] = match;
    if (year.length === 2) year = `20${year}`;
    const date = `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
    const time = hour ? `${hour.padStart(2, '0')}:${minute}` : '';
    items.push({ id, sender: sender || '전사공지', subject: title, date, time });
    ids.add(id);
  }
  if (!items.length && !/게시(?:물|글)이?\s*없|등록된\s*(?:게시물|글)이?\s*없/.test(text(doc))) return { type: 'unknown' };
  return { type: 'ok', items };
}
