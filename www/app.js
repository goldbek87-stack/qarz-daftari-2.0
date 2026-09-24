/* Qarz Daftari — asosiy mantiq */
(function () {
'use strict';

/* ---------- yordamchilar ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = (n) => { n = Math.round(Number(n) || 0); const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s; };
const parseMoney = (s) => { s = String(s || '').replace(/[^\d.,]/g, '').replace(',', '.'); const v = parseFloat(s); return isNaN(v) ? 0 : v; };
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function nowHM() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const WDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
function dateShort(iso) { const [y, m, d] = iso.split('-'); return d + '.' + m + '.' + y; }
function dateLong(iso) {
  if (iso === todayISO()) return 'Bugun';
  if (iso === addDays(todayISO(), -1)) return 'Kecha';
  const [y, m, d] = iso.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return d + '-' + MONTHS[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : '') + ', ' + WDAYS[w];
}
function toast(msg, ms) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2600);
}

/* ---------- Capacitor ---------- */
const Cap = window.Capacitor;
const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const pluginCache = {};
function plugin(name) {
  if (!isNative) return null;
  if (pluginCache[name]) return pluginCache[name];
  let p = Cap.Plugins && Cap.Plugins[name];
  if (!p && Cap.registerPlugin) p = Cap.registerPlugin(name);
  return (pluginCache[name] = p);
}

/* ---------- ma'lumotlar ---------- */
const KEY = 'qarz_daftari_v1';
let DB = { clients: [], entries: [], settings: { lang: 'uz-UZ', shop: '', autoBk: '' } };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) { const d = JSON.parse(raw); DB.clients = d.clients || []; DB.entries = d.entries || []; DB.settings = Object.assign(DB.settings, d.settings || {}); }
} catch (e) { }
let bkTimer = null;
let curKey = KEY;            // hisobsiz: KEY, bulut hisobida: KEY_u_<uid>, kirilmagan: '' (saqlanmaydi)
// faqat telefonga saqlash (bulutdan kelgan o'zgarishlar uchun ham)
function saveLocal() {
  if (curKey) { try { localStorage.setItem(curKey, JSON.stringify(DB)); } catch (e) { toast("Telefon xotirasiga saqlanmadi", 3000); } }
  clearTimeout(bkTimer); bkTimer = setTimeout(autoBackup, 1500);
  clearTimeout(ntTimer); ntTimer = setTimeout(scheduleReminders, 800);
}
// telefonga saqlash + bulutga yuborish
function save() { saveLocal(); if (window.Cloud) Cloud.push(); }
function switchStorage(suffix) {
  curKey = suffix === '__none' ? '' : suffix ? KEY + '_' + suffix : KEY;
  let d = null; try { d = curKey ? JSON.parse(localStorage.getItem(curKey) || 'null') : null; } catch (e) { }
  DB.clients = (d && d.clients) || []; DB.entries = (d && d.entries) || [];
  if (d && d.settings && suffix !== '__none') DB.settings = Object.assign(DB.settings, d.settings);
}
let ntTimer = null;
const client = (id) => DB.clients.find(c => c.id === id);
const sortKey = (e) => e.date + ' ' + (e.time || '00:00') + ' ' + (e.created || 0);
function stats(cid) {
  let took = 0, paid = 0, last = '';
  for (const e of DB.entries) if (e.clientId === cid) {
    if (e.type === 'pay') paid += e.amount; else took += e.amount;
    const k = sortKey(e); if (k > last) last = k;
  }
  return { took, paid, bal: took - paid, last };
}
function itemsText(e) {
  if (e.type === 'pay') return e.note || '';
  return (e.items || []).map(i => i.name + (i.qty && i.qty !== 1 ? ' × ' + i.qty : '')).join(', ');
}

/* ---------- navigatsiya (Android "orqaga" tugmasi ham ishlaydi) ---------- */
let tab = 'home', curClient = null;
const stack = [];
function pushLayer(name) { stack.push(name); history.pushState({ n: stack.length }, ''); }
function back() { if (stack.length) history.back(); }
let pendingTab = null;
window.addEventListener('popstate', (ev) => {
  const target = (ev.state && ev.state.n) || 0;
  while (stack.length > target) {
    const top = stack.pop();
    if (top === 'client') { curClient = null; showTab(tab); }
    else $(top).classList.add('hidden');
  }
  if (pendingTab) { const t = pendingTab; pendingTab = null; showTab(t); return; }
  refresh();
});
function showModal(id) { $(id).classList.remove('hidden'); pushLayer(id); }

