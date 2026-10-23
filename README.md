# SnapVibe

Web photobooth untuk event. Tamu buka link di browser HP, pilih layout, jepret
bareng-bareng, lalu hias strip dengan filter, stiker, dan frame sebelum
menyimpan. Data tersimpan di Neon Postgres, file foto di disk lokal.

Stack: Next.js 16 (App Router) + React 19 + Tailwind v4 + Drizzle ORM + Neon Postgres.

## Menjalankan

Prasyarat: Node 20+ dan proyek Neon.

```bash
npm install

# 1. Hubungkan ke Neon (menulis DATABASE_URL ke .env)
neon link --project-id <project-id> --branch production -y

# 2. Buat tabel di Neon
npm run db:migrate

# 3. Isi admin + event contoh
npm run db:seed

# 4. Jalankan
npm run dev
```

Buka http://localhost:3000. Booth ada di `/booth`, dashboard di `/admin`.

Kamera hanya bisa diakses lewat HTTPS atau `localhost`. Untuk HP di jaringan
lokal, pakai HTTPS (misalnya lewat `ngrok http 3000` atau reverse proxy).

## Neon

Proyek ini terhubung ke Neon lewat `neon link`, yang menulis variabel berikut ke
`.env`:

| Variabel | Isi |
| --- | --- |
| `DATABASE_URL` | Koneksi *pooler*, dipakai aplikasi |
| `DATABASE_URL_UNPOOLED` | Koneksi langsung, berguna untuk migrasi |
| `NEON_BRANCH` | Branch aktif, saat ini `production` |

`neon link` menimpa `DATABASE_URL` di `.env` setiap kali dijalankan. `SESSION_SECRET`,
`STORAGE_DIR`, dan `ADMIN_*` tetap harus diisi manual seperti di `.env.example`.

`neon.ts` memakai `defineConfig({})`, jadi tidak ada service yang diaktifkan.
Kalau auth atau object storage diaktifkan nanti, perintahnya lewat
`neon deploy` (`auth`, `storage`, `functions`).

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan |
| `npm run build` / `npm start` | Build dan jalankan produksi |
| `npm run typecheck` | Pemeriksaan TypeScript |
| `npm run lint` | ESLint |
| `npm run db:push` | Terapkan schema langsung ke Neon (dev cepat, tanpa riwayat) |
| `npm run db:migrate` | Terapkan file migrasi di `drizzle/` (pakai ini di produksi) |
| `npm run db:seed` | Isi admin dan event contoh |
| `npm run e2e` | Uji perjalanan booth sampai unduhan dengan kamera palsu |
| `npm run e2e:hero` | Uji hero statis Strip 3 dan pastikan halaman depan tidak pernah meminta kamera |
| `npm run e2e:retake` | Uji bahwa studio selalu memakai draft terakhir, bukan foto run sebelumnya |
| `npm run e2e:draft` | Uji draft di penyimpanan penuh tetap memakai foto baru, bukan foto run lama atau "belum ada foto" |
| `npm run e2e:frame` | Uji frame event Kultur/Fiksi mengisi ketiga jendela Strip 3 dan hanya muncul di layout itu |
| `npm run e2e:download` | Uji tally "kali diunduh" bertambah sendiri tanpa reload |
| `npm run e2e:capture` | Uji bidikan yang tersimpan benar-benar bingkai kamera, bukan frame kosong atau duplikat |
| `npm run e2e:mirror` | Uji pratinjau dan foto tersimpan sama-sama bercermin |
| `npm run e2e:timer` | Uji hitung mundur 3 detik per bidikan, pembatalan, dan(frame) gelap |
| `npm run e2e:nav` | Uji semua rute, tautan, dan affordance navigasi |
| `npm run capture` | Tangkapan layar desktop dan mobile untuk review desain |

`npm run e2e` butuh dev server berjalan dan kamera Chromium palsu
(`npx playwright install chromium`).

