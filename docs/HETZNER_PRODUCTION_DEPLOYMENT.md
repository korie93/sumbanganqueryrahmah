# Hetzner VPS Production Deployment Guide

Panduan ini menerangkan cara deploy Sumbangan Query Rahmah (SQR) ke satu VPS Hetzner secara selamat dan praktikal.

Sasaran panduan ini:

- 1 VPS
- PostgreSQL pada server yang sama
- Nginx sebagai reverse proxy
- PM2 sebagai process manager
- HTTPS melalui Let's Encrypt
- sekitar 30 pengguna dalaman

Untuk sistem anda sekarang, seni bina ini sesuai sebagai permulaan production yang terkawal.

## 1. Cadangan Spesifikasi Awal

Untuk sekitar 30 pengguna dalaman:

- 2 vCPU
- 4 GB RAM
- 80 GB SSD atau lebih
- Ubuntu 24.04 LTS

Jika anda jangka:

- banyak import Excel besar
- banyak preview resit serentak
- penggunaan AI/Ollama pada server yang sama

maka lebih selamat naik ke 4 vCPU dan 8 GB RAM.

## 2. Topologi Disyorkan

Topologi awal yang ringkas:

1. Internet -> Nginx (HTTPS 443)
2. Nginx -> Node/Express app pada `127.0.0.1:5000`
3. App -> PostgreSQL pada server yang sama

Nota penting:

- jangan expose app Node terus ke internet
- jangan expose PostgreSQL ke public internet jika tidak perlu
- hanya buka port `22`, `80`, dan `443`

## 3. Provision Server

Selepas VPS siap:

1. tambah SSH key
2. login sebagai `root`
3. cipta user deploy
4. matikan password SSH jika boleh
5. hidupkan firewall

Contoh:

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Disyorkan juga dalam `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Kemudian:

```bash
systemctl restart ssh
```

## 4. Firewall

Gunakan `ufw`:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

## 5. Install Dependencies

Login sebagai user `deploy` dan pasang pakej asas:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl unzip nginx certbot python3-certbot-nginx postgresql postgresql-contrib
```

Pasang Node.js 24:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Pasang PM2:

```bash
sudo npm install -g pm2
pm2 -v
```

## 6. Sediakan PostgreSQL

Masuk ke PostgreSQL:

```bash
sudo -u postgres psql
```

Cipta database dan user:

```sql
CREATE USER sqr_app WITH PASSWORD 'ganti-dengan-password-yang-sangat-kuat';
CREATE DATABASE sqr_db OWNER sqr_app;
\c sqr_db
GRANT ALL PRIVILEGES ON DATABASE sqr_db TO sqr_app;
```

Jika anda tidak perlukan sambungan luar, biarkan PostgreSQL listen secara local sahaja.

Semak:

- `/etc/postgresql/*/main/postgresql.conf`
- `/etc/postgresql/*/main/pg_hba.conf`

Cadangan:

- `listen_addresses = 'localhost'`

Kemudian:

```bash
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

## 7. Clone Project

Contoh lokasi:

```bash
mkdir -p /var/www
sudo chown deploy:deploy /var/www
cd /var/www
git clone https://github.com/<org-atau-username>/sumbanganqueryrahmah.git
cd sumbanganqueryrahmah
```

Pasang dependencies:

```bash
npm ci
```

Contoh fail deploy yang boleh anda salin dan ubah suai ada di:

- `deploy/examples/sqr.production.env.template`
- `deploy/nginx/sqr.conf.example`
- `deploy/pm2/ecosystem.config.cjs.example`
- `deploy/systemd/sqr.service.example`

Semasa menyalin contoh ini, kekalkan hardening yang sudah disediakan:

- `systemd`: `NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, `PrivateTmp`, `RestrictAddressFamilies`
- `nginx`: TLS termination, request/connection limits, import body-size alignment, dan proxying. Browser security headers kekal diurus oleh Express/Helmet supaya tiada header HSTS/X-Frame-Options bercanggah.
- `PM2`: restart backoff dan `min_uptime`

