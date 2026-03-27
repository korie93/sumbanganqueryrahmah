# SMTP Secret Incident Response

Gunakan panduan ini jika kredensial SMTP pernah terdedah dalam sejarah Git atau repo awam.

## 1. Anggap Rahsia Itu Sudah Bocor

Jangan anggap kebocoran itu selamat hanya kerana fail sudah dipadam daripada branch semasa.

Jika secret pernah berada pada:

- commit lama
- branch lama
- pull request lama
- artifact CI lama
- fork awam

maka secret itu mesti dianggap telah terdedah.

## 2. Tindakan Segera

Lakukan semua ini secepat mungkin:

1. revoke atau padam kredensial SMTP lama
2. jika guna Google App Password, padam App Password itu terus
3. cipta kredensial SMTP baharu
4. kemas kini secret pada production server sahaja
5. kemas kini mana-mana GitHub Actions secret atau deploy secret store jika digunakan

## 3. Pembersihan History Git

Perubahan kod semasa sahaja tidak cukup jika secret sudah pernah masuk sejarah repo.

Anda masih perlu:

1. rewrite history untuk buang fail atau literal secret daripada semua ref berkaitan
2. force-push branch yang telah dibersihkan
3. force-push tag jika ada
4. tutup atau refresh branch/fork lama yang masih menyimpan commit tercemar

Jika kebocoran datang daripada fail seperti `.env`, pendekatan biasa ialah `git filter-repo`.

Contoh konsep:

```bash
git filter-repo --path .env --invert-paths
git push --force --all
git push --force --tags
```

Jika secret terdedah sebagai literal dalam fail lain, gunakan `--replace-text` atau pendekatan setara untuk menggantikan nilai itu di seluruh history.

## 4. Semakan Selepas Rewrite

Selepas rewrite history:

1. semak semula `git log --all -- .env`
2. semak fail lama yang pernah terlibat seperti `INSTALL.bat` atau `START.bat`
3. semak branch remote yang masih wujud
4. semak PR lama yang mungkin masih cache diff lama

## 5. Kerasan Repo Semasa

Repo ini sekarang sepatutnya ikut amalan berikut:

- tiada hardcoded SMTP password dalam kod
- `.env` tidak ditrack
- `.env.example` hanya mengandungi placeholder
- startup akan fail di environment bukan-local jika config SMTP separuh siap
- repo hygiene check akan fail jika ada `SMTP_PASSWORD=` sebenar atau `nodemailer auth.pass` literal yang dikomit

## 6. Apa Yang Perlu Diingat

Walaupun history sudah dibersihkan, anda tetap perlu rotate secret.

History rewrite tidak membatalkan hakikat bahawa:

- secret mungkin sudah dibaca orang lain
- secret mungkin sudah diindeks
- secret mungkin sudah muncul dalam fork, cache, atau clone lama

## 7. Ringkasan

Urutan pemulihan yang betul:

1. revoke secret lama
2. keluarkan secret daripada history
3. force-push history baharu
4. kemas kini secret production
5. semak repo dan CI semula
