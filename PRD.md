# Product Requirement Document (PRD) - Web-Based Photobooth Application

| Metadata | Detail |
| :--- | :--- |
| **Product Name** | SnapVibe / Web Photobooth |
| **Document Version** | 1.0.0 |
| **Status** | Draft / Planning |
| **Target Audience** | Event Attendees, Gen Z/Millennials, Party Guests, General Users |
| **Core Architecture** | Next.js (App Router), React, Tailwind CSS, Framer Motion, shadcn/ui, MySQL |

---

## 1. Executive Summary & Vision

### 1.1 Visi Produk
Membuat platform **Web-based Photobooth** yang menyenangkan, modern, dan mudah digunakan langsung dari browser (tanpa perlu install aplikasi). Pengguna dapat mengambil foto beruntun (*burst/strip photo*), memberikan efek filter/frame kustom, serta mengunduh atau membagikan hasilnya secara instan via QR Code atau link.

### 1.2 Key Objectives
* **Aksesibilitas Tanpa Hambatan:** Pengguna dapat mengambil foto langsung dari perangkat (laptop/tablet/smartphone) menggunakan akses kamera web.
* **Pengalaman Interaktif (UX):** Animasi yang intuitif, *countdown timer*, dan *live preview* dengan performa mulus menggunakan Framer Motion & shadcn/ui.
* **Kustomisasi Tinggi:** Dukungan pemilihan layout photo strip, stiker, filter warna, dan kustomisasi frame (termasuk watermark/frame tema event).
* **Penyimpanan Efisien & Mudah:** Menyimpan hasil foto ke storage dan menyediakan akses unduh cepat via QR Code atau *direct link*.

---

## 2. Target Audience & Use Cases

1. **Pengguna Mandiri (Personal Use):** Mengabadikan momen cepat sendirian atau bersama teman untuk diunggah ke media sosial (Instagram, TikTok).
2. **Penyelenggara Acara (Event / Party Host):** Menggunakan tablet/laptop sebagai *booth* foto mandiri pada acara pernikahan, ulang tahun, atau acara kantor dengan frame tema kustom.

---

## 3. Tech Stack Architecture

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | Full-stack React framework untuk Server Side Rendering & API Routes |
| **UI Library & Component** | shadcn/ui & Tailwind CSS | Styling modular, modern, accessible, dan fully responsive |
| **Animation Engine** | Framer Motion | Smooth page transitions, countdown animations, and interactive modals |
| **Database** | MySQL | Relational DB untuk menyimpan data user, template frame, session foto, dan metadata |
| **ORM / Query Builder** | Prisma ORM / Drizzle ORM | Type-safe database client untuk integrasi Next.js & MySQL |
| **Canvas Manipulation** | HTML5 Canvas API / Fabric.js | Menggabungkan hasil jepretan foto, filter, frame, dan stiker menjadi 1 gambar akhir |
| **Image Storage** | Cloudinary / AWS S3 / Local Storage | Penyimpanan file gambar hasil cetak/strip foto |

---

## 4. Core Features & Functional Requirements

### 4.1 User / Client-Facing Features

#### A. Landing & Onboarding
* **Hero Banner:** Tampilan yang menarik dengan contoh photo strip interaktif.
* **Session Start:** Tombol "Start Photo Session" dengan opsi izin akses kamera (*getUserMedia API*).
* **Preset Selection:** Pemilihan mode layout sebelum foto (misal: 3-Photo Strip, 4-Grid, Single Frame).

#### B. Camera & Capture Interface (The Booth)
* **Live Camera View:** Preview kamera real-time dengan tombol ganti kamera (depan/belakang pada mobile).
* **Countdown Timer:** Penghitung waktu mundur interaktif (3, 2, 1) dengan efek flash layar saat foto diambil.
* **Burst Mode Capture:** Mengambil foto secara otomatis sesuai jumlah slot pada layout yang dipilih (misal: 4 kali jepretan dengan jeda 3 detik per foto).
* **Retake Option:** Kesempatan mengulang jepretan individual atau mengulang seluruh sesi.

#### C. Customization Studio (Post-Capture Editor)
* **Filter Selection:** Efek warna real-time/post-processing (Grayscale, Vintage/Sepia, Bright, Warm, B&W High Contrast).
* **Frame & Border Customs:**
  * Pilihan warna border (Hitam, Putih, Pastel, Gradien).
  * Frame bertema (Birthday, Wedding, Minimalist, Seasonal).
* **Stickers & Text Overlays:** Menambahkan stiker ekspresi, tanggal otomatis, atau teks kustom pada photo strip.

