# Auth smooth transitions — handoff

13 November 2026. Goal aktif mengikut keseluruhan `FIX-PROMPT-auth-smooth-transitions.md`. Asas `54a99feb6cc95b822d665130d64034449080cdf2`, branch `codex/visual-layout-repair`.

## Skop dan keputusan

Frontend login, forgot-password dan peralihan landing sahaja. Kekalkan API/payload, sesi/JWT, validasi, rate limit, error copy, URL, permission, ilustrasi asal, tema dan BM/EN. Tiada dependency baharu atau akses production. Pengguna meluluskan commit setiap fasa selepas build lulus; push/deploy bukan sebahagian tugas.

- Mod Operate: parent auth-family kekal, borang sahaja bertukar. Token 150/260/360ms; page fade 240ms; gerakan maksimum 10px. CSS dan native View Transitions dengan fallback/reduced motion.
- Peraturan keras opacity/transform mengatasi contoh yang menganimasikan warna/shadow. Satu pengecualian ialah grid-template-rows untuk error reveal.
- Wouter dipasang, tetapi public route memakai `usePublicAppState.currentPage` dan callback `handlePublicNavigate` + `replaceHistory`. Kekalkan replaceState; jangan gantikan dengan pushState/wouter navigation untuk klik biasa.
- Focus heading hanya selepas pertukaran route; jangan autofocus input pada document load. Fokus validasi/MFA/tindakan sedia ada kekal. Success heading mesti menghormati perlindungan fokus pengguna yang sudah berpindah ketika request pending.

## Punca yang diaudit

- Dua lazy page lama masing-masing membina AuthV17Layout: brand/toolbar, listener online dan request health ikut remount.
- Login side di tengah dengan translateY(-2.5vh), forgot-only padding-top 16vh: heading berbeza Y pada desktop.
- Breakpoint lama 700px, spesifikasi meminta compact header <768px. Signin art pseudo-element, recovery image conditional dan crop/position berbeza.
- Helper forgot kelihatan seperti input; perlu menjadi info kecil di bawah input dan dirujuk aria-describedby.
- Public popstate asal tidak menyegerakkan halaman. Penyegerakan sempit anonymous home/login/forgot disediakan tanpa menulis history atau mengubah sesi.
- Review Fasa 5 menemui Back ketika native snapshot masih berjalan tidak membatalkan overlay/controller lama. Pembatalan sebelum render history destination dan regresi unit/browser sudah ditambah.

## Status fasa

| Fasa | Status |
| --- | --- |
| 1 Discovery | Baseline cerah 5 lebar × BM/EN; screenshot desktop 1440px diperiksa, 360px disimpan tetapi belum diperiksa |
| 2 Tokens/reduced motion | Build lulus; baac8b8f |
| 3 Persistent layout | Build + 34 kontrak/SSR lulus; 5b251502 |
| 4 Stable form slot | Build + 27 kontrak/SSR lulus; e683e1ab; browser mengesahkan heading Y sama pada 5 lebar |
| 5 Form transition | Build, 28 ujian, lint, typecheck pengawal animasi dan browser lulus; commit 0da0e16d |
| 6 Illustration crossfade | Sudah diintegrasi. 23 ujian, typecheck komponen dan build lulus; 3 browser termasuk slow-network/retry lulus; menunggu guard/commit |
| 7 Micro-interactions | AuthError/AuthFormView disediakan, belum diintegrasi atau dijalankan |
| 8 Landing/auth fade | Belum diimplementasi |
| 9 Responsive/helper/background | Belum diimplementasi |
| 10 Verification/polish/audit | Belum selesai |

## Bukti

