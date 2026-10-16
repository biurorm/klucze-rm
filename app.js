// KLUCZE RM: szafka z numerami haczyków, wydanie i zwrot kluczy, historia, piątkowa kontrola
// Dane w bazie Zadań RM (Supabase, to samo logowanie). Bez config.js albo z ?proba: tryb próbny w tej przeglądarce.
// Klucz po terminie: baza sama tworzy zadanie w Zadaniach RM (setup.sql, prywatne.klucze_po_terminie).
const WERSJA = 'v1';

const PO_CO = ['Prezentacja', 'Sesja zdjęć', 'Fachowiec, ekipa', 'Właściciel', 'Liczniki, odczyt'];
const SPOZA = '__spoza__';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoDzien = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dzis = () => isoDzien(new Date());
const zaDni = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDzien(d); };
const dataPL = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const godz = (ts) => new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const kiedyTxt = (ts) => {
  const d = isoDzien(new Date(ts));
  if (d === dzis()) return 'dziś ' + godz(ts);
  if (d === zaDni(-1)) return 'wczoraj ' + godz(ts);
  return dataPL(d) + ' ' + godz(ts);
};
const terminTxt = (iso) => iso === dzis() ? 'dziś' : iso === zaDni(1) ? 'jutro' : iso === zaDni(-1) ? 'wczoraj' : dataPL(iso);
const bezOgonkow = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');

function toast(t, ms = 2600) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ===================== MAGAZYN DANYCH =====================
function magazynSupabase(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const blad = (e) => {
    if (!e) return;
    if (e.code === '23505') throw new Error(/haczyk/.test(e.message) ? 'Ten haczyk jest już zajęty' : 'Ktoś właśnie wydał ten klucz, odświeżam');
    throw new Error(e.message || String(e));
  };
  let user = null;
  async function profil() {
    const { data, error } = await sb.from('profile').select('*').eq('id', user.id).maybeSingle(); blad(error);
    if (!data || !data.aktywny) throw new Error('To konto nie jest aktywne w zespole RM.');
    return data;
  }
  return {
    demo: false,
    async init() { const { data } = await sb.auth.getSession(); user = data.session?.user || null; return user ? { user, profil: await profil() } : null; },
    async zaloguj(email, haslo) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: haslo });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Zły e-mail albo hasło' : error.message);
      user = data.user; return { user, profil: await profil() };
    },
    async wyloguj() { await sb.auth.signOut(); },
    async osoby() { const { data, error } = await sb.from('profile').select('id, imie, rola, aktywny').eq('aktywny', true).order('imie'); blad(error); return data; },
    async klucze(aktywne) {
      const { data, error } = await sb.from('klucze').select('*').eq('aktywny', aktywne).order(aktywne ? 'haczyk' : 'oddane_wlascicielowi', { ascending: aktywne }); blad(error); return data;
    },
    async otwarte() { const { data, error } = await sb.from('klucze_wydania').select('*').is('zwrocono', null); blad(error); return data; },
    async historia(kluczId) { const { data, error } = await sb.from('klucze_wydania').select('*').eq('klucz_id', kluczId).order('kiedy', { ascending: false }).limit(25); blad(error); return data; },
    async wydaj(w) { const { error } = await sb.from('klucze_wydania').insert(w); blad(error); },
    async zmienWydanie(id, zm) { const { error } = await sb.from('klucze_wydania').update(zm).eq('id', id); blad(error); },
    async dodajKlucze(lista) { const { error } = await sb.from('klucze').insert(lista); blad(error); },
    async zmienKlucz(id, zm) { const { error } = await sb.from('klucze').update(zm).eq('id', id); blad(error); },
    async ostatniaKontrola() { const { data, error } = await sb.from('klucze_kontrole').select('*').order('kiedy', { ascending: false }).limit(1); blad(error); return data[0] || null; },
    async zapiszKontrole(wynik) { const { error } = await sb.from('klucze_kontrole').insert({ wynik }); blad(error); },
    nasluchuj(fn) {
      let t; const odpal = () => { clearTimeout(t); t = setTimeout(fn, 400); };
      sb.channel('rm-klucze')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'klucze' }, odpal)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'klucze_wydania' }, odpal)
        .subscribe();
    }
  };
}