function showTab(name) {
  tab = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  $('v-' + name).classList.add('on');
  document.querySelectorAll('nav.bottom button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === name));
  $('backBtn').classList.add('hidden'); $('topAction').classList.add('hidden');
  $('title').textContent = { home: 'Qarz daftari', report: 'Hisobot', settings: 'Sozlamalar' }[name];
  window.scrollTo(0, 0);
  refresh();
}
function openClient(id) {
  curClient = id;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  $('v-client').classList.add('on');
  $('backBtn').classList.remove('hidden'); $('topAction').classList.remove('hidden');
  if (stack[stack.length - 1] !== 'client') pushLayer('client');
  window.scrollTo(0, 0);
  refresh();
}
function refresh() {
  if (curClient && client(curClient)) renderClient();
  else if (tab === 'home') renderHome();
  else if (tab === 'report') renderReport();
  else if (tab === 'settings') renderSettings();
}

/* ---------- MIJOZLAR ---------- */
function renderHome() {
  const q = $('q').value.trim().toLowerCase();
  let total = 0;
  const rows = DB.clients.map(c => { const s = stats(c.id); total += s.bal; return { c, s }; });
  rows.sort((a, b) => (b.s.last || b.c.created || '').localeCompare(a.s.last || a.c.created || ''));
  $('homeTotal').innerHTML = fmt(total) + "<small>so'm</small>";
  const debtors = rows.filter(r => r.s.bal > 0).length;
  $('homeCount').textContent = DB.clients.length ? DB.clients.length + ' ta mijoz, ' + debtors + ' tasida qarz bor' : '';
  const t = todayISO(); let td = 0, tp = 0;
  for (const e of DB.entries) if (e.date === t) { if (e.type === 'pay') tp += e.amount; else td += e.amount; }
  $('homeToday').textContent = (td || tp) ? 'Bugun: +' + fmt(td) + ' qarz, −' + fmt(tp) + " to'lov" : '';
  renderDue();
  const list = rows.filter(r => !q || r.c.name.toLowerCase().includes(q) || (r.c.phone || '').includes(q));
  if (!DB.clients.length) {
    $('clientList').innerHTML = '<div class="empty"><b>Daftar hali bo\'sh</b>"+ Mijoz" tugmasi bilan birinchi mijozni qo\'shing yoki pastdagi 🎤 tugmani bosib ayting: "Farruxga 2 qop un 300 ming".</div>';
    return;
  }
  if (!list.length) { $('clientList').innerHTML = '<div class="empty">"' + esc(q) + '" topilmadi.</div>'; return; }
  $('clientList').innerHTML = list.map(({ c, s }) => {
    const cls = s.bal > 0 ? 'debt' : s.bal < 0 ? 'pay' : 'zero';
    const last = s.last ? 'Oxirgi: ' + dateShort(s.last.slice(0, 10)) + ', ' + s.last.slice(11, 16) : 'Yozuv yo\'q';
    return '<button class="row" data-cid="' + c.id + '"><span class="ini">' + esc(c.name.charAt(0).toUpperCase()) + '</span>' +
      '<div class="main"><div class="nm">' + esc(c.name) + '</div><div class="meta">' + last + (c.phone ? ' · ' + esc(c.phone) : '') + '</div></div>' +
      '<div class="num amt ' + cls + '">' + (s.bal < 0 ? 'Ortiqcha ' + fmt(-s.bal) : fmt(s.bal)) + '</div></button>';
  }).join('');
}
$('clientList').addEventListener('click', (ev) => { const r = ev.target.closest('[data-cid]'); if (r) openClient(r.dataset.cid); });
$('q').addEventListener('input', renderHome);

/* ---------- QAYTARISH MUDDATI: bosh sahifadagi eslatmalar ---------- */
let dueAll = false;
function renderDue() {
  const all = QarzDue.reminders(DB, todayISO());
  const urgent = all.filter(r => r.st.kind === 'late' || r.st.kind === 'today');
  const soon = all.filter(r => r.st.kind === 'soon');
  const show = dueAll ? all : urgent.concat(soon);
  const box = $('dueBox');
  if (!show.length && !all.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const late = urgent.some(r => r.st.kind === 'late');
  const head = urgent.length ? (late ? '⏰ Qarz qaytarish muddati keldi' : '⏰ Bugun qaytarish kuni') : '📅 Yaqinda qaytariladigan qarzlar';
  box.innerHTML = '<div class="duecard"><div class="duehead ' + (late ? 'late' : '') + '"><span>' + head + '</span><span>' + (urgent.length || soon.length || all.length) + '</span></div>' +
    (show.length ? show.map(r => {
      const ph = r.client.phone;
      return '<div class="duerow"><button class="main" data-duecid="' + r.client.id + '"><div class="nm">' + esc(r.client.name) + '</div>' +
        '<div class="meta"><b class="' + r.st.kind + '">' + esc(r.st.text) + '</b> · ' + dateShort(r.due) + ' · <span class="num">' + fmt(r.left) + " so'm</span></div></button>" +
        '<button class="callbtn ' + (ph ? '' : 'off') + '" data-call="' + r.client.id + '" aria-label="Qo\'ng\'iroq">📞</button></div>';
    }).join('') : '<div class="duerow"><div class="main meta">Bugun va yaqin kunlarda muddat yo\'q</div></div>') +
    (all.length > show.length || dueAll ? '<button class="duemore" id="dueMore">' + (dueAll ? 'Faqat yaqinlarini ko\'rsatish' : 'Barcha muddatlar (' + all.length + ')') + '</button>' : '') + '</div>';
}
$('dueBox').addEventListener('click', (ev) => {
  const call = ev.target.closest('[data-call]');
  if (call) {
    const c = client(call.dataset.call);
    if (c && c.phone) location.href = 'tel:' + c.phone.replace(/[^\d+]/g, '');
    else { toast("Telefon raqami kiritilmagan. Mijoz sahifasida ⋮ → O'zgartirish", 3500); }
    return;
  }
  if (ev.target.closest('#dueMore')) { dueAll = !dueAll; renderDue(); return; }
  const r = ev.target.closest('[data-duecid]'); if (r) openClient(r.dataset.duecid);
});

/* ---------- telefon bildirishnomalari (ilova yopiq bo'lsa ham) ---------- */
let ntAsked = false;
async function scheduleReminders() {
  const LN = plugin('LocalNotifications'); if (!LN) return;
  try {
    const today = todayISO(), now = new Date();
    const list = QarzDue.reminders(DB, today);
    const pend = await LN.getPending();
    const old = (pend.notifications || []).filter(n => n.extra && n.extra.qd).map(n => ({ id: n.id }));
    if (old.length) await LN.cancel({ notifications: old });
    const notes = [];
    const at9 = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 9, 0, 0); };
    for (const r of list) {
      const who = r.client.name, sum = fmt(r.left) + " so'm";
      const t1 = at9(r.due);
      if (t1 > now) notes.push({ id: QarzDue.notifId(r.entry.id, 0), title: '⏰ Qarz qaytarish kuni: ' + who,
        body: 'Bugun ' + who + ' qarzini qaytarishi kerak: ' + sum + ". Qo'ng'iroq qiling.", schedule: { at: t1, allowWhileIdle: true },
        isExactNotification: false, extra: { qd: 1, clientId: r.client.id } });
      const t2 = at9(QarzDueAdd(r.due, 1));
      if (t2 > now) notes.push({ id: QarzDue.notifId(r.entry.id, 1), title: '❗ Muddat o\'tdi: ' + who,
        body: who + ' qarzini qaytarmadi: ' + sum + ". Qo'ng'iroq qiling.", schedule: { at: t2, allowWhileIdle: true },
        isExactNotification: false, extra: { qd: 1, clientId: r.client.id } });
    }
    if (!notes.length) return;
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted' && !ntAsked) { ntAsked = true; perm = await LN.requestPermissions(); }
    if (perm.display !== 'granted') return;
    await LN.schedule({ notifications: notes.slice(0, 60) });
  } catch (e) { console.warn('Eslatma:', e && e.message); }
}
function QarzDueAdd(iso, n) { return addDays(iso, n); }
function initNotifications() {
  const LN = plugin('LocalNotifications'); if (!LN) return;
  LN.addListener('localNotificationActionPerformed', (a) => {
    const cid = a && a.notification && a.notification.extra && a.notification.extra.clientId;
    if (cid && client(cid)) setTimeout(() => openClient(cid), 300);
  });
  scheduleReminders();
}