**Port dev.** Skrip uji dan tangkapan screenshot memakai
`E2E_BASE_URL`, default `http://localhost:3000`. Kalau port 3000 sudah dipakai
project lain dan `next dev` pindah ke port berikutnya, arahkan manual:

```bash
E2E_BASE_URL=http://localhost:3001 npm run e2e
```

## Migrasi database

Schema.sql berada di `drizzle/`. Setelah mengubah `src/db/schema.ts`:

```bash
npx drizzle-kit generate   # membuat drizzle/000X_*.sql
npm run db:migrate          # menerapkan ke Neon
```

`drizzle-kit push` hanya mengubah database langsung tanpa menulis file, jadi
tidak ada jejak perubahan yang bisa direview atau dijalankan di server lain.
Pemakaian `push` membuat `npm run db:migrate` gagal di database yang sudah
terbentuk lewat `push`, karena tidak ada tabel `__drizzle_migrations` yang
menandai migrasi lama sudah diterapkan.

Database dev lokal ini dibuat dengan `push`, jadi di database itu tetap pakai
`db:push`. `db:migrate` dipakai untuk database baru atau produksi, yang belum
pernah disentuh `push`. File di `drizzle/` adalah catatan perubahan schema dan
sudah ikut di-commit.

## Variabel environment

| Nama | Keterangan |
| --- | --- |
| `DATABASE_URL` | Connection string Neon, mis. `postgresql://USER:PASS@ep-x-pooler.region.aws.neon.tech/neondb?sslmode=require` |
| `STORAGE_DIR` | Folder penyimpanan lokal untuk pengembangan, default `./storage`. Di Vercel folder ini sementara |
| `BLOB_READ_WRITE_TOKEN` | Token Vercel Blob untuk penyimpanan foto yang persisten. Wajib di Vercel, opsional di lokal. Vercel mengisinya otomatis saat Blob store dihubungkan |
| `NEXT_PUBLIC_BASE_URL` | URL dasar untuk QR dan tautan berbagi |
| `SESSION_SECRET` | Kunci HMAC untuk cookie sesi admin |
| `CRON_SECRET` | Bearer token untuk `/api/cron/cleanup`; wajib di produksi |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Kredensial admin untuk `db:seed` |
| `CLOUDINARY_URL` | Kredensial Cloudinary, mis. `cloudinary://KEY:SECRET@CLOUD_NAME`. Tanpa kurung sudut di sekitar key atau secret, kalau tidak `src/lib/cloudinary.ts` menolaknya |
| `CLOUDINARY_FOLDER` | Folder tujuan aset di dalam cloud, default `photo` |

`CLOUDINARY_URL` hanya dibaca di server. Secret-nya ada di dalam URL, jadi
jangan pernah memberi awalan `NEXT_PUBLIC_` dan jangan commit `.env` yang sudah
terisi.

## Deploy

Checklist minimum sebelum produksi:

1. Isi `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL`
   (origin HTTPS publik), dan kredensial Cloudinary.
2. Di database baru, jalankan `npm run db:migrate`, lalu `npm run db:seed`
   sekali. Ganti `ADMIN_EMAIL`/`ADMIN_PASSWORD` sebelum seed; kredensial contoh
   hanya untuk lokal.
3. `npm run build`, lalu `npm start`.
4. Jadwalkan `POST /api/cron/cleanup` dengan header
   `Authorization: Bearer $CRON_SECRET`. Di Vercel, `vercel.json` sudah memakai
   cron harian (batas Hobby) dan Vercel mengirim header tersebut otomatis.
5. Hubungkan Vercel Blob store (akses private) ke project. Filesystem Vercel
   bersifat sementara, jadi tanpa `BLOB_READ_WRITE_TOKEN` penyimpanan foto akan
   gagal dengan pesan konfigurasi yang jelas. Di lokal, tanpa token, aplikasi
   memakai `STORAGE_DIR` seperti biasa.
6. Kamera hanya aktif di HTTPS atau `localhost`.

Untuk Vercel: import repo GitHub, set environment variables di atas, hubungkan
Blob store, lalu deploy branch `main`. `NEXT_PUBLIC_BASE_URL` harus diisi domain
produksi (mis. `https://photo.vercel.app`) agar QR dan tautan berbagi stabil.

