# Pembetulan CI client tests selepas polish layout

Status: pembetulan dan pengesahan lokal selesai. Empat punca/kontrak diselaraskan dalam lima fail ujian; 18 ujian terfokus serta 2,610 ujian dalam keseluruhan inventori client lulus. Tiada perubahan kod production. Keputusan GitHub selepas push perlu disahkan berasingan.

## Bukti CI

[CI run 42239259406, job build-and-test](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/42239259406/job/127964905819) pada commit `7f7782cc2a40993f8b39f536cbfbe39abd976093` gagal di langkah **Run client tests**: 1,142 ujian, 1,140 lulus dan 2 gagal. Ini keputusan kelompok pertama daripada tiga (237 fail); kelompok selebihnya belum dijalankan selepas kegagalan itu. Node CI ialah 24.22.2.

1. `client/src/app/scroll-fade-contract.test.ts` masih mewajibkan kelas `scroll-fade-y` pada AIConversationCard. Mask itu sengaja dibuang supaya teks chat tidak pudar. Kontrak lima senarai lain dikekalkan; AI kini mempunyai kontrak khusus untuk log yang boleh difokus/skrol tanpa fade atau mask.
2. `client/src/pages/backup-restore/backup-filters-layout.test.ts` mengimport komponen secara statik, yang kini mencapai `Calendar → calendar.css`. Node SSR menolak import CSS dengan `ERR_UNKNOWN_FILE_EXTENSION` sebelum assertion dijalankan. Ujian kini mendaftarkan loader CSS sedia ada dengan `await`, kemudian menggunakan dynamic import komponen, konsisten dengan ujian SSR Viewer/Forbidden/Collection. Semua assertion Backup lama dikekalkan.
3. Semakan terhadap ujian yang belum dicapai CI mereplikasi kegagalan `settings-role-sections-contract.test.ts`: ia masih memerlukan `sticky top-3`. Kontrak kini memerlukan offset `calc(var(--workspace-topbar-height)+var(--spacing-3))`, seperti pembetulan toolbar yang telah diluluskan, supaya toolbar tidak berada di belakang topbar.
4. Semakan yang sama mereplikasi kegagalan `collection-decorative-icons-a11y-contract.test.ts`: literal kelas ikon Filter menolak tambahan `shrink-0`. Ujian kini memeriksa kehadiran Filter/RotateCcw, `aria-hidden="true"` dan semua kelas asal `mr-2`, `h-4`, `w-4` tanpa mengunci urutan atau menolak kelas layout tambahan. Kontrak consumer lain tidak berubah.

Semakan luas turut mereplikasi ralat CSS yang sama pada `client/src/pages/collection-records/tests/edit-collection-dialog-layout.test.ts`. Loader didaftarkan sebelum dynamic import kedua-dua DatePickerField dan EditCollectionRecordDialog; import props kekal type-only. Semua 10 assertion/senario asal dialog lulus selepas pemuatan ujian dibetulkan. Audit teks graf import terhadap 1,930 fail client tidak menemui lagi laluan static import `.test.ts` ke tiga stylesheet baharu yang belum ditangani.

## Replikasi dan pengesahan

Semua pelaksanaan berada dalam bwrap WSL SQR-Audit dengan had asal. Harness terfokus kali ini tidak mempunyai stub CSS global; ini penting kerana stub lama menyembunyikan ralat kedua. Tiada dependency dimuat turun atau dipasang.

- BEFORE: `receipt-adaptive-tests-3b9a8c8632e9` mereplikasi kedua-dua kegagalan CI, 1 lulus / 2 gagal.
- AFTER: `receipt-adaptive-tests-95d0e99b40de` lulus4/4, termasuk kontrak AI baharu dan assertion buka/tutup Backup yang asal.
- Replikasi dua kontrak tambahan: `receipt-adaptive-tests-ad6026ff7086`, 2 lulus / 2 gagal.
- Selepas empat pembetulan: `receipt-adaptive-tests-038d55471f3c`, 8/8 lulus.
- Replikasi CSS dialog edit: kelompok `receipt-adaptive-tests-8158870df865`, 198 lulus / 1 gagal semasa bootstrap fail dialog. Selepas loader dibetulkan: `receipt-adaptive-tests-c36e8dd676b6`, 10/10 lulus.
- Senarai ujian client CI mempunyai 524 fail `.test.ts`. Semakan luas menggunakan inventori yang sama, dijalankan secara bersiri dalam kelompok 24–48 fail untuk mematuhi had sandbox. Resit driver: `ci-client-layout-fix-suite-*.json` dalam harness `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105`.

Keputusan akhir:

| Semakan | Keputusan / bukti |
|---|---|
| Seluruh inventori client | 524 fail, 2,610 lulus, 0 gagal atau dilangkau |
| Resit suite akhir | `ci-client-layout-fix-suite-1793980613192.json`, 15 kelompok yang lulus; kelompok lama yang dihentikan/gagal tidak dikira sebagai bukti akhir |
| Lint lima fail | Lulus, `receipt-adaptive-tests-350fa3a5e249` |
| TypeScript semantik lima fail | Lulus dengan pilihan compiler CI asal, `receipt-adaptive-tests-e8f737ac7715` |
| Diff whitespace | Lulus |

Pembaca `verify-client-ci-fix.cjs` membandingkan inventori dengan semua resit yang lulus, mengesahkan fingerprint setiap fail ujian yang dijalankan serta sumber aplikasi, dan menyimpan bukti lokal dalam `ci-client-layout-fix-verification.json` di harness. Semakan lokal tidak menggantikan pengesahan workflow sebenar.

Node sandbox ialah 24.22.1. Binary esbuild Linux untuk CLI tsx belum tersedia di sandbox; semakan lokal menggunakan TypeScript terpasang untuk transpile, dengan test runner Node sebenar dan loader CSS khusus ujian. Ini bukan pelaksanaan literal `npm run test:client` melalui tsx. Keputusan GitHub sebenar selepas push tetap perlu disahkan.

Fail production, UI, CSS, backend, permission, workflow dan dependency tidak diubah. Ujian browser tidak diulang kerana rendering tidak berubah; bukti render versi aplikasi yang sama berada dalam `docs/ui-ai-chat-no-copy.md`.
