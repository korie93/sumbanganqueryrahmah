# WebSocket Protocol

Dokumen ini menerangkan kontrak WebSocket yang benar-benar dilaksanakan oleh repo semasa.
Ia merujuk kepada `server/ws/*`, `shared/websocket-close-reasons.ts`, dan
`client/src/components/auto-logout-*`.

## Endpoint dan Auth

- Endpoint runtime: `/ws`
- Auth menggunakan cookie sesi HTTP sedia ada yang dibaca semasa handshake
- Query-string token ditolak
- Handshake mesti same-origin
- Token sesi WebSocket mesti:
  - sah dari segi signature
  - mempunyai `activityId`
  - belum melepasi `exp` claim
  - masih aktif dalam storage (`isActive !== false` dan `logoutTime === null`)

Jika syarat ini gagal, server akan tutup sambungan dengan close code `1008`.

## Message dan Payload Limits

Terdapat dua lapisan had payload:

- transport `ws` server: `100 KiB` (`maxPayload` pada `WebSocketServer`)
- runtime serialized payload: `64 KiB`

Selain itu, broadcast akan menggugurkan client yang sudah terlalu backpressured:

- max buffered bytes per client: `256 KiB`

Inbound abuse juga dikawal:

- token bucket: `100` message seminit per sambungan
- max concurrent socket per user: `5`
- pending-auth socket TTL: `60 saat`

## Heartbeat dan Dead Connection Handling

- heartbeat interval: `30 saat`
- setiap tick, server akan `ping()` socket yang masih `OPEN`
- jika socket tidak membalas `pong` pada kitaran seterusnya, socket akan ditamatkan
- socket yang masih `CONNECTING` tidak diterminasi secara agresif oleh heartbeat

## Close Codes dan Reasons

Auth/session terminal close menggunakan:

- close code: `1008`
- reason `session_invalid`
- reason `session_expired`

Makna praktikal:

- `session_invalid`: token tidak sah, session tiada, session logout, atau aktiviti tidak lagi aktif
- `session_expired`: JWT sesi WebSocket telah melepasi `exp` claim

Close tanpa reason khusus boleh berlaku semasa shutdown, socket replacement, atau cleanup biasa.

## Reconnection Strategy Di Client

Client auto-logout runtime menggunakan reconnection policy berikut:

- base delay: `1000ms`
- exponential backoff dengan jitter
- capped delay: `30000ms`
- max attempts: `12`

Terminal behavior:

- jika menerima `1008` dengan `session_invalid` atau `session_expired`, client berhenti retry dan jalankan logout flow
- jika cap `12` percubaan tercapai, client berhenti retry dan tunjukkan state terminal yang meminta refresh atau login semula

Retryable behavior:

- network error biasa atau close tanpa auth reason akan cuba reconnect sehingga cap dicapai

## Outbound Message Types Yang Digunakan Client

Client kini mengenali payload JSON berikut:

- `logout`
- `banned`
- `kicked`
- `maintenance_update`
- `settings_updated`

Repo semasa tidak mendokumenkan command channel umum daripada client ke server; inbound
messages pada runtime ini lebih kepada liveness dan abuse surface, bukan public mutation API.
