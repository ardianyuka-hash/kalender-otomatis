/**
 * Kalender Otomatis — layanan "Kirim undangan" (Google Apps Script)
 *
 * Alur:
 *  1. Aplikasi mengirim daftar jadwal + email pengguna  → doPost
 *  2. Skrip menyimpan permintaan & mengirim EMAIL KONFIRMASI ke pengguna
 *  3. Pengguna membuka email → tombol "Ya, tambahkan" → halaman konfirmasi → tekan "Ya"
 *  4. Baru setelah itu jadwal dibuat (email pengguna sebagai tamu) dan muncul di Google Kalendernya.
 *     Tekan "Tidak" / diabaikan → tidak ada yang ditambahkan (kedaluwarsa otomatis).
 *
 * Cara pasang: lihat PANDUAN-SETUP.md bagian B.
 */

// ===== Pengaturan =====
const KALENDER_ID = '';            // kosong = kalender utama admin. Disarankan kalender khusus.
const DOMAIN_DIIZINKAN = [];       // contoh: ['gmail.com']. Kosong = semua domain boleh.
const BATAS_PER_HARI = 100;        // maks. jadwal per email per hari
const MAKS_PER_KIRIM = 50;         // maks. jadwal per permintaan
const BERLAKU_JAM = 72;            // tautan konfirmasi berlaku (jam)
const NAMA_PENGIRIM = 'Kalender Otomatis';
const KIRIM_UNDANGAN_GOOGLE = true; // setelah "Ya": Google juga mengirim undangan resmi (bukti + cadangan bila tidak otomatis muncul)

/* ---------- API dari aplikasi ---------- */
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const email = String(d.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'Email tidak valid.' });
    if (DOMAIN_DIIZINKAN.length && DOMAIN_DIIZINKAN.indexOf(email.split('@')[1]) < 0) {
      return json({ ok: false, error: 'Domain email ini tidak diizinkan oleh admin.' });
    }
    const evs = (d.events || []).slice(0, MAKS_PER_KIRIM).map(bersihkanAcara);
    if (!evs.length) return json({ ok: false, error: 'Tidak ada jadwal.' });

    const cal = ambilKalender();
    // Tandai yang sudah pernah ditambahkan supaya tidak dobel
    const results = evs.map(function (ev) {
      try { return { status: sudahAda(cal, ev, email) ? 'dup' : 'pending' }; }
      catch (err) { return { status: 'err', error: String(err.message || err) }; }
    });
    const baru = evs.filter(function (_, i) { return results[i].status === 'pending'; });
    if (!baru.length) return json({ ok: true, results: results });

    const token = Utilities.getUuid().replace(/-/g, '');
    simpan(token, { email: email, events: baru, at: Date.now() });
    kirimEmailKonfirmasi(email, token, baru);
    bersihkanKedaluwarsa();
    return json({ ok: true, results: results, pending: baru.length });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- Halaman konfirmasi (dibuka dari email) ---------- */
function doGet(e) {
  const t = e && e.parameter && e.parameter.t;
  if (!t) return halaman('Kalender Otomatis', '<p>Layanan aktif.</p>');
  const req = ambil(t);
  if (!req) return halaman('Tautan tidak berlaku', '<p>Permintaan ini sudah diproses, dibatalkan, atau kedaluwarsa.</p>');
  const daftar = req.events.map(function (ev) { return '<li><b>' + esc(ev.title) + '</b><br><span class="m">' + esc(teksWaktu(ev)) + (ev.location ? ' · ' + esc(ev.location) : '') + '</span></li>'; }).join('');
  const body =
    '<p>Tambahkan <b>' + req.events.length + ' jadwal</b> berikut ke Google Kalender <b>' + esc(req.email) + '</b>?</p>' +
    '<ul>' + daftar + '</ul>' +
    '<div id="aksi"><button class="ya" onclick="jawab(\'yes\')">✅ Ya, tambahkan</button>' +
    '<button class="tidak" onclick="jawab(\'no\')">Tidak</button></div><p id="hasil"></p>' +
    '<script>function jawab(a){document.getElementById("aksi").style.display="none";var h=document.getElementById("hasil");h.textContent="Memproses…";' +
    'google.script.run.withSuccessHandler(function(r){h.innerHTML=r;}).withFailureHandler(function(er){h.textContent="Gagal: "+er.message;document.getElementById("aksi").style.display="";}).konfirmasi(' + JSON.stringify(t) + ',a);}</script>';
  return halaman('Konfirmasi jadwal', body);
}