Verifikasi rilis: `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run e2e`, lalu `node scripts/responsive-check.mjs` saat server produksi
berjalan.

## Galeri publik

Tamu boleh mencentang **"Tampilkan di galeri publik"** di studio. Kalau dicentang,
`POST /api/sessions` juga mengunggah PNG yang sama ke Cloudinary dan
mengisi `published_at`, `cloudinary_public_id`, dan `cloudinary_url` di baris
yang sama. Kalau `CLOUDINARY_URL` belum diatur atau upload ditolak, sesi tetap
dibuat dan `published=false` dikembalikan; studio lalu memberi tahu tamu bahwa
fotonya tersimpan tapi gagal masuk galeri.

`GET /api/gallery` hanya mengembalikan baris dengan `published_at` dan
`cloudinary_url` yang tidak null, dengan proyeksi yang sengaja tidak memuat
`accessKey`, `finalPhotoUrl`, maupun `expiresAt`. Halaman `/gallery` sekarang
merender foto pertama di server supaya gambar LCP ditemukan tanpa menunggu
hidrasi, lalu memakai transformasi Cloudinary `c_limit,f_auto,q_auto,w_480` untuk
thumbnail. Seksi galeri di beranda tetap memakai feed API.

**`public_id` Cloudinary memakai `id` baris, bukan `accessKey`.** `accessKey` adalah
kapabilitas yang membuka `/p/[accessKey]` dan endpoint unduh, sedangkan URL
aset yang sudah dipublikasikan bersifat publik dan bisa di-cache permanen, jadi
memasukkan `accessKey` ke sana akan menyerahkan kapabilitas itu ke siapa pun yang
menyalin tautan gambarnya.

**Foto publik tidak pernah kedaluwarsa selama masih dipublikasikan.**
`POST /api/cron/cleanup` melewati baris dengan `published_at` yang tidak null, jadi
galeri tidak kehilangan foto yang sengaja dibagikan. Admin bisa menyembunyikan
foto dari `/admin/storage`; aksi itu menghapus salinan Cloudinary, mempertahankan
salinan privat tamu di `/p/[accessKey]`, dan membuat sesi kembali mengikuti
retensi. Job retensi juga menghapus aset Cloudinary untuk baris kedaluwarsa yang
masih memilikinya (misalnya karena `destroy` sempat gagal), dan menahan baris
kalau Cloudinary belum bisa dihubungi supaya tidak ada aset yatim. Responsnya
melaporkan `publishedKept`, `cloudinaryRemoved`, dan `cloudinaryFailed`.

**Galeri menampilkan preview, bukan semuanya.** `GalleryGrid` merender 8 foto
pertama lalu tombol `Lihat semua (N lainnya)`; menekannya menampilkan seluruh
foto dan tombol berubah jadi `Tutup`. Angka total tetap dilaporkan di bawah
grid. Kalau kamu ingin batasannya permanen, hapus blok tombol itu dan biarkan
`slice(0, PREVIEW_COUNT)` berjalan.

**Kontrol foto publik ada di `/admin/storage`.** Halaman ini menampilkan 24 foto
publik per halaman beserta event, layout, filter, dan tanggalnya. Tombol
**Sembunyikan** menghapus foto dari galeri dan menghapus salinan Cloudinary tanpa
menghapus akses privat tamu; tombol **Hapus** menghapus aset Cloudinary, file
lokal, dan baris sesi secara permanen. Semua aksi memakai cookie admin yang sama
dengan dashboard.

## Alur

1. `/booth` pilih layout (Strip 3, Strip 4, Grid 2x2, Single), aktifkan kamera,
   hitung mundur 3-2-1, lalu burst beberapa bidikan.
2. Bidikan dikirim ke `/studio` lewat `sessionStorage`, dirender jadi satu PNG
   di canvas dengan filter, stiker, frame, dan tata letak pilihan.
