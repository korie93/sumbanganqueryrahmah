# SQR Deployment Sizing Guide

Panduan ini menetapkan saiz awal untuk deployment SQR yang menggunakan PM2. Nilai di bawah ialah starting point yang selamat; ukur semula selepas traffic sebenar stabil.

## PM2 Memory Limit Sizing

`max_memory_restart` ialah recovery guard, bukan capacity plan. Tetapkan had ini cukup tinggi untuk spike biasa, tetapi cukup rendah supaya proses tidak mengambil semua RAM VPS sebelum PM2 restart secara terkawal.

Formula asas:

```text
max_memory_restart = base_memory x 1.5 x safety_factor
```

Gunakan `base_memory` daripada RSS stabil proses selepas 15-30 minit traffic biasa. `safety_factor` lazimnya `1.1` untuk traffic stabil dan `1.3` untuk traffic yang bursty.

Contoh:

```text
320M base_memory x 1.5 x 1.3 = 624M
```

Dalam contoh ini, pilih tier `768M` supaya ada ruang untuk GC, request burst, dan WebSocket fan-out.

| Traffic tier | Rough traffic | PM2 `max_memory_restart` | Node heap flag | Workers |
| --- | --- | --- | --- | --- |
| Low | kurang 100 req/min | `512M` | `--max-old-space-size=400` | `1` |
| Medium | 100-500 req/min | `768M` | `--max-old-space-size=600` | `1-2` |
| High | 500-1500 req/min | `1024M` | `--max-old-space-size=800` | `2-4` |

Default dalam [ecosystem.config.cjs.example](../deploy/pm2/ecosystem.config.cjs.example) ialah tier medium-conservative: `max_memory_restart: "768M"` dengan `--max-old-space-size=600`. Kekalkan `SQR_MAX_WORKERS=1` untuk deployment kecil sehingga Redis rate limiting dan Redis WebSocket shared bus disediakan.

## Multi-Worker Guardrails

Multi-worker meningkatkan throughput, tetapi beberapa state keselamatan mesti dikongsi merentas proses.

Sebelum menetapkan `SQR_MAX_WORKERS` lebih daripada `1`, pastikan:

- `SQR_RATE_LIMIT_STORE=redis`
- `SQR_REDIS_RATE_LIMIT_URL` ditetapkan
- `SQR_WS_SHARED_BUS=redis`
- `SQR_REDIS_WS_URL` ditetapkan jika URL WebSocket Redis berbeza daripada Redis utama
- deployment mempunyai RAM cukup untuk `workers x max_memory_restart`, ditambah ruang untuk PostgreSQL, Nginx, PM2, dan OS

Jika Redis shared protection tidak tersedia, kekalkan satu worker. Ini mengelakkan bypass rate limit dan kehilangan broadcast WebSocket merentas worker.

## Monitoring Commands

Semak penggunaan memori selepas deploy, selepas seeding, dan semasa peak traffic:

```bash
pm2 list
pm2 monit
pm2 show sqr
pm2 logs sqr --lines 100
```

Untuk semakan pantas:

```bash
pm2 jlist
```

Sasaran operasi:

- RSS stabil di bawah 70% daripada `max_memory_restart`
- restart kerana memori kurang daripada 5 kali seminggu
- tiada corak RSS yang naik berterusan selepas traffic menurun
- tiada restart loop selepas deploy baru

Jika PM2 restart kerana memori lebih kerap daripada sasaran, jangan terus naikkan limit. Semak dahulu log, route yang berat, backup restore/export, import multipart, dan WebSocket fan-out.

## Choosing a Tier

Gunakan low tier untuk server kecil atau staging:

```js
max_memory_restart: "512M",
node_args: "--max-old-space-size=400",
```

Gunakan medium tier untuk production kecil hingga sederhana:

```js
max_memory_restart: "768M",
node_args: "--max-old-space-size=600",
```

Gunakan high tier hanya jika RAM VPS mencukupi dan Redis shared state sudah siap:

```js
max_memory_restart: "1024M",
node_args: "--max-old-space-size=800",
```

## Rollback and Adjustment

Jika perubahan sizing menyebabkan restart loop:

1. Turunkan kembali `max_memory_restart` dan `node_args` kepada nilai terakhir yang stabil.
2. Jalankan `npm run build`.
3. Restart PM2 dengan `pm2 restart ecosystem.config.cjs --update-env`.
4. Pantau `pm2 list` dan `pm2 logs sqr --lines 100`.

Jika rollback masih tidak stabil, kembali kepada single worker (`SQR_MAX_WORKERS=1`) dan anggap isu ini sebagai incident capacity, bukan sekadar tuning PM2.