function magazynProbny() {
  const czytaj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const pisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const user = { id: 'ja', email: 'tryb próbny' };
  const osoby = [{ id: 'ja', imie: 'Rafał (próba)', rola: 'admin', aktywny: true }, { id: 'aneta', imie: 'Aneta', rola: 'asystentka', aktywny: true }];
  const START = ['Słowackiego 57e/7', 'Szarych Szeregów 5/5', 'Nowy Dwór', 'Władysława IV 7', 'Zabrowo', 'Hala Agatowa', 'Królewiecka 19', 'Słoneczna 15b', 'Dobrzyki działka', 'Sztum', 'Lokal Szarych Szeregów 2F', 'Biuro 3', 'Biuro 4', 'Skrzynka pocztowa'];
  if (!czytaj('kl-proba-klucze', null)) pisz('kl-proba-klucze', START.map((n, i) => ({ id: 'k' + (i + 1), haczyk: i + 1, nazwa: n, rodzaj: i > 10 ? 'biuro' : 'nieruchomosc', komplet: '', czyje: '', uwagi: '', aktywny: true, oddane_wlascicielowi: null, przyjete: null })));
  const K = () => czytaj('kl-proba-klucze', []), W = () => czytaj('kl-proba-wydania', []);
  const id = () => 'x' + Date.now() + Math.random().toString(36).slice(2, 6);
  return {
    demo: true,
    async init() { return { user, profil: osoby[0] }; },
    async zaloguj() { return { user, profil: osoby[0] }; },
    async wyloguj() {},
    async osoby() { return osoby; },
    async klucze(aktywne) { return K().filter(k => k.aktywny === aktywne).sort((a, b) => aktywne ? a.haczyk - b.haczyk : String(b.oddane_wlascicielowi).localeCompare(a.oddane_wlascicielowi)); },
    async otwarte() { return W().filter(w => !w.zwrocono); },
    async historia(kid) { return W().filter(w => w.klucz_id === kid).sort((a, b) => b.kiedy.localeCompare(a.kiedy)); },
    async wydaj(w) {
      const all = W(); if (all.some(x => x.klucz_id === w.klucz_id && !x.zwrocono)) throw new Error('Ktoś właśnie wydał ten klucz, odświeżam');
      all.push({ ...w, id: id(), wydal: 'ja', kiedy: new Date().toISOString(), zwrocono: null }); pisz('kl-proba-wydania', all);
    },
    async zmienWydanie(wid, zm) { pisz('kl-proba-wydania', W().map(w => w.id === wid ? { ...w, ...zm } : w)); },
    async dodajKlucze(lista) {
      const all = K(); for (const k of lista) { if (all.some(x => x.aktywny && x.haczyk === k.haczyk)) throw new Error('Ten haczyk jest już zajęty'); all.push({ uwagi: '', aktywny: true, ...k, id: id() }); }
      pisz('kl-proba-klucze', all);
    },
    async zmienKlucz(kid, zm) {
      const all = K(); if (zm.haczyk && all.some(x => x.aktywny && x.id !== kid && x.haczyk === zm.haczyk)) throw new Error('Ten haczyk jest już zajęty');
      pisz('kl-proba-klucze', all.map(k => k.id === kid ? { ...k, ...zm } : k));
    },
    async ostatniaKontrola() { return czytaj('kl-proba-kontrola', null); },
    async zapiszKontrole(wynik) { pisz('kl-proba-kontrola', { kto: 'ja', kiedy: new Date().toISOString(), wynik }); },
    nasluchuj() {}
  };
}

const cfg = window.RM_CONFIG || {};
const DB = (cfg.supabaseUrl && !/[?&]proba/.test(location.search)) ? magazynSupabase(cfg) : magazynProbny();

// ===================== STAN =====================
const S = { user: null, profil: null, admin: false, osoby: [], klucze: [], otwarte: {}, filtr: 'wszystkie', szukaj: '', kontrola: {}, otwartyKlucz: null };
const imie = (id) => (S.osoby.find(o => o.id === id)?.imie) || 'ktoś z zespołu';
const ktoMa = (w) => w.komu ? imie(w.komu) : w.komu_obcy;
function stan(k) {
  const w = S.otwarte[k.id];
  if (!w) return 'w_szafce';
  return w.zwrot_do < dzis() ? 'po_terminie' : 'wydany';
}

