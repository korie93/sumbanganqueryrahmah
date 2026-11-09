# Artifacts — sasaran pembersihan yang disemak

9 November 2026. **Inventori sejarah sebelum pembersihan manual; bukan senarai semasa untuk terus dipadam.** Sebahagian calon kemudian telah dipadam pengguna. Semak kewujudan dan kandungan semula sebelum tindakan baharu. Keputusan pemampatan susulan direkodkan dalam docs/disk-cleanup-20261109.md.

Semakan asal sahaja; agen tidak melakukan pemadaman. Ketika inventori dibuat, folder artifacts mengandungi 3,621,098,471 bait fail (sekitar 3.62 GB); 2,185 item aras teratas, tiada read error atau reparse point. Kandungan artifacts tidak tracked Git dan tidak semestinya boleh dipulihkan selepas dipadam.

Sasaran di bawah ialah output ujian lama atau cache browser. Jumlah saiz fail sekitar 1.05 GB (998 MiB). Ruang sebenar yang kembali boleh lebih kecil jika fail telah dimampatkan. Tiada proses Chrome/Edge/Node/PostgreSQL berdaftar dengan laluan folder calon semasa semakan. Ujian UI baharu yang sedang tertangguh berada di harness berasingan, bukan folder lama ini.

## Kekalkan

- frontend-redesign/final-I8mHIZ (bukti smoke berjaya yang dirujuk dokumen CI) dan final-QIb5SM (hasil terbaru yang kecil).
- approved-release-*, production-release-*, deploy-* sehingga arkib keluaran semasa dan rollback disahkan; kekalkan manifest/hash dan laporan deployment.
- Eksport PDF/Excel/fixture resit di collection-save-access-*, receipt-ui-audit dan mana-mana fail yang sumber datanya belum diketahui.
- Source/prototype/reference asal, termasuk account-management-option-1/{src,public,scripts,tests}, sidebar-q/reference dan aset rujukan dalam collection-reference-20261015.
- Fail security/provenance atau kunci yang asal-usulnya belum disemak.

Senarai cleanup lama dalam docs/ui-impeccable-cleanup-plan.md ialah sejarah: 21 chrome-probe-* dan ci-38669128827/smoke.zip sudah dipadam pengguna. Jangan mengira saiznya semula.

## Sasaran tepat

Pilih hanya item yang disenaraikan. Untuk v9-final-smoke, calon hanyalah trace.zip, bukan seluruh folder eksport. Untuk sidebar-q, kekalkan reference dan laporan final selain folder kegagalan/sampling di bawah.

### Baseline screenshot lama frontend-redesign — 250.6 MB

- [frontend-redesign/baseline-0aeRip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-0aeRip)
- [frontend-redesign/baseline-0PqUak](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-0PqUak)
- [frontend-redesign/baseline-1hJYsm](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-1hJYsm)
- [frontend-redesign/baseline-34Y0q7](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-34Y0q7)
- [frontend-redesign/baseline-41KHxu](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-41KHxu)
- [frontend-redesign/baseline-5K9qOO](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-5K9qOO)
- [frontend-redesign/baseline-6hFx2f](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-6hFx2f)
- [frontend-redesign/baseline-8qcvrK](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-8qcvrK)
- [frontend-redesign/baseline-97nDQE](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-97nDQE)
- [frontend-redesign/baseline-aCtyWW](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-aCtyWW)
- [frontend-redesign/baseline-aJ8hrd](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-aJ8hrd)
- [frontend-redesign/baseline-bNu1BC](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-bNu1BC)
- [frontend-redesign/baseline-Ch2z08](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-Ch2z08)
- [frontend-redesign/baseline-cV2A6g](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-cV2A6g)
- [frontend-redesign/baseline-ediRau](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-ediRau)
- [frontend-redesign/baseline-F9CmAP](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-F9CmAP)
- [frontend-redesign/baseline-gLv4OP](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-gLv4OP)
- [frontend-redesign/baseline-Izg6dl](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-Izg6dl)
- [frontend-redesign/baseline-JB1wqz](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-JB1wqz)
- [frontend-redesign/baseline-jjsBq4](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-jjsBq4)
- [frontend-redesign/baseline-khBH8k](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-khBH8k)
- [frontend-redesign/baseline-M5SK1N](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-M5SK1N)
- [frontend-redesign/baseline-mCqlwp](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-mCqlwp)
- [frontend-redesign/baseline-MqcN2s](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-MqcN2s)
- [frontend-redesign/baseline-nKBTKd](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-nKBTKd)
- [frontend-redesign/baseline-nQQaJz](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-nQQaJz)
- [frontend-redesign/baseline-oaDvlu](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-oaDvlu)
- [frontend-redesign/baseline-ow9R4L](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-ow9R4L)
- [frontend-redesign/baseline-Q8J9PP](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-Q8J9PP)
- [frontend-redesign/baseline-rj9X8g](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-rj9X8g)
- [frontend-redesign/baseline-Rkz6l3](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-Rkz6l3)
- [frontend-redesign/baseline-TULNcE](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-TULNcE)
- [frontend-redesign/baseline-U9oyKc](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-U9oyKc)
- [frontend-redesign/baseline-Vc5rp4](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-Vc5rp4)
- [frontend-redesign/baseline-vhAnKo](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-vhAnKo)
- [frontend-redesign/baseline-vLkj0I](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-vLkj0I)
- [frontend-redesign/baseline-W4bqVV](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-W4bqVV)
- [frontend-redesign/baseline-wH5Ion](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-wH5Ion)
- [frontend-redesign/baseline-XAIWED](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-XAIWED)
- [frontend-redesign/baseline-xqV6ma](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-xqV6ma)
- [frontend-redesign/baseline-xWZUy3](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-xWZUy3)
- [frontend-redesign/baseline-Y4yDHG](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-Y4yDHG)
- [frontend-redesign/baseline-ydYK8p](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-ydYK8p)
- [frontend-redesign/baseline-YKvZFD](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-YKvZFD)
- [frontend-redesign/baseline-zhQDed](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/baseline-zhQDed)

