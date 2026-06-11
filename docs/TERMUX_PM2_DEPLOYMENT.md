# Termux + PM2 Runtime Setup

Gunakan panduan ini jika anda mengurus server daripada Termux atau mahu simpan konfigurasi runtime dalam cara yang konsisten untuk PM2.

## 1. Simpan Secret Dalam `.env`

Repo ini memuatkan env melalui `dotenv/config`, jadi PM2 tidak perlu menyimpan secret di dalam ecosystem file.

Salin contoh:

```bash
cp .env.example .env
```

Jana secret rawak yang kuat:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Jalankan arahan itu beberapa kali dan isi sekurang-kurangnya nilai berikut dalam `.env`:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=5000

PUBLIC_APP_URL=https://domain-anda.com
CORS_ALLOWED_ORIGINS=https://domain-anda.com
TRUSTED_PROXIES=loopback

SESSION_SECRET=ganti-dengan-secret-random-yang-kuat
TWO_FACTOR_ENCRYPTION_KEY=ganti-dengan-secret-random-yang-berbeza
COLLECTION_PII_ENCRYPTION_KEY=ganti-dengan-secret-random-yang-berbeza

PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=ganti-dengan-password-db
PG_DATABASE=sqr_db
```

`TWO_FACTOR_ENCRYPTION_KEY` dan `COLLECTION_PII_ENCRYPTION_KEY` wajib ada di luar strict local development. Tanpanya runtime akan block startup walaupun anda belum aktifkan 2FA atau rollout penuh PII retirement.

Jika backup dihidupkan, tambah juga:

```dotenv
BACKUP_FEATURE_ENABLED=1
BACKUP_ENCRYPTION_KEY=ganti-dengan-secret-random-yang-berbeza
BACKUP_ENCRYPTION_KEYS=
BACKUP_ENCRYPTION_KEY_ID=
```

## 2. Guna Ecosystem File Tanpa Secret

Salin contoh PM2:

```bash
cp deploy/pm2/ecosystem.config.cjs.example ecosystem.config.cjs
```

Edit `cwd` dalam `ecosystem.config.cjs` supaya menunjuk ke path sebenar project. Contoh:

```js
module.exports = {
  apps: [
    {
      name: "sqr",
      cwd: "/root/apps/sumbanganqueryrahmah",
      script: "dist-local/server/cluster-local.js",
      interpreter: "node",
      wait_ready: true,
      shutdown_with_message: true,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "5000",
        GRACEFUL_SHUTDOWN_TIMEOUT_MS: "10000",
      },
      max_memory_restart: "768M",
      node_args: "--max-old-space-size=600",
      restart_delay: 5000,
      kill_timeout: 10000,
      listen_timeout: 5000,
      time: true,
    },
  ],
};
```

Simpan secret sebenar dalam `.env`, bukan dalam ecosystem file.
PM2 contoh ini menggunakan entrypoint Node terbina terus, bukan wrapper `npm`, supaya `wait_ready` dan `shutdown_with_message` berfungsi. Jalankan `npm run build` sebelum `pm2 start` atau `pm2 restart`.
Untuk tuning `max_memory_restart`, Node heap, dan jumlah worker, ikut [Deployment Sizing Guide](DEPLOYMENT-SIZING-GUIDE.md).

## 3. Build dan Start

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Semak log:

```bash
pm2 status
pm2 logs sqr --lines 100
```

## 4. Kekalkan Selepas Reboot

### Jika server anda ialah Linux/VPS biasa

Jalankan:

```bash
pm2 startup
pm2 save
```

PM2 akan tunjuk satu arahan tambahan. Salin dan jalankan arahan itu tepat seperti dipaparkan, kemudian ulang:

```bash
pm2 save
```

### Jika anda benar-benar host app terus dalam Termux pada Android

`.env` tetap kekal pada disk, tetapi PM2 tidak akan auto-start selepas reboot telefon tanpa bantuan tambahan.

Pilihan biasa:

1. Pasang aplikasi `Termux:Boot`
2. Cipta folder boot script:

```bash
mkdir -p ~/.termux/boot
```

3. Cipta fail `~/.termux/boot/start-sqr.sh`:

```bash
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd /data/data/com.termux/files/home/apps/sumbanganqueryrahmah || exit 1
pm2 resurrect || pm2 start ecosystem.config.cjs
```

4. Jadikan executable:

```bash
chmod +x ~/.termux/boot/start-sqr.sh
pm2 save
```

## 5. Update Deploy Seterusnya

Setiap kali pull kod baru dari branch yang sedang dideploy:

```bash
BRANCH=main
git fetch origin --prune
git switch "$BRANCH" 2>/dev/null || git switch --track "origin/$BRANCH"
git pull --ff-only origin "$BRANCH"
npm ci
npm run build
pm2 restart sqr --update-env
```

Jika anda ubah `.env`, gunakan `--update-env` supaya process ambil nilai terbaru.

Untuk branch pembaikan, tukar baris pertama sahaja, contohnya:

```bash
BRANCH=fix/task-13-split-theme-tokens
```

## 6. Elak Nginx 413 Untuk Import

Tetapan aplikasi production yang disyorkan:

```dotenv
IMPORT_MAX_FILE_SIZE_MB=96
IMPORT_BODY_LIMIT=96mb
IMPORT_PER_USER_ACTIVE_UPLOAD_BYTES=100663296
IMPORT_CSV_MAX_ROWS=100000
IMPORT_MAX_COLUMNS=300
IMPORT_MAX_SHEETS=20
IMPORT_MAX_CELL_LENGTH=5000
```

Nginx perlu sedikit lebih tinggi daripada had fail aplikasi kerana request
multipart turut membawa boundary dan metadata. Dalam blok `server` HTTPS aktif,
pastikan baris ini wujud:

```nginx
client_max_body_size 100M;
```

Semak konfigurasi aktif, uji, kemudian reload:

```bash
sudo nginx -T 2>/dev/null | grep -n "client_max_body_size"
sudo nginx -t
sudo systemctl reload nginx
sudo nginx -T 2>/dev/null | grep -n "client_max_body_size"
```

Jika output masih menunjukkan `1m`, `1M`, atau nilai kecil pada blok domain
SQR, edit fail yang dipaparkan oleh `sudo nginx -T`, bukan salinan config yang
tidak diaktifkan. Selepas reload, uji import CSV, XLSX, dan XLSB menggunakan
fail melebihi 1 MB tetapi di bawah 96 MB.