/* ---------- MIJOZ SAHIFASI ---------- */
function renderClient() {
  const c = client(curClient); const s = stats(c.id);
  $('title').textContent = c.name;
  $('cLbl').textContent = s.bal < 0 ? "Ortiqcha to'lagan" : 'Qarzi';
  $('cBal').innerHTML = fmt(Math.abs(s.bal)) + "<small>so'm</small>";
  $('cTook').textContent = 'Jami olgan: ' + fmt(s.took);
  $('cPaid').textContent = "Jami to'lagan: " + fmt(s.paid);
  const list = DB.entries.filter(e => e.clientId === c.id).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  let run = 0; const bal = {};
  for (const e of list) { run += e.type === 'pay' ? -e.amount : e.amount; bal[e.id] = run; }
  list.reverse();
  if (!list.length) { $('cHistory').innerHTML = '<div class="empty"><b>Hali yozuv yo\'q</b>"+ Qarz yozish" yoki 🎤 tugmasini bosing.</div>'; return; }
  let html = '', day = '';
  for (const e of list) {
    if (e.date !== day) { day = e.date; html += '<div class="day">' + dateLong(day) + '</div>'; }
    html += entryHTML(e, false).replace('%BAL%', 'Qoldiq: ' + fmt(bal[e.id]));
  }
  $('cHistory').innerHTML = html;
}
function dueLine(e) {
  if (e.type === 'pay' || !e.due) return '';
  const open = QarzDue.openDebts(DB.entries, e.clientId).find(o => o.entry.id === e.id);
  if (!open) return '<div class="due paid">✓ Muddat: ' + dateShort(e.due) + ' — to\'langan</div>';
  const st = QarzDue.status(e.due, todayISO());
  return '<div class="due ' + (st.kind === 'late' ? 'late' : '') + '">⏰ Oxirgi muddat: ' + dateShort(e.due) + ' (' + st.text.toLowerCase() + ')' +
    (open.left < e.amount ? ' · qoldi ' + fmt(open.left) : '') + '</div>';
}
function entryHTML(e, withName) {
  const pay = e.type === 'pay';
  const c = client(e.clientId);
  let items = '';
  if (!pay) items = '<div class="items">' + (e.items || []).map(i =>
    '<div><span>' + esc(i.name) + (i.qty && i.qty !== 1 ? ' × ' + i.qty : '') + '</span><span class="num">' + fmt(i.sum) + '</span></div>').join('') + '</div>';
  return '<button class="ent" data-eid="' + e.id + '"><span class="tm">' + esc(e.time || '') + '</span>' +
    '<div class="l1"><span class="kind">' + (withName ? esc(c ? c.name : '?') : (pay ? "To'lov" : 'Qarz berildi')) + '</span>' +
    '<span class="num amt ' + (pay ? 'pay' : 'debt') + '">' + (pay ? '−' : '+') + fmt(e.amount) + '</span></div>' +
    (withName && pay ? '<div class="nt">To\'lov qildi</div>' : '') + items +
    (e.note ? '<div class="nt">' + esc(e.note) + '</div>' : '') + dueLine(e) +
    (withName ? '' : '<div class="bal num">%BAL%</div>') + '</button>';
}
$('cHistory').addEventListener('click', (ev) => { const r = ev.target.closest('[data-eid]'); if (r) openEntry({ id: r.dataset.eid }); });
$('cDebt').onclick = () => openEntry({ clientId: curClient, type: 'debt' });
$('cPay').onclick = () => openEntry({ clientId: curClient, type: 'pay' });
$('backBtn').onclick = back;
$('topAction').onclick = () => {
  const c = client(curClient); if (!c) return;
  $('menuTitle').textContent = c.name;
  $('menuPhone').textContent = c.phone || "Telefon kiritilmagan";
  showModal('mMenu');
};
$('menuPdf').onclick = () => { back(); setTimeout(() => pdfClient(curClient), 150); };
$('menuCall').onclick = () => { const c = client(curClient); if (c && c.phone) location.href = 'tel:' + c.phone.replace(/[^\d+]/g, ''); else toast('Avval telefon raqamini kiriting'); };
$('menuEdit').onclick = () => { back(); setTimeout(() => openClientForm(curClient), 150); };

