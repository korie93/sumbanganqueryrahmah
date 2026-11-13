# Auth smooth transitions — handoff

13 November 2026. Goal aktif: laksanakan keseluruhan `FIX-PROMPT-auth-smooth-transitions.md` pengguna. Asas `54a99feb6cc95b822d665130d64034449080cdf2`, branch `codex/visual-layout-repair`.

## Had skop

Frontend login, forgot-password dan peralihan landing sahaja. Kekalkan API, payload, sesi/JWT, validasi, rate limit, error copy, URL, permission, ilustrasi asal, tema dan BM/EN. Tiada dependency baharu atau akses production. Pengguna meluluskan pelaksanaan spesifikasi, termasuk commit setiap fasa selepas build lulus; push/deploy bukan sebahagian tugas ini.

## Penemuan Fasa 1 (sumber, belum bukti browser)

- `App.tsx` menukar dua jenis lazy page; kedua-dua page membina `AuthV17Layout`. Brand, toolbar, listener online dan health request ikut remount.
- `AuthV17Layout.css`: login side di tengah dan wrap translateY(-2.5vh), tetapi forgot-only menggunakan padding-top 16vh. Aturan berbeza menyebabkan heading beralih.
- Breakpoint split sekarang 700px; spesifikasi meminta compact header di bawah 768px.
- Sign-in art ialah CSS pseudo-element; recovery image dimount mengikut halaman. Aset asal cerah/gelap sudah ada.
- Forgot note menggunakan surface berbingkai seperti input; copy perlu kekal dan dipautkan melalui aria-describedby.
- Wouter dipasang, tetapi public route memakai `usePublicAppState.currentPage` dan callback `handlePublicNavigate` + `replaceHistory`. Jangan gantikan dengan wouter navigate atau pushState.

## Keputusan pelaksanaan

- Mod Operate; motion menerangkan hubungan antara halaman. Brand dan toolbar kekal, borang sahaja bertukar. Masa 150/260/360ms dan page fade 240ms, gerakan maksimum 10px.
- Guna CSS + View Transitions yang dikesan sokongannya; tiada library baharu. Fallback enter dipilih sekali ketika content dipasang. Reduced motion menukar keadaan terus.
- Peraturan keras opacity/transform mengatasi contoh Phase 7 yang menganimasikan warna/shadow. Satu pengecualian yang dibenarkan ialah grid-template-rows untuk reveal error.
- Kekalkan pengurusan fokus selepas tindakan/validasi/MFA; fokus heading selepas pertukaran route dan success biasa tanpa merampas fokus pengguna yang sudah berpindah.
- Persistence melalui parent auth-family yang tidak dikey mengikut route; layout sedia ada menjadi content adapter dengan fallback standalone untuk pemanggil/SSR lama.
- Tiada dakwaan telefon rakaman menggunakan Desktop site: tiada rakaman asal dalam lampiran ini. Uji viewport CSS sebenar dan compact <768px.

## Status fasa

| Fasa | Status |
| --- | --- |
| 1 Discovery | Baseline cerah dirender pada 5 lebar dan BM/EN; screenshot 360/1440px diperiksa |
| 2 Tokens/reduced motion | Build lulus; commit baac8b8f |
| 3 Persistent layout | Build + 34 ujian kontrak/SSR lulus; commit 5b251502 |
| 4 Stable form slot | Kod siap; build/regresi belum dijalankan |
| 5 Form transition | Belum diubah |
| 6 Illustration crossfade | Belum diubah |
| 7 Micro-interactions/states | Belum diubah |
| 8 Landing/auth fade | Belum diubah |
| 9 Responsive/helper/background | Belum diubah |
| 10 Verification/polish/audit | Belum dijalankan |

## Sambungan

- Semua build/test/browser target dalam WSL/bwrap sedia ada, data sintetik, had asal CPU100%, RAM768MiB/high704, swap0, PID128, tmp256MiB, CPU120s/wall180s. Tiada instalasi atau peningkatan had.
- Helper baharu di `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-smooth-20261113` sedia. Harness lama kekal. `sandbox.cjs` menerima build/tests/lint/types-focused/browser/hooks; `collect.cjs <receipt>` mengambil bukti bounded. Semua target mesti bersiri.
- Jangan commit untracked `.agents/`, `.codex/`, `.github/agents|hooks|skills/`, `.impeccable/` atau sebarang `.env`.
- Simpan baseline/after screenshot pada viewport matching serta metadata receipt dan source manifest. Laporan akhir mesti menyatakan batas pengesahan, default, commit hash dan perubahan setiap isu rakaman.

## Bukti setakat checkpoint

- Baseline dibekukan daripada build `receipt-adaptive-build-4a87c44113c2`; 2,503 hash sumber direkodkan dan semua fail aplikasi/config/package sepadan sebelum suntingan.
- Browser asal cerah `auth-smooth-tests-d0d764c1038a`: lulus, 26.481s, budgetFailure null. Brand/topbar identity false pada semua lima lebar. Y heading login/forgot: 360=311/311; 390=322.4375/322.4375; 412=333/333; 768=275.453125/247; 1440=189.28125/231. CLS yang diperhatikan sudah 0; jangan mendakwa penurunan CLS daripada metrik ini.
- Screenshot baseline desktop login menunjukkan validasi username kosong selepas autofocus diikuti klik bahasa; autofocus awal akan dibuang dalam Fasa 5, sementara fokus validasi/MFA kekal.
- Build Fasa 2: `receipt-adaptive-build-76b2f7cd4bbb`, lulus 32.343s. Guard commit `auth-smooth-tests-9fd639cb7e52`, lulus.
- Build Fasa 3: `auth-smooth-build-e40ee0853e95`, lulus 21.017s. Regresi `auth-smooth-tests-364cd6d34063`: 34/34. Guard commit `auth-smooth-tests-51cd6e6bab7e`, lulus.
- Dua percubaan persediaan helper gagal sebelum target bermula (mountpoint node_modules dan akses arkib private); kedua-duanya dibetulkan pada helper sahaja, caps kekal. Receipt gagal 12e89592c928 dan c5df3233c1e7 bukan kegagalan aplikasi.
- C: turun ke sekitar 240MB semasa QA. Semua target dihentikan; VHD distro ujian sedang dipadatkan melalui skrip DiskPart lama dengan attach read-only. Jangan mulakan WSL sebelum compaction/detach tamat. Tiada fail dipadam.

Fasa 4–10 dan pengesahan UI selepas pembaikan masih belum selesai. Goal kekal aktif.
