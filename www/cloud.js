/* Qarz Daftari — bulut (Firebase).
   - Har kim o'zi ro'yxatdan o'tadi. Bitta loginga 2–3 kishi kirib, umumiy daftarni ko'radi.
   - Ma'lumot avval telefonda saqlanadi, orqa fonda bulutga yuboriladi (internetsiz ham ishlaydi).
   - Bulutdan faqat O'ZGARGAN yozuvlar olinadi (bepul limitni tejash uchun).
   - O'chirilgan yozuvlar 30 kun "savat"da turadi va qaytarib olinadi.
   Bulut yo'li: users/{uid}/clients/{id}, users/{uid}/entries/{id} */
(function (root) {
  'use strict';
  const DOMAIN = '@qarzdaftari.app';
  const COLS = ['clients', 'entries'];
  const TRASH_DAYS = 30;
  let H = null;            // ilovadan keladigan funksiyalar
  let B = null;            // backend (Firebase yoki test uchun soxta)
  let user = null;         // { uid, login }
  let mode = 'none';       // none | local | cloud
  let shadow = { clients: new Map(), entries: new Map() };   // bulutdagi oxirgi holat (farqni topish uchun)
  let since = 0, unsubs = [], pending = 0, applying = false, firstServer = { clients: false, entries: false };

  /* ---------- yordamchilar ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const strip = (d) => { const o = Object.assign({}, d); delete o.updated; delete o.deleted; delete o.deletedAt; delete o.deletedWith; delete o.by; return o; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const K = { mode: 'qd_mode', last: 'qd_last_login', migrated: (uid) => 'qd_migrated_' + uid, since: (uid) => 'qd_since_' + uid };
  function loginToEmail(login) { login = login.trim().toLowerCase(); return login.includes('@') ? login : login + DOMAIN; }
  function emailToLogin(email) { return String(email || '').replace(DOMAIN, ''); }
  function validLogin(login) {
    login = login.trim().toLowerCase();
    if (login.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) ? '' : "Email noto'g'ri yozilgan";
    if (!/^[a-z0-9._-]{3,30}$/.test(login)) return "Login 3–30 ta lotin harfi yoki raqamdan iborat bo'lsin (bo'sh joysiz)";
    return '';
  }
  function errText(e) {
    const c = (e && (e.code || e.message)) || '';
    if (/email-already-in-use/.test(c)) return 'Bu login band. Boshqa login tanlang yoki "Kirish" orqali kiring';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return "Login yoki parol noto'g'ri";
    if (/weak-password/.test(c)) return "Parol kamida 6 belgidan iborat bo'lsin";
    if (/network-request-failed|unavailable/.test(c)) return "Internet yo'q. Internetni yoqib, qayta urinib ko'ring";
    if (/too-many-requests/.test(c)) return "Ko'p urinish bo'ldi. Bir oz kutib, qayta urinib ko'ring";
    if (/operation-not-allowed|configuration-not-found/.test(c)) return "Firebase'da Email/Password kirish yoqilmagan (sozlash bo'limiga qarang)";
    if (/requires-recent-login/.test(c)) return 'Qaytadan kirib, keyin urinib ko\'ring';
    if (/permission-denied/.test(c)) return "Ruxsat yo'q: Firebase qoidalari noto'g'ri qo'yilgan";
    return 'Xatolik: ' + c;
  }
  function configured() {
    try { return typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey && !/SHU_YERGA/.test(firebaseConfig.apiKey); } catch (e) { return false; }
  }

  /* ---------- Firebase backend ---------- */
  function firebaseBackend() {
    const F = root.FB;
    const app = F.initializeApp(firebaseConfig);
    const auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserSessionPersistence] });
    let db;
    try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentSingleTabManager() }) }); }
    catch (e) { db = F.initializeFirestore(app, { localCache: F.memoryLocalCache() }); }
    const wrap = (u) => u ? { uid: u.uid, login: emailToLogin(u.email) } : null;
    return {
      onAuth: (cb) => F.onAuthStateChanged(auth, u => cb(wrap(u))),
      async register(login, pass, remember) {
        await F.setPersistence(auth, remember ? F.indexedDBLocalPersistence : F.browserSessionPersistence);
        return wrap((await F.createUserWithEmailAndPassword(auth, loginToEmail(login), pass)).user);
      },
      async signIn(login, pass, remember) {
        await F.setPersistence(auth, remember ? F.indexedDBLocalPersistence : F.browserSessionPersistence);
        return wrap((await F.signInWithEmailAndPassword(auth, loginToEmail(login), pass)).user);
      },
      signOut: () => F.signOut(auth),
      async changePassword(oldP, newP) {
        const u = auth.currentUser;
        await F.reauthenticateWithCredential(u, F.EmailAuthProvider.credential(u.email, oldP));
        await F.updatePassword(u, newP);
      },
      resetPassword: (email) => F.sendPasswordResetEmail(auth, email),
      // faqat "since" dan keyin o'zgargan hujjatlar
      listen(uid, col, sinceMs, cb, onErr) {
        const q = F.query(F.collection(db, 'users', uid, col), F.where('updated', '>', F.Timestamp.fromMillis(Math.max(0, sinceMs))));
        return F.onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
          const out = [];
          snap.docChanges().forEach(ch => {
            if (ch.type === 'removed') return;
            const d = ch.doc.data({ serverTimestamps: 'estimate' });
            const up = d.updated && d.updated.toMillis ? d.updated.toMillis() : 0;
            out.push({ id: ch.doc.id, data: d, updatedMs: up, pending: ch.doc.metadata.hasPendingWrites });
          });
          cb(out, { fromCache: snap.metadata.fromCache });
        }, onErr);
      },
      async write(uid, ops) {
        for (let i = 0; i < ops.length; i += 400) {
          const b = F.writeBatch(db);
          for (const op of ops.slice(i, i + 400)) {
            const ref = F.doc(db, 'users', uid, op.col, op.id);
            if (op.data === null) b.delete(ref);
            else b.set(ref, Object.assign({}, op.data, { updated: F.serverTimestamp() }));
          }
          await b.commit();
        }
      },
      async listDeleted(uid, col) {
        const s = await F.getDocs(F.query(F.collection(db, 'users', uid, col), F.where('deleted', '==', true)));
        return s.docs.map(d => ({ id: d.id, data: d.data() }));
      }
    };
  }

  /* ---------- sinxronlash ---------- */
  function persistMeta() { if (user) LS.set(K.since(user.uid), since); }
  function resetShadow(DB) {
    shadow = { clients: new Map(), entries: new Map() };
    for (const c of COLS) for (const x of DB[c]) shadow[c].set(x.id, clone(x));
  }
  // telefondagi o'zgarishlarni bulutga yuborish (faqat farqlar)
  function push() {
    if (mode !== 'cloud' || !user || applying) return;
    const DB = H.getDB(), ops = [], now = Date.now();
    const alive = { clients: new Set(DB.clients.map(x => x.id)), entries: new Set(DB.entries.map(x => x.id)) };
    for (const col of COLS) {
      for (const x of DB[col]) {
        const old = shadow[col].get(x.id);
        if (!old || !same(old, x)) { ops.push({ col, id: x.id, data: Object.assign(clone(x), { deleted: false }) }); shadow[col].set(x.id, clone(x)); }
      }
      for (const [id, old] of shadow[col]) {
        if (alive[col].has(id)) continue;
        const data = Object.assign(clone(old), { deleted: true, deletedAt: now });
        if (col === 'entries' && old.clientId && !alive.clients.has(old.clientId)) data.deletedWith = old.clientId;   // mijoz bilan birga o'chgan
        ops.push({ col, id, data }); shadow[col].delete(id);
      }
    }
    if (!ops.length) return;
    send(ops);
  }
  function send(ops) {
    pending++; badge();
    B.write(user.uid, ops).then(() => { pending--; badge(); }).catch((e) => { pending--; badge(); H.toast(errText(e), 4000); });
  }
  // bulutdan kelgan o'zgarishlarni telefonga qo'llash
  function apply(col, changes, meta) {
    const DB = H.getDB();
    let touched = false;
    for (const ch of changes) {
      if (ch.updatedMs > since && !ch.pending) since = ch.updatedMs;
      if (ch.pending) continue;                                   // o'zimizning hali yuborilmagan yozuvimiz
      const d = strip(ch.data);
      const arr = DB[col], i = arr.findIndex(x => x.id === ch.id);
      if (ch.data.deleted) {
        if (i >= 0) { arr.splice(i, 1); touched = true; }
        shadow[col].delete(ch.id);
      } else {
        if (i >= 0) { if (!same(arr[i], d)) { arr[i] = d; touched = true; } }
        else { arr.push(d); touched = true; }
        shadow[col].set(ch.id, clone(d));
      }
    }
    persistMeta();
    if (touched) { applying = true; try { H.saveLocal(); H.refresh(); } finally { applying = false; } }
    if (!meta.fromCache && !firstServer[col]) { firstServer[col] = true; if (firstServer.clients && firstServer.entries) afterFirstSync(); }
    badge();
  }
  // birinchi marta: telefondagi eski (hisobsiz) ma'lumotni bulutga ko'chirish taklifi
  function afterFirstSync() {
    const DB = H.getDB();
    if (LS.get(K.migrated(user.uid), false)) return;
    LS.set(K.migrated(user.uid), true);
    const legacy = H.legacyData();
    if (!legacy || (!legacy.clients.length && !legacy.entries.length)) return;
    if (DB.clients.length || DB.entries.length) {
      H.toast("Bu hisobda ma'lumot bor. Telefondagi eski daftar zaxira sifatida saqlab qo'yildi.", 4500);
      return;
    }
    if (!confirm('Telefonda ' + legacy.clients.length + ' ta mijoz va ' + legacy.entries.length + " ta yozuv bor. Ularni bulutga ko'chiraymi?")) return;
    DB.clients = clone(legacy.clients); DB.entries = clone(legacy.entries);
    H.saveLocal(); push(); H.refresh();
    H.toast("Ma'lumotlar bulutga ko'chirildi", 3000);
  }
  function startListeners() {
    stopListeners();
    firstServer = { clients: false, entries: false };
    const from = since ? since - 60000 : 0;        // 1 daqiqa zaxira bilan
    for (const col of COLS) unsubs.push(B.listen(user.uid, col, from, (ch, meta) => apply(col, ch, meta), (e) => H.toast(errText(e), 5000)));
  }
  function stopListeners() { unsubs.forEach(u => { try { u(); } catch (e) { } }); unsubs = []; }

  function enter(u) {
    user = u; mode = 'cloud'; LS.set(K.mode, 'cloud'); LS.set(K.last, u.login);
    since = LS.get(K.since(u.uid), 0);
    H.switchStorage('u_' + u.uid);                 // shu loginning telefondagi nusxasi
    resetShadow(H.getDB());
    hideAuth(); startListeners(); H.refresh(); renderCard(); badge();
  }
  function enterLocal() {
    user = null; mode = 'local'; LS.set(K.mode, 'local');
    stopListeners(); H.switchStorage(''); hideAuth(); H.refresh(); renderCard(); badge();
  }

  /* ---------- kirish / ro'yxatdan o'tish oynasi ---------- */
  let authTab = 'login';
  function showAuth(tabName) {
    authTab = tabName || authTab;
    let el = $('authScreen');
    if (!el) { el = document.createElement('div'); el.id = 'authScreen'; el.className = 'authscr'; document.body.appendChild(el); }
    const reg = authTab === 'register';
    el.innerHTML = '<div class="authbox"><div class="authlogo">📒</div><h1>Qarz Daftari</h1>' +
      '<p class="authsub">Ma\'lumotlar bulutda saqlanadi. Bitta login bilan 2–3 kishi kirib, umumiy daftarni ko\'rishi mumkin.</p>' +
      '<div class="authseg"><button data-at="login" class="' + (reg ? '' : 'on') + '">Kirish</button><button data-at="register" class="' + (reg ? 'on' : '') + '">Ro\'yxatdan o\'tish</button></div>' +
      '<input class="inp" id="auLogin" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Login (yoki Gmail)" value="' + esc(LS.get(K.last, '')) + '">' +
      '<div class="pwrow"><input class="inp" id="auPass" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" placeholder="Parol (kamida 6 belgi)"><button class="eye" data-eye="auPass" aria-label="Parolni ko\'rsatish">👁</button></div>' +
      (reg ? '<div class="pwrow"><input class="inp" id="auPass2" type="password" autocomplete="new-password" placeholder="Parolni takrorlang"><button class="eye" data-eye="auPass2">👁</button></div>' : '') +
      '<label class="authchk"><input type="checkbox" id="auRemember" ' + (LS.get('qd_remember', true) ? 'checked' : '') + '> Parolni eslab qolish (shu telefonda)</label>' +
      '<button class="btn authgo" id="auGo">' + (reg ? "Ro'yxatdan o'tish" : 'Kirish') + '</button>' +
      (reg ? '<p class="authnote">Maslahat: login o\'rniga <b>Gmail</b> yozsangiz, parolni unutganda tiklash mumkin bo\'ladi. Oddiy login bo\'lsa, parolni yaxshi eslab qoling.</p>'
        : '<button class="authlink" id="auForgot">Parolni unutdim</button>') +
      '<button class="authlink" id="auLocal">Hisobsiz ishlash (faqat shu telefonda)</button></div>';
    el.classList.remove('hidden');
    el.onclick = onAuthClick;
    el.onkeydown = (e) => { if (e.key === 'Enter') doAuth(); };
  }
  function hideAuth() { const el = $('authScreen'); if (el) el.classList.add('hidden'); }
  function onAuthClick(e) {
    const t = e.target;
    if (t.dataset.at) { showAuth(t.dataset.at); return; }
    if (t.dataset.eye) { const i = $(t.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; return; }
    if (t.id === 'auGo') doAuth();
    if (t.id === 'auLocal') {
      if (confirm("Hisobsiz ishlasangiz, ma'lumot faqat shu telefonda saqlanadi. Keyinroq Sozlamadan bulutga kirishingiz mumkin. Davom etilsinmi?")) enterLocal();
    }
    if (t.id === 'auForgot') forgot();
  }
  let busy = false;
  async function doAuth() {
    if (busy) return;
    const login = $('auLogin').value.trim(), pass = $('auPass').value, remember = $('auRemember').checked;
    const bad = validLogin(login); if (bad) return H.toast(bad, 3500);
    if (pass.length < 6) return H.toast("Parol kamida 6 belgidan iborat bo'lsin", 3000);
    if (authTab === 'register' && pass !== $('auPass2').value) return H.toast('Parollar bir xil emas', 3000);
    LS.set('qd_remember', remember);
    busy = true; $('auGo').textContent = 'Kutib turing...';
    try {
      const u = authTab === 'register' ? await B.register(login, pass, remember) : await B.signIn(login, pass, remember);
      H.toast(authTab === 'register' ? "Hisob ochildi: " + u.login : 'Xush kelibsiz, ' + u.login, 2500);
      // onAuth avtomatik enter() ni chaqiradi
    } catch (e) { H.toast(errText(e), 4500); }
    finally { busy = false; const b = $('auGo'); if (b) b.textContent = authTab === 'register' ? "Ro'yxatdan o'tish" : 'Kirish'; }
  }
  async function forgot() {
    const login = $('auLogin').value.trim().toLowerCase();
    if (!login.includes('@')) return alert("Parolni tiklash faqat Gmail bilan ochilgan hisoblarda ishlaydi.\n\nOddiy login bo'lsa: shu loginga kiradigan boshqa telefonda Sozlama → Parolni o'zgartirish orqali yangi parol qo'ying.");
    try { await B.resetPassword(login); alert(login + " manziliga parolni tiklash havolasi yuborildi. Pochtangizni (Spam papkasini ham) tekshiring."); }
    catch (e) { H.toast(errText(e), 4000); }
  }

  /* ---------- sozlama kartasi, holat belgisi, savat ---------- */
  function badge() {
    let b = $('syncBadge');
    if (!b) { const top = document.querySelector('header.top'); if (!top) return; b = document.createElement('span'); b.id = 'syncBadge'; b.className = 'syncb'; top.appendChild(b); b.onclick = () => H.openSettings(); }
    if (mode !== 'cloud') { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    const off = navigator.onLine === false;
    b.textContent = off ? '📴' : pending ? '⏳' : '☁️';
    b.title = off ? "Internet yo'q — telefonda saqlanmoqda" : pending ? 'Bulutga yuborilmoqda' : 'Bulut bilan bir xil';
    const st = $('cloudState'); if (st) st.textContent = b.title;
  }
  root.addEventListener('online', badge); root.addEventListener('offline', badge);
  function renderCard() {
    const box = $('cloudCard'); if (!box) return;
    if (!configured() && !root.QD_TEST_BACKEND) { box.innerHTML = '<b>☁️ Bulut</b><p class="note">Bulut hali sozlanmagan — ma\'lumot faqat shu telefonda saqlanadi.</p>'; return; }
    if (mode === 'cloud') {
      box.innerHTML = '<b>☁️ Hisob: ' + esc(user.login) + '</b><p class="note" id="cloudState"></p>' +
        '<p class="note">Shu login va parol bilan boshqa telefondan kirsangiz, o\'sha daftar ochiladi.</p>' +
        '<div class="micline" style="margin-top:10px"><button class="btn light" id="clTrash">🗑 O\'chirilganlar</button><button class="btn light" id="clPass">🔑 Parol</button></div>' +
        '<div class="micline" style="margin-top:10px"><button class="btn light" id="clOut">Chiqish</button></div>';
    } else {
      box.innerHTML = '<b>☁️ Bulut</b><p class="note">Hozir hisobsiz ishlayapsiz — ma\'lumot faqat shu telefonda.</p>' +
        '<div class="micline" style="margin-top:10px"><button class="btn" id="clIn">Kirish / Ro\'yxatdan o\'tish</button></div>';
    }
    badge();
  }
  document.addEventListener('click', async (e) => {
    const id = e.target && e.target.id;
    if (id === 'clIn') showAuth('login');
    if (id === 'clOut') {
      if (pending && !confirm("Ba'zi yozuvlar hali bulutga yetib bormagan. Chiqsangiz, ular internet kelganda yuboriladi. Chiqilsinmi?")) return;
      if (!confirm('Hisobdan chiqilsinmi? Ma\'lumotlar bulutda saqlanib qoladi.')) return;
      stopListeners(); H.dropStorage('u_' + user.uid); LS.del(K.since(user.uid));
      await B.signOut();
    }
    if (id === 'clPass') changePass();
    if (id === 'clTrash') openTrash();
    const rs = e.target.closest && e.target.closest('[data-restore]');
    if (rs) restore(rs.dataset.col, rs.dataset.restore);
    if (id === 'trClose') closeTrash();
  });
  async function changePass() {
    const oldP = prompt('Hozirgi parol:'); if (!oldP) return;
    const newP = prompt('Yangi parol (kamida 6 belgi):'); if (!newP) return;
    if (newP.length < 6) return H.toast("Parol kamida 6 belgidan iborat bo'lsin", 3000);
    if (prompt('Yangi parolni takrorlang:') !== newP) return H.toast('Parollar bir xil emas', 3000);
    try { await B.changePassword(oldP, newP); alert("Parol o'zgartirildi. Shu loginga kiradigan boshqa telefonlar ham yangi parol bilan qayta kirishi kerak bo'ladi."); }
    catch (e) { H.toast(errText(e), 4000); }
  }
  let trash = { clients: [], entries: [] };
  async function openTrash() {
    let el = $('trashScreen');
    if (!el) { el = document.createElement('div'); el.id = 'trashScreen'; el.className = 'authscr trash'; document.body.appendChild(el); }
    el.classList.remove('hidden');
    el.innerHTML = '<div class="authbox"><h1>🗑 O\'chirilganlar</h1><p class="authsub">Yuklanmoqda...</p></div>';
    try {
      const [c, en] = await Promise.all([B.listDeleted(user.uid, 'clients'), B.listDeleted(user.uid, 'entries')]);
      const limit = Date.now() - TRASH_DAYS * 864e5;
      const old = c.filter(x => (x.data.deletedAt || 0) < limit).map(x => ({ col: 'clients', id: x.id, data: null }))
        .concat(en.filter(x => (x.data.deletedAt || 0) < limit).map(x => ({ col: 'entries', id: x.id, data: null })));
      if (old.length) send(old);                                      // 30 kundan eskilari butunlay o'chadi
      trash = { clients: c.filter(x => (x.data.deletedAt || 0) >= limit), entries: en.filter(x => (x.data.deletedAt || 0) >= limit) };
      renderTrash();
    } catch (e) { el.innerHTML = '<div class="authbox"><h1>🗑 O\'chirilganlar</h1><p class="authsub">' + esc(errText(e)) + '</p><button class="btn authgo" id="trClose">Yopish</button></div>'; }
  }
  function renderTrash() {
    const el = $('trashScreen'); const DB = H.getDB();
    const cname = (id) => { const c = DB.clients.find(x => x.id === id) || (trash.clients.find(x => x.id === id) || {}).data; return c ? c.name : '?'; };
    const day = (ms) => { const d = new Date(ms); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); };
    const rows = trash.clients.map(x => ({ col: 'clients', id: x.id, at: x.data.deletedAt, t: '👤 Mijoz: ' + x.data.name, s: trash.entries.filter(e => e.data.deletedWith === x.id).length + ' ta yozuvi bilan' }))
      .concat(trash.entries.filter(x => !x.data.deletedWith).map(x => ({ col: 'entries', id: x.id, at: x.data.deletedAt,
        t: (x.data.type === 'pay' ? "To'lov: " : 'Qarz: ') + cname(x.data.clientId) + ' — ' + H.fmt(x.data.amount), s: 'Sana: ' + x.data.date })))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    el.innerHTML = '<div class="authbox wide"><h1>🗑 O\'chirilganlar</h1><p class="authsub">' + TRASH_DAYS + " kun ichida qaytarib olish mumkin, keyin butunlay o'chadi.</p>" +
      (rows.length ? rows.map(r => '<div class="trrow"><div class="main"><div class="nm">' + esc(r.t) + '</div><div class="meta">' + esc(r.s) + ' · o\'chirilgan: ' + day(r.at || 0) + '</div></div>' +
        '<button class="btn light" data-col="' + r.col + '" data-restore="' + esc(r.id) + '">Qaytarish</button></div>').join('') : '<p class="authsub">Savat bo\'sh</p>') +
      '<button class="btn authgo" id="trClose">Yopish</button></div>';
  }
  function closeTrash() { const el = $('trashScreen'); if (el) el.classList.add('hidden'); }
  function restore(col, id) {
    const DB = H.getDB();
    const back = [];
    const take = (c, x) => { const d = strip(x.data); if (!DB[c].some(y => y.id === d.id)) DB[c].push(d); back.push(x.id); };
    if (col === 'clients') {
      const c = trash.clients.find(x => x.id === id); if (!c) return;
      take('clients', c);
      trash.entries.filter(e => e.data.deletedWith === id).forEach(e => take('entries', e));
      trash.entries = trash.entries.filter(e => e.data.deletedWith !== id);
      trash.clients = trash.clients.filter(x => x.id !== id);
    } else {
      const e = trash.entries.find(x => x.id === id); if (!e) return;
      if (!DB.clients.some(c => c.id === e.data.clientId)) return H.toast("Avval shu yozuvning mijozini qaytaring", 3500);
      take('entries', e); trash.entries = trash.entries.filter(x => x.id !== id);
    }
    H.saveLocal(); push(); H.refresh(); renderTrash(); H.toast('Qaytarildi', 2000);
  }

  /* ---------- ishga tushirish ---------- */
  function start(hooks) {
    H = hooks;
    renderCard();
    if (!configured() && !root.QD_TEST_BACKEND) { mode = 'local'; return; }
    try { B = root.QD_TEST_BACKEND || firebaseBackend(); }
    catch (e) { mode = 'local'; H.toast('Bulutga ulanib bo\'lmadi: ' + e.message, 4000); return; }
    let first = true;
    B.onAuth((u) => {
      if (u) { enter(u); }
      else {
        const wasCloud = mode === 'cloud';
        stopListeners(); user = null;
        if (!first && wasCloud) { mode = 'none'; H.switchStorage('__none'); H.refresh(); renderCard(); showAuth('login'); }
        else if (LS.get(K.mode, '') === 'local') enterLocal();
        else { mode = 'none'; H.switchStorage('__none'); showAuth(LS.get(K.last, '') ? 'login' : 'register'); }
      }
      first = false;
    });
  }

  root.Cloud = { start, push, configured, get mode() { return mode; }, get user() { return user; }, showAuth, _errText: errText };
})(window);