// ===================== START =====================
async function start() {
  $$('[data-wersja]').forEach(el => el.textContent = WERSJA);
  if (DB.demo) { const b = $('#banner'); b.hidden = false; b.textContent = 'Tryb próbny: dane zostają tylko w tej przeglądarce.'; }
  try { const s = await DB.init(); if (s) await poZalogowaniu(s); else pokazLogowanie(); }
  catch (e) { pokazLogowanie(); $('#log-blad').textContent = e.message; }
}
function pokazLogowanie() {
  $$('.screen').forEach(el => el.hidden = true); $('#tabs').hidden = true; $('#btn-wyloguj').hidden = true;
  $('#ekran-logowanie').hidden = false;
}
$('#form-logowanie').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#log-blad').textContent = '';
  try { await poZalogowaniu(await DB.zaloguj($('#log-email').value, $('#log-haslo').value)); }
  catch (err) { $('#log-blad').textContent = err.message; }
});
$('#btn-wyloguj').addEventListener('click', async () => { await DB.wyloguj(); location.reload(); });

async function poZalogowaniu({ user, profil }) {
  S.user = user; S.profil = profil; S.admin = profil.rola === 'admin';
  S.osoby = await DB.osoby();
  $('#ekran-logowanie').hidden = true; $('#tabs').hidden = false; $('#btn-wyloguj').hidden = false;
  await odswiez();
  pokazZakladke('szafka');
  DB.nasluchuj(async () => { await odswiez(); if (S.otwartyKlucz) { const k = S.klucze.find(x => x.id === S.otwartyKlucz); if (k && !$('#ark-tresc form, #ark-tresc .potwierdz')) rysujArkusz(k); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) odswiez(); });
  // link z kodu QR na zawieszce: ?h=4 otwiera haczyk 4
  const h = Number(new URLSearchParams(location.search).get('h'));
  if (h) { const k = S.klucze.find(x => x.haczyk === h); if (k) otworzKlucz(k); else toast(`Haczyk ${h} jest wolny`); }
}

async function odswiez() {
  try {
    const [klucze, otwarte] = await Promise.all([DB.klucze(true), DB.otwarte()]);
    S.klucze = klucze; S.otwarte = Object.fromEntries(otwarte.map(w => [w.klucz_id, w]));
    if (zakladka === 'szafka') rysujSzafke();
  } catch (e) { toast('Nie udało się wczytać: ' + e.message, 5000); }
}

// ===================== ZAKŁADKI =====================
let zakladka = 'szafka';
function pokazZakladke(t) {
  zakladka = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.screen').forEach(el => el.hidden = true);
  $('#ekran-' + t).hidden = false;
  if (t === 'szafka') rysujSzafke();
  if (t === 'kontrola') startKontroli();
  if (t === 'archiwum') rysujArchiwum();
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) pokazZakladke(b.dataset.tab); });

// ===================== SZAFKA =====================
function rysujSzafke() {
  const moje = S.klucze.filter(k => S.otwarte[k.id]?.komu === S.profil.id);
  const box = $('#moje');
  box.hidden = !moje.length;
  box.innerHTML = moje.length ? `<div class="moje-tytul">Masz u siebie: ${moje.length}</div>` + moje.map(k => {
    const w = S.otwarte[k.id];
    return `<div class="moje-wiersz"><div><b>${k.haczyk}</b> · ${esc(k.nazwa)}<div class="small ${stan(k) === 'po_terminie' ? 'err' : 'muted'}" style="margin:0">ma wrócić ${terminTxt(w.zwrot_do)}</div></div>
      <button class="btn btn-ok" data-oddaj="${w.id}">Oddaję</button></div>`;
  }).join('') : '';

  const liczby = { wszystkie: S.klucze.length, w_szafce: 0, wydane: 0, po_terminie: 0 };
  S.klucze.forEach(k => { const s = stan(k); if (s === 'w_szafce') liczby.w_szafce++; else { liczby.wydane++; if (s === 'po_terminie') liczby.po_terminie++; } });
  const F = [['wszystkie', 'wszystkie'], ['w_szafce', 'w szafce'], ['wydane', 'wydane'], ['po_terminie', 'po terminie']];
  $('#filtry').innerHTML = F.map(([k, n]) => `<button class="filtr${S.filtr === k ? ' on' : ''}" data-f="${k}"><b>${liczby[k]}</b><span>${n}</span></button>`).join('');

  const q = bezOgonkow(S.szukaj.trim());
  const lista = S.klucze.filter(k => {
    const s = stan(k);
    if (S.filtr === 'w_szafce' && s !== 'w_szafce') return false;
    if (S.filtr === 'wydane' && s === 'w_szafce') return false;
    if (S.filtr === 'po_terminie' && s !== 'po_terminie') return false;
    if (q && !bezOgonkow(`${k.haczyk} ${k.nazwa} ${k.czyje}`).includes(q) && String(k.haczyk) !== q) return false;
    return true;
  });
  $('#siatka').innerHTML = lista.length ? lista.map(k => {
    const s = stan(k), w = S.otwarte[k.id];
    const opis = s === 'w_szafce' ? 'w szafce' : `${esc(ktoMa(w))}, ${s === 'po_terminie' ? 'miał wrócić ' + terminTxt(w.zwrot_do) : 'od ' + kiedyTxt(w.kiedy).replace(/ \d\d:\d\d$/, '')}`;
    return `<button class="haczyk" data-s="${s}" data-k="${k.id}"><span class="haczyk-nr">${k.haczyk}</span>
      <span class="haczyk-nazwa">${esc(k.nazwa)}${k.komplet ? ` <span class="muted small">${esc(k.komplet)}</span>` : ''}</span><span class="haczyk-stan">${opis}</span></button>`;
  }).join('') : `<div class="pusto">${S.klucze.length ? 'Nic nie pasuje' : 'Szafka jest pusta. Przyjmij pierwsze klucze przyciskiem poniżej.'}</div>`;
}
$('#filtry').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { S.filtr = b.dataset.f; rysujSzafke(); } });
$('#szukaj').addEventListener('input', (e) => { S.szukaj = e.target.value; rysujSzafke(); });
$('#siatka').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) otworzKlucz(S.klucze.find(k => k.id === b.dataset.k)); });
$('#moje').addEventListener('click', (e) => { const b = e.target.closest('[data-oddaj]'); if (b) oddaj(b.dataset.oddaj); });

