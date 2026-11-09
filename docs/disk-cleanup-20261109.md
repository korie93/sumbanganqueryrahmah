# Rekod ruang cakera lokal — 9 November 2026

Ruang dikurangkan melalui pemampatan LZX native Windows yang telus kepada pembacaan fail. Kandungan fail tidak ditulis semula sebagai arkib ZIP; aplikasi masih menggunakan laluan fail asal. Operasi ini melibatkan fail cache/runtime alat pembangunan dan artifak ujian lokal yang telah dipilih.

## Keputusan

| Kumpulan | Fail unik | Penjimatan ruang pada fail |
| --- | ---: | ---: |
| Pilot fail teks | 1 | 18,993,560 bait |
| Batch fail teks tambahan | 444 | 211,838,984 bait |
| Binari tidak aktif | 79 | 773,404,864 bait |
| Jumlah | 524 | 1,004,237,408 bait |

Terdapat **445 fail teks unik** termasuk pilot. Metadata batch teks mengandungi 445 rekod: 444 pemampatan baharu dan satu fail pilot yang telah dimampatkan. Penjimatan pilot tidak dikira sekali lagi dalam `SavedByFileTotals` batch teks. Metadata binari merekodkan 79 pemampatan baharu. Kedua-dua batch merekodkan sifar ralat.

Semakan SHA-256 sebelum/selepas mengesahkan kandungan kekal sama: 445 semakan fail teks dan 79 semakan binari, dengan `ContentUnchanged: true` bagi kesemua rekod. Pemampatan mengubah penggunaan ruang fizikal, bukan kandungan logik fail.

## Bacaan ruang kosong

Ruang kosong awal dilaporkan sekitar **29 MB** sebelum kerja pemampatan. Bacaan metadata bagi setiap batch ialah:

| Batch | Sebelum | Selepas |
| --- | ---: | ---: |
| Teks tambahan | 36,265,984 bait | 248,406,016 bait |
| Binari | 247,132,160 bait | **1,022,279,680 bait** |

Bacaan terakhir bersamaan kira-kira 975 MiB kosong ketika batch binari selesai. Ruang kosong berubah dengan penggunaan komputer; angka ini bukan jaminan ruang yang masih tersedia selepas itu. Perubahan ruang kosong keseluruhan juga boleh berbeza daripada jumlah penjimatan per fail kerana aktiviti sistem lain.

## Batas tindakan

- **Sifar pemadaman fail.** Percubaan memadam fail trace yang ditetapkan secara tepat ditolak oleh semakan kelulusan automatik dengan sebab `blocked by policy`; pemadaman itu tidak dilaksanakan dan tidak dicuba melalui laluan lain.
- Tiada perubahan pada kod aplikasi SQR, konfigurasi aplikasi, `.env`, resit/gambar/PDF/Excel, data Collection atau database.
- Tiada akses atau perubahan pada server production untuk kerja ruang cakera lokal ini.
- Dokumen ini merekodkan keputusan yang telah diperoleh; penyediaannya tidak menjalankan aplikasi, ujian sasaran, pemampatan atau pemadaman tambahan.

## Bukti lokal

- [Metadata batch teks](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/compression-results-20261109.json): 445 laluan unik, `HashChecks: 445`, `Errors: 0`, `SavedByFileTotals: 211838984`.
- [Metadata batch binari](C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/ui-layout-20261105/binary-compression-results-20261109.json): 79 laluan unik, `HashChecks: 79`, `Errors: 0`, `SavedByFileTotals: 773404864`, `FreeAfter: 1022279680`.

Angka pilot 18,993,560 bait dan bacaan awal sekitar 29 MB berasal daripada rekod operasi pilot; dua fail metadata di atas merekodkan batch susulan.