### Final rerun lama frontend-redesign — 308.2 MB

- [frontend-redesign/final-1nOoxJ](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-1nOoxJ)
- [frontend-redesign/final-2z98qg](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-2z98qg)
- [frontend-redesign/final-7oC8vY](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-7oC8vY)
- [frontend-redesign/final-c9P0rd](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-c9P0rd)
- [frontend-redesign/final-e4HXoH](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-e4HXoH)
- [frontend-redesign/final-fjoC8y](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-fjoC8y)
- [frontend-redesign/final-jhXECR](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-jhXECR)
- [frontend-redesign/final-TdQHoO](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-TdQHoO)
- [frontend-redesign/final-uBpYJa](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-uBpYJa)
- [frontend-redesign/final-xYOtdt](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-xYOtdt)
- [frontend-redesign/final-Y51bxZ](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-Y51bxZ)
- [frontend-redesign/final-yyl669](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-yyl669)
- [frontend-redesign/final-ZNB5Ag](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/frontend-redesign/final-ZNB5Ag)

### Laporan sidebar kegagalan/sampling — 131.9 MB

- [sidebar-q/motion-first-failure-results](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/sidebar-q/motion-first-failure-results)
- [sidebar-q/motion-prefetch-and-sampling-failure-report](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/sidebar-q/motion-prefetch-and-sampling-failure-report)
- [sidebar-q/motion-prefetch-and-sampling-failure-results](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/sidebar-q/motion-prefetch-and-sampling-failure-results)
- [sidebar-q/motion-split-transition-sampling-results](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/sidebar-q/motion-split-transition-sampling-results)

### Profil Chrome sementara tailwind-v4-smoke — 57.6 MB

- [tailwind-v4-smoke/run-FZWwpj/pagespeed/tmp/chrome-user-data-14744-1791037572367-9222](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/tailwind-v4-smoke/run-FZWwpj/pagespeed/tmp/chrome-user-data-14744-1791037572367-9222)
- [tailwind-v4-smoke/run-hak7tw/pagespeed/tmp/chrome-user-data-15448-1791043436671-9222](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/tailwind-v4-smoke/run-hak7tw/pagespeed/tmp/chrome-user-data-15448-1791043436671-9222)
- [tailwind-v4-smoke/run-Qq3hTO/pagespeed/tmp/chrome-user-data-11648-1791068048062-9222](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/tailwind-v4-smoke/run-Qq3hTO/pagespeed/tmp/chrome-user-data-11648-1791068048062-9222)
- [tailwind-v4-smoke/run-RErGgq/pagespeed/tmp/chrome-user-data-12092-1791043141331-9222](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/tailwind-v4-smoke/run-RErGgq/pagespeed/tmp/chrome-user-data-12092-1791043141331-9222)
- [tailwind-v4-smoke/run-VWouwp/pagespeed/tmp/chrome-user-data-9908-1791037322258-9222](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/tailwind-v4-smoke/run-VWouwp/pagespeed/tmp/chrome-user-data-9908-1791037322258-9222)
- [tailwind-v4-smoke/run-YHcGmb/pagespeed/tmp/chrome-user-data-7524-1791038856740-9222](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/tailwind-v4-smoke/run-YHcGmb/pagespeed/tmp/chrome-user-data-7524-1791038856740-9222)
- [tailwind-v4-smoke/run-ZV4aoc/pagespeed/tmp/chrome-user-data-5736-1791035963843-9222](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/tailwind-v4-smoke/run-ZV4aoc/pagespeed/tmp/chrome-user-data-5736-1791035963843-9222)

### ZIP CI diagnostik lama — 161.9 MB

- [ci-smoke-33815331067.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/ci-smoke-33815331067.zip)
- [diagnostics-10155047266.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/diagnostics-10155047266.zip)
- [diagnostics-10606810998.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/diagnostics-10606810998.zip)
- [diagnostics-10934586579.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/diagnostics-10934586579.zip)
- [release-failed-34233980049.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/release-failed-34233980049.zip)
- [release-verification-33824787873.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/release-verification-33824787873.zip)

### Trace ZIP smoke V9 lama — 87.7 MB

- [v9-final-smoke-2/trace.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/v9-final-smoke-2/trace.zip)
- [v9-final-smoke-4/trace.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/v9-final-smoke-4/trace.zip)
- [v9-final-smoke-5/trace.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/v9-final-smoke-5/trace.zip)
- [v9-final-smoke-6/trace.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/v9-final-smoke-6/trace.zip)
- [v9-final-smoke-7/trace.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/v9-final-smoke-7/trace.zip)
- [v9-final-smoke-8/trace.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/v9-final-smoke-8/trace.zip)
- [v9-final-smoke-9/trace.zip](C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah/artifacts/v9-final-smoke-9/trace.zip)