/* ---------- MIJOZ QO'SHISH / TAHRIRLASH ---------- */
let editingClient = null;
function openClientForm(id) {
  editingClient = id || null;
  const c = id ? client(id) : null;
  $('mcTitle').textContent = c ? "Mijozni o'zgartirish" : 'Yangi mijoz';
  $('mcName').value = c ? c.name : ''; $('mcPhone').value = c ? (c.phone || '') : '';
  $('mcDelete').classList.toggle('hidden', !c);
  showModal('mClient');
  setTimeout(() => $('mcName').focus(), 200);
}
function findByName(name) { const n = name.trim().toLowerCase(); return DB.clients.find(c => c.name.trim().toLowerCase() === n); }
function createClient(name, phone) {
  const ex = findByName(name); if (ex) return ex;
  const c = { id: uid(), name: name.trim(), phone: (phone || '').trim(), created: todayISO() + ' ' + nowHM() };
  DB.clients.push(c); return c;
}
$('addClientBtn').onclick = () => openClientForm(null);
$('mcSave').onclick = () => {
  const name = $('mcName').value.trim();
  if (!name) { toast('Ismni kiriting'); return; }
  if (editingClient) {
    const other = findByName(name);
    if (other && other.id !== editingClient) { toast('Bu ismli mijoz allaqachon bor'); return; }
    const c = client(editingClient); c.name = name; c.phone = $('mcPhone').value.trim();
    save(); back(); toast('Saqlandi');
  } else {
    if (findByName(name)) { toast('Bu ismli mijoz allaqachon bor'); return; }
    const c = createClient(name, $('mcPhone').value); save();
    back(); setTimeout(() => openClient(c.id), 120);
  }
};
$('mcDelete').onclick = () => {
  const c = client(editingClient); if (!c) return;
  const s = stats(c.id);
  if (!confirm(c.name + ' va uning barcha yozuvlari o\'chirilsinmi?' + (s.bal > 0 ? '\nQarzi: ' + fmt(s.bal) + " so'm" : ''))) return;
  DB.entries = DB.entries.filter(e => e.clientId !== c.id);
  DB.clients = DB.clients.filter(x => x.id !== c.id);
  save(); history.go(-stack.length); toast("O'chirildi");
};