3. PNG dikirim ke `POST /api/sessions`, disimpan ke disk, dan baris Postgres dibuat
   dengan `accessKey` acak 20 karakter.
4. `/p/[accessKey]` menampilkan strip, QR ke halaman yang sama, dan tombol unduh
   yang menambah `download_count`.
5. `/api/cron/cleanup` menghapus sesi kedaluwarsa beserta filenya. Sesi yang
   sudah dipublikasikan ke galeri dilewati, jadi fotonya tetap tampil.

Admin membuat event di `/admin`, opsional dengan kode akses, dan mengunggah
frame PNG. Event terkunci hanya bisa dibuka lewat `/e/[slug]` dengan kode yang
benar.

**Frame** ada di studio, bukan di booth: tujuh desain canvas (Pita, Kucing, Mata,
Spidol, Hantu, Neon, Balap) digambar dengan primitif di `src/lib/frames.ts`, jadi
swatch pemilih, pratinjau, dan PNG hasil simpan memakai kode yang sama persis.
Dua frame event RTS, **Kultur** dan **Fiksi**, sekarang dikelola admin seperti
frame lain: PNG diunggah ke Cloudinary, metadata dan jendela fotonya disimpan di
Neon, lalu studio mengambil katalog dari `GET /api/frames`. Keduanya khusus
**Strip 3** dan tidak ditampilkan di layout lain.

Saat admin mengunggah PNG, `src/lib/frame-image.ts` memindai alpha channel:
margin transparan yang menyentuh tepi diabaikan, lalu komponen transparan
tertutup yang besar dan berbentuk kotak dianggap jendela foto. Ukuran sumber dan
jendela disimpan sebagai JSON, sehingga `renderStrip` bisa menempatkan foto ke
jendela artwork apa pun tanpa kode per frame. Bila tidak ada jendela terdeteksi,
foto memakai slot layout biasa dan artwork menjadi overlay. Swatch memakai
potongan atas artwork; file penuh baru dimuat saat frame dipilih.

Frame dilukis setelah foto dan sebelum stiker; tepi bawah 70px dan tepi samping
34px sengaja dibiarkan longgar supaya label event tetap terbaca. Untuk frame
bitmap, stiker ditempel di foto terakhir agar footer bermerek pada frame tidak
tertutup. Global frame (`event_id` null) muncul di semua sesi; frame yang
dipasang ke event hanya muncul untuk draft dari event itu.

**Stiker tempel** juga ada di studio: enam desain die-cut (Senyum, Cakep, Squad,
Bestie, Party, Gemes) digambar di `src/lib/stickers.ts` dengan bentuk, rim kertas,
garis tinta, dan bayangan offset. Stiker ditempel di pojok kiri bawah strip,
menimpa frame, dan ukurannya mengikuti lebar foto supaya proporsinya sama di
Strip maupun Grid 2x2. Sama seperti frame, pilihan stiker ikut ter-render ke PNG
dan tidak butuh kolom baru di Postgres.

## CRUD admin

`/admin` sengaja tidak ditautkan dari mana pun di UI: tidak ada tombol di
beranda maupun di footer, dan halamannya memasang `robots: noindex`. Masuk ke
sana harus lewat URL langsung. Itu menyembunyikan pintunya, bukan menguncinya —
yang mengunci adalah `requireAdmin()`; tanpa cookie sesi yang sah halaman itu
hanya menampilkan form login, dan `POST /api/admin/login` menolak siapa pun yang
bukan user ber-role `ADMIN`.

