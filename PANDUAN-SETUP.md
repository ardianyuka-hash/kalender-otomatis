# Panduan Setup — Kalender Otomatis

Di langkah 1 pengguna **cukup mengetik alamat email**. Secara bawaan jadwal dikirim lewat
**Kirim undangan** (konfirmasi "Ya" di email). Bila pengguna ingin alarm khusus, di langkah 3 ada tombol
**🔔 Atur alarm sendiri** yang beralih ke **Masuk langsung** (konfirmasi akun Google sekali).

| | **Masuk langsung** | **Kirim undangan** |
|---|---|---|
| Yang dilakukan pengguna | Ketik email → konfirmasi Google sekali | Ketik email → tekan **Ya** di email konfirmasi |
| Acara masuk ke | Kalender pengguna sendiri | Kalender pengguna, sebagai undangan dari email admin — **hanya setelah pengguna menjawab Ya** |
| Alarm khusus (30 mnt, 1 hari, dst.) | ✅ Ya | ❌ Ikut setelan notifikasi Google Kalender pengguna |
| Yang disiapkan admin | OAuth Client ID (bagian A) | Google Apps Script (bagian B) |

Admin boleh menyiapkan satu atau keduanya. Jika keduanya ada, pengguna bisa memilih.

---

## A. Mode "Masuk langsung" — buat OAuth Client ID (±10 menit)

1. Buka https://console.cloud.google.com/ → login dengan akun Google admin.
2. **Select a project → New Project** → nama `Kalender Otomatis` → **Create**.
3. ☰ → **APIs & Services → Library** → cari **Google Calendar API** → **Enable**.
4. ☰ → **Google Auth Platform → Branding** (dulu: *OAuth consent screen*):
   App name `Kalender Otomatis`, email dukungan & kontak developer = email admin. Audience: **External**.
5. **Data Access → Add or remove scopes** → centang `.../auth/calendar.events`,
   `.../auth/calendar.calendarlist.readonly`, `openid`, `email`, `profile` → **Update → Save**.
6. **Clients → Create client** → Application type **Web application**.
   **Authorized JavaScript origins**:
   - `https://ardianyuka-hash.github.io`
   - `http://localhost:8125` (uji coba di komputer)
   → **Create** → salin **Client ID** (berakhiran `.apps.googleusercontent.com`).
7. **Siapa yang boleh masuk?**
   - Status *Testing*: hanya email di **Audience → Test users** (maks. 100). Cocok untuk tim internal.
   - Agar semua akun Google bisa: **Audience → Publish app**. Pengguna akan melihat
     *"Google hasn't verified this app"* → **Advanced → Go to Kalender Otomatis**. Normal untuk aplikasi internal.

## B. Mode "Kirim undangan" — pasang Google Apps Script (±5 menit)

1. Login dengan akun Google admin (akun ini akan tercatat sebagai pengirim undangan).
   *Disarankan* pakai akun/kalender khusus, misal `jadwal.rsmb@gmail.com`.
2. Buka https://script.google.com → **New project** → beri nama `Kalender Otomatis`.
3. Hapus isi `Code.gs`, tempel seluruh isi berkas **`apps-script/Code.gs`** → **Save** (ikon disket).
4. Pilih fungsi **`uji`** di toolbar → **▶ Run** → **Review permissions** → pilih akun admin →
   *Advanced → Go to … (unsafe)* → **Allow** (memberi izin Kalender, Gmail kirim email, dan tampilan halaman).
   Di log harus tampil nama kalender dan sisa kuota email.
5. (Opsional) ubah pengaturan di bagian atas skrip:
   - `KALENDER_ID` — ID kalender khusus (Google Kalender → Setelan kalender → *Integrasikan kalender* → ID kalender).
   - `DOMAIN_DIIZINKAN` — batasi email, misal `['gmail.com']`.
   - `BATAS_PER_HARI` — maks. acara per email per hari (bawaan 100).
   - `BERLAKU_JAM` — masa berlaku tautan konfirmasi (bawaan 72 jam).
   - `KIRIM_UNDANGAN_GOOGLE` — `true`: setelah "Ya", Google juga mengirim email undangan resmi sebagai bukti.