- Baseline frozen build `receipt-adaptive-build-4a87c44113c2`; 2,503 hash sumber direkodkan. Semua fail aplikasi/config/package sepadan sebelum suntingan.
- Baseline cerah `auth-smooth-tests-d0d764c1038a`, exit0, 26.481s: brand/topbar identity false pada semua lebar. Y login/forgot: 360=311/311; 390=322.4375/322.4375; 412=333/333; 768=275.453125/247; 1440=189.28125/231. CLS yang diperhatikan sudah 0; jangan dakwa penurunan CLS daripada metrik itu.
- Fasa 2 build `receipt-adaptive-build-76b2f7cd4bbb`, lulus 32.343s; guard `auth-smooth-tests-9fd639cb7e52`, lulus.
- Fasa 3 build `auth-smooth-build-e40ee0853e95`, lulus 21.017s; `auth-smooth-tests-364cd6d34063`, 34/34; guard `auth-smooth-tests-51cd6e6bab7e`, lulus.
- Fasa 4 build `auth-smooth-build-c45e333daff0`, lulus 23.343s; `auth-smooth-tests-bff03881761a`, 27/27; guard `auth-smooth-tests-4c6a0b7866e3`, lulus.
- Versi awal Fasa 5 build `auth-smooth-build-fe36701d9e21`, lulus 26.295s; `auth-smooth-tests-6a357498e879`, 10/10 lifecycle; `auth-smooth-tests-6966e7e08989`, lint 11 fail lulus. Binaan ini belum mewakili tambahan arrival-focus, updateCallbackDone rejection dan external-history cancellation terkini.
- Selepas semua tambahan Fasa 5 itu: `auth-smooth-tests-3d18ad82ecda`, exit0, 4.63s, 28/28 ujian (lifecycle + public auth memory + login navigation contracts), budgetFailure null.
- Lint terkini 11 fail `auth-smooth-tests-5a26eed3bf10`, lulus 9.472s. Typecheck pengawal animasi sahaja `auth-smooth-tests-741569cc0c9b`, lulus 4.141s.
- Typecheck 11 fail `auth-smooth-tests-151aaa8c85b5` benar-benar berjalan tetapi kehabisan heap 384MB (peak cgroup 590,606,336 bait; tiada cgroup OOM). Salinan log host kemudian gagal ENOSPC; summary/stdout/stderr berjaya diperiksa semula di Linux. Ini berbeza daripada dua kegagalan persediaan terdahulu; jangan dakwa semua fail lulus typecheck.
- Build Fasa 5 akhir `auth-smooth-build-2725afded6cb`, lulus 17.17s. Browser `auth-smooth-tests-18dc0565fb13`, 6/6 lulus: anchor 5 lebar, modifier/history, fallback/reduced, rapid native dan Back ketika snapshot dipause. Build akar capture sebelumnya `auth-smooth-build-8e48838296a7` lulus; CSS akhir mengecualikan root capture untuk auth sahaja dan mengekalkan interaksi toolbar.
- Selepas pengecualian root itu, `auth-smooth-tests-5bf11d5b9766`, 2/2 native/history lulus 13.804s. Durasi CSS native masuk 340ms (termasuk delay80), keluar140ms; jarak10px/6px. Durasi API start→finished ialah metrik berasingan dan masih perlu laporan prestasi akhir, bukan bukti CSS sahaja.
- Y heading login/forgot selepas Fasa 5: 360=387/387; 390=398.4375/398.4375; 412=409/409; 768=183/183; 1440=195/195. Identiti brand/toolbar kekal pada semua lebar. Header telefon masih tinggi dan ilustrasi masih dipaparkan sehingga Fasa 9.
- Guard Fasa 5 `auth-smooth-tests-86d0bc9bc574`, lulus; tree disamakan sebelum commit 0da0e16d.
- Baseline dark tambahan `auth-smooth-tests-a9bfee2ff2ff`, lulus 22.976s; empat screenshot before dark dikumpul. Desktop login dark diperiksa; baseline mobile belum diperiksa.
- Fasa 6 awal: 23 ujian `auth-smooth-tests-1aac3018f21d`, lint `auth-smooth-tests-4266b69e1899`, typecheck artwork `auth-smooth-tests-9a77430f393e`, build `auth-smooth-build-128c5715afd9`, semuanya lulus. Browser gated artwork `auth-smooth-tests-6301817488d0`, lulus 18.885s; gambar desktop dark recovery/light login diperiksa. Ini belum layout akhir Fasa 9.
- Ujian retry pertama `auth-smooth-tests-8737e061eaa4` gagal pada SETUP kerana preload+img membuat dua request; fixture fail-sekali tidak cukup. Jangan tafsir sebagai bukti bug aplikasi. Selepas semua request awal digagalkan sehingga revisit sengaja, RED sebenar `auth-smooth-tests-2c41c45c5cb9` gagal pada stage light-revisit: 2 request awal gagal, Dark berjaya, kembali Light tidak membuat request baharu.
- Pembaikan: kegagalan tidak disenarai hitam selamanya; revisit tema boleh retry sumber yang gagal, termasuk rendered URL masih sama selepas kedua-dua tema gagal. Rujukan imej mengekalkan DOM node; render biasa/failure tidak menyebabkan loop retry. Satu isu exactOptionalPropertyTypes pada ref map dikesan dan dibetulkan kepada record nullable; tiada kelemahan typecheck ditambah.
- Fasa 6 selepas pembaikan: typecheck `auth-smooth-tests-5ca4f8404d93` lulus 3.615s; SSR/kontrak `auth-smooth-tests-fe6d324808d8` 23/23; build `auth-smooth-build-abc91cf8040d` lulus 17.169s; browser `auth-smooth-tests-50ddea148aed`, 3/3 lulus 27.156s (latency-gated normal, retry Dark berjaya, retry kedua-dua tema gagal).
- Profil rangkaian browser dinyatakan tepat: latency150ms, download200000B/s, upload93750B/s. Gating memastikan keadaan pending dapat diperiksa; jangan dakwa preset DevTools tertentu. Imej asal/dimensi/decode, frame/node sama, CLS0 dan opacity transition sebenar360ms disahkan. Toolbar diuji ketika native form snapshot masih berjalan.
- Dua typecheck fokus terdahulu gagal ENOSPC pada persediaan host sebelum TypeScript bermula. Tiada hasil TypeScript daripada percubaan itu. Belum ada bukti browser selepas pembaikan.

