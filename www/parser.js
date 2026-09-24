/* Qarz Daftari — ovozli gapni yozuvga aylantirish
   Misollar:
   "Farruxga 2 qop un 300 ming, shakar 40 ming"
   "Farrux 200 ming to'ladi"
   "Alisherga 5 ta non 4 mingdan va bir kilo go'sht 120 ming"
*/
(function (root) {
  const NUM = {
    'bir':1,'ikki':2,'uch':3,"to'rt":4,'tort':4,'besh':5,'olti':6,'yetti':7,'sakkiz':8,
    "to'qqiz":9,'toqqiz':9,"o'n":10,'on':10,'yigirma':20,"o'ttiz":30,'ottiz':30,'qirq':40,
    'ellik':50,'oltmish':60,'yetmish':70,'sakson':80,"to'qson":90,'toqson':90
  };
  const MULT = {
    'ming':1e3,'k':1e3,'million':1e6,'mln':1e6,'milliard':1e9,'mlrd':1e9,
    'тысяч':1e3,'тысячи':1e3,'тысяча':1e3,'тыс':1e3,'миллион':1e6,'миллиона':1e6,'миллионов':1e6,'млн':1e6
  };
  const UNITS = ['ta','dona','kg','kilo','kilogramm','kilogram','gramm','gr','litr','l','qop','quti','pachka',
    'metr','m','blok','yashik','karobka','korobka','bank','banka','shisha','juft','paket','xalta',"bog'",'bog','rulon','list',
    'шт','штук','кг','литр','литра','пачка','пачки','коробка','мешок','мешка'];
  const SILENT_UNITS = ['ta','dona','шт','штук'];
  const PAY_RE = /(to'la|tola|to'lov|tolov|qaytar|uzdi|uzib|olindi|oldim|kirim|отдал|вернул|оплат|погасил)/;
  const FILLER = new Set(['ga','uchun',"so'm",'som','sum','сум','сумов',"so'mlik",'somlik','sumlik','berildi','berdim','berdi',
    'oldi','olgan','oldik','qarz','qarzga','qarzi','nasiya','nasiyaga','jami','hammasi','narxi','summa','summasi',
    'yozib','yoz','yozing',"qo'y","qo'ying","qo'sh","qo'shing",'kirit','kiriting','bugun','kecha',"o'tgan",'otgan','kuni',
    'aka','opa','akaga','opaga','ham','yana','edi','bo\'ldi','boldi','tovar','tovarga','ning','dan','da','ni','bilan','u','shu',
    'на','за','в','долг','дал','дали','взял','сегодня','вчера','товар',
    "to'ladi",'toladi',"to'lov",'tolov',"to'lab",'tolab','qaytardi','qaytarib','uzdi','oldim','olindi','kirim']);
  const METHODS = {'naqd':'Naqd','naqt':'Naqd','karta':'Karta','kartaga':'Karta','plastik':'Karta','click':'Click','payme':'Payme',
    'uzum':'Uzum',"o'tkazma":"O'tkazma",'otkazma':"O'tkazma",'perevod':"O'tkazma",'наличные':'Naqd','карта':'Karta','карту':'Karta'};

  function normalize(t) {
    t = (t || '').toLowerCase();
    t = t.replace(/[ʻʼ‘’`´]/g, "'");
    t = t.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');             // 1,5 -> 1.5
    // 150 000 -> 150000 (lekin "2 150 ming" ni birlashtirmaydi)
    for (let i = 0; i < 3; i++)
      t = t.replace(/(\d{1,3})[ \u00a0](\d{3})(?!\d)(?!\s*(ming|million|mln|тыс|млн))/g, '$1$2');
    t = t.replace(/(\d)[ \u00a0.](?=\d{3}(?!\d))/g, '$1');
    t = t.replace(/(\d)([a-zа-я'])/g, '$1 $2');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  // token -> {kind:'num'|'mult'|'half', v, suffix}
  function numToken(tok) {
    if (/^\d+(\.\d+)?$/.test(tok)) return { kind: 'num', v: parseFloat(tok) };
    if (tok === 'yarim' || tok === 'пол') return { kind: 'half' };
    if (tok === 'yuz' || tok === 'yuzta') return { kind: 'hundred' };
    if (MULT[tok]) return { kind: 'mult', v: MULT[tok] };
    if (NUM[tok] !== undefined) return { kind: 'num', v: NUM[tok] };
    for (const suf of ['talik', 'dan', 'ta', 'ga', 'lik', 'ni', 'ga']) {
      if (tok.endsWith(suf) && tok.length > suf.length) {
        const stem = tok.slice(0, -suf.length);
        const r = (stem === 'yuz') ? { kind: 'hundred' } : MULT[stem] ? { kind: 'mult', v: MULT[stem] } :
          NUM[stem] !== undefined ? { kind: 'num', v: NUM[stem] } :
          /^\d+(\.\d+)?$/.test(stem) ? { kind: 'num', v: parseFloat(stem) } : null;
        if (r) { r.suffix = suf; return r; }
      }
    }
    return null;
  }

  function groups(tokens) {
    // ketma-ket raqam so'zlarini bitta qiymatga yig'ish
    const out = [];
    let i = 0;
    while (i < tokens.length) {
      const nt = numToken(tokens[i]);
      if (!nt) { out.push({ word: tokens[i], from: i, to: i + 1 }); i++; continue; }
      const from = i;
      let total = 0, cur = 0, hasMult = false, lastMult = 0, suffix = '';
      while (i < tokens.length) {
        const t = numToken(tokens[i]);
        if (!t) break;
        if (t.kind === 'num') {
          if (lastMult && cur === 0 && total && t.v >= lastMult) break; // yangi son boshlanmoqda
          if (lastMult && cur === 0 && total) {
            const nx = tokens[i + 1] ? tokens[i + 1].replace(/(ga|dan)$/, '') : '';
            if (t.suffix === 'ta' || UNITS.includes(nx)) break; // "40 ming 2 ta ..." -> yangi tovar
          }
          cur += t.v;
        } else if (t.kind === 'hundred') cur = (cur || 1) * 100;
        else if (t.kind === 'half') { if (cur === 0 && lastMult) total += lastMult / 2; else cur += 0.5; }
        else if (t.kind === 'mult') { total += (cur || 1) * t.v; cur = 0; hasMult = true; lastMult = t.v; }
        i++;
        if (t.suffix) { suffix = t.suffix; break; }
      }
      out.push({ value: Math.round((total + cur) * 100) / 100, hasMult, suffix, from, to: i });
    }
    return out;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function parseSegment(seg) {
    const tokens = seg.split(' ').filter(Boolean);
    const g = groups(tokens);
    let qty = null, unit = '', money = null, perUnit = false, nameWords = [];
    const numIdx = g.map((x, i) => x.value !== undefined ? i : -1).filter(i => i >= 0);
    for (let k = 0; k < g.length; k++) {
      const x = g[k];
      if (x.value === undefined) {
        if (x.word === 'dan' && k > 0 && g[k - 1].value !== undefined) { perUnit = true; continue; }
        if (!FILLER.has(x.word) && !METHODS[x.word]) nameWords.push(x.word);
        continue;
      }
      const next = g[k + 1] && g[k + 1].word;
      const nextIsMoneyWord = next && /^(so'm|som|sum|сум|so'mlik|somlik|sumlik|so'mdan|somdan)$/.test(next);
      if (x.suffix === 'ta' && !x.hasMult) { qty = x.value; unit = ''; continue; }
      if (next && UNITS.includes(next.replace(/(ga|dan)$/, '')) && !x.hasMult && x.value < 1000) {
        qty = x.value; unit = SILENT_UNITS.includes(next) ? '' : next; k++; continue;
      }
      const isLast = numIdx[numIdx.length - 1] === k;
      if (x.hasMult || nextIsMoneyWord || x.value >= 1000 || (isLast && money === null && x.value >= 100)) {
        if (money === null) { money = x.value; if (x.suffix === 'dan' || (next && /dan$/.test(next))) perUnit = true; }
        else money += x.value;
        continue;
      }
      if (qty === null) qty = x.value;
    }
    let name = nameWords.join(' ').replace(/^(va|ham)\s+/, '').trim();
    const isCash = /\b(pul|naqd|naqt|деньги)\b/.test(seg);
    if (!name) name = isCash ? 'Pul' : 'Tovar';
    name = cap(name);
    if (unit) name += ' (' + unit + ')';
    const q = qty || 1;
    let price, sum;
    if (money === null) { price = 0; sum = 0; }
    else if (perUnit) { price = money; sum = Math.round(money * q); }
    else { sum = money; price = Math.round((money / q) * 100) / 100; }
    return { name, qty: q, price, sum, _hasMoney: money !== null, _hasName: nameWords.length > 0 };
  }

  function findClient(tokens, clients) {
    const SUF = ['', 'ga', 'ka', 'qa', 'ning', 'dan', 'ni', 'da', 'jon', 'jonga', 'aka', 'akaga', 'opa', 'opaga', 'ning', 'ga,'];
    let best = null;
    for (const c of clients) {
      const nt = normalize(c.name).split(' ').filter(Boolean);
      if (!nt.length) continue;
      for (let i = 0; i + nt.length <= tokens.length; i++) {
        let ok = true;
        for (let j = 0; j < nt.length; j++) {
          const tok = tokens[i + j];
          if (!tok.startsWith(nt[j]) || !SUF.includes(tok.slice(nt[j].length))) { ok = false; break; }
        }
        if (ok && (!best || nt.length > best.len)) best = { client: c, start: i, len: nt.length };
      }
    }
    return best;
  }

  function parse(text, clients) {
    const raw = text || '';
    let t = normalize(raw);
    const res = { raw, clientId: null, newName: null, type: 'debt', dayOffset: 0, items: [], amount: 0, note: '' };
    if (!t) return res;

    if (/\b(o'tgan kuni|otgan kuni|позавчера)\b/.test(t)) res.dayOffset = -2;
    else if (/\b(kecha|вчера)\b/.test(t)) res.dayOffset = -1;

    let tokens = t.split(' ');
    const found = findClient(tokens, clients || []);
    if (found) {
      res.clientId = found.client.id;
      tokens.splice(found.start, found.len);
    } else {
      // noma'lum ism: birinchi so'zlardan "...ga" / "...dan" yoki birinchi so'z
      for (let i = 0; i < Math.min(3, tokens.length); i++) {
        const m = tokens[i].match(/^([a-z'а-я]{3,}?)(ga|ka|qa|dan|ning|ni)$/);
        if (m && !numToken(tokens[i]) && !FILLER.has(tokens[i]) && !['kecha', 'bugun'].includes(m[1])) {
          res.newName = cap(m[1]); tokens.splice(i, 1); break;
        }
      }
      if (!res.newName && tokens.length > 1 && /^[a-z'а-я]{3,}$/.test(tokens[0]) && !numToken(tokens[0]) &&
          !FILLER.has(tokens[0]) && !UNITS.includes(tokens[0]) && PAY_RE.test(t)) {
        res.newName = cap(tokens[0]); tokens.splice(0, 1);
      }
    }
    t = tokens.join(' ');

    for (const w of t.split(/[\s,.;]+/)) if (METHODS[w]) { res.note = METHODS[w]; break; }

    if (PAY_RE.test(t)) {
      res.type = 'pay';
      const g = groups(t.split(' ').filter(Boolean));
      let best = 0;
      for (const x of g) if (x.value !== undefined) {
        const v = x.value < 1000 && !x.hasMult ? x.value : x.value;
        if (v > best) best = v;
      }
      res.amount = best;
      return res;
    }

    const segs = t.split(/,(?!\d)|;|\.(?!\d)|\s+va\s+|\s+hamda\s+|\s+keyin\s+|\s+и\s+/).map(s => s.trim()).filter(Boolean);
    // vergulsiz aytilgan bo'lsa: har bir pul summasidan keyin yangi tovar boshlanadi
    const pieces = [];
    for (const s of segs) {
      const tk = s.split(' ').filter(Boolean);
      const g = groups(tk);
      let start = 0;
      for (let k = 0; k < g.length; k++) {
        const x = g[k];
        const nextW = g[k + 1] && g[k + 1].word;
        const isMoney = x.value !== undefined && (x.hasMult || x.value >= 1000 ||
          (nextW && /^(so'm|som|sum|сум)/.test(nextW)));
        if (!isMoney) continue;
        let end = x.to;
        let m = k + 1;
        while (g[m] && g[m].word !== undefined && (FILLER.has(g[m].word) || METHODS[g[m].word] || /^(so'm|som|sum|сум)/.test(g[m].word))) { end = g[m].to; m++; }
        const moreNumbers = g.slice(m).some(z => z.value !== undefined);
        if (g[m] && moreNumbers) { pieces.push(tk.slice(start, end).join(' ')); start = end; k = m - 1; }
      }
      pieces.push(tk.slice(start).join(' '));
    }
    for (const s of pieces.filter(Boolean)) {
      const it = parseSegment(s);
      if (!it._hasMoney && !it._hasName) continue;
      delete it._hasMoney; delete it._hasName;
      res.items.push(it);
    }
    res.amount = res.items.reduce((a, b) => a + b.sum, 0);
    return res;
  }

  const api = { parse, normalize };
  if (typeof module !== 'undefined') module.exports = api; else root.QarzParser = api;
})(this);