6. **Deploy → New deployment** → ikon ⚙ → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   → **Deploy** (izinkan lagi bila diminta).
7. Salin **Web app URL** (`https://script.google.com/macros/s/…/exec`).
8. Jika skrip diubah di kemudian hari: **Deploy → Manage deployments → ✏ → Version: New version → Deploy**
   (URL tetap sama).

Alur mode undangan (wajib konfirmasi "Ya"):
1. Pengguna menekan **Kirim** di aplikasi → status jadwal: **⏳ Menunggu jawaban "Ya" di email**.
2. Pengguna menerima email **"Konfirmasi: tambahkan N jadwal ke Google Kalender Anda?"** berisi daftar jadwal.
3. Tombol **✅ Ya, tambahkan ke kalender** → membuka halaman konfirmasi → tekan **Ya** sekali lagi.
   (Dua langkah ini mencegah tautan "terklik otomatis" oleh pemindai keamanan email.)
4. Baru saat itu jadwal dibuat dan muncul di Google Kalender pengguna. Tekan **Tidak** atau abaikan email →
   tidak ada yang ditambahkan, dan tautan kedaluwarsa setelah 3 hari. Tautan hanya bisa dipakai sekali.

Catatan:
- Karena wajib konfirmasi, orang lain tidak bisa mengisi kalender Anda hanya dengan mengetik email Anda.
- Alarm mengikuti setelan notifikasi pengguna di Google Kalender (bawaan: 30 menit sebelum).
- Kuota akun Gmail gratis: **100 email konfirmasi per hari** (1 email per sekali kirim, berapa pun jumlah jadwalnya).
  Akun Google Workspace: 1.500 per hari.
- Jika setelah "Ya" jadwal belum muncul (setelan pengguna *"Tambahkan undangan ke kalender saya"* bukan
  "Dari semua orang"), buka email undangan resmi dari Google Kalender → pilih **Ya**.

## C. Pasang ke aplikasi

Pilih salah satu:
- **Permanen (disarankan):** buka `index.html`, isi
  `const DEFAULT_CLIENT_ID = "…";` dan/atau `const DEFAULT_INVITE_URL = "…";` lalu unggah ulang.
- **Sementara:** buka aplikasi → langkah 1 → **⚙ Pengaturan admin** → tempel → **Simpan** (hanya di perangkat itu).

## D. Cara pakai (untuk pengguna)

1. Ketik **alamat email Google** Anda.
2. **Masukkan berkas**: Excel/CSV (pakai template), PDF/Word surat undangan, `.ics`, atau tempel teks WA.
3. **Alarm**: bawaan mengikuti setelan Google Kalender Anda. Ingin atur sendiri (misal 🔔 30 menit + 1 hari sebelum)?
   Tekan **🔔 Atur alarm sendiri** → konfirmasi akun Google sekali → atur alarm (maks. 5, bisa khusus per acara).
4. Periksa daftar → tekan tombol kirim di bawah.
   - Masuk langsung: status ✓ muncul per acara.
   - Kirim undangan: buka email konfirmasi → **Ya** → jadwal masuk kalender.

Tips:
- Kolom **Alarm** di Excel: `30 menit, 1 hari` / `2 jam` / `tidak`.
- Jam dikosongkan → acara sepanjang hari. Jam selesai kosong → durasi bawaan.
- Jadwal yang sama tidak akan dobel bila dikirim ulang.
- PDF hasil scan (gambar) tidak bisa dibaca — ketik/tempel teksnya.

## E. Update aplikasi

Edit `index.html` → naikkan versi `CACHE` di `sw.js` (misal `v1` → `v2`) → commit & push.
