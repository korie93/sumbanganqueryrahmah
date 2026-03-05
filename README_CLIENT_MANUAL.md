# SQR Client User Manual

Dokumen ini ialah manual penggunaan sistem **SQR (Sumbangan Query Rahmah)** untuk pengguna akhir.

## 1. Tujuan Sistem
SQR digunakan untuk:
- import data (CSV/Excel),
- simpan dan lihat semula data,
- carian data (simple/advanced),
- analisis dan pemantauan sistem,
- audit dan aktiviti pengguna,
- pengurusan keselamatan akaun.

## 2. Peranan Pengguna
Sistem mempunyai 3 peranan:
- `superuser`
- `admin`
- `user`

### Ringkasan akses

| Modul | superuser | admin | user |
|---|---|---|---|
| Home | Ya | Ya (ikut tetapan) | Ya (ikut tetapan) |
| Import | Ya | Ya (ikut tetapan) | Ya (ikut tetapan) |
| Saved | Ya | Ya (ikut tetapan) | Ya (ikut tetapan) |
| Viewer | Ya | Ya (ikut tetapan) | Ya (ikut tetapan) |
| Search (General Search) | Ya | Ya | Ya |
| System Monitor | Ya | Ya (ikut tetapan) | Ya (ikut tetapan) |
| Backup (lihat senarai) | Ya | Ya | Ya (read-only) |
| Backup create/restore/delete | Ya | Ya | Tidak |
| Settings (System Settings) | Ya | Ya (ikut permission setting) | Tidak (hanya Account Security) |
| Account Security (own account) | Ya | Ya | Ya |
| User Credential Management (admin/user lain) | Ya | Tidak | Tidak |
| Rename/Delete import | Ya | Tidak | Tidak |
| Viewer export (CSV/PDF/Excel) | Ya | Tidak | Tidak |
| Audit logs view | Ya | Ya | Ya (ikut tab setting) |
| Audit logs cleanup | Ya | Tidak | Tidak |
| Activity kick session | Ya | Ya | Tidak |
| Activity ban/unban | Ya | Tidak | Tidak |

Nota:
- Akses tab boleh dihidup/matikan oleh superuser melalui Settings.
- Jika banyak tab dimatikan, user/admin mungkin hanya nampak Search.

## 3. Mula Guna (Semua Pengguna)
1. Buka URL sistem SQR pada browser.
2. Login menggunakan `username` dan `password`.
3. Pilih menu melalui navbar:
   - `Home`, `Import`, `Saved`, `Viewer`, `Search`, `System Monitor`, `Settings`, `Backup`.
4. Klik `Logout` bila selesai.

## 4. Tingkah Laku Keselamatan Sesi
- Sistem ada auto logout ikut tempoh idle (tetapan runtime).
- Sesi boleh tamat jika:
  - user idle terlalu lama,
  - user di-`kick` oleh moderator,
  - user di-`ban`,
  - password akaun ditukar.
- Jika password ditukar:
  - **self change**: sesi semasa ditamatkan, perlu login semula.
  - **superuser reset password user lain**: sesi user sasaran akan dipaksa logout.

## 5. Modul dan Cara Guna

## 5.1 Import Data
Fail yang disokong:
- `.csv`
- `.xlsx`
- `.xls`
- `.xlsb`

Aliran:
1. Buka tab `Import`.
2. Pilih fail (single) atau beberapa fail (bulk import).
3. Semak preview data.
4. Simpan import.
5. Buka tab `Saved` untuk lihat hasil.

Tips:
- Pastikan header kolum betul.
- Fail Excel yang rosak atau password-protected akan ditolak.

## 5.2 Saved Imports
Fungsi:
- lihat semua import,
- cari/filter ikut nama/tarikh,
- buka Viewer,
- buka Analysis.

Aksi khas:
- `superuser` sahaja: `Rename` dan `Delete` import.

## 5.3 Viewer
Fungsi:
- paparan row data terperinci,
- search dalam dataset (minimum 2 aksara),
- column filter,
- pilih kolum untuk dipaparkan,
- pilih row tertentu.

Aksi khas:
- `superuser` sahaja: export `CSV`, `PDF`, `Excel`.

Nota prestasi:
- dataset besar guna virtual rendering untuk paparan lebih lancar.

## 5.4 General Search
Mode:
- `Simple Search`: keyword terus.
- `Advanced Search`: filter berbilang kolum dengan operator.

Ciri:
- pagination result,
- had result ikut tetapan sistem.

Perbezaan role:
- `superuser/admin` boleh lihat kolum `Source File`.
- `user` tidak nampak `Source File`.

## 5.5 System Monitor
Seksyen:
- `Dashboard` (ringkasan analytics),
- `Activity` (aktiviti user/sesi),
- `System Performance` (status runtime),
- `Analysis`,
- `Audit Logs`.

Akses sebenar ikut:
- role pengguna,
- tetapan tab visibility oleh superuser.

## 5.6 Backup
Fungsi umum:
- lihat senarai backup,
- cari/filter backup,
- export senarai backup.

Hak tindakan:
- `admin/superuser`: create, restore, delete backup.
- `user`: lihat sahaja (read-only).

