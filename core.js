export const DEFAULT_FILTERS = ['인젠트 뉴스브리핑'];
const HISTORY_LIMIT = 10;
export const BOARD_URL = 'https://ep.inzent.com:1204/bbs/bbslist?AddBbs=0&csrf=eyJ0b2tlbiI6IiIsIlJvb21ObyI6IjQ1In0%3D';

export function boardPostUrl(item) {
  if (!/^\d+$/.test(item.id || '')) return BOARD_URL;
  const csrf = item.csrf && /^[A-Za-z0-9+/=_-]{1,2048}$/.test(item.csrf)
    ? item.csrf : btoa(JSON.stringify({ token: '', RoomNo: '45', DocNo: item.id }));
  const url = new URL('https://ep.inzent.com:1204/bbs/BbsView');
  url.searchParams.set('AddBbs', '0');
  url.searchParams.set('csrf', csrf);
  return url.href;
}

export function badgeAppearance(status, count) {
  const number = Number.isSafeInteger(count) && count > 0 ? count : 0;
  if (number) return { text: number > 99 ? '99+' : String(number), color: '#dc3f48' };
  return { text: { login: '!', error: '?', uncertain: '?' }[status] || '', color: status === 'login' ? '#c2410c' : '#475569' };
}

export function normalizeName(name) {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko');
}

export function seoulToday(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(({ type, value }) => [type, value]));
  return `${parts.year}/${parts.month}/${parts.day}`;
}

export function todayMail(messages, filters, now = Date.now()) {
  const excluded = new Set(filters.map(normalizeName).filter(Boolean));
  return messages
    .filter((item) => !excluded.has(normalizeName(item.sender)))
    .map(({ id, sender, subject, csrf, dateText }) => ({ id, sender, subject, csrf, mailDate: formatListDate(dateText, now) }))
    .filter((item) => item.mailDate?.date === seoulToday(now))
    .sort((a, b) => b.mailDate.time.localeCompare(a.mailDate.time))
    .slice(0, HISTORY_LIMIT);
}

export function todayBoard(items, now = Date.now()) {
  const today = seoulToday(now);
  return items.filter((item) => item.date === today).sort((a, b) => (b.time || '').localeCompare(a.time || '')).slice(0, HISTORY_LIMIT);
}

export function compareBoard(previous, items) {
  const ids = items.map((item) => item.id);
  const known = new Set(previous || []);
  return {
    fresh: Array.isArray(previous) ? items.filter((item) => !known.has(item.id)) : [],
    trackedIds: [...new Set([...ids, ...(previous || [])])].slice(0, 100),
  };
}

export function mailNotification(messages) {
  const shown = messages.slice(0, 5);
  if (messages.length === 1) return {
    type: 'basic', iconUrl: 'icon.png', title: '새 메일이 도착했습니다',
    message: `${messages[0].sender}: ${messages[0].subject || '(제목 없음)'}`
  };
  return {
    type: 'list', iconUrl: 'icon.png', title: `새 메일 ${messages.length}건`,
    message: messages.length > shown.length ? `최근 ${shown.length}건을 표시합니다.` : '받은편지함에서 확인하세요.',
    items: shown.map((mail) => ({ title: mail.sender, message: mail.subject || '(제목 없음)' }))
  };
}

// The inbox shows today's time without a date and older dates without a year.
export function formatListDate(value, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(({ type, value: part }) => [type, part]));
  let year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  const raw = (value || '').replace(/\s+/g, ' ').trim();
  const dated = raw.match(/^(?:(\d{4})[.\/-])?(\d{1,2})[.\/-](\d{1,2})\.?\s+(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})$/);
  const today = raw.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})$/);
  let period, hour, minute;
  if (dated) {
    const [, givenYear, m, d, p, h, min] = dated;
    month = Number(m); day = Number(d); period = p; hour = Number(h); minute = Number(min);
    if (givenYear) year = Number(givenYear);
    else if (month > Number(parts.month) || (month === Number(parts.month) && day > Number(parts.day))) year--;
  } else if (today) {
    [, period] = today; hour = Number(today[2]); minute = Number(today[3]);
  } else return null;
  if (period) { if (hour < 1 || hour > 12) return null; hour = hour % 12 + (period === '오후' ? 12 : 0); }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (hour > 23 || minute > 59 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${year}/${pad(month)}/${pad(day)}`, time: `${pad(hour)}:${pad(minute)}` };
}

export function updateHistory(previous, messages, now = Date.now()) {
  const entries = messages.map(({ id, sender, subject, csrf, dateText }) => ({ id, sender, subject, csrf, mailDate: formatListDate(dateText, now), notifiedAt: now }));
  const ids = new Set(entries.map((item) => item.id));
  const dateKey = (item) => {
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(item.mailDate?.date || '') && /^\d{2}:\d{2}$/.test(item.mailDate?.time || '')) return `${item.mailDate.date} ${item.mailDate.time}`;
    if (!Number.isFinite(item.notifiedAt)) return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(item.notifiedAt)).map(({ type, value }) => [type, value]));
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
  };
  return [...entries, ...(previous || []).filter((item) => !ids.has(item.id))]
    .sort((a, b) => dateKey(b).localeCompare(dateKey(a)))
    .slice(0, HISTORY_LIMIT);
}

export function compareInbox(previous, messages, filters, tracked = previous || []) {
  const ids = messages.map((message) => message.id);
  const known = new Set(previous || []);
  const anchor = messages.findIndex((message) => known.has(message.id));
  const initialized = Array.isArray(previous);
  const uncertain = initialized && known.size > 0 && messages.length > 0 && anchor < 0;
  const candidates = !initialized || uncertain ? [] : messages.slice(0, anchor < 0 ? messages.length : anchor);
  const excluded = new Set(filters.map(normalizeName).filter(Boolean));
  const alreadySeen = new Set(tracked);
  const fresh = candidates.filter((message) => !alreadySeen.has(message.id) && !excluded.has(normalizeName(message.sender)));
  const trackedIds = [...new Set([...ids, ...tracked])].slice(0, 100);
  return { fresh, ids, uncertain, trackedIds };
}
