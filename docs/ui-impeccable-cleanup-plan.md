# Pembersihan folder projek yang telah disemak

**Kemas kini 5 November 2026:** pengguna mengesahkan pemadaman manual telah selesai. Lokasi sasaran kini tiada; ruang bebas awal selepas itu sekitar1.35GB dan ujian sandbox berjaya disambung. Agen tidak menjalankan pemadaman alternatif. Senarai di bawah ialah rekod sejarah, bukan arahan untuk memadam sekali lagi.

4 November 2026. Arahan pengguna: buang benda tidak penting di dalam folder projek.

Semakan kelulusan automatik menolak pemadaman dengan sebab `blocked by policy`. **Tiada folder di bawah telah dipadam oleh agen.** Jangan cuba memintas penolakan melalui Node, .NET, shell lain atau automasi GUI.

Sasaran manual: hanya 21 folder profil Chrome ujian sementara, kira-kira 1.3 GB. Semakan mendapati tiada reparse point, tiada proses Chrome/Edge menggunakannya, tiada fail tracked Git, dan skrip `perf-probe.mjs` mencipta profil ini untuk server localhost. Tarikh terakhir: 28 September–1 Oktober 2026.

Dalam Explorer, buka dua lokasi berikut. Pilih **hanya folder yang namanya bermula `chrome-probe-`** dalam senarai ini, kemudian Shift+Delete. Kekalkan semua laporan JSON/log, screenshot dan rujukan reka bentuk di sebelahnya. Downloads, kod, .env, node_modules utama, resit/PDF/Excel, database dan data Collection bukan sasaran.

Lokasi pertama:
`C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/login-lcp-fix/`

- chrome-probe-aplgcg
- chrome-probe-E4xjvq
- chrome-probe-Ej641e
- chrome-probe-G1lGpk
- chrome-probe-jVa7xm
- chrome-probe-kzk9pd
- chrome-probe-mMlrm6
- chrome-probe-nHijYX
- chrome-probe-o46XwZ
- chrome-probe-ordqPp
- chrome-probe-r3LHMT
- chrome-probe-UMrSoe
- chrome-probe-WUuG2e
- chrome-probe-Xo006n

Lokasi kedua:
`C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/landing-v21-reference/`

- chrome-probe-7mSLNw
- chrome-probe-cE4yC8
- chrome-probe-kd1qth
- chrome-probe-ldvfJz
- chrome-probe-YP50u1
- chrome-probe-YTxhRb
- chrome-probe-YWahV0

Selepas pemadaman manual, semak ruang bebas C:. Fail lama `artifacts/ci-38669128827/smoke.zip` sudah dipadam sendiri oleh pengguna lebih awal dan telah disahkan tiada.
