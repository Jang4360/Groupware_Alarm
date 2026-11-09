import test from 'node:test';
import assert from 'node:assert/strict';
import { boardPostUrl, compareBoard, todayBoard, todayMail, seoulToday } from '../core.js';
import { parseNoticeBoard } from '../parser.bundle.js';

const now = Date.parse('2026-11-09T04:00:00Z');

test('서울 자정 기준으로 오늘 메일만 필터링하고 최근 열 개를 표시한다', () => {
  const mails = Array.from({ length: 11 }, (_, n) => ({ id: String(n), sender: '동료', subject: '메일', dateText: `오전 09:${String(n).padStart(2, '0')}` }));
  mails.unshift({ id: 'newsletter', sender: '인젠트 뉴스브리핑', dateText: '오전 10:00' });
  mails.push({ id: 'yesterday', sender: '동료', dateText: '11.08 23:59' });
  assert.deepEqual(todayMail(mails, ['인젠트 뉴스브리핑'], now).map((item) => item.id), ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1']);
  assert.equal(seoulToday(Date.parse('2026-11-08T14:59:59Z')), '2026/11/08');
  assert.equal(seoulToday(Date.parse('2026-11-08T15:00:00Z')), '2026/11/09');
});

test('오늘 게시글을 최신순으로 최대 열 개 표시한다', () => {
  const items = Array.from({ length: 11 }, (_, n) => ({ id: String(n), date: '2026/11/09', time: `09:${String(n).padStart(2, '0')}` }));
  items.push({ id: 'yesterday', date: '2026/11/08', time: '23:59' });
  assert.deepEqual(todayBoard(items, now).map((item) => item.id), ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1']);
});

test('실제 전사공지 목록의 고정글과 일반글, 작성자와 날짜를 읽는다', () => {
  const html = `<table><tr><td>100</td><td><img alt="고정글입니다."></td><td><b><a href="javascript:goView(100);">고정글</a></b></td><td>작성자</td><td>26.10.20&nbsp;11:28</td></tr><tr><td>101</td><td></td><td><a href="javascript:goView(101);">공지 A</a></td><td>홍길동</td><td>26.11.09&nbsp;09:05</td></tr><tr><td>102</td><td></td><td><a href="javascript:goView(102);">공지 B</a></td><td>관리자</td><td>26.11.08&nbsp;13:39</td></tr></table>`;
  const result = parseNoticeBoard(html, 'https://ep.inzent.com:1204/bbs/bbslist?AddBbs=0');
  assert.equal(result.type, 'ok');
  assert.deepEqual(todayBoard(result.items, now).map((item) => item.subject), ['공지 A']);
  assert.equal(result.items[1].time, '09:05');
  assert.equal(result.items[1].sender, '홍길동');
  assert.equal(parseNoticeBoard('<p>오류</p>', 'https://ep.inzent.com:1204/bbs/BbsList').type, 'unknown');
});

test('공지 상세 URL은 그룹웨어가 사용하는 인코딩된 게시글 식별자를 포함한다', () => {
  const url = new URL(boardPostUrl({ id: '1794' }));
  assert.equal(url.pathname, '/bbs/BbsView');
  assert.equal(url.searchParams.get('AddBbs'), '0');
  assert.deepEqual(JSON.parse(atob(url.searchParams.get('csrf'))), { token: '', RoomNo: '45', DocNo: '1794' });
});

test('게시판의 첫 조회는 기준으로만 저장하고 이후 새 글만 감지한다', () => {
  const old = [{ id: '1' }, { id: '2' }];
  const initial = compareBoard(undefined, old);
  assert.deepEqual(initial.fresh, []);
  const next = compareBoard(initial.trackedIds, [{ id: '3' }, ...old]);
  assert.deepEqual(next.fresh.map((item) => item.id), ['3']);
  assert.deepEqual(compareBoard(next.trackedIds, [{ id: '3' }, ...old]).fresh, []);
});
