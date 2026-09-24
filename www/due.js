/* Qarz Daftari — qaytarish muddati (oxirgi muddat) mantiqi.
   To'lovlar eng eski qarzni birinchi yopadi (FIFO). Qarz to'liq yopilsa, eslatma o'chadi. */
(function (root) {
  'use strict';
  const sortKey = (e) => e.date + ' ' + (e.time || '00:00') + ' ' + String(e.created || 0).padStart(15, '0');

  // mijozning hali to'lanmagan qarz yozuvlari: [{entry, left}]
  function openDebts(entries, clientId) {
    const list = entries.filter(e => e.clientId === clientId).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const queue = []; let credit = 0;
    for (const e of list) {
      const amt = Math.round(Number(e.amount) || 0);
      if (e.type === 'pay') {
        let p = amt;
        while (p > 0 && queue.length) {
          const q = queue[0]; const take = Math.min(q.left, p);
          q.left -= take; p -= take;
          if (q.left === 0) queue.shift();
        }
        credit += p;                                // ortiqcha to'lov keyingi qarzlarni yopadi
      } else {
        const use = Math.min(credit, amt); credit -= use;
        if (amt - use > 0) queue.push({ entry: e, left: amt - use });
      }
    }
    return queue;
  }
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
  }
  // muddat holati: kechikkan / bugun / yaqin / keyin
  function status(due, today) {
    const d = daysBetween(today, due);
    if (d < 0) return { kind: 'late', days: -d, text: -d + ' kun kechikdi' };
    if (d === 0) return { kind: 'today', days: 0, text: 'Bugun' };
    if (d === 1) return { kind: 'soon', days: 1, text: 'Ertaga' };
    if (d <= 3) return { kind: 'soon', days: d, text: d + ' kun qoldi' };
    return { kind: 'later', days: d, text: d + ' kun qoldi' };
  }
  // barcha ochiq, muddati belgilangan qarzlar
  function reminders(db, today) {
    const out = [];
    for (const c of db.clients) {
      for (const o of openDebts(db.entries, c.id)) {
        if (!o.entry.due) continue;
        out.push({ client: c, entry: o.entry, left: o.left, due: o.entry.due, st: status(o.entry.due, today) });
      }
    }
    return out.sort((a, b) => a.due.localeCompare(b.due) || b.left - a.left);
  }
  // bildirishnoma uchun barqaror raqamli id
  function notifId(entryId, n) {
    let h = 0; const s = String(entryId);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 500000000) * 2 + 1 + (n || 0);
  }
  const api = { openDebts, status, reminders, notifId, daysBetween };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QarzDue = api;
})(this);
