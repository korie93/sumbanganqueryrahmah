# Eksport pilihan dalam View Rekod Collection

Superuser boleh menanda rekod menggunakan kotak di sebelah nama. Klik nama untuk membuka butiran rekod seperti biasa. Kotak pada tajuk jadual memilih atau menyahpilih halaman semasa sahaja. Pilihan pada halaman lain kekal apabila carian, penapis atau susunan berubah.

Gunakan **Lihat pilihan** untuk mencari atau mengeluarkan rekod. **Export pilihan (ZIP)** memaparkan bilangan rekod, anggaran jumlah bayaran dan bilangan resit sebelum muat turun. Anggaran mengikut rekod semasa pemilihan. Pelayan membaca semula data semasa eksport. Pilihan kekal selepas muat turun atau pembatalan. Pilihan disimpan dalam memori halaman dan dikosongkan apabila halaman dimuat semula, ditinggalkan atau akaun bertukar.

- Selepas **Kosongkan pilihan**, klik **Pulihkan pilihan** untuk mendapatkan semula rekod mengikut turutan asal. Membuat pilihan baharu menggantikan pilihan yang boleh dipulihkan.
- Jika amaun atau bilangan resit berubah, semak nilai sebelum dan selepas bagi rekod terlibat. Selepas pengesahan, pelayan menyemak semula nilai tersebut sebelum menyediakan ZIP. Perubahan seterusnya memerlukan pengesahan baharu.
- Jika fail resit bermasalah, semakan pilihan mengenal pasti transaksi dan, jika diketahui, kedudukan resit seperti **Resit 2 daripada 3**. Buka butiran transaksi untuk menyemaknya atau keluarkan transaksi itu sahaja dan teruskan dengan rekod lain.

## Kandungan muat turun

- `Collection_Selected.xlsx` mengandungi helaian **Collection Records**, **Receipt Index** dan **Export Info**. Setiap transaksi muncul mengikut turutan pemilihan. Dua helaian data mempunyai penapis dan baris tajuk yang dibekukan.
- Nombor akaun, kad, IC dan telefon disimpan sebagai teks supaya sifar awal dan digit panjang kekal. Tarikh dan amaun menggunakan jenis sel Excel yang boleh disusun dan dijumlahkan. Nombor kad penuh diperoleh melalui padanan sumber yang disahkan oleh SQR.
- Pautan pada transaksi membuka resit pertama. **Receipt Index** menyediakan satu pautan bagi setiap resit. Fail dalam folder `Receipts` mengandungi bait asal yang disimpan oleh SQR. Rekod tanpa resit ditandakan **Tiada Resit**.
- `Export_Readme.txt` memberikan arahan penggunaan luar talian dan pengendalian data peribadi. Ekstrak keseluruhan ZIP dan kekalkan Excel bersama folder `Receipts` apabila memindahkan laporan.

## API dan had

`POST /api/collection/export-selected-offline` menerima ID rekod unik. Antara muka turut menghantar `expected`, contohnya `{ "recordIds": ["<uuid>"], "expected": [{ "id": "<uuid>", "cents": 12550, "receipts": 2 }] }`. Setiap ID mesti mempunyai satu anggaran apabila medan ini dihantar. Permintaan lama yang hanya menghantar ID masih disokong. Laluan menggunakan semakan sesi, peranan Superuser, akses tab Collection dan CSRF sedia ada. Semua nilai yang dimasukkan ke dalam ZIP diperoleh daripada pelayan.

Respons 409 `OFFLINE_EXPORT_SELECTION_CHANGED` menyenaraikan ID, amaun dalam sen dan bilangan resit terkini bagi pilihan yang berubah. Respons 409 `INVALID_RECEIPT` boleh memberikan `recordId`, `receiptNumber` (bermula pada 1, atau `null` jika tidak dapat dikenal pasti) dan `receiptCount`. Untuk membuka butiran rekod merentas halaman, `GET /api/collection/export-selected-offline/records/:id` menyemak semula akses Superuser dan merekodkan akses sebelum memulangkan butiran.

Pertanyaan PostgreSQL menggunakan satu transaksi baca sahaja dengan snapshot konsisten. Semakan mengambil kira resit aktif, resit lama yang belum mempunyai baris hubungan dan resit yang telah diarkibkan. Sekiranya sebahagian pilihan sudah tidak tersedia, pelayan memulangkan 409 dan antara muka memaklumkan perubahan pilihan. Resit berdaftar yang hilang, rosak atau tidak sepadan membatalkan keseluruhan ZIP.

