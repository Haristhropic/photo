# SnapVibe

Web photobooth untuk event. Tamu buka link di browser HP, pilih layout, jepret
bareng-bareng, dapat strip foto dengan QR untuk diunduh. Data tersimpan di
Neon Postgres, file foto di disk lokal.

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
| `npm run e2e:retake` | Uji bahwa studio selalu memakai draft terakhir, bukan foto run sebelumnya |
| `npm run e2e:download` | Uji tally "kali diunduh" bertambah sendiri tanpa reload |
| `npm run e2e:capture` | Uji bidikan yang tersimpan benar-benar bingkai kamera, bukan frame kosong atau duplikat |
| `npm run e2e:mirror` | Uji foto yang tersimpan tidak terbalik kiri-kanan |
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
| `STORAGE_DIR` | Folder penyimpanan file foto, default `./storage` |
| `NEXT_PUBLIC_BASE_URL` | URL dasar untuk QR dan tautan berbagi |
| `SESSION_SECRET` | Kunci HMAC untuk cookie sesi admin |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Kredensial admin untuk `db:seed` |
| `CLOUDINARY_URL` | Kredensial Cloudinary, mis. `cloudinary://KEY:SECRET@CLOUD_NAME`. Tanpa kurung sudut di sekitar key atau secret, kalau tidak `src/lib/cloudinary.ts` menolaknya |
| `CLOUDINARY_FOLDER` | Folder tujuan aset di dalam cloud, default `photo` |

`CLOUDINARY_URL` hanya dibaca di server. Secret-nya ada di dalam URL, jadi
jangan pernah memberi awalan `NEXT_PUBLIC_` dan jangan commit `.env` yang sudah
terisi.

## Galeri publik

Tamu boleh mencentang **"Tampilkan di galeri publik"** di studio. Kalau dicentang,
`POST /api/sessions` juga mengunggah PNG yang sama ke Cloudinary dan
mengisi `published_at`, `cloudinary_public_id`, dan `cloudinary_url` di baris
yang sama. Kalau `CLOUDINARY_URL` belum diatur atau upload ditolak, sesi tetap
dibuat dan `published=false` dikembalikan; studio lalu memberi tahu tamu bahwa
fotonya tersimpan tapi gagal masuk galeri.

`GET /api/gallery` hanya mengembalikan baris dengan `published_at` dan
`cloudinary_url` yang tidak null, dengan proyeksi yang sengaja tidak memuat
`accessKey`, `finalPhotoUrl`, maupun `expiresAt`. Halaman `/gallery` (dan
seksi galeri di beranda) memakai feed itu.

**`public_id` Cloudinary memakai `id` baris, bukan `accessKey`.** `accessKey` adalah
kapabilitas yang membuka `/p/[accessKey]` dan endpoint unduh, sedangkan URL
aset yang sudah dipublikasikan bersifat publik dan bisa di-cache permanen, jadi
memasukkan `accessKey` ke sana akan menyerahkan kapabilitas itu ke siapa pun yang
menyalin tautan gambarnya.

**Foto publik tidak pernah kedaluwarsa.** `POST /api/cron/cleanup` hanya
menghapus sesi yang `published_at`-nya null, jadi galeri hanya tumbuh dan
`cloudinary_public_id` selalu punya baris yang cocok. Responsnya melaporkan
`publishedKept` supaya Retention yang melewati foto publik terlihat disengaja,
bukan terlewat. Kalau kamu ingin galeri bisa kedaluwarsa, ubah `expiredCutoff`
di `src/app/api/cron/cleanup/route.ts` dan panggil `destroyAsset` dari
`src/lib/cloudinary.ts` saat baris dihapus, supaya folder `photo` tidak menumpuk
aset yatim.

## Alur

1. `/booth` pilih layout (Strip 3, Strip 4, Grid 2x2, Single), aktifkan kamera,
   hitung mundur 3-2-1, lalu burst beberapa bidikan.
2. Bidikan dikirim ke `/studio` lewat `sessionStorage`, dirender jadi satu PNG
   di canvas dengan filter, stiker, dan tata letak pilihan.
3. PNG dikirim ke `POST /api/sessions`, disimpan ke disk, dan baris Postgres dibuat
   dengan `accessKey` acak 20 karakter.
4. `/p/[accessKey]` menampilkan strip, QR ke halaman yang sama, dan tombol unduh
   yang menambah `download_count`.
5. `/api/cron/cleanup` menghapus sesi kedaluwarsa beserta filenya. Sesi yang
   sudah dipublikasikan ke galeri dilewati, jadi fotonya tetap tampil.

Admin membuat event di `/admin`, opsional dengan kode akses, dan mengunggah
frame PNG. Event terkunci hanya bisa dibuka lewat `/e/[slug]` dengan kode yang
benar.

## CRUD admin

`/admin` sengaja tidak ditautkan dari mana pun di UI: tidak ada tombol di
beranda maupun di footer, dan halamannya memasang `robots: noindex`. Masuk ke
sana harus lewat URL langsung. Itu menyembunyikan pintunya, bukan menguncinya —
yang mengunci adalah `requireAdmin()`; tanpa cookie sesi yang sah halaman itu
hanya menampilkan form login, dan `POST /api/admin/login` menolak siapa pun yang
bukan user ber-role `ADMIN`.

Akun admin dibuat `npm run db:seed` dari `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Seed bersifat upsert **berdasarkan email**, jadi:

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
| `GET` | `/api/admin/frames` | Daftar frame |
| `POST` | `/api/admin/frames` | Unggah frame PNG |
| `PATCH` | `/api/admin/frames/[id]` | Ubah nama, layout, event |
| `DELETE` | `/api/admin/frames/[id]` | Hapus frame dan file PNG |
| `POST` | `/api/cron/cleanup` | Jalankan retensi kedaluwarsa |

Mengubah judul event juga memperbarui slug-nya dan tetap unik. Menghapus event
atau frame ikut menghapus file PNG di disk, bukan hanya baris di Postgres.

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

**Tidak ada cermin.** Foto disimpan apa adanya seperti sensor melihatnya, jadi
tidak ada yang membalik kiri-kanan. Ada empat tempat yang dulu membalik dan
harus tetap kosong: `grabFrame`, `drawCover` di `src/lib/render.ts`, kelas
`<video>` di booth, dan thumbnail di `live-strip.tsx`. `drawCover` menggambar
langsung di `(x, y)` slotnya; kalau suatu saat perlu membalik lagi, ingat bahwa
`translate` di sana juga yang memposisikan gambar ke slot, bukan hanya bagian
dari pembalikan. `npm run e2e:mirror` memasang stream uji separuh merah
separuh biru dan memastikan merah tetap di kiri, baik di thumbnail maupun di
file yang tersimpan.

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

**Penyimpanan file.** Foto ditulis ke `STORAGE_DIR` dan disajikan lewat
`/api/files/[...path]`, yang menolak path di luar root. Untuk produksi,
ganti dengan object storage (S3 atau sejenis) dan ganti `src/lib/storage.ts`.

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