## 8. Sediakan Production .env

Salin contoh env:

```bash
cp .env.example .env
```

Kemudian isi nilai production sebenar.

Medan paling penting:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=5000

PUBLIC_APP_URL=https://domain-anda.com
CORS_ALLOWED_ORIGINS=https://domain-anda.com
TRUSTED_PROXIES=loopback

SESSION_SECRET=ganti-dengan-random-secret-yang-panjang-dan-kuat
SESSION_SECRET_PREVIOUS=
TWO_FACTOR_ENCRYPTION_KEY=ganti-dengan-secret-2fa-yang-kuat-dan-berbeza
COLLECTION_PII_ENCRYPTION_KEY=ganti-dengan-secret-pii-yang-kuat-dan-berbeza
AUTH_COOKIE_SECURE=auto
HSTS_MAX_AGE_SECONDS=31536000
HSTS_PRELOAD_ENABLED=0

PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=sqr_app
PG_PASSWORD=ganti-dengan-password-db-yang-kuat
PG_DATABASE=sqr_db
PG_MAX_CONNECTIONS=10
PG_STATEMENT_TIMEOUT_MS=30000

COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED=1
COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND=clamdscan
COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON='["--fdpass","--no-summary","--infected","{file}"]'
COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED=1

SEED_DEFAULT_USERS=0
MAIL_DEV_OUTBOX_ENABLED=0
LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED=0
```

Simpan `PG_PASSWORD` dan secret lain melalui secret manager, fail environment
private yang permission-nya ketat, atau mekanisme `pm2/systemd` yang tidak
menulis nilai ke shell history. Elakkan command seperti
`PG_PASSWORD=... npm run db:migrate` atau paste nilai sebenar dalam tiket/log,
kerana ia boleh tertinggal dalam history terminal, process listing, CI output,
atau scrollback.

Jika anda gunakan email production:

```dotenv
MAIL_FROM=notifikasi@domain-anda.com
SMTP_HOST=smtp.provider-anda.com
SMTP_PORT=587
SMTP_USER=akaun-smtp
SMTP_PASSWORD=kata-laluan-atau-app-password
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
```

Jika backup dihidupkan, jangan lupa:

```dotenv
BACKUP_FEATURE_ENABLED=1
BACKUP_ENCRYPTION_KEY=ganti-dengan-kunci-enkripsi-backup-yang-kuat
BACKUP_ENCRYPTION_KEYS=
BACKUP_ENCRYPTION_KEY_ID=primary
```

`TWO_FACTOR_ENCRYPTION_KEY` dan `COLLECTION_PII_ENCRYPTION_KEY` kini dianggap secret wajib di luar strict local development. Jika salah satu kosong, runtime akan fail fast semasa startup supaya server tidak berjalan dalam keadaan tidak selamat.

Jika anda deploy di belakang Nginx sahaja pada server yang sama, `TRUSTED_PROXIES=loopback` biasanya memadai.
Untuk production HTTPS di belakang Nginx, biarkan `AUTH_COOKIE_SECURE=auto` atau set `AUTH_COOKIE_SECURE=true`; jangan paksa `false`.
`HSTS_MAX_AGE_SECONDS=31536000` menyediakan tempoh preload-ready. Kekalkan `HSTS_PRELOAD_ENABLED=0` sehingga semua subdomain production benar-benar HTTPS-only; selepas disahkan, set `HSTS_PRELOAD_ENABLED=1`, deploy, dan submit domain ke `https://hstspreload.org`.
Receipt upload production perlu melalui ClamAV. Gunakan `clamdscan --fdpass` jika `clamav-daemon` aktif; jika hanya `clamscan` tersedia, tukar command dan args kepada fallback yang dinyatakan dalam `.env.example`.
Mulakan `PG_MAX_CONNECTIONS=10` untuk production kecil dan naikkan ke 20 hanya selepas semak `max_connections`, RAM PostgreSQL, dan log `PostgreSQL pool pressure detected`.
Kekalkan `PG_STATEMENT_TIMEOUT_MS=30000` sebagai guard query runaway PostgreSQL. Jika backup/report production sah memerlukan statement lebih lama, naikkan nilai ini secara deliberate dan pastikan ia masih lebih rendah daripada `HTTP_REQUEST_TIMEOUT_MS` atau selari dengan runbook backup yang dipantau.
`CORS_ALLOWED_ORIGINS` bukan mekanisme auth. Browser origin yang dibenarkan tetap perlu cookie/token sah, dan request server-to-server tanpa `Origin` masih bergantung pada auth, CSRF guard yang sesuai, rate limit, dan route permission.
Jika SMTP config berubah, restart semua PM2 worker selepas update env kerana transporter SMTP dicache dalam proses.
Jika anda rotate `SESSION_SECRET`, device fingerprint HMAC turut berubah; guna `SESSION_SECRET_PREVIOUS` untuk compatibility window yang dirancang, atau paksa login semula jika rotation kecemasan.
Production-like startup kini mewajibkan `SQR_RATE_LIMIT_STORE=redis` dengan `SQR_REDIS_RATE_LIMIT_URL` walaupun `SQR_MAX_WORKERS=1`, supaya fixed-window rate-limit counters, adaptive runtime protection buckets, 2FA replay protection, dan JWT logout revocation dikongsi serta fail closed jika Redis bermasalah. Kekalkan `SQR_MAX_WORKERS=1` untuk production kecil. Jika mahu multi-worker, aktifkan juga `SQR_WS_SHARED_BUS=redis` untuk Redis pub/sub WebSocket, termasuk mesej broadcast serta cross-worker activity close. Runtime production akan fail fast jika multi-worker diaktifkan tanpa WebSocket shared bus. Jika Redis shared protection sudah dikonfigurasi tetapi tidak boleh dicapai, protected request akan fail closed dan perlu dianggap sebagai insiden operasi, bukan fallback biasa.
Biarkan `TWO_FACTOR_TOTP_ALGORITHM=SHA1` untuk akaun 2FA sedia ada. `SHA256` hanya sesuai selepas jadual re-enrollment TOTP dibuat kerana aplikasi pengesah menyimpan algorithm semasa enrollment.

