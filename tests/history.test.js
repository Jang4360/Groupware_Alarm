import test from 'node:test';
import assert from 'node:assert/strict';
import { updateHistory } from '../core.js';

test('메일이 입력된 순서와 관계없이 최근 메일부터 정렬하고 오래된 항목을 밀어낸다', () => {
  const now = Date.parse('2026-11-06T02:00:00Z');
  const previous = [{ id: 'old', mailDate: { date: '2026/11/05', time: '10:00' }, notifiedAt: now }];
  const messages = [1, 10, 2, 9, 3, 8, 4, 7, 5, 6].map((n) => ({ id: `${n}`, sender: '동료', subject: '메일', csrf: '', dateText: `오전 09:${String(n).padStart(2, '0')}` }));
  assert.deepEqual(updateHistory(previous, messages, now).map((item) => item.id), ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1']);
});

test('같은 시각 메일과 시각 정보가 없는 메일도 안정적으로 유지한다', () => {
  const now = Date.parse('2026-11-06T00:00:00Z');
  const messages = ['a', 'b'].map((id) => ({ id, sender: '동료', subject: '', csrf: '', dateText: '오전 09:00' }));
  assert.deepEqual(updateHistory([], messages, now).map((item) => item.id), ['a', 'b']);
  assert.deepEqual(updateHistory([{ id: 'old', notifiedAt: now - 86400000 }], [{ id: 'new' }], now).map((item) => item.id), ['new', 'old']);
});