/* ---------- YOZUV (qarz / to'lov) OYNASI ---------- */
let E = null; // tahrirlanayotgan yozuv
function openEntry(opts) {
  opts = opts || {};
  if (opts.id) {
    const e = DB.entries.find(x => x.id === opts.id); if (!e) return;
    E = JSON.parse(JSON.stringify(e)); E._edit = true;
  } else {
    E = { id: uid(), clientId: opts.clientId || null, newName: opts.newName || '', type: opts.type || 'debt',
      date: opts.date || todayISO(), time: nowHM(), items: opts.items && opts.items.length ? opts.items : [{ name: '', qty: 1, price: 0, sum: 0 }],
      amount: opts.amount || 0, note: opts.note || '', created: Date.now() };
  }
  $('eTitle').textContent = E._edit ? "Yozuvni o'zgartirish" : 'Yangi yozuv';
  $('eHeard').classList.toggle('hidden', !opts.heard);
  if (opts.heard) $('eHeard').querySelector('span').textContent = '"' + opts.heard + '"';
  fillClientSelect();
  $('eDate').value = E.date; $('eTime').value = E.time || nowHM();
  $('eNote').value = E.note || '';
  $('eDueOn').checked = !!E.due;
  $('eDue').value = E.due || addDays(E.date || todayISO(), 7);
  $('eDueBox').classList.toggle('hidden', !E.due);
  $('ePayAmt').value = E.type === 'pay' && E.amount ? fmt(E.amount) : '';
  $('eDelete').classList.toggle('hidden', !E._edit);
  setType(E.type);
  renderItems();
  showModal('mEntry');
}
function fillClientSelect() {
  const sorted = DB.clients.slice().sort((a, b) => a.name.localeCompare(b.name));
  $('eClient').innerHTML = '<option value="">— tanlang —</option>' +
    sorted.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') +
    '<option value="__new">+ Yangi mijoz</option>';
  if (E.clientId && client(E.clientId)) $('eClient').value = E.clientId;
  else if (E.newName) { $('eClient').value = '__new'; }
  else $('eClient').value = '';
  $('eNewName').value = E.newName || '';
  $('eNewName').classList.toggle('hidden', $('eClient').value !== '__new');
  updatePayHint();
}
$('eClient').onchange = () => {
  const v = $('eClient').value;
  $('eNewName').classList.toggle('hidden', v !== '__new');
  if (v === '__new') setTimeout(() => $('eNewName').focus(), 50);
  E.clientId = v && v !== '__new' ? v : null;
  updatePayHint();
};
function setType(t) {
  E.type = t;
  document.querySelectorAll('.typeseg button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('eDebtBox').classList.toggle('hidden', t !== 'debt');
  $('ePayBox').classList.toggle('hidden', t !== 'pay');
  updatePayHint();
}
document.querySelectorAll('.typeseg button').forEach(b => b.onclick = () => setType(b.dataset.t));
function updatePayHint() {
  const cid = $('eClient').value;
  if (cid && cid !== '__new') {
    let s = stats(cid);
    if (E && E._edit) { const orig = DB.entries.find(x => x.id === E.id); if (orig) s.bal += orig.type === 'pay' ? orig.amount : -orig.amount; }
    const paid = parseMoney($('ePayAmt').value);
    $('ePayHint').textContent = 'Hozirgi qarzi: ' + fmt(s.bal) + " so'm" + (paid ? ' → to\'lovdan keyin: ' + fmt(s.bal - paid) + " so'm" : '');
  } else $('ePayHint').textContent = '';
}
function renderItems() {
  $('eItems').innerHTML = E.items.map((it, i) =>
    '<div class="item" data-i="' + i + '">' +
    '<input class="inp nameinp" data-f="name" placeholder="Tovar nomi (masalan: un)" value="' + esc(it.name) + '">' +
    '<button class="x" data-del="' + i + '" aria-label="O\'chirish">✕</button>' +
    '<div class="three">' +
    '<div><small>Soni</small><input class="inp num" data-f="qty" inputmode="decimal" value="' + (it.qty || '') + '"></div>' +
    '<div><small>Narxi</small><input class="inp num" data-f="price" inputmode="numeric" value="' + (it.price ? fmt(it.price) : '') + '" placeholder="0"></div>' +
    '<div><small>Summa</small><input class="inp num" data-f="sum" inputmode="numeric" value="' + (it.sum ? fmt(it.sum) : '') + '" placeholder="0"></div>' +
    '</div></div>').join('');
  updateSum();
}
function updateSum() { $('eSum').textContent = fmt(E.items.reduce((a, b) => a + (Number(b.sum) || 0), 0)) + " so'm"; }
$('eItems').addEventListener('input', (ev) => {
  const inp = ev.target; const box = inp.closest('.item'); if (!box) return;
  const it = E.items[+box.dataset.i]; const f = inp.dataset.f;
  if (f === 'name') { it.name = inp.value; return; }
  if (f === 'price' || f === 'sum') {
    const v = parseMoney(inp.value); inp.value = v ? fmt(v) : '';
  }
  it.qty = parseMoney(box.querySelector('[data-f=qty]').value) || 0;
  if (f === 'qty' || f === 'price') {
    it.price = parseMoney(box.querySelector('[data-f=price]').value);
    it.sum = Math.round((it.qty || 1) * it.price);
    box.querySelector('[data-f=sum]').value = it.sum ? fmt(it.sum) : '';
  } else if (f === 'sum') {
    it.sum = parseMoney(inp.value);
    it.price = it.qty ? Math.round(it.sum / it.qty * 100) / 100 : it.sum;
    box.querySelector('[data-f=price]').value = it.price ? fmt(it.price) : '';
  }
  updateSum();
});
$('eItems').addEventListener('click', (ev) => {
  const d = ev.target.closest('[data-del]'); if (!d) return;
  E.items.splice(+d.dataset.del, 1);
  if (!E.items.length) E.items.push({ name: '', qty: 1, price: 0, sum: 0 });
  renderItems();
});
$('eAddItem').onclick = () => { E.items.push({ name: '', qty: 1, price: 0, sum: 0 }); renderItems(); const ins = $('eItems').querySelectorAll('.nameinp'); ins[ins.length - 1].focus(); };
$('ePayAmt').addEventListener('input', () => { const v = parseMoney($('ePayAmt').value); $('ePayAmt').value = v ? fmt(v) : ''; updatePayHint(); });
$('eVoiceAdd').onclick = () => listen((text) => {
  const r = QarzParser.parse(text, DB.clients);
  $('eHeard').classList.remove('hidden'); $('eHeard').querySelector('span').textContent = '"' + text + '"';
  if (!$('eClient').value || $('eClient').value === '__new') {
    if (r.clientId) { E.clientId = r.clientId; E.newName = ''; fillClientSelect(); }
    else if (r.newName && !$('eNewName').value) { E.newName = r.newName; E.clientId = null; fillClientSelect(); }
  }
  if (r.dayOffset) { $('eDate').value = addDays(todayISO(), r.dayOffset); }
  if (r.note && !$('eNote').value) $('eNote').value = r.note;
  if (r.type === 'pay') { setType('pay'); if (r.amount) $('ePayAmt').value = fmt(r.amount); updatePayHint(); return; }
  if (!r.items.length) { toast('Summa yoki tovar tushunilmadi — qo\'lda to\'ldiring'); return; }
  setType('debt');
  E.items = E.items.filter(i => i.name || i.sum).concat(r.items);
  renderItems();
});
$('eDueOn').onchange = () => {
  $('eDueBox').classList.toggle('hidden', !$('eDueOn').checked);
  if ($('eDueOn').checked && !$('eDue').value) $('eDue').value = addDays($('eDate').value || todayISO(), 7);
};
document.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => { $('eDue').value = addDays($('eDate').value || todayISO(), +b.dataset.dd); });
$('eSave').onclick = () => {
  let cid = $('eClient').value;
  if (cid === '__new') {
    const nm = $('eNewName').value.trim();
    if (!nm) { toast('Yangi mijoz ismini yozing'); return; }
    cid = createClient(nm).id;
  }
  if (!cid) { toast('Mijozni tanlang'); return; }
  const out = { id: E.id, clientId: cid, type: E.type, date: $('eDate').value || todayISO(), time: $('eTime').value || nowHM(),
    note: $('eNote').value.trim(), created: E.created || Date.now() };
  if (E.type === 'pay') {
    out.amount = parseMoney($('ePayAmt').value);
    if (!out.amount) { toast("To'langan summani kiriting"); return; }
    out.items = [];
  } else {
    out.items = E.items.filter(i => (i.name && i.name.trim()) || i.sum).map(i => ({ name: (i.name || '').trim() || 'Tovar', qty: i.qty || 1, price: i.price || 0, sum: Math.round(i.sum || 0) }));
    out.amount = out.items.reduce((a, b) => a + b.sum, 0);
    if (!out.amount) { toast('Kamida bitta tovar summasini kiriting'); return; }
    if ($('eDueOn').checked) {
      out.due = $('eDue').value;
      if (!out.due) { toast('Oxirgi muddat sanasini tanlang'); return; }
      if (out.due < out.date) { toast("Oxirgi muddat qarz sanasidan oldin bo'lishi mumkin emas"); return; }
    }
  }
  const idx = DB.entries.findIndex(x => x.id === out.id);
  if (idx >= 0) DB.entries[idx] = out; else DB.entries.push(out);
  save();
  const wasOnClient = curClient;
  back();
  const s = stats(cid);
  toast((out.type === 'pay' ? "To'lov yozildi. " : 'Qarz yozildi. ') + client(cid).name + ' qarzi: ' + fmt(s.bal) + " so'm" + (out.due ? '. Eslatma: ' + dateShort(out.due) : ''), 3200);
  if (!wasOnClient) setTimeout(() => openClient(cid), 150);
};
$('eDelete').onclick = () => {
  if (!confirm("Bu yozuv o'chirilsinmi?")) return;
  DB.entries = DB.entries.filter(x => x.id !== E.id); save(); back(); toast("O'chirildi");
};
document.querySelectorAll('[data-close]').forEach(b => b.onclick = back);