/** Dipanggil dari tombol di halaman konfirmasi. */
function konfirmasi(token, jawaban) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const req = ambil(token);
    if (!req) return 'Permintaan ini sudah diproses atau kedaluwarsa.';
    hapus(token);
    if (jawaban !== 'yes') return '❎ Dibatalkan. Tidak ada jadwal yang ditambahkan.';

    const cal = ambilKalender(), email = req.email;
    const props = PropertiesService.getScriptProperties();
    const kunci = 'n_' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd') + '_' + email;
    let terpakai = Number(props.getProperty(kunci) || 0), ok = 0, dup = 0, gagal = 0;
    req.events.forEach(function (ev) {
      try {
        if (terpakai >= BATAS_PER_HARI) { gagal++; return; }
        if (sudahAda(cal, ev, email)) { dup++; return; }
        const w = waktu(ev);
        const opt = { location: ev.location, description: ev.desc, guests: email, sendInvites: KIRIM_UNDANGAN_GOOGLE };
        const c = ev.allDay ? cal.createAllDayEvent(ev.title, w.start, w.end, opt) : cal.createEvent(ev.title, w.start, w.end, opt);
        c.setTag('kaloto', ev.key + '|' + email);
        c.setGuestsCanSeeGuests(false);
        terpakai++; ok++;
      } catch (err) { gagal++; }
    });
    props.setProperty(kunci, String(terpakai));
    return '✅ <b>' + ok + ' jadwal ditambahkan</b> ke Google Kalender Anda.' +
      (dup ? '<br>' + dup + ' jadwal sudah ada sebelumnya.' : '') +
      (gagal ? '<br>⚠ ' + gagal + ' jadwal gagal (batas harian / data tidak valid).' : '') +
      '<br><br><a href="https://calendar.google.com/" target="_blank">Buka Google Kalender ↗</a>' +
      '<p class="m">Belum muncul? Buka email undangan dari Google Kalender lalu pilih <b>Ya</b>.</p>';
  } finally { lock.releaseLock(); }
}

/* ---------- Email ---------- */
function kirimEmailKonfirmasi(email, token, events) {
  const url = ScriptApp.getService().getUrl() + '?t=' + token;
  const daftar = events.slice(0, 20).map(function (ev) {
    return '<tr><td style="padding:6px 0;border-bottom:1px solid #eee"><b>' + esc(ev.title) + '</b><br><span style="color:#5f6b7a;font-size:13px">' + esc(teksWaktu(ev)) + (ev.location ? ' · ' + esc(ev.location) : '') + '</span></td></tr>';
  }).join('') + (events.length > 20 ? '<tr><td style="color:#5f6b7a">…dan ' + (events.length - 20) + ' jadwal lainnya</td></tr>' : '');
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;color:#1c2430">' +
    '<h2 style="color:#1a73e8;margin:0 0 8px">Konfirmasi jadwal</h2>' +
    '<p>Ada permintaan untuk menambahkan <b>' + events.length + ' jadwal</b> ke Google Kalender Anda:</p>' +
    '<table style="width:100%;border-collapse:collapse">' + daftar + '</table>' +
    '<p style="margin:20px 0"><a href="' + url + '" style="background:#1a73e8;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">✅ Ya, tambahkan ke kalender</a></p>' +
    '<p style="font-size:13px;color:#5f6b7a">Jadwal <b>tidak</b> akan ditambahkan sebelum Anda menekan tombol di atas lalu memilih <b>Ya</b>. ' +
    'Jika Anda tidak merasa meminta ini, abaikan saja email ini — tautan kedaluwarsa dalam ' + BERLAKU_JAM + ' jam.</p></div>';
  MailApp.sendEmail({
    to: email, name: NAMA_PENGIRIM,
    subject: 'Konfirmasi: tambahkan ' + events.length + ' jadwal ke Google Kalender Anda?',
    htmlBody: html,
    body: 'Buka tautan ini untuk mengonfirmasi ' + events.length + ' jadwal: ' + url
  });
}