## Sambung dan had keselamatan

- Semua target build/test/browser dalam WSL/bwrap sedia ada, data sintetik, had asal CPU100%, RAM768MiB/high704, swap0, PID128, tmp256MiB, CPU120s/wall180s. Tiada instalasi atau peningkatan had.
- Helper: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/auth-smooth-20261113`. `sandbox.cjs` menyokong build/tests/lint/types-focused/browser/hooks; `collect.cjs <receipt>` mengambil bukti bounded. Target mesti bersiri. Binaan mestilah sepadan hash sumber sebelum browser; current-build masih menunjuk versi awal Fasa 5 sehingga build baharu lulus.
- Ujian `auth-smooth-transitions.spec.ts` penuh merangkumi fasa yang belum siap. Jalankan subset Fasa 5 (anchor/fallback/native/links/history) dahulu. Jangan longgarkan penerimaan untuk meluluskan fasa belum siap.
- Guard commit menggunakan staged snapshot sebenar dalam sandbox. Bandingkan tree selepas guard dengan index sebelum host Git commit melalui empty-host-hooks yang sedia ada. Allowlist helper turut membenarkan tepat `scripts/landing-v21-built-browser.mjs` untuk kemas kini selector button→link; pemeriksaan rahsia sebenar kekal. Jangan stage `.agents/`, `.codex/`, `.github/agents|hooks|skills/`, `.impeccable/` atau `.env`.
- Fasa 6 mengekalkan dua imej dalam frame sama dan mula active=null sehingga decode. Pseudo-image, crop/background/position recovery-only dibuang. Fasa 9 masih perlu membetulkan saiz frame desktop yang boleh melebihi tinggi panel dan menyembunyikan art di telefon; jangan dakwa semua layout sudah siap.
- Pakej esbuild Linux tambahan belum tersedia. Jangan muat turun tanpa arahan sesuai. Frontend Vite build terdahulu lulus, tetapi ia bukan full backend/release build.

## Insiden ruang

C: berulang kali 0 bait, menyekat ujian dan penulisan checkpoint penuh. Fail ini sempat dipendekkan kepada checkpoint kecil; versi penuh terdahulu kekal dalam commit e683e1ab. Ruang kira-kira 1GB kemudian diperhatikan tersedia dan pengesahan disambung. Agen tidak memadam fail; jangan dakwa punca ruang baharu tanpa bukti.

Pemadatan VHD/fstrim tidak mencukupi. Pemampatan tanpa kehilangan data pada cache lama membebaskan ruang sementara dengan hash sebelum/selepas sepadan (`cache-compression.json`, `immutable-file-compression.json` di helper). WSL host dikurangkan 1536→1024MB dengan backup; had target kekal. DISM cleanup standard gagal `Incorrect function`; tiada ResetBase atau pembaikan OS.

Empat binary dalam dua runtime.previous-* yang tidak aktif/tidak berkongsi hardlink turut dimampat LZX. Hash semua sepadan, tiada pemadaman; ruang diperhatikan naik47,620,096→195,403,776 bait (~141MiB). Bukti `previous-runtime-compression.json`. Tiga VSIX lama kemudian diperhatikan sudah tiada; jangan mendakwa agen memadamnya. Pagefile Windows membesar semasa typecheck, jadi ruang yang tersedia masih perlu dipantau.

Pengguna sudah membenarkan cleanup. Namun semakan kelulusan automatik menolak pemadaman cache browser dan tiga VSIX lama dengan `blocked by policy`; jangan memintas melalui API lain. Tiga cache di `AppData/Roaming/Code/CachedExtensionVSIXs` dikenal pasti (~982MiB): `.d00c1d92-d3fe-4100-a68f-3e4a09e96891`, `openai.chatgpt-26.908.40401-win32-x64`, `anthropic.claude-code-2.1.263-win32-x64`. Tiada data SQR, .env, resit/PDF/Excel, Downloads atau SQLite/WAL Codex disentuh.

Goal kekal aktif. Fasa 5–10 dan pengesahan akhir belum lengkap; tiada push/deploy.
