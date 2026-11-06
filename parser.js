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
