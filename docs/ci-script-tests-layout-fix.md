# Pembetulan CI Run script tests selepas polish layout

## Punca yang disahkan

[CI run 42249254186, job build-and-test](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/42249254186/job/127999605756) pada commit `3f7d80c2ee0f57936903fee1fcf96a13b8905f1b` lulus **Run client tests**, kemudian gagal **Run script tests**. Kumpulan MJS mempunyai 841 ujian: 838 lulus, 2 gagal dan 1 dilangkau. Oleh sebab arahan menggunakan `&&`, kumpulan TypeScript belum dijalankan di CI tersebut.

1. `scripts/tests/billing-osp-table-layout.test.mjs`: regex lama mewajibkan teks `D3` dan `ALL` sebagai anak teks terus pada `<th>`. Komponen kini membalut nilai itu dalam `<span data-floating-ai-avoid="true">` untuk mengelakkan launcher AI menutup kandungan. Ujian kini memeriksa teks sel tanpa bergantung pada pembalut tersebut. Ia masih mewajibkan tepat tiga sel pinned, kelas pada elemen `<th>` sendiri, satu scope column, dua scope row, label tepat dan `font-semibold` pada jumlah sistem. Assertion scroll, formula, editing, readonly dan CSS legap dikekalkan.
2. `scripts/tests/tailwind-v4-compatibility.test.mjs`: assertion gradien memeriksa utility `bg-linear-to-br/srgb` yang tidak lagi digunakan oleh markup aplikasi selepas polish AI. Tailwind betul-betul tidak menjana utility yang tidak digunakan. Utility itu kini dinyatakan dalam input `@source inline` fixture ujian, bersama utility probe lain. Assertion asal dikekalkan; tiada safelist atau gradien ditambah pada aplikasi.

Tiada perubahan kod production, backend, data, permission, dependency, workflow atau threshold. Perubahan hanya melibatkan dua fail ujian dan laporan ini.

## Bukti lokal

Semua pelaksanaan kod projek berada dalam bwrap WSL `SQR-Audit` dengan had sandbox asal; tiada dependency baharu dimuat turun.

| Semakan | Keputusan / resit |
|---|---|
| Replikasi dua kegagalan asal | 12 lulus, 2 gagal; `receipt-adaptive-tests-574cc7832098` |
| Selepas dua pembetulan | 14/14 lulus; `receipt-adaptive-tests-f121392da299` |
| Billing, Tailwind, config dan design-token berkaitan | 28/28 lulus; `receipt-adaptive-tests-0692630b8fac` |
| Billing selepas assertion opening-tag diperkukuh | 5/5 lulus; `receipt-adaptive-tests-1af4ea57853d` |
| Kumpulan 10 fail TypeScript skrip | 62 lulus, 1 gagal kerana binary Linux tiada; `receipt-adaptive-tests-1cce14a6578a` |
| Lint kedua-dua fail diubah | Lulus; `receipt-adaptive-tests-5249ae56052d` |

Had pengesahan lokal: esbuild Linux tidak tersedia; Billing menggunakan bootstrap TypeScript terpasang untuk merender komponen production, kemudian menjalankan badan assertion MJS asal tanpa perubahan. Hash badan assertion direkodkan dalam stdout. Satu ujian TypeScript (`system-status-assets.test.ts`, semakan static error documents) memanggil CLI tsx dalam child process dan gagal kerana hanya esbuild Windows tersedia. Tiada assertion ujian itu dilonggarkan, diganti atau dilangkau dalam repositori. Pelaksanaan literal `npm run test:scripts`, termasuk esbuild dan child process tersebut, perlu disahkan dalam GitHub CI Linux selepas push.

Resit, stdout/stderr dan fingerprint sumber lokal berada dalam harness `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105`. Semakan bebas turut mengesahkan kedua-dua pembetulan mengekalkan perlindungan ujian. Keputusan CI selepas push dilaporkan berasingan; keputusan lokal ini bukan dakwaan seluruh workflow telah lulus.
