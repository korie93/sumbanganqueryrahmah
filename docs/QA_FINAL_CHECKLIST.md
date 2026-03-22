# QA Final Checklist

Gunakan checklist ini selepas refactor besar, sebelum release, atau selepas dependency/security hardening.

## Prasyarat

- Jalankan `npm run typecheck`
- Jalankan `npm test`
- Jalankan `npm run build`
- Pastikan server tempatan hidup pada `http://127.0.0.1:5000`

## Smoke UI

- Jalankan `npm run smoke:ui`
- Jika mahu uji login sebenar juga, set:
  - `SMOKE_TEST_USERNAME`
  - `SMOKE_TEST_PASSWORD`
- Semak tiada console error/warning dan tiada request auth liar semasa startup unauthenticated
- Jika credential diberi, smoke script juga perlu meluluskan:
  - `/collection/records`
  - `/collection/summary`
  - `/settings`

## Auth

- Login berjaya untuk peranan yang sah
- Logout kembali ke login tanpa console noise
- Deep-link sah seperti `/collection/records` kekal selepas login
- `savedUser` lama tanpa cookie tidak mencetuskan `/api/me` `403`
- Forgot/reset/activation page boleh dibuka terus melalui URL

## Collection Report

- `Save Collection` boleh dibuka tanpa blank screen
- `View Rekod Collection` memaparkan jadual, filter, dan pagination
- `View All` buka dialog dengan pagination dan scroll yang stabil
- `Edit Record` dialog buka tanpa accessibility warning
- `Delete Record` menolak stale request dengan mesej `Record Updated Elsewhere` (409 concurrency conflict)
- `Receipt Preview` buka/tutup tanpa broken viewer state
- `Collection Summary` buka popup bulan dengan pagination
- `Nickname Summary` hanya memaparkan total yang betul
- `Manage Nickname` buka semua dialog utama tanpa error

## Settings

- Semua kategori boleh dibuka
- `My Account` boleh buka flow ubah username/password
- `Managed Users` boleh buka dialog create/edit/reset/resend tanpa error
- `Dev Mail Outbox` boleh refresh bila feature dihidupkan

## Monitor / Search / Import

- `System Monitor` dashboard dan tab lain boleh dibuka tanpa polling error selepas logout
- `Search` simple/advanced/reset berfungsi
- `Import` single dan bulk tab boleh dibuka
- `Saved` dan `Viewer` boleh dibuka tanpa console error

## Manual Caution Paths

Uji hanya pada data staging / non-production:

- delete rekod collection
- purge data collection lama
- ban / unban user
- restore backup
- chaos / failure injection

## Release Gate

Anggap build layak hanya jika:

- typecheck lulus
- tests lulus
- build lulus
- `npm run smoke:ui` lulus
- tiada console error/warning pada flow utama
