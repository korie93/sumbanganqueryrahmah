# AEON Branches Import

Fail ini disediakan untuk bantu anda isi dan import data `AEON Credit Service` ke dalam:

- `public.aeon_branches`
- `public.aeon_branch_postcodes`

## 1. Isi CSV

Gunakan fail:

- `data/aeon_branches_template.csv`

Kolum yang perlu diisi:

- `name`
- `branch_address`
- `phone_number`
- `fax_number`
- `cdm_available`
- `business_hour`
- `day_open`
- `atm_cdm`
- `inquiry_availability`
- `application_availability`
- `aeon_lounge`
- `branch_lat`
- `branch_lng`
- `postcode`
- `state`

Penting:

- `branch_lat` dan `branch_lng` mesti diisi.
- `postcode` sangat digalakkan untuk lookup cawangan terdekat.
- `phone_number` ialah nombor telefon cawangan.
- `fax_number` ialah nombor fax cawangan.
- `cdm_available` boleh diisi dengan `Ya` atau `Tidak`.
- `atm_cdm` boleh diisi jika anda mahu keterangan lebih khusus seperti `ATM sahaja`, `ATM + CDM`, atau `Tiada CDM`.
- Simpan fail dalam format UTF-8 CSV.

## 2. Import ke PostgreSQL

Jika anda ada `psql`, gunakan:

```sql
\set csv_path 'C:/Users/Administrator/Desktop/sumbanganqueryrahmah/data/aeon_branches_template.csv'
\i C:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/sql/import_aeon_branches_template.sql
```

## 3. Apa script SQL ini buat

- baca CSV ke temporary table
- `upsert` ke `public.aeon_branches` ikut nama cawangan
- `upsert` ke `public.aeon_branch_postcodes` ikut postcode

## 4. Semakan ringkas selepas import

Contoh semakan:

```sql
SELECT COUNT(*) FROM public.aeon_branches;
SELECT name, branch_lat, branch_lng FROM public.aeon_branches ORDER BY name LIMIT 20;
```

## 5. Nota

- Dataset ini belum disediakan secara rasmi dalam repo sekarang.
- Template ini tidak menukar code aplikasi semasa.
- Anda boleh isi branch sebenar dahulu, kemudian baru import.