Akun admin dibuat `npm run db:seed` dari `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Seed juga mengunggah `Frame_RTS_01.png` dan `Frame_RTS_02.png` ke Cloudinary
lalu melakukan upsert baris **Kultur** dan **Fiksi** ke Neon. Kalau Cloudinary
belum diatur, seed memakai penyimpanan lokal sebagai fallback supaya alur admin
tetap bisa dicoba.

Kode akses event demo memakai `DEMO_EVENT_CODE` kalau diisi. Kalau variabel itu
kosong, seed mempertahankan kode yang sudah ada; kode acak hanya dibuat untuk
database baru. Dengan begitu menjalankan ulang seed tidak memutus link yang
sudah dibagikan.

Seed akun bersifat upsert **berdasarkan email**, jadi:

- Ganti `ADMIN_PASSWORD` lalu jalankan `npm run db:seed` untuk memperbarui
  password akun yang sudah ada.
- Ganti `ADMIN_EMAIL` akan **membuat akun admin kedua** dan meninggalkan akun
  lama tetap aktif. Hapus dulu baris lama di tabel `users`, atau ubah email-nya
  langsung di database.

Kredensial default di `.env.example` (`admin@snapvibe.local` /
`snapvibe-dev-admin`) hanya untuk lokal. Ganti keduanya sebelum deploy, karena
akun itu ada di database yang sama dengan yang dipakai produksi.

Semua endpoint di bawah butuh cookie sesi admin dari `POST /api/admin/login`.
Tanpa cookie selalu dibalas `401`.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/api/admin/events` | Daftar event milik admin |
| `POST` | `/api/admin/events` | Buat event |
| `PATCH` | `/api/admin/events/[id]` | Ubah judul, kode akses, retensi |
| `DELETE` | `/api/admin/events/[id]` | Hapus event, frame ikut terhapus |
| `GET` | `/api/admin/frames` | Daftar frame, termasuk status Cloudinary |
| `POST` | `/api/admin/frames` | Unggah PNG, deteksi jendela, simpan ke Cloudinary + Neon |
| `PATCH` | `/api/admin/frames/[id]` | Ubah nama, layout, kategori, event |
| `DELETE` | `/api/admin/frames/[id]` | Hapus baris dan aset Cloudinary |
| `PATCH` | `/api/admin/photos/[id]` | Sembunyikan foto publik dan hapus salinan Cloudinary |
| `DELETE` | `/api/admin/photos/[id]` | Hapus permanen aset Cloudinary, file lokal, dan sesi |
| `GET` | `/api/frames?eventId=...` | Katalog publik untuk studio |
| `POST` | `/api/cron/cleanup` | Jalankan retensi kedaluwarsa (butuh `Authorization: Bearer <CRON_SECRET>`) |

Semua endpoint admin dan cron di atas butuh kredensial. Endpoint admin memakai
cookie sesi dari `POST /api/admin/login`; cron memakai header
`Authorization: Bearer <CRON_SECRET>`. Di produksi, cron membalas `503` kalau
`CRON_SECRET` belum diset, jadi job retensi tidak pernah terbuka tanpa sengaja.

Mengubah judul event juga memperbarui slug-nya dan tetap unik. Menghapus event
atau frame ikut menghapus aset Cloudinary (atau file lokal fallback), bukan hanya
baris di Postgres. Frame upload memakai folder `CLOUDINARY_FRAME_FOLDER`
(default `snapvibe/frames`); strip galeri tetap memakai `CLOUDINARY_FOLDER`.
Sembunyikan/hapus foto publik tersedia di halaman admin **Storage**, bukan di
API publik.

## Catatan teknis

**Zona waktu.** Semua kolom waktu adalah `timestamp without time zone` yang
diisi sebagai UTC. Perbandingan kedaluwarsa memakai
`now() at time zone 'utc'`, bukan `now()` biasa, supaya tidak ikut zona waktu
sesi. Menyamakan kolom dengan `now()` telanjang pernah membuat job retensi
diam-diam gagal dan foto tidak pernah terhapus.

**Driver.** Koneksi memakai `postgres` (postgres.js) lewat
`drizzle-orm/postgres-js`. Client di-cache di `globalThis` agar hot reload tidak
membuka pool baru tiap edit. Pakai connection string *pooler* dari Neon untuk
aplikasi, bukan koneksi langsung.

**Enum.** Kolom enum memakai `pgEnum`, jadi nilainya berupa enum Postgres asli
(`CREATE TYPE`), bukan varchar. `layout_type` dan `role` terdefinisi di
`drizzle/0000_*.sql`.

