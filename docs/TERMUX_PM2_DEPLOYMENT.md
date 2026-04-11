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
      script: "npm",
      args: "start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "5000",
      },
      max_memory_restart: "768M",
      restart_delay: 5000,
      kill_timeout: 30000,
      listen_timeout: 10000,
      time: true,
    },
  ],
};
```

Simpan secret sebenar dalam `.env`, bukan dalam ecosystem file.

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

Setiap kali pull kod baru:

```bash
git pull origin main
npm ci
npm run build
pm2 restart sqr --update-env
```

Jika anda ubah `.env`, gunakan `--update-env` supaya process ambil nilai terbaru.