## 9. Build dan Migrate

Jalankan:

```bash
npm run db:migrate
npm run build
```

Sebelum hidupkan production pertama kali, disyorkan juga:

```bash
npm run typecheck
npm test
```

Nota:

- startup server semasa memang menjalankan bootstrap storage/database sebelum `listen()`, jadi kegagalan sambungan DB akan fail awal dan readiness tidak akan naik secara palsu
- selepas deploy, semak `GET /api/health/ready` sebelum anggap instance benar-benar sedia

## 10. Jalankan App Dengan PM2

Contoh:

```bash
pm2 start npm --name sqr -- start
pm2 save
pm2 startup
```

Semak log:

```bash
pm2 logs sqr
pm2 status
```

Jika mahu ecosystem file, contoh minimal:

```js
module.exports = {
  apps: [
    {
      name: "sqr",
      script: "npm",
      args: "start",
      cwd: "/var/www/sumbanganqueryrahmah",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
```

Lebih selamat lagi, bermula daripada:

- `deploy/pm2/ecosystem.config.cjs.example`

Nota penting untuk `wait_ready`:

- contoh PM2 semasa masih menggunakan `npm start` sebagai wrapper
- sebab itu `wait_ready` tidak dihidupkan secara default dalam contoh
- aktifkan `wait_ready` hanya jika anda tukar `script` kepada entrypoint Node terus dan app memang menghantar `process.send("ready")`

Jika anda lebih suka `systemd` berbanding PM2, gunakan contoh:

- `deploy/systemd/sqr.service.example`