## 5.7 Settings
Untuk `admin/superuser`:
- boleh buka kategori system settings (General, Security, AI & Search, Data Management, Backup & Restore, Roles & Permissions, System Monitoring),
- sesetengah setting mungkin read-only ikut permission.

Untuk `user`:
- hanya seksyen **Account Security**.

## 6. Account Security (Semua Role)
Lokasi:
- `Settings` > kategori `Security` > `Account Security`.

## 6.1 Tukar Username (Own Account)
1. Isi username baru.
2. Klik `Change Username`.

Rules:
- 3 hingga 32 aksara.
- Hanya: huruf, nombor, `_`, `.`, `-`.
- Mesti unik (case-insensitive).

## 6.2 Tukar Password (Own Account)
1. Isi `Current Password`.
2. Isi `New Password`.
3. Isi `Confirm Password`.
4. Klik `Change Password`.

Rules:
- minimum 8 aksara,
- mesti ada sekurang-kurangnya 1 huruf dan 1 nombor,
- tidak boleh sama dengan password lama.

Kesan:
- selepas berjaya, user perlu login semula.

## 7. User Credential Management (Superuser Sahaja)
Lokasi:
- `Settings` > `Security` > `User Credential Management`.

Fungsi:
- kemaskini `username` dan/atau `password` untuk akaun role `admin` atau `user`.

Tidak dibenarkan:
- admin ubah credential user lain,
- user ubah credential orang lain,
- superuser ubah credential superuser lain melalui panel ini.

Kesan bila superuser reset password target:
- sesi aktif target ditamatkan (force logout).

## 8. Manual Mengikut Role

## 8.1 Superuser SOP
Cadangan rutin:
1. Login.
2. Semak `System Monitor` (Dashboard + Activity + Performance).
3. Semak `Audit Logs`.
4. Urus tab visibility / policy di `Settings`.
5. Semak backup status.
6. Lakukan backup berkala.

Tanggungjawab utama:
- urus sistem settings kritikal,
- urus credential admin/user,
- ban/unban user bermasalah,
- kawal akses tab untuk admin/user,
- buat cleanup audit log jika perlu.

## 8.2 Admin SOP
Cadangan rutin:
1. Login.
2. Import data baru jika ada.
3. Semak Saved + Analysis.
4. Guna Monitor untuk semak aktiviti/performance.
5. Buat backup sebelum perubahan besar.

Boleh buat:
- import/saved/viewer/search/analysis,
- kick sesi user,
- create/restore/delete backup,
- ubah sebahagian system settings (ikut permission).

Tidak boleh:
- urus credential user lain,
- ban/unban user (polisi superuser sahaja),
- rename/delete import (superuser sahaja),
- cleanup audit logs.

## 8.3 User SOP
Cadangan rutin:
1. Login.
2. Guna Search untuk cari data.
3. Jika dibenarkan tab, guna import/saved/viewer/analysis asas.
4. Kemas kini username/password sendiri di Account Security bila perlu.

Tidak boleh:
- ubah system settings,
- urus user lain,
- backup restore/delete,
- aksi moderation user lain.

## 9. Kod Ralat Credential Yang Biasa
Semasa tukar credential, sistem boleh pulangkan kod berikut:
- `USERNAME_TAKEN`
- `INVALID_PASSWORD`
- `INVALID_CURRENT_PASSWORD`
- `PERMISSION_DENIED`
- `USER_NOT_FOUND`

Maksud umum:
- `USERNAME_TAKEN`: username sudah digunakan.
- `INVALID_PASSWORD`: password baru lemah / tidak ikut polisi / sama seperti lama.
- `INVALID_CURRENT_PASSWORD`: current password salah.
- `PERMISSION_DENIED`: role tidak dibenarkan untuk aksi tersebut.
- `USER_NOT_FOUND`: user sasaran tiada.

## 10. Troubleshooting Ringkas

### Tidak boleh login
- Semak username/password.
- Pastikan akaun tidak diban.
- Jika baru tukar password, login semula dengan password baru.

### Tiba-tiba logout
- Sesi mungkin idle timeout.
- Sesi mungkin di-kick admin/superuser.
- Password mungkin telah direset.

### Tab tidak muncul
- Tab mungkin dimatikan oleh superuser di Roles & Permissions.

### Tidak boleh buat action walaupun butang ada
- Semak role dan polisi semasa.
- Sesetengah endpoint hanya benarkan superuser.

### Search perlahan
- Kurangkan keyword terlalu umum.
- Gunakan Advanced Search dengan filter yang tepat.

## 11. Amalan Terbaik Operasi
- Buat backup sebelum operasi besar (import massal, restore, cleanup).
- Guna password kuat dan tukar secara berkala.
- Elakkan kongsi akaun antara staf.
- Audit log disemak secara berkala untuk kesan aktiviti luar biasa.
- Untuk data besar, guna filter dan pagination untuk prestasi lebih baik.

## 12. Versi Dokumen
- Nama: `README_CLIENT_MANUAL.md`
- Tujuan: Manual pengguna client
- Kemaskini: selari dengan implementasi role `superuser/admin/user` semasa.