**Primary key.** Semua id bertipe `uuid` dengan default `gen_random_uuid()`,
kecuali `photo_sessions.access_key` yang sengaja varchar 32 karakter karena
dipakai di URL dan QR.

**Bidikan kamera.** `grabFrame` menolak mengambil bingkai sampai
`readyState >= HAVE_CURRENT_DATA`. `videoWidth` dan `videoHeight` muncul
bersama metadata, yang bisa sebelum bingkai apa pun ter-decode, dan menggambar
video di jendela itu menghasilkan kanvas kosong. Efek yang menempelkan stream ke
`<video>` juga guarding `srcObject`: mengassign ulang `srcObject` memulai ulang
media pipeline, dan karena efek itu ikut jalan pada setiap perubahan `status`,
lompatan status tepat sebelum burst mengambil bingkai bisa menghasilkan frame
yang belum ter-decode atau frame basi.

Karena itu burst menunggu bingkai baru lewat `requestVideoFrameCallback`
(`waitForVideoFrame`) dan memeriksa bahwa bingkainya bukan isian rata
(`lumaRange`), lalu memeriksa lagi sebelum countdown pertama bahwa stream baru
benar-benar sudah live (`waitForVideoLive`). Bingkai juga diperkecil ke sisi
terpanjang 1440px sebelum disimpan: kamera 4K menghasilkan data URL
multi-megabyte, sementara slot strip tidak lebih dari ~900px. Tanpa ini,
`sessionStorage` bisa penuh dan draft baru gagal ditulis.

**Mode cermin (selfie).** Booth memakai tampilan cermin seperti kamera depan HP.
Pratinjau `<video>` di-flip dengan `scaleX(-1)`, dan `grabFrame` membalik piksel
dengan cara yang sama, jadi foto yang tersimpan persis seperti yang tamu lihat di
pratinjau. Label teks di strip digambar setelah pembalikan, jadi tulisan tetap
terbaca normal. `drawCover` di `src/lib/render.ts` menggambar langsung di
`(x, y)` slotnya; kalau suatu saat perlu mengubah pembalikan, ingat bahwa
`translate` di sana juga yang memposisikan gambar ke slot, bukan hanya bagian
dari pembalikan. `npm run e2e:mirror` memasang stream uji separuh merah separuh
biru dan memastikan merah pindah ke kanan, baik di transform pratinjau, thumbnail
review, maupun file yang tersimpan.

**Strip halaman depan.** Hero di `/` menampilkan `HeroStrip`, proof statis
layout pertama (`Strip 3`) dengan tiga slot bernomor dan ilustrasi placeholder.
Tidak ada hitung mundur, animasi bidikan, atau umpan kamera; halaman marketing
tidak meminta kamera sebelum tamu memilih masuk booth, dan loop kamera
sungguhan hanya ada di `/booth`. `npm run e2e:hero` memastikan hero tetap
statis, memakai tiga slot, tidak memasang `<video>`, dan tidak memanggil
`getUserMedia`, termasuk saat `prefers-reduced-motion`.

**Tally unduhan.** `/p/[accessKey]` adalah server component, jadi angka
`download_count` yang dirender hanya benar saat halaman itu dibuat. Tombol unduh
karena itu jadi client component (`src/components/download-button.tsx`) yang
menahan klik biasa: ia mengambil endpoint sebagai blob, handing-sel-nya ke browser
dengan object URL, lalu membaca jumlah terbaru dari header `X-Download-Count`.
`anchor` asli tetap ada, jadi middle-click, "buka di tab baru", dan jalur
nativeketika JS gagal tetap mengunduh seperti biasa. Object URL baru di-*revoke*
setelah jeda, karena mencabutnya seketika bisa membatalkan simpan yang masih
sedang berjalan. Endpoint memakai `UPDATE ... RETURNING` supaya angka yang
dikirim persis sama dengan yang tersimpan, bahkan kalau dua unduhan tumpang tindih.
`npm run e2e:download` menjaga seluruh rangkaian ini.