/* ---------- Bantuan ---------- */
function ambilKalender() {
  const cal = KALENDER_ID ? CalendarApp.getCalendarById(KALENDER_ID) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Kalender admin tidak ditemukan (cek KALENDER_ID).');
  return cal;
}
function bersihkanAcara(ev) {
  return {
    key: String(ev.key || '').slice(0, 40), title: String(ev.title || 'Acara').slice(0, 200),
    location: String(ev.location || '').slice(0, 200), desc: String(ev.desc || '').slice(0, 600),
    allDay: !!ev.allDay, start: String(ev.start || '').slice(0, 19), end: String(ev.end || '').slice(0, 19),
    tz: String(ev.tz || 'Asia/Jakarta').slice(0, 40)
  };
}
function waktu(ev) {
  let start, end;
  if (ev.allDay) {
    start = Utilities.parseDate(ev.start.slice(0, 10), ev.tz, 'yyyy-MM-dd');
    end = Utilities.parseDate(ev.end.slice(0, 10), ev.tz, 'yyyy-MM-dd'); // eksklusif
    if (!(end > start)) end = new Date(start.getTime() + 864e5);
  } else {
    start = Utilities.parseDate(ev.start.slice(0, 16), ev.tz, "yyyy-MM-dd'T'HH:mm");
    end = Utilities.parseDate(ev.end.slice(0, 16), ev.tz, "yyyy-MM-dd'T'HH:mm");
    if (!(end > start)) end = new Date(start.getTime() + 3600e3);
  }
  return { start: start, end: end };
}
function sudahAda(cal, ev, email) {
  const w = waktu(ev), tag = ev.key + '|' + email;
  return cal.getEvents(w.start, w.end).some(function (x) { return x.getTag('kaloto') === tag; });
}
function teksWaktu(ev) {
  const w = waktu(ev);
  const tgl = function (d) { return Utilities.formatDate(d, ev.tz, 'dd/MM/yyyy'); };
  if (ev.allDay) {
    const akhir = new Date(w.end.getTime() - 864e5);
    return tgl(w.start) + (tgl(akhir) !== tgl(w.start) ? ' – ' + tgl(akhir) : '') + ' · sepanjang hari';
  }
  return tgl(w.start) + ' · ' + Utilities.formatDate(w.start, ev.tz, 'HH:mm') + '–' + Utilities.formatDate(w.end, ev.tz, 'HH:mm');
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function halaman(judul, isi) {
  const css = 'body{font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px 16px;color:#1c2430;background:#f4f6fa}' +
    'h2{color:#1a73e8}ul{padding-left:18px}li{margin:8px 0}.m{color:#5f6b7a;font-size:13px}' +
    'button{font:inherit;font-size:16px;padding:12px 20px;border-radius:10px;border:1px solid #c9d2de;margin:6px 8px 6px 0;cursor:pointer;background:#fff}' +
    'button.ya{background:#1a73e8;color:#fff;border-color:#1a73e8;font-weight:bold}#hasil{font-size:16px;line-height:1.5}';
  return HtmlService.createHtmlOutput('<style>' + css + '</style><h2>' + esc(judul) + '</h2>' + isi)
    .setTitle(judul).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Penyimpanan permintaan (dipecah per 8 KB) ---------- */
function simpan(token, obj) {
  const s = JSON.stringify(obj), props = PropertiesService.getScriptProperties(), parts = {};
  const n = Math.ceil(s.length / 8000);
  for (let i = 0; i < n; i++) parts['p_' + token + '_' + i] = s.slice(i * 8000, (i + 1) * 8000);
  parts['m_' + token] = JSON.stringify({ n: n, at: obj.at });
  props.setProperties(parts);
}
function ambil(token) {
  token = String(token || '').replace(/[^a-f0-9]/gi, '');
  const props = PropertiesService.getScriptProperties(), m = props.getProperty('m_' + token);
  if (!m) return null;
  const meta = JSON.parse(m);
  if (Date.now() - meta.at > BERLAKU_JAM * 3600e3) { hapus(token); return null; }
  let s = '';
  for (let i = 0; i < meta.n; i++) s += props.getProperty('p_' + token + '_' + i) || '';
  try { return JSON.parse(s); } catch (e) { return null; }
}
function hapus(token) {
  const props = PropertiesService.getScriptProperties(), m = props.getProperty('m_' + token);
  if (!m) return;
  const n = JSON.parse(m).n;
  for (let i = 0; i < n; i++) props.deleteProperty('p_' + token + '_' + i);
  props.deleteProperty('m_' + token);
}
function bersihkanKedaluwarsa() {
  const props = PropertiesService.getScriptProperties(), semua = props.getProperties();
  const hariIni = 'n_' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd');
  Object.keys(semua).forEach(function (k) {
    if (k.indexOf('m_') === 0) { try { if (Date.now() - JSON.parse(semua[k]).at > BERLAKU_JAM * 3600e3) hapus(k.slice(2)); } catch (e) {} }
    else if (k.indexOf('n_') === 0 && k.indexOf(hariIni) !== 0) props.deleteProperty(k);
  });
}

/** Jalankan sekali dari editor (tombol ▶ Run) untuk memberi izin Kalender & Email. */
function uji() {
  Logger.log('Kalender: ' + ambilKalender().getName());
  Logger.log('Sisa kuota email hari ini: ' + MailApp.getRemainingDailyQuota());
}