/* ---------- OVOZ ---------- */
let webRec = null;
async function listen(cb) {
  const lang = DB.settings.lang || 'uz-UZ';
  if (isNative) {
    const SR = plugin('SpeechRecognition');
    try {
      const perm = await SR.requestPermissions();
      if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') { toast('Mikrofonga ruxsat berilmadi. Telefon sozlamalaridan ruxsat bering.', 4000); return; }
      const av = await SR.available();
      if (av && av.available === false) { toast("Telefonda Google ovoz xizmati topilmadi. Qo'lda kiriting.", 4000); return; }
      // popup: Google'ning o'z oynasi — gap tugashi bilan o'zi to'xtaydi va matnni qaytaradi
      const res = await SR.start({ language: lang, popup: true, maxResults: 1, partialResults: false, prompt: 'Gapiring...' });
      const text = res && res.matches && res.matches[0];
      if (text) cb(text); else toast("Hech narsa eshitilmadi, qayta urinib ko'ring");
    } catch (e) {
      toast("Ovoz tanilmadi. Internet borligini tekshiring yoki qo'lda kiriting.", 3500);
    }
    return;
  }
  const W = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!W) { toast("Bu brauzerda ovoz ishlamaydi — qo'lda kiriting"); return; }
  webRec = new W(); webRec.lang = lang; webRec.interimResults = true; webRec.continuous = false;
  let text = '';
  $('listenTxt').textContent = 'Gapiring...'; $('listen').classList.remove('hidden');
  webRec.onresult = (ev) => { text = ''; for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript; $('listenTxt').textContent = text; };
  webRec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Mikrofonga ruxsat berilmadi'); };
  webRec.onend = () => { $('listen').classList.add('hidden'); const t = text.trim(); webRec = null; if (t) cb(t); };
  webRec.start();
}
$('listenCancel').onclick = () => { if (webRec) { webRec.onend = null; webRec.abort(); webRec = null; } $('listen').classList.add('hidden'); };

function voiceToEntry(text) {
  const r = QarzParser.parse(text, DB.clients);
  let cid = r.clientId || (curClient && !r.newName ? curClient : null);
  openEntry({ clientId: cid, newName: cid ? '' : (r.newName || ''), type: r.type, date: addDays(todayISO(), r.dayOffset || 0),
    items: r.items, amount: r.amount, note: r.note, heard: text });
}
$('fab').onclick = () => listen(voiceToEntry);
$('navManual').onclick = () => openEntry({ clientId: curClient || null, type: 'debt' });

/* ---------- HISOBOT ---------- */
let repMode = 'day';
$('repDate').value = todayISO();
document.querySelectorAll('#repSeg button').forEach(b => b.onclick = () => {
  repMode = b.dataset.r;
  document.querySelectorAll('#repSeg button').forEach(x => x.classList.toggle('on', x === b));
  renderReport();
});
$('repDate').onchange = renderReport;
$('dPrev').onclick = () => { $('repDate').value = addDays($('repDate').value || todayISO(), -1); renderReport(); };
$('dNext').onclick = () => { $('repDate').value = addDays($('repDate').value || todayISO(), 1); renderReport(); };
function dayEntries(d) { return DB.entries.filter(e => e.date === d).sort((a, b) => sortKey(a).localeCompare(sortKey(b))); }
function renderReport() {
  $('repDay').classList.toggle('hidden', repMode !== 'day');
  $('repAll').classList.toggle('hidden', repMode !== 'all');
  if (repMode === 'day') {
    const d = $('repDate').value || todayISO();
    const list = dayEntries(d);
    let td = 0, tp = 0; for (const e of list) { if (e.type === 'pay') tp += e.amount; else td += e.amount; }
    $('rdDebt').textContent = fmt(td); $('rdPay').textContent = fmt(tp);
    $('rdList').innerHTML = list.length ? '<div class="day">' + dateLong(d) + ' — ' + list.length + ' ta yozuv</div>' + list.map(e => entryHTML(e, true)).join('')
      : '<div class="empty"><b>' + dateLong(d) + ' yozuv yo\'q</b>Boshqa kunni tanlash uchun sanani bosing.</div>';
  } else {
    let T = 0, TT = 0, TP = 0;
    const rows = DB.clients.map(c => { const s = stats(c.id); T += s.bal; TT += s.took; TP += s.paid; return { c, s }; })
      .sort((a, b) => b.s.bal - a.s.bal);
    $('raTotal').textContent = fmt(T) + " so'm"; $('raTook').textContent = fmt(TT); $('raPaid').textContent = fmt(TP);
    $('raList').innerHTML = rows.length ? rows.map(({ c, s }) =>
      '<button class="row" data-cid="' + c.id + '"><span class="ini">' + esc(c.name.charAt(0).toUpperCase()) + '</span><div class="main"><div class="nm">' + esc(c.name) +
      '</div><div class="meta num">Olgan ' + fmt(s.took) + " · to'lagan " + fmt(s.paid) + '</div></div><div class="num amt ' + (s.bal > 0 ? 'debt' : s.bal < 0 ? 'pay' : 'zero') + '">' + fmt(s.bal) + '</div></button>').join('')
      : '<div class="empty">Mijozlar yo\'q.</div>';
  }
}
$('rdList').addEventListener('click', (ev) => { const r = ev.target.closest('[data-eid]'); if (r) openEntry({ id: r.dataset.eid }); });
$('raList').addEventListener('click', (ev) => { const r = ev.target.closest('[data-cid]'); if (r) openClient(r.dataset.cid); });

