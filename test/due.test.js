const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../www/due.js');
const D = (id, date, amount, due) => ({ id, clientId: 'f', type: 'debt', date, time: '10:00', amount, due: due || '' });
const P = (id, date, amount) => ({ id, clientId: 'f', type: 'pay', date, time: '12:00', amount });

test("To'lanmagan qarz eslatmada turadi", () => {
  const db = { clients: [{ id: 'f', name: 'Farrux' }], entries: [D('a', '2026-09-20', 1000000, '2026-09-25')] };
  const r = Q.reminders(db, '2026-09-25');
  assert.equal(r.length, 1); assert.equal(r[0].left, 1000000); assert.equal(r[0].st.kind, 'today');
});
test("Qisman to'lov: qolgani ko'rsatiladi", () => {
  const db = { clients: [{ id: 'f', name: 'Farrux' }], entries: [D('a', '2026-09-20', 1000000, '2026-09-25'), P('p', '2026-09-22', 400000)] };
  assert.equal(Q.reminders(db, '2026-09-23')[0].left, 600000);
});
test("To'liq to'lansa eslatma o'chadi", () => {
  const db = { clients: [{ id: 'f', name: 'Farrux' }], entries: [D('a', '2026-09-20', 1000000, '2026-09-25'), P('p', '2026-09-22', 1000000)] };
  assert.equal(Q.reminders(db, '2026-09-23').length, 0);
});
test("To'lov eng eski qarzni birinchi yopadi", () => {
  const db = { clients: [{ id: 'f', name: 'Farrux' }], entries: [D('a', '2026-09-01', 1000000, '2026-09-25'), D('b', '2026-09-10', 500000, '2026-10-10'), P('p', '2026-09-15', 1200000)] };
  const r = Q.reminders(db, '2026-09-23');
  assert.equal(r.length, 1); assert.equal(r[0].entry.id, 'b'); assert.equal(r[0].left, 300000);
});
test("Muddatsiz qarz eslatmaga tushmaydi", () => {
  const db = { clients: [{ id: 'f', name: 'Farrux' }], entries: [D('a', '2026-09-20', 1000000)] };
  assert.equal(Q.reminders(db, '2026-09-23').length, 0);
});
test("Oldindan ortiqcha to'lov keyingi qarzni yopadi", () => {
  const db = { clients: [{ id: 'f', name: 'Farrux' }], entries: [P('p', '2026-09-01', 300000), D('a', '2026-09-02', 1000000, '2026-09-30')] };
  assert.equal(Q.reminders(db, '2026-09-23')[0].left, 700000);
});
test('Holatlar: kechikkan, bugun, ertaga', () => {
  assert.equal(Q.status('2026-09-20', '2026-09-23').kind, 'late');
  assert.equal(Q.status('2026-09-20', '2026-09-23').days, 3);
  assert.equal(Q.status('2026-09-23', '2026-09-23').kind, 'today');
  assert.equal(Q.status('2026-09-24', '2026-09-23').text, 'Ertaga');
  assert.equal(Q.status('2026-10-01', '2026-09-23').kind, 'later');
});
test("Bildirishnoma id'lari barqaror va musbat", () => {
  const a = Q.notifId('abc123'), b = Q.notifId('abc123', 1);
  assert.equal(a, Q.notifId('abc123')); assert.ok(a > 0 && b === a + 1 && b < 2147483647);
});
