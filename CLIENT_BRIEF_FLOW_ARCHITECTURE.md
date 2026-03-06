# SQR System Flowchart & Architecture (Client Briefing)

Dokumen ini direka untuk memudahkan briefing client bagi sistem:
- **SQR - Sumbangan Query Rahmah**
- Stack: **React + Vite**, **Node.js + Express**, **PostgreSQL**, **WebSocket**, **Cluster Worker**, **Ollama AI**

## 1) High-Level Architecture

```mermaid
flowchart LR
    U[End User<br/>Superuser / Admin / User]
    B[Browser<br/>React + Vite SPA]
    WS[WebSocket Channel<br/>/ws]
    API[REST API<br/>/api/*]

    CM[Cluster Master<br/>server/cluster-local.ts]
    W[Worker Process<br/>server/index-local.ts + Express]

    ST[Storage Layer<br/>server/storage-postgres.ts]
    PG[(PostgreSQL)]
    AI[AI Service Adapter<br/>server/ai-ollama.ts]
    OL[Ollama Model Host]

    U --> B
    B -->|HTTPS/HTTP| API
    B -->|Realtime events| WS

    API --> CM
    WS --> CM
    CM --> W
    W --> ST
    ST --> PG
    W --> AI
    AI --> OL
```

## 2) Runtime / Deployment Architecture (Cluster)

```mermaid
flowchart TB
    subgraph HOST[Application Host]
        CM[Cluster Master]
        W1[Worker #1 Express]
        W2[Worker #2 Express]
        WN[Worker #N Express]
    end

    FE[Frontend Static Build<br/>dist-local/public]
    DB[(PostgreSQL DB)]
    OLL[Ollama AI Runtime]
    CLI[Admin/Users Browser]

    CLI --> CM
    CM --> W1
    CM --> W2
    CM --> WN
    W1 --> DB
    W2 --> DB
    WN --> DB
    W1 --> OLL
    W2 --> OLL
    WN --> OLL
    W1 --> FE
```

Nota untuk client:
- Master process mengawal bilangan worker dan kestabilan.
- Worker handle API request sebenar.
- Jika satu worker gagal, master boleh replace worker tanpa matikan keseluruhan sistem.

## 3) End-to-End User Flow

```mermaid
flowchart TD
    A[User buka aplikasi] --> B[Login]
    B --> C[POST /api/auth/login]
    C --> D{Credential valid?}
    D -- Tidak --> E[Paparan ralat login]
    D -- Ya --> F[JWT + Activity Session dicipta]
    F --> G[Masuk dashboard/tab ikut role]

    G --> H[Request API /api/* + token]
    G --> I[WebSocket connect /ws?token=...]
    H --> J{Auth + Role check}
    J -- Gagal --> K[403 / 401]
    J -- Lulus --> L[Business logic + DB query]
    L --> M[Response ke UI]
    I --> N[Realtime event: kick, ban, maintenance, settings update]
```

## 4) Role-Based Access Flow

```mermaid
flowchart TD
    R[User action] --> P{Role?}
    P -- superuser --> S[Full access<br/>+ manage users/admin creds<br/>+ critical settings]
    P -- admin --> A[Operational access<br/>no cross-user credential changes]
    P -- user --> U[Limited access<br/>own account + assigned tabs]

    S --> X[Allowed endpoint check]
    A --> X
    U --> X
    X --> Y{Permission pass?}
    Y -- No --> Z[PERMISSION_DENIED]
    Y -- Yes --> OK[Action executed + audit log]
```

## 5) Credential Management Flow (Security Tab)

```mermaid
flowchart TD
    AA[Settings > Security] --> AB{Action type}

    AB -- My Account --> AC[PATCH /api/me/credentials]
    AC --> AD[Validate username/password rules]
    AD --> AE[Verify current password if password change]
    AE --> AF[Hash password bcrypt cost 12]
    AF --> AG[Update users table]
    AG --> AH[Write audit log]
    AH --> AI[Force logout if password changed]

    AB -- Superuser manage admin/user --> BA[PATCH /api/admin/users/:id/credentials]
    BA --> BB[Role check superuser only]
    BB --> BC[Validate target role admin/user]
    BC --> BD[Validate username/password]
    BD --> BE[Hash password if provided]
    BE --> BF[Update target user]
    BF --> BG[Write audit log]
    BG --> BH[Force logout target if password reset]
```

## 6) Data Lifecycle Flow (Import -> Search -> Analysis)

```mermaid
flowchart LR
    F1[Import CSV/XLSX] --> F2[POST /api/imports]
    F2 --> F3[Store imports + data_rows]
    F3 --> F4[Saved Imports]
    F4 --> F5[Viewer / General Search]
    F5 --> F6[Analysis / Dashboard / Monitor]
    F6 --> F7[Audit log + Activity tracking]
```

## 7) Monitoring & Stability Flow

```mermaid
flowchart TD
    M1[Worker metrics collected] --> M2[Cluster control state]
    M2 --> M3{Pressure detected?}
    M3 -- Yes --> M4[Throttle / protection mode / route guard]
    M3 -- No --> M5[Normal mode]
    M4 --> M6[System Monitor UI update]
    M5 --> M6
```

## 8) Talking Points Untuk Brief Client

Gunakan poin ringkas ini semasa presentation:
1. **Secure by design**: semua endpoint penting dilindungi auth + role check.
2. **Role separation jelas**: superuser, admin, user mempunyai sempadan kuasa yang ketat.
3. **Auditability**: action kritikal direkod dalam audit logs.
4. **Scalable runtime**: cluster worker untuk kestabilan operasi.
5. **Realtime governance**: WebSocket untuk status sesi, kick/ban, maintenance.
6. **Operational readiness**: backup/restore, monitor, activity, analytics.

## 9) Appendix: Modul Utama Mengikut Role

| Modul | Superuser | Admin | User |
|---|---|---|---|
| Search | Ya | Ya | Ya |
| Import/Saved/Viewer | Ya | Ya | Ya (ikut setting tab) |
| System Monitor | Ya | Ya (ikut setting tab) | Ya (ikut setting tab) |
| Backup create/restore/delete | Ya | Ya | Tidak |
| System Settings | Ya | Ya (ikut permission) | Tidak |
| Account Security (own) | Ya | Ya | Ya |
| User Credential Management | Ya | Tidak | Tidak |