| Had | Nilai |
| --- | --- |
| Rekod dan resit bagi satu eksport | 1,000 rekod dan 3,000 resit |
| Saiz resit dan ZIP | 5 MiB setiap resit dan 128 MiB bagi ZIP |
| Kandungan sel Excel selepas pengekodan | 12 MiB bagi setiap helaian |
| Permulaan eksport | 4 seminit bagi setiap akaun dalam satu proses aplikasi |
| Eksport serentak | 1 bagi setiap akaun dan 2 keseluruhan dalam satu proses aplikasi |
| Tempoh permintaan | 120 saat |

Arkib disediakan dalam direktori sementara peribadi sebelum penghantaran dan dibersihkan selepas berjaya, gagal atau dibatalkan. Acara audit `export_selected_offline` merekod ID pelaku, masa, bilangan rekod dan resit, hasil serta tempoh. Workbook dan arkib menggunakan `fflate` yang sudah ada dalam projek.

## Lokasi perubahan

| Bahagian | Fail utama |
| --- | --- |
| Paparan, tindakan dan pemilihan | `client/src/pages/collection/CollectionRecordsPage.tsx`, `client/src/pages/collection-records/CollectionOfflineSelection.tsx`, `CollectionOfflineSelectionDialog.tsx`, `CollectionSelectionCheckbox.tsx`, `collection-offline-selection.ts`, komponen jadual desktop dan kad mudah alih |
| Muat turun dan maklum balas | `client/src/lib/api/collection-records.ts`, `client/src/pages/collection/utils.ts` |
| Kontrak dan kawalan permintaan | `shared/collection-offline-export.ts`, `shared/error-codes.ts`, `server/internal/apiProtection.ts`, `server/routes/collection/collection-offline-export-route.ts`, `collection-report-routes.ts` |
| Rekod dan resit | `server/repositories/collection-record-read-utils.ts`, `collection-offline-export-receipts.ts`, `server/storage-postgres-collection-types.ts` |
| Arkib dan workbook | `server/services/collection/collection-offline-archive.ts`, `collection-offline-workbook.ts`, `client/src/types/xlsx.d.ts` |
| Regresi dan CI | Ujian pilihan dan muat turun dalam `client/src/pages/collection-records/tests/`, ujian servis, laluan HTTP dan PostgreSQL `collection-offline-export*`, `tests/visual/collection-offline-export.spec.ts`, fixture Collection, `scripts/test-auth-recovery-isolated.mjs` dan `.github/workflows/ci.yml` |

## Semakan yang boleh diulang

Gunakan pemasangan dependency mengikut lockfile projek dan data rekaan. Runner PostgreSQL menggunakan kluster sementara tersendiri di localhost. Pada Linux, tetapkan `SQR_AUTH_TEST_PG_BIN` kepada direktori binari PostgreSQL seperti dalam CI.

```sh
npm run lint
npm run typecheck
npm run build
node --import tsx --test server/services/tests/collection-offline-export.test.ts server/routes/tests/collection-offline-export.integration.test.ts
node scripts/test-auth-recovery-isolated.mjs --collection-offline
```

Dalam persekitaran ujian visual SQR, jalankan Playwright untuk `tests/visual/collection-offline-export.spec.ts` dan `tests/visual/collection-polish.spec.ts`. Suite merangkumi kawalan peranan, pilihan merentas halaman, fokus papan kekunci, pembatalan, rekod lapuk, dan paparan 320, 390 serta 1366 px dalam kedua-dua tema.

### Semakan manual Excel Desktop

1. Ekstrak ZIP dan buka `Collection_Selected.xlsx` dalam Microsoft Excel Desktop. Semak nombor akaun dengan sifar awal, susun tarikh dan tapis status CP.
2. Putuskan sambungan rangkaian. Klik **Lihat Resit** pada helaian utama dan pautan resit kedua pada **Receipt Index**. Kedua-duanya perlu membuka fail setempat yang sepadan. Excel mungkin meminta pengesahan sebelum membuka fail.
3. Pindahkan keseluruhan folder yang diekstrak dan ulang semakan pautan. Bandingkan bilangan resit serta jumlah bayaran dengan helaian **Export Info**.
