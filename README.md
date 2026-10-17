# LMS St. Louis 2

Learning Management System berbasis Next.js dengan automated grading dan plagiarism detection. AI provider: Ollama lokal atau OpenAI.

## Dokumentasi engineer

**Mulai dari [Engineering Runbook](ops/ENGINEERING-RUNBOOK.md).**

Panduan mencakup:

- Prasyarat runtime, arsitektur, port, dan storage.
- Konfigurasi environment dan perbedaan loader Next.js/Prisma/script.
- Instalasi PostgreSQL/pgvector, migrasi LMS/AUX, bootstrap master data/admin.
- Integrasi Ollama/OpenAI serta migrasi Supabase opsional.
- Development, production, systemd, Nginx, HTTPS.
- Administrasi, monitoring, backup/restore, update/rollback.
- Testing, troubleshooting, batasan, dan acceptance checklist.

Referensi tambahan:

- [Template environment](.env.example).
- [Hasil verifikasi instalasi bersih](ops/INSTALL-VERIFICATION.md).
- [Playwright E2E](tests/e2e/README.md).
- [RTX deployment dan benchmark](ops/rtx-runbook.md) — konteks eksperimen hardware; untuk setup umum gunakan engineering runbook.

## Prasyarat ringkas

- Node.js **24.x** dan npm.
- PostgreSQL dengan extension `vector` dan `pgcrypto` pada database AUX.
- Dua database: LMS dan AUX.
- Ollama beserta model jika `AI_PROVIDER=local`, atau credential OpenAI jika `openai`.
- Disk persisten untuk `public/uploads/`.

> **[PERHATIAN]** Clone baru belum memiliki akun atau data akademik. `npm ci` dan migrasi schema tidak membuat akun admin. Jalankan `npm run db:bootstrap` sesuai runbook. Jangan memakai seed E2E untuk database operasional.

## Command setup

```bash
cp .env.example .env.local
# Isi credential dan URL database di .env.local sebelum melanjutkan.
npm ci
npm run db:migrate
npm run db2:init
npm run db:bootstrap -- --help
```

Bootstrap membaca password melalui stdin; lihat runbook untuk command lengkap. `db2:init` ditujukan untuk AUX kosong; database existing mengikuti prosedur migrasi/baseline di runbook. Semua CLI setup memakai loader env yang sama dengan Next.js, dengan process env sebagai prioritas tertinggi.

## Menjalankan setelah setup selesai

```bash
npm ci
npm run build
npm start
```

Untuk pengembangan kode:

```bash
npm run dev
```

Gunakan production build untuk grading batch; restart/HMR dapat menghentikan background job.

## Verifikasi

```bash
npm run lint
npm run typecheck
npm run test:setup
npm test -- --runInBand --coverage --ci
npm run build
```

## Data private

File env asli, upload, backup, dan `docs/` tidak dibawa Git. Gunakan `.env.example` sebagai template dan simpan `.env.local` secara private. Dokumentasi engineer disimpan di `ops/` agar ikut version control.