**Draft studio.** Draft run berada di `sessionStorage` dengan kunci
`snapvibe.draft`, dan `src/lib/draft-store.ts` adalah satu-satunya tempat yang
membaca dan menulisnya. Booth dan studio adalah komponen terpisah yang masing-masing
dimount ulang saat pindah halaman, jadi snapshot-nya harus stabil secara referensial
buat `useSyncExternalStore`; karena itu hasil `JSON.parse` di-memoisikan **terhadap
string mentahnya**, bukan disimpan sekali lalu dibekukan. Cache yang hanya di-reset
setelah simpan akan terus mengembalikan foto run pertama, atau `null` yang membuat
studio menampilkan "belum ada foto" padahal tamu baru saja jepret.
Draft juga dianggap tidak sah kalau jumlah bidikan kurang dari `shotCount` layout-nya,
supaya strip tidak pernah dirender dengan slot kosong. Pratinjau disimpan bersama
asal render-nya (draft, filter, stiker) dan validity-nya diturunkan saat dibaca,
jadi pratinjau milik run lama tidak bisa diunggah ke database. `npm run e2e:retake`
menjaga semua itu.

Penyimpanan hanyalah lapisan ketahanan, bukan sumber kebenaran untuk layar
berikutnya. Draft juga dipegang di memori modul untuk handoff client-side, dan
booth menghapus snapshot run (`snapvibe.boothrun`) **sebelum** menulis draft
supaya kuota tidak terpakai dua kali untuk foto yang sama. Kalau penulisan tetap
gagal, entri draft lama dihapus agar reload tidak pernah memunculkan strip tamu
sebelumnya; studio memakai salinan di memori, jadi tamu tetap melihat foto yang
baru diambil. `npm run e2e:draft` mengisi `sessionStorage` sampai penuh lalu
memastikan kedua gejala lama — foto run sebelumnya dan "belum ada foto" — tidak
kembali. `npm run e2e:retake` memutar ulang Strip 3, Strip 4, Grid 2x2, dan
Single untuk memastikan draft terbaru menang di setiap layout.

**Penyimpanan file.** Foto ditulis ke Vercel Blob privat saat
`BLOB_READ_WRITE_TOKEN` tersedia, atau ke `STORAGE_DIR` sebagai fallback lokal.
Keduanya disajikan lewat `/api/files/[...path]`, yang hanya menerima basename PNG
yang aman. Jalur Blob memakai `put`/`get`/`del` dari `@vercel/blob`; tidak ada
URL Blob publik yang bocor ke halaman hasil. Di Vercel, simpan foto tanpa Blob
akan gagal, bukan menulis ke `/tmp` yang hilang saat instance berikutnya.

**Sistem visual.** Arah desainnya playful/cute bergaya `cetak layar`
(screenprint Indonesia): permukaan kertas krem, tinta candy bermSATA tinggi
(pink `#FF3D8B`, orange `#FF7A1A`, butter `#FFD23F`, mint `#3DD9A0`,
sky `#3DA5F5`, plum `#7B2D8E`), bentuk rounded, dan bayangan stiker
offset keras. Sudut tidak lagi dikunci 0; skala radius ada di
`globals.css` (`--radius-sm` sampai `--radius-xl` plus `--radius-pill`).
Font display `Baloo 2` dengan teks `Nunito`. Ikon memakai Tabler, bukan
emoji. Semua token warna, radius, bayangan, dan font diekspor lewat
`@theme`, jadi utility Tailwind (`bg-pink`, `rounded-[var(--radius)]`,
`shadow-lift-2`, `font-display`) tersedia langsung. Semuanya
dokumentasi lengkap di `DESIGN.md`.

**Tailwind dan symlink.** `globals.css` memakai `source(none)` lalu
`@source "../"`. Pemindaian otomatis Tailwind v4 akan menelusuri seluruh
project, dan karena `.codegraph` adalah junction ke folder di luar project,
Turbopack gagal build. Sources ditulis eksplisit supaya hanya `src/` yang
dipindai.