#### D. Result, Export & Share
* **High-Res Canvas Renderer:** Menggabungkan seluruh komponen (foto + frame + filter + stiker) menjadi gambar PNG/JPEG resolusi tinggi.
* **Direct Download:** Mengunduh hasil foto ke perangkat.
* **QR Code Sharing:** Menampilkan QR Code yang merujuk pada link unik halaman unduh foto (*Result Page*).
* **Social Share:** Tombol cepat untuk menyalin link atau berbagi ke platform pihak ketiga.

---

### 4.2 Admin & Event Organizer Dashboard

#### A. Frame & Template Manager
* Upload dan kelola gambar frame kustom (PNG transparan).
* Mengatur ukuran canvas & koordinat slot foto pada frame.

#### B. Event / Session Management
* Membuat "Event Code" khusus yang mengunci UI ke tema frame tertentu (cocok untuk photobooth acara offline).

#### C. Gallery & Analytics (Admin)
* Melihat jumlah foto yang diambil per hari / per event.
* Manajemen retensi file (hapus foto lama secara otomatis untuk menghemat storage).

---

## 5. Database Schema (MySQL + Prisma/Drizzle Example)

```prisma
// Example Schema using Prisma Syntax for MySQL

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER) // USER, ADMIN
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  events    Event[]
}

model Event {
  id          String       @id @default(uuid())
  title       String
  slug        String       @unique
  accessCode  String?
  creatorId   String
  creator     User         @relation(fields: [creatorId], references: [id])
  frames      Frame[]
  photoSessions PhotoSession[]
  createdAt   DateTime     @default(now())
}

model Frame {
  id          String   @id @default(uuid())
  name        String
  imageUrl    String   // Overlay PNG URL
  layoutType  String   // e.g., "STRIP_3", "GRID_4"
  eventId     String?
  event       Event?   @relation(fields: [eventId], references: [id])
  createdAt   DateTime @default(now())
}

model PhotoSession {
  id             String   @id @default(uuid())
  eventId        String?
  event          Event?   @relation(fields: [eventId], references: [id])
  finalPhotoUrl  String   // Combined output image
  accessKey      String   @unique // For QR code / shortlink URL
  downloadCount  Int      @default(0)
  expiresAt      DateTime // Auto cleanup threshold
  createdAt      DateTime @default(now())
}

enum Role {
  USER
  ADMIN
}
```

---

## 6. User Journey & Flow

```
[ Landing Page ]
       │
       ▼
[ Select Layout / Frame ]
       │
       ▼
[ Grant Camera Access ]
       │
       ▼
[ Photo Capture Session (3..2..1.. Flash!) ]
       │
       ▼
[ Customization Studio (Filter, Frame Color, Sticker) ]
       │
       ▼
[ Render to Canvas & Save to Storage ]
       │
       ▼
[ Result Page: Download / Scan QR Code ]
```

---

## 7. Non-Functional Requirements

1. **Performance:**
   * Render Canvas pada browser harus berjalan di bawah 2 detik setelah pengeditan selesai.
   * Animasi Framer Motion harus berjalan pada 60fps tanpa *lag/stutter*.
2. **Responsiveness:**
   * Tampilan responsif pada perangkat Mobile, Tablet, maupun Desktop/Kiosk display.
3. **Privacy & Security:**
   * Izin kamera wajib meminta persetujuan (*explicit permission*) dari browser pengguna.
   * Opsi *Auto-Delete* foto di server setelah durasi tertentu (misal: 24 jam atau 7 hari) untuk privasi dan efisiensi storage.
4. **Reliability:**
   * Penanganan error graceful jika browser tidak mendeteksi web camera (*fallback UI*).

---

## 8. Milestone & Implementation Roadmap

* **Phase 1: Core Setup & Camera Capture**
  * Setup Next.js, Tailwind, shadcn/ui, dan Framer Motion.
  * Implementasi *useUserMedia* hook untuk kamera & *Countdown capture mechanism*.
* **Phase 2: Canvas Rendering & Studio UI**
  * Pembuatan fitur filter & penataan layout menggunakan HTML5 Canvas API / Fabric.js.
  * Integrasi shadcn/ui components (Sliders, Modals, Tabs) untuk editor studio.
* **Phase 3: Database & Backend Integration**
  * Setup MySQL & Prisma ORM.
  * API Route untuk upload hasil render foto & generator QR code.
* **Phase 4: Admin Dashboard & Custom Frame Upload**
  * Dashboard pengelola untuk membuat event & upload template frame PNG.
* **Phase 5: Polish, Animation & Testing**
  * Penyempurnaan animasi UI menggunakan Framer Motion (Flash effect, smooth page slide, modal transitions).
  * Testing kompatibilitas browser (Safari iOS, Chrome Android, Desktop Browsers).