Contoh `systemd` itu sudah termasuk hardening asas yang selamat untuk VPS tunggal:

- `UMask=0077`
- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `PrivateDevices=true`
- `ProtectSystem=full`
- `ProtectHome=true`

## 11. Nginx Reverse Proxy

Cipta fail:

```bash
sudo nano /etc/nginx/sites-available/sqr
```

Contoh config:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    "" close;
}

limit_req_zone $binary_remote_addr zone=sqr_api_per_ip:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=sqr_auth_per_ip:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=sqr_telemetry_per_ip:10m rate=60r/m;
limit_conn_zone $binary_remote_addr zone=sqr_conn_per_ip:10m;

server {
    listen 80;
    listen [::]:80;
    server_name domain-anda.com www.domain-anda.com;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name domain-anda.com www.domain-anda.com;

    ssl_certificate /etc/letsencrypt/live/domain-anda.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/domain-anda.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    server_tokens off;
    # Browser security headers are owned by the Express/Helmet app layer.
    # Do not duplicate HSTS/X-Frame-Options here unless Helmet is disabled or
    # both layers are aligned. Helmet currently keeps X-Frame-Options at
    # SAMEORIGIN for same-origin/blob preview flows and keeps HSTS preload off
    # until every production subdomain is HTTPS-ready.
    # To prepare for HSTS preload, set HSTS_MAX_AGE_SECONDS=31536000 or higher
    # and HSTS_PRELOAD_ENABLED=1 only after every production subdomain is
    # HTTPS-only, includeSubDomains is acceptable for the whole domain tree,
    # and the domain is ready for manual submission to https://hstspreload.org.

    # Keep this equal to or higher than IMPORT_BODY_LIMIT so Express can return
    # application-level import validation errors instead of generic Nginx 413s.
    client_max_body_size 100M;

    # Login responses carry Helmet/CSP security headers plus auth cookies.
    # Keep upstream response-header buffers above Nginx defaults so successful
    # logins are not converted into 502 "upstream sent too big header" errors.
    proxy_buffer_size 32k;
    proxy_buffers 8 32k;
    proxy_busy_buffers_size 64k;

    # The app still accepts the legacy /api/login path for older clients and
    # rollback compatibility. Keep both login paths on the stricter auth edge throttle.
    location = /api/login {
        limit_req zone=sqr_auth_per_ip burst=5 nodelay;
        limit_conn sqr_conn_per_ip 10;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location = /api/auth/login {
        limit_req zone=sqr_auth_per_ip burst=5 nodelay;
        limit_conn sqr_conn_per_ip 10;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /api/ {
        limit_req zone=sqr_api_per_ip burst=20 nodelay;
        limit_conn sqr_conn_per_ip 20;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Canonical Web Vitals telemetry route. The app validates same-site
    # Origin/Referer signals, JSON content type, a 4KB body limit, and bounded
    # per-IP drop buckets. Keep the legacy /telemetry/web-vitals block only
    # until the accelerated 2026-06-15 sunset for older deployed clients.
    # Do not send personal data, auth tokens, cookies, or session identifiers.
    location = /api/telemetry/web-vitals {
        limit_req zone=sqr_telemetry_per_ip burst=20 nodelay;
        limit_conn sqr_conn_per_ip 10;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    location = /telemetry/web-vitals {
        limit_req zone=sqr_telemetry_per_ip burst=20 nodelay;
        limit_conn sqr_conn_per_ip 10;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    location /ws {
        limit_conn sqr_conn_per_ip 20;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        limit_conn sqr_conn_per_ip 40;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Anda juga boleh terus bermula daripada:

- `deploy/nginx/sqr.conf.example`

Kekalkan header di atas melainkan anda benar-benar ada sebab produk untuk melonggarkannya. Jangan tambah `location /uploads` yang menghidangkan fail secara statik dari Nginx; fail resit/upload perlu kekal melalui route API authenticated supaya legacy storage path tidak menjadi public URL.

Aktifkan:

```bash
sudo ln -s /etc/nginx/sites-available/sqr /etc/nginx/sites-enabled/sqr
sudo nginx -t
sudo systemctl reload nginx
```

## 12. HTTPS Dengan Let's Encrypt

Pastikan DNS domain sudah menunjuk ke IP VPS anda.

Kemudian:

```bash
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com
```

Semak auto-renew:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## 13. First Production Verification

Selepas deploy:

1. buka landing page
2. klik `Log In`
3. login dengan akaun sebenar
4. semak `General Search`
5. semak `Viewer`
6. simpan collection baru
7. edit collection
8. preview dan download resit
9. cuba forgot password
10. semak email keluar jika SMTP aktif

Jika anda ada staging/CI yang sudah siap, jalankan juga:

```bash
npm run smoke:preflight
```

Untuk `smoke:ui`, lebih sesuai dijalankan pada CI atau mesin staging yang ada browser automation.

## 14. Monitoring Asas

Semak rutin ini selepas go-live:

```bash
pm2 logs sqr
pm2 monit
sudo journalctl -u nginx -f
```

Semak juga:

- penggunaan RAM
- penggunaan disk
- error rate
- login failures
- status backup

## 15. Backup dan Recovery

Sebelum go-live penuh, pastikan anda sudah uji:

- `docs/DISASTER_RECOVERY_DRILL.md`
- `docs/GO_LIVE_LAUNCH_CHECKLIST.md`
- `docs/PRODUCTION_PROMOTION_PLAYBOOK.md`

Minimum yang disyorkan:

1. backup database berkala
2. backup fail resit/upload
3. simpan salinan `.env` secara selamat di luar server
4. simpan snapshot VPS atau backup offsite
5. uji restore sekurang-kurangnya sekali sebelum launch penuh

## 16. Security Minimum Sebelum Go-Live

Pastikan semua ini betul:

- `.env` tidak pernah di-commit
- `SEED_DEFAULT_USERS=0`
- `MAIL_DEV_OUTBOX_ENABLED=0`
- `LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED=0`
- `SESSION_SECRET` kuat dan unik
- `BACKUP_ENCRYPTION_KEY` diisi jika backup aktif
- hanya `80/443/22` dibuka dari internet
- PostgreSQL tidak dibuka ke public internet
- Nginx berada di hadapan app
- HTTPS aktif
- domain production sudah betul pada `PUBLIC_APP_URL`

## 17. Tentang "Orang Lain Tak Boleh Tengok Source Code"

Untuk aplikasi web, frontend tetap akan dihantar ke browser dalam bentuk bundle JavaScript. Jadi source frontend tidak boleh "disembunyikan sepenuhnya".

Yang boleh dan mesti dibuat:

- jangan letak rahsia dalam frontend
- simpan semua secret di server/.env sahaja
- matikan source maps production
- pastikan semua access control dibuat di backend
- jangan anggap kod frontend itu private

Sistem ini sudah ikut pendekatan yang betul: yang perlu dilindungi ialah secret, endpoint, dan access control, bukan cuba sembunyikan bundle browser sepenuhnya.

## 18. Cadangan Launch Flow

Urutan paling selamat:

1. deploy ke staging
2. jalankan smoke dan manual flow penting
3. buat backup sebelum production deploy
4. deploy production di luar waktu puncak
5. monitor 30-60 minit pertama
6. simpan rollback plan yang jelas

## 19. Ringkasan

Untuk skala sistem anda sekarang, 1 VPS Hetzner adalah pendekatan yang munasabah dan cukup praktikal.

Jika semua perkara di atas dipatuhi, deployment ini sesuai untuk:

- sistem dalaman organisasi
- pengguna sekitar 30 orang
- rollout production yang terkawal

Naik taraf ke seni bina lebih besar hanya bila:

- concurrent users meningkat dengan ketara
- import/report jadi sangat berat
- anda mula perlukan high availability atau failover