async function oddaj(wydanieId) {
  try {
    await DB.zmienWydanie(wydanieId, { zwrocono: new Date().toISOString(), przyjal: S.profil.id });
    toast('Oddany, wisi w szafce'); await odswiez();
    if (S.otwartyKlucz) rysujArkusz(S.klucze.find(k => k.id === S.otwartyKlucz));
  } catch (e) { toast('Nie zapisało się: ' + e.message, 5000); }
}

// ===================== KARTA KLUCZA =====================
function otworzArkusz() { $('#tlo').hidden = false; $('#arkusz').hidden = false; document.body.style.overflow = 'hidden'; }
function zamknijArkusz() { $('#tlo').hidden = true; $('#arkusz').hidden = true; document.body.style.overflow = ''; S.otwartyKlucz = null; }
$('#tlo').addEventListener('click', zamknijArkusz);
$('#ark-zamknij').addEventListener('click', zamknijArkusz);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#arkusz').hidden) zamknijArkusz(); });

function otworzKlucz(k) { S.przyjecie = null; S.otwartyKlucz = k.id; S.wydanie = { komu: S.profil.id, poCo: '', zwrot: dzis() }; rysujArkusz(k); otworzArkusz(); }

async function rysujArkusz(k, tryb) {
  if (!k) { zamknijArkusz(); return; }
  const s = stan(k), w = S.otwarte[k.id];
  $('#ark-nr').textContent = `Haczyk ${k.haczyk}${k.rodzaj === 'biuro' ? ' · biuro' : ''}`;
  let h = `<div class="ark-nazwa" id="ark-tytul">${esc(k.nazwa)}</div>
    <div class="ark-info">${[k.komplet, k.czyje ? 'klucze: ' + k.czyje : '', k.przyjete ? 'przyjęte ' + dataPL(k.przyjete) : ''].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}${k.uwagi ? `<br>${esc(k.uwagi)}` : ''}</div>`;

  if (tryb === 'edycja') {
    h += `<form id="f-edycja">
      <label>Nazwa (adres) <input type="text" id="e-nazwa" value="${esc(k.nazwa)}" maxlength="120" required></label>
      <div class="grid2"><label>Nr haczyka <input type="number" id="e-haczyk" value="${k.haczyk}" min="1" max="200" required></label>
      <label>Komplet <input type="text" id="e-komplet" value="${esc(k.komplet)}" maxlength="40" placeholder="np. komplet 2 z 2"></label></div>
      <label>Czyje klucze (właściciel) <input type="text" id="e-czyje" value="${esc(k.czyje)}" maxlength="120"></label>
      <label>Uwagi <input type="text" id="e-uwagi" value="${esc(k.uwagi)}" maxlength="300" placeholder="np. 3 klucze + pilot do bramy"></label>
      <button class="btn btn-main" type="submit">Zapisz</button>
      <button class="btn btn-ghost" type="button" data-akcja="anuluj">Anuluj</button></form>`;
    $('#ark-tresc').innerHTML = h; return;
  }

  if (s === 'w_szafce') {
    const W = S.wydanie;
    const osoby = S.osoby.filter(o => o.rola !== 'doradca' || o.id === S.profil.id);
    h += `<div class="stan-box w_szafce">✓ Wisi w szafce</div>
      <form id="f-wydaj">
      <div class="sekcja-tytul" style="margin-top:0">Komu</div>
      <div class="chips">${osoby.map(o => `<button type="button" class="chip${W.komu === o.id ? ' on' : ''}" data-komu="${o.id}">${o.id === S.profil.id ? 'Ja' : esc(o.imie)}</button>`).join('')}
        <button type="button" class="chip${W.komu === SPOZA ? ' on' : ''}" data-komu="${SPOZA}">Ktoś spoza biura</button></div>
      ${W.komu === SPOZA ? `<div class="grid2"><label>Kto (imię, kim jest) <input type="text" id="w-obcy" maxlength="80" placeholder="np. Marek, hydraulik" value="${esc(W.obcy || '')}"></label>
        <label>Telefon <input type="tel" id="w-tel" maxlength="20" value="${esc(W.tel || '')}"></label></div>` : ''}
      <div class="sekcja-tytul">Po co (nie musisz)</div>
      <div class="chips">${PO_CO.map(p => `<button type="button" class="chip${W.poCo === p ? ' on' : ''}" data-poco="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <div class="sekcja-tytul">Wraca</div>
      <div class="chips">${[['Dziś', dzis()], ['Jutro', zaDni(1)], ['Za 2 dni', zaDni(2)]].map(([n, d]) => `<button type="button" class="chip${W.zwrot === d ? ' on' : ''}" data-zwrot="${d}">${n}</button>`).join('')}
        <input type="date" id="w-data" value="${W.zwrot}" min="${dzis()}" style="width:auto;margin:0;padding:7px 10px"></div>
      <button class="btn btn-main btn-big" type="submit">Wydaj klucz</button></form>`;
  } else {
    h += `<div class="stan-box ${s}"><b>${esc(ktoMa(w))}</b>${w.telefon ? ` · <a href="tel:${esc(w.telefon)}">${esc(w.telefon)}</a>` : ''}<br>
      wziął(a) ${kiedyTxt(w.kiedy)}${w.po_co ? ', ' + esc(w.po_co.toLowerCase()) : ''}<br>
      ${s === 'po_terminie' ? `<b style="color:var(--late)">miał wrócić ${terminTxt(w.zwrot_do)}</b>${w.zadanie_id ? ' · jest zadanie w Zadaniach RM' : ''}` : `ma wrócić ${terminTxt(w.zwrot_do)}`}</div>
      <button class="btn btn-ok btn-big" data-akcja="oddany">✓ Oddany, wisi w szafce</button>
      <div class="akcje-dol" style="margin-top:10px"><button class="link" data-akcja="przedluz">Przedłuż do ${w.zwrot_do >= dzis() ? 'następnego dnia' : 'jutra'}</button></div>`;
  }

  h += `<div class="sekcja-tytul">Historia</div><ul class="historia" id="ark-historia"><li class="muted">Wczytuję…</li></ul>`;
  if (tryb === 'archiwizuj') {
    h += `<div class="potwierdz">Klucze wracają do właściciela, haczyk ${k.haczyk} się zwolni. Historia zostaje w Archiwum.
      <div class="akcje-dol"><button class="link" style="color:var(--late);font-weight:700" data-akcja="archiwizuj-tak">Tak, oddane właścicielowi</button><button class="link" data-akcja="anuluj">Zostaw</button></div></div>`;
  } else {
    h += `<div class="akcje-dol"><button class="link" data-akcja="edytuj">Edytuj</button>${s === 'w_szafce' ? '<button class="link" data-akcja="archiwizuj">Oddane właścicielowi</button>' : ''}</div>`;
  }
  $('#ark-tresc').innerHTML = h;

  try {
    const hist = await DB.historia(k.id);
    const ul = $('#ark-historia'); if (!ul || S.otwartyKlucz !== k.id) return;
    ul.innerHTML = hist.length ? hist.map(x => `<li><b>${esc(x.komu ? imie(x.komu) : x.komu_obcy)}</b> · ${kiedyTxt(x.kiedy)} → ${x.zwrocono ? 'oddany ' + kiedyTxt(x.zwrocono) : '<b>jeszcze u niego/niej</b>'}
      <span class="muted">${x.po_co ? ' · ' + esc(x.po_co) : ''}${x.komu !== x.wydal ? ' · wydał(a) ' + esc(imie(x.wydal)) : ''}</span></li>`).join('') : '<li class="muted">Jeszcze nikt nie brał tego klucza</li>';
  } catch (e) { const ul = $('#ark-historia'); if (ul) ul.innerHTML = '<li class="muted">Nie udało się wczytać historii</li>'; }
}

$('#arkusz').addEventListener('click', async (e) => {
  const k = S.klucze.find(x => x.id === S.otwartyKlucz); if (!k) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.komu) {
    zapamietajPola(); S.wydanie.komu = b.dataset.komu; rysujArkusz(k);
    if (b.dataset.komu === SPOZA) setTimeout(() => $('#w-obcy')?.focus(), 50);
    return;
  }
  if (b.dataset.poco !== undefined) { zapamietajPola(); S.wydanie.poCo = S.wydanie.poCo === b.dataset.poco ? '' : b.dataset.poco; rysujArkusz(k); return; }
  if (b.dataset.zwrot) { zapamietajPola(); S.wydanie.zwrot = b.dataset.zwrot; rysujArkusz(k); return; }
  const a = b.dataset.akcja; if (!a) return;
  const w = S.otwarte[k.id];
  if (a === 'oddany') oddaj(w.id);
  if (a === 'przedluz') {
    const nowy = w.zwrot_do >= dzis() ? isoDzien(new Date(new Date(w.zwrot_do + 'T12:00').getTime() + 864e5)) : zaDni(1);
    try { await DB.zmienWydanie(w.id, { zwrot_do: nowy }); toast('Ma wrócić ' + terminTxt(nowy)); await odswiez(); rysujArkusz(S.klucze.find(x => x.id === k.id)); }
    catch (err) { toast('Nie zapisało się: ' + err.message, 5000); }
  }
  if (a === 'edytuj') rysujArkusz(k, 'edycja');
  if (a === 'anuluj') rysujArkusz(k);
  if (a === 'archiwizuj') rysujArkusz(k, 'archiwizuj');
  if (a === 'archiwizuj-tak') {
    try { await DB.zmienKlucz(k.id, { aktywny: false, oddane_wlascicielowi: dzis() }); toast(`Haczyk ${k.haczyk} jest wolny`); zamknijArkusz(); await odswiez(); }
    catch (err) { toast('Nie zapisało się: ' + err.message, 5000); }
  }
});
$('#arkusz').addEventListener('change', (e) => { if (e.target.id === 'w-data' && e.target.value) { zapamietajPola(); S.wydanie.zwrot = e.target.value; rysujArkusz(S.klucze.find(x => x.id === S.otwartyKlucz)); } });
function zapamietajPola() { if ($('#w-obcy')) S.wydanie.obcy = $('#w-obcy').value; if ($('#w-tel')) S.wydanie.tel = $('#w-tel').value; }

$('#arkusz').addEventListener('submit', async (e) => {
  e.preventDefault();
  const k = S.klucze.find(x => x.id === S.otwartyKlucz); if (!k) return;
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (e.target.id === 'f-wydaj') {
      zapamietajPola();
      const W = S.wydanie, obcy = W.komu === SPOZA;
      if (obcy && !(W.obcy || '').trim()) { toast('Wpisz, komu dajesz klucz'); return; }
      await DB.wydaj({ klucz_id: k.id, komu: obcy ? null : W.komu, komu_obcy: obcy ? W.obcy.trim() : '', telefon: obcy ? (W.tel || '').trim() : '',
        po_co: W.poCo, zwrot_do: W.zwrot, wydal: S.profil.id });
      toast(`Klucz ${k.haczyk} wydany, wraca ${terminTxt(W.zwrot)}`);
      zamknijArkusz(); await odswiez();
    }
    if (e.target.id === 'f-edycja') {
      const zm = { nazwa: $('#e-nazwa').value.trim(), haczyk: Number($('#e-haczyk').value), komplet: $('#e-komplet').value.trim(), czyje: $('#e-czyje').value.trim(), uwagi: $('#e-uwagi').value.trim() };
      if (!zm.nazwa || !(zm.haczyk > 0)) { toast('Uzupełnij nazwę i numer haczyka'); return; }
      await DB.zmienKlucz(k.id, zm); toast('Zapisano'); await odswiez(); rysujArkusz(S.klucze.find(x => x.id === k.id));
    }
  } catch (err) { toast(err.message, 5000); await odswiez(); }
  finally { btn.disabled = false; }
});

// ===================== PRZYJĘCIE NOWYCH KLUCZY =====================
$('#btn-przyjmij').addEventListener('click', () => {
  S.otwartyKlucz = null; S.przyjecie = { rodzaj: 'nieruchomosc', ile: 1 };
  rysujPrzyjecie(); otworzArkusz(); setTimeout(() => $('#p-nazwa')?.focus(), 80);
});
function wolneHaczyki(n) {
  const zajete = new Set(S.klucze.map(k => k.haczyk)); const wyn = [];
  for (let h = 1; wyn.length < n && h <= 200; h++) if (!zajete.has(h)) wyn.push(h);
  return wyn;
}
function rysujPrzyjecie() {
  const P = S.przyjecie, hz = wolneHaczyki(P.ile);
  $('#ark-nr').textContent = 'Przyjęcie kluczy';
  $('#ark-tresc').innerHTML = `<div class="ark-nazwa" id="ark-tytul">Nowe klucze do szafki</div>
    <form id="f-przyjmij">
    <label>Adres albo nazwa <input type="text" id="p-nazwa" maxlength="120" value="${esc(P.nazwa || '')}" placeholder="np. Agatowa 19" required></label>
    <div class="chips"><button type="button" class="chip${P.rodzaj === 'nieruchomosc' ? ' on' : ''}" data-rodzaj="nieruchomosc">Nieruchomość</button>
      <button type="button" class="chip${P.rodzaj === 'biuro' ? ' on' : ''}" data-rodzaj="biuro">Biuro</button></div>
    <label>Czyje klucze (właściciel) <input type="text" id="p-czyje" maxlength="120" value="${esc(P.czyje || '')}"></label>
    <div class="sekcja-tytul" style="margin-top:4px">Ile kompletów</div>
    <div class="chips">${[1, 2, 3, 4].map(n => `<button type="button" class="chip${P.ile === n ? ' on' : ''}" data-ile="${n}">${n}</button>`).join('')}</div>
    <label>Uwagi <input type="text" id="p-uwagi" maxlength="300" value="${esc(P.uwagi || '')}" placeholder="np. 3 klucze + pilot do bramy"></label>
    <div class="stan-box w_szafce">Powieś na haczyk${hz.length > 1 ? 'ach' : 'u'} <b>${hz.join(', ')}</b></div>
    <button class="btn btn-main btn-big" type="submit">Przyjmij do szafki</button></form>`;
}
$('#arkusz').addEventListener('click', (e) => {
  if (!S.przyjecie || S.otwartyKlucz) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.rodzaj || b.dataset.ile) {
    const P = S.przyjecie; P.nazwa = $('#p-nazwa').value; P.czyje = $('#p-czyje').value; P.uwagi = $('#p-uwagi').value;
    if (b.dataset.rodzaj) P.rodzaj = b.dataset.rodzaj; if (b.dataset.ile) P.ile = Number(b.dataset.ile);
    rysujPrzyjecie();
  }
});
$('#arkusz').addEventListener('submit', async (e) => {
  if (e.target.id !== 'f-przyjmij') return;
  e.preventDefault();
  const P = S.przyjecie, nazwa = $('#p-nazwa').value.trim();
  if (!nazwa) { toast('Wpisz adres albo nazwę'); return; }
  const hz = wolneHaczyki(P.ile);
  try {
    await DB.dodajKlucze(hz.map((h, i) => ({ haczyk: h, nazwa, rodzaj: P.rodzaj, czyje: $('#p-czyje').value.trim(), uwagi: $('#p-uwagi').value.trim(),
      komplet: P.ile > 1 ? `komplet ${i + 1} z ${P.ile}` : '', przyjete: dzis() })));
    toast(`Przyjęte. Powieś na haczyk${hz.length > 1 ? 'ach' : 'u'} ${hz.join(', ')}`, 5000);
    S.przyjecie = null; zamknijArkusz(); await odswiez();
  } catch (err) { toast(err.message, 5000); await odswiez(); rysujPrzyjecie(); }
});

// ===================== KONTROLA =====================
async function startKontroli() {
  await odswiez();
  S.kontrola = Object.fromEntries(S.klucze.map(k => [k.id, stan(k) === 'w_szafce']));
  $('#kontrola-wynik').hidden = true; $('#btn-kontrola-zapisz').hidden = false;
  rysujKontrole();
  try {
    const o = await DB.ostatniaKontrola();
    $('#kontrola-ostatnia').textContent = o ? `Ostatnia kontrola: ${kiedyTxt(o.kiedy)}, ${imie(o.kto)}, ${(o.wynik || []).length ? 'różnice: ' + o.wynik.length : 'wszystko się zgadzało'}.` : 'Jeszcze nie było kontroli w aplikacji.';
  } catch (e) {}
}
function rysujKontrole() {
  $('#kontrola-lista').innerHTML = S.klucze.map(k => {
    const powinien = stan(k) === 'w_szafce', jest = S.kontrola[k.id];
    const w = S.otwarte[k.id];
    return `<div class="kontrola-wiersz${powinien !== jest ? ' rozbieznosc' : ''}"><span class="haczyk-nr">${k.haczyk}</span>
      <div><div style="font-weight:600">${esc(k.nazwa)}${k.komplet ? ` <span class="muted small">${esc(k.komplet)}</span>` : ""}</div><div class="small muted">${powinien ? 'powinien wisieć' : 'wydany: ' + esc(ktoMa(w))}</div></div>
      <div class="przelacznik"><button class="${jest ? 'on jest' : ''}" data-kk="${k.id}" data-v="1">jest</button><button class="${!jest ? 'on brak' : ''}" data-kk="${k.id}" data-v="0">brak</button></div></div>`;
  }).join('') || '<div class="pusto">Szafka jest pusta</div>';
}
$('#kontrola-lista').addEventListener('click', (e) => { const b = e.target.closest('[data-kk]'); if (b) { S.kontrola[b.dataset.kk] = b.dataset.v === '1'; rysujKontrole(); } });

$('#btn-kontrola-zapisz').addEventListener('click', async () => {
  const roznice = S.klucze.filter(k => (stan(k) === 'w_szafce') !== S.kontrola[k.id]).map(k => {
    const powinien = stan(k) === 'w_szafce', w = S.otwarte[k.id];
    return { haczyk: k.haczyk, nazwa: k.nazwa, klucz_id: k.id, wydanie_id: w?.id || null, powinien: powinien ? 'w szafce' : 'u ' + ktoMa(w), jest: S.kontrola[k.id] ? 'wisi' : 'brak' };
  });
  try { await DB.zapiszKontrole(roznice); } catch (e) { toast('Nie zapisało się: ' + e.message, 5000); return; }
  const box = $('#kontrola-wynik'); box.hidden = false; $('#btn-kontrola-zapisz').hidden = true;
  if (!roznice.length) { box.innerHTML = '<div class="card-title" style="color:var(--ok)">✓ Wszystko się zgadza</div><p class="muted small" style="margin:0">Kontrola zapisana.</p>'; }
  else {
    box.innerHTML = `<div class="card-title" style="color:var(--late)">Różnice: ${roznice.length}</div><ul class="wynik-lista">${roznice.map(r => r.jest === 'brak'
      ? `<li><b>${r.haczyk} · ${esc(r.nazwa)}</b>: haczyk pusty, a w aplikacji nikt go nie wziął. Ustal, kto ma klucz, i wydaj go w aplikacji.</li>`
      : `<li><b>${r.haczyk} · ${esc(r.nazwa)}</b>: wisi, a w aplikacji jest ${esc(r.powinien)}. <button class="link" data-zwroc="${r.wydanie_id}">Oznacz jako oddany</button></li>`).join('')}</ul>`;
  }
  box.scrollIntoView({ behavior: 'smooth' });
});
$('#kontrola-wynik').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-zwroc]'); if (!b) return;
  await oddaj(b.dataset.zwroc); b.replaceWith(document.createTextNode('✓ oznaczony jako oddany'));
});

// ===================== ARCHIWUM =====================
async function rysujArchiwum() {
  const box = $('#archiwum-lista'); box.innerHTML = '<div class="pusto">Wczytuję…</div>';
  try {
    const lista = await DB.klucze(false);
    box.innerHTML = lista.length ? lista.map(k => `<div class="card"><div class="row-between"><b>${esc(k.nazwa)}</b><span class="muted small">był na haczyku ${k.haczyk}</span></div>
      <div class="small muted">${[k.komplet, k.czyje ? 'właściciel: ' + k.czyje : '', k.przyjete ? 'przyjęte ' + dataPL(k.przyjete) : '', k.oddane_wlascicielowi ? 'oddane ' + dataPL(k.oddane_wlascicielowi) : ''].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('')
      : '<div class="pusto">Archiwum jest puste. Trafiają tu klucze oddane właścicielom.</div>';
  } catch (e) { box.innerHTML = `<div class="pusto">${esc(e.message)}</div>`; }
}

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  let przeladowano = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (przeladowano || !$('#arkusz').hidden) return;
    przeladowano = true; location.reload();
  });
}

start();