/* ---------- PDF ---------- */
function newDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DejaVu.ttf', window.PDF_FONTS.regular); doc.addFont('DejaVu.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVu-Bold.ttf', window.PDF_FONTS.bold); doc.addFont('DejaVu-Bold.ttf', 'DejaVu', 'bold');
  doc.setFont('DejaVu', 'normal');
  return doc;
}
const pdfText = (s) => String(s == null ? '' : s).replace(/[ʻʼ‘’`´]/g, "'").replace(/−/g, '-');
function pdfHeader(doc, title, sub) {
  let y = 16;
  if (DB.settings.shop) { doc.setFont('DejaVu', 'normal'); doc.setFontSize(10); doc.setTextColor(106, 116, 136); doc.text(pdfText(DB.settings.shop), 14, y); y += 7; }
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(16); doc.setTextColor(30, 42, 68); doc.text(pdfText(title), 14, y); y += 7;
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(10); doc.setTextColor(106, 116, 136);
  for (const line of [].concat(sub)) { doc.text(pdfText(line), 14, y); y += 5.5; }
  doc.setTextColor(0, 0, 0);
  return y + 2;
}
function pdfTable(doc, y, head, body, foot, colStyles) {
  doc.autoTable({
    startY: y, head: [head.map(pdfText)], body: body.map(r => r.map(pdfText)), foot: foot ? [foot.map(pdfText)] : undefined,
    theme: 'grid', showFoot: 'lastPage',
    styles: { font: 'DejaVu', fontSize: 9, cellPadding: 2, lineColor: [225, 230, 239], lineWidth: 0.2, textColor: [30, 42, 68] },
    headStyles: { font: 'DejaVu', fontStyle: 'bold', fillColor: [30, 42, 68], textColor: 255 },
    footStyles: { font: 'DejaVu', fontStyle: 'bold', fillColor: [238, 241, 246], textColor: [30, 42, 68] },
    columnStyles: colStyles || {},
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
      doc.text('Qarz daftari · ' + dateShort(todayISO()) + ' ' + nowHM() + ' · ' + doc.internal.getNumberOfPages() + '-bet', 14, 290);
    }
  });
}
async function outputPdf(doc, filename) {
  if (!isNative) { doc.save(filename); toast('PDF yuklab olindi'); return; }
  const b64 = doc.output('datauristring').split(',')[1];
  await shareFile(filename, b64, false, 'PDF');
}
async function shareFile(filename, data, isText, label) {
  const FS = plugin('Filesystem'), SH = plugin('Share');
  const opt = { path: filename, data, directory: 'CACHE' };
  if (isText) opt.encoding = 'utf8';
  let savedDocs = false;
  try { await FS.writeFile(Object.assign({}, opt, { path: 'QarzDaftari/' + filename, directory: 'DOCUMENTS', recursive: true })); savedDocs = true; } catch (e) { }
  try {
    const w = await FS.writeFile(opt);
    if (savedDocs) toast(label + ' saqlandi: Fayllar → Documents → QarzDaftari', 3500);
    try { await SH.share({ title: filename, files: [w.uri] }); }
    catch (e1) { try { await SH.share({ title: filename, url: w.uri }); } catch (e2) { } }
  } catch (e) {
    toast(savedDocs ? label + ' saqlandi: Documents → QarzDaftari' : label + ' saqlanmadi: ' + (e.message || e), 4000);
  }
}
function pdfDay() {
  const d = $('repDate').value || todayISO(); const list = dayEntries(d);
  if (!list.length) { toast('Bu kunda yozuv yo\'q'); return; }
  const doc = newDoc(); let td = 0, tp = 0;
  const body = list.map(e => {
    const c = client(e.clientId); const pay = e.type === 'pay';
    if (pay) tp += e.amount; else td += e.amount;
    const det = pay ? ("To'lov" + (e.note ? ' (' + e.note + ')' : '')) :
      (e.items || []).map(i => i.name + (i.qty !== 1 ? ' × ' + i.qty : '') + ' = ' + fmt(i.sum)).join('\n') + (e.note ? '\n' + e.note : '');
    return [e.time || '', c ? c.name : '?', det, pay ? '' : fmt(e.amount), pay ? fmt(e.amount) : '', c ? fmt(stats(c.id).bal) : ''];
  });
  const y = pdfHeader(doc, 'Kunlik hisobot: ' + dateShort(d), ['Berilgan qarz: ' + fmt(td) + " so'm", "Qaytarilgan: " + fmt(tp) + " so'm"]);
  pdfTable(doc, y, ['Vaqt', 'Mijoz', 'Tafsilot', 'Qarz', "To'lov", 'Jami qarzi (hozir)'], body,
    ['', '', 'Jami', fmt(td), fmt(tp), ''], { 0: { cellWidth: 14 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } });
  outputPdf(doc, 'qarz-kunlik-' + d + '.pdf');
}
function pdfAll() {
  if (!DB.clients.length) { toast("Mijozlar yo'q"); return; }
  const doc = newDoc(); let T = 0, TT = 0, TP = 0;
  const rows = DB.clients.map(c => ({ c, s: stats(c.id) })).sort((a, b) => b.s.bal - a.s.bal);
  const body = rows.map((r, i) => { T += r.s.bal; TT += r.s.took; TP += r.s.paid; return [String(i + 1), r.c.name, r.c.phone || '', fmt(r.s.took), fmt(r.s.paid), fmt(r.s.bal)]; });
  const y = pdfHeader(doc, 'Umumiy qarzlar hisoboti', [dateShort(todayISO()) + ' holatiga', 'Jami olinadigan qarz: ' + fmt(T) + " so'm", DB.clients.length + ' ta mijoz']);
  pdfTable(doc, y, ['№', 'Mijoz', 'Telefon', 'Jami olgan', "Jami to'lagan", 'Qoldiq qarz'], body,
    ['', 'Jami', '', fmt(TT), fmt(TP), fmt(T)], { 0: { cellWidth: 9 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } });
  outputPdf(doc, 'qarz-umumiy-' + todayISO() + '.pdf');
}
function pdfClient(cid) {
  const c = client(cid); if (!c) return;
  const list = DB.entries.filter(e => e.clientId === cid).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const s = stats(cid); const doc = newDoc(); let run = 0;
  const body = list.map(e => {
    const pay = e.type === 'pay'; run += pay ? -e.amount : e.amount;
    const det = pay ? ("To'lov" + (e.note ? ' (' + e.note + ')' : '')) :
      (e.items || []).map(i => i.name + (i.qty !== 1 ? ' × ' + i.qty + ' (' + fmt(i.price) + ')' : '') + ' = ' + fmt(i.sum)).join('\n') + (e.note ? '\n' + e.note : '');
    return [dateShort(e.date) + '\n' + (e.time || ''), det, pay ? '' : fmt(e.amount), pay ? fmt(e.amount) : '', fmt(run)];
  });
  const y = pdfHeader(doc, c.name + ' — hisob-kitob', [(c.phone ? 'Tel: ' + c.phone + '   ' : '') + dateShort(todayISO()) + ' holatiga',
    'Jami olgan: ' + fmt(s.took) + " so'm   Jami to'lagan: " + fmt(s.paid) + " so'm", 'Qoldiq qarz: ' + fmt(s.bal) + " so'm"]);
  pdfTable(doc, y, ['Sana', 'Tafsilot', 'Qarz', "To'lov", 'Qoldiq'], body,
    ['', 'Jami', fmt(s.took), fmt(s.paid), fmt(s.bal)], { 0: { cellWidth: 22 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } });
  outputPdf(doc, 'qarz-' + c.name.replace(/[^\wа-яё'-]+/gi, '_') + '-' + todayISO() + '.pdf');
}
$('pdfDay').onclick = () => { try { pdfDay(); } catch (e) { toast('PDF xatosi: ' + e.message, 4000); } };
$('pdfAll').onclick = () => { try { pdfAll(); } catch (e) { toast('PDF xatosi: ' + e.message, 4000); } };

/* ---------- ZAXIRA ---------- */
function backupJSON() { return JSON.stringify({ app: 'qarz-daftari', version: 1, exported: new Date().toISOString(), clients: DB.clients, entries: DB.entries, settings: DB.settings }, null, 1); }
async function autoBackup() {
  if (!isNative) return;
  const FS = plugin('Filesystem');
  const names = ['qarz-daftari-zaxira.json', 'qarz-daftari-zaxira-' + (DB.settings.inst || (DB.settings.inst = uid().slice(-5))) + '.json'];
  for (const n of names) {
    try {
      await FS.writeFile({ path: 'QarzDaftari/' + n, data: backupJSON(), directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
      DB.settings.autoBk = 'Documents/QarzDaftari/' + n + ' — ' + dateShort(todayISO()) + ' ' + nowHM();
      if (curKey) localStorage.setItem(curKey, JSON.stringify(DB));
      if (tab === 'settings') renderSettings();
      return;
    } catch (e) { }
  }
}
function renderSettings() {
  $('setLang').value = DB.settings.lang || 'uz-UZ';
  $('setShop').value = DB.settings.shop || '';
  $('autoBkInfo').textContent = isNative
    ? (DB.settings.autoBk ? 'Avtomatik zaxira: Fayllar → ' + DB.settings.autoBk : "Avtomatik zaxira birinchi yozuvdan keyin Fayllar → Documents → QarzDaftari papkasiga yoziladi.")
    : 'Brauzerda avtomatik zaxira yo\'q — "Zaxirani saqlash"dan foydalaning.';
}
$('setLang').onchange = () => { DB.settings.lang = $('setLang').value; save(); };
$('setShop').onchange = () => { DB.settings.shop = $('setShop').value.trim(); save(); };
$('bkExport').onclick = async () => {
  const name = 'qarz-daftari-zaxira-' + todayISO() + '.json';
  if (!isNative) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([backupJSON()], { type: 'application/json' }));
    a.download = name; a.click(); toast('Zaxira yuklab olindi'); return;
  }
  await shareFile(name, backupJSON(), true, 'Zaxira');
};
$('bkImport').onclick = () => { $('rsText').value = ''; showModal('mRestore'); };
$('rsPick').onclick = () => $('bkFile').click();
$('bkFile').onchange = () => {
  const f = $('bkFile').files[0]; if (!f) return;
  const rd = new FileReader(); rd.onload = () => restore(rd.result); rd.readAsText(f); $('bkFile').value = '';
};
$('rsPaste').onclick = () => restore($('rsText').value);
function restore(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { toast("Fayl noto'g'ri — bu zaxira fayli emas", 3500); return; }
  if (!d || !Array.isArray(d.clients) || !Array.isArray(d.entries)) { toast("Bu faylda qarz daftari ma'lumotlari yo'q", 3500); return; }
  if (!confirm(d.clients.length + ' ta mijoz va ' + d.entries.length + " ta yozuv tiklanadi. Hozirgi ma'lumotlar almashtiriladi. Davom etilsinmi?")) return;
  localStorage.setItem(KEY + '_oldingi', JSON.stringify(DB));
  DB.clients = d.clients; DB.entries = d.entries; DB.settings = Object.assign(DB.settings, d.settings || {});
  save(); back(); toast('Tiklandi: ' + d.clients.length + ' ta mijoz', 3000);
}
$('wipe').onclick = () => {
  if (!confirm("Barcha mijozlar va yozuvlar o'chiriladi. Avval zaxira saqlaganingizga ishonchingiz komilmi?")) return;
  if (!confirm("Rostdan ham hammasini o'chirasizmi?")) return;
  localStorage.setItem(KEY + '_oldingi', JSON.stringify(DB));
  DB.clients = []; DB.entries = []; save(); toast("O'chirildi"); refresh();
};

/* ---------- pastki menyu ---------- */
document.querySelectorAll('nav.bottom button[data-v]').forEach(b => b.onclick = () => {
  if (stack.length) { pendingTab = b.dataset.v; history.go(-stack.length); }
  else showTab(b.dataset.v);
});

showTab('home');
initNotifications();
if (window.Cloud) Cloud.start({
  getDB: () => DB,
  saveLocal, switchStorage, toast, fmt,
  refresh: () => { refresh(); },
  dropStorage: (suffix) => { try { localStorage.removeItem(KEY + '_' + suffix); } catch (e) { } },
  legacyData: () => { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d ? { clients: d.clients || [], entries: d.entries || [] } : null; } catch (e) { return null; } },
  openSettings: () => { const b = document.querySelector('nav.bottom [data-v=settings]'); if (b) b.click(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && tab === 'home' && !curClient) renderHome(); });
window.__qd = { sched: scheduleReminders, DB, parse: (t) => QarzParser.parse(t, DB.clients), voiceToEntry };
})();
