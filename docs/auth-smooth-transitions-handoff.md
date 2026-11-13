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
| 1 Discovery | Sumber disemak; baseline browser sedang disediakan |
| 2 Tokens/reduced motion | Belum diubah |
| 3 Persistent layout | Belum diubah |
| 4 Stable form slot | Belum diubah |
| 5 Form transition | Belum diubah |
| 6 Illustration crossfade | Belum diubah |
| 7 Micro-interactions/states | Belum diubah |
| 8 Landing/auth fade | Belum diubah |
| 9 Responsive/helper/background | Belum diubah |
| 10 Verification/polish/audit | Belum dijalankan |

## Sambungan

- Semua build/test/browser target dalam WSL/bwrap sedia ada, data sintetik, had asal CPU100%, RAM768MiB/high704, swap0, PID128, tmp256MiB, CPU120s/wall180s. Tiada instalasi atau peningkatan had.
- Helper baharu di `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-smooth-20261113` sedang disediakan. Harness lama kekal.
- Jangan commit untracked `.agents/`, `.codex/`, `.github/agents|hooks|skills/`, `.impeccable/` atau sebarang `.env`.
- Simpan baseline/after screenshot pada viewport matching serta metadata receipt dan source manifest. Laporan akhir mesti menyatakan batas pengesahan, default, commit hash dan perubahan setiap isu rakaman.

Belum ada pembetulan UI atau ujian browser yang didakwa selesai dalam checkpoint ini.
