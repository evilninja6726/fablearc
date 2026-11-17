<div align="center">
  <img src="./public/favicon.svg" alt="FABLEARC Logo" width="84" height="84" />
  <h1>FABLEARC</h1>
  <p><strong>Security-Hardened Cloud &amp; Desktop 4K Streaming Platform with 9-Stage Hybrid Recommendation Engine</strong></p>
  <p>
    <a href="https://fablearc.vercel.app"><img src="https://img.shields.io/badge/Live_Platform-fablearc.vercel.app-00E5FF?style=for-the-badge&logo=vercel&logoColor=050A1C" alt="Live Platform" /></a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=050A1C" alt="React" />
    <img src="https://img.shields.io/badge/Turso_LibSQL-3NF_WAL-00E5FF?style=for-the-badge&logo=sqlite&logoColor=050A1C" alt="SQLite & Turso" />
    <img src="https://img.shields.io/badge/FFmpeg-4K_Multi--Audio-00FFC6?style=for-the-badge&logo=ffmpeg&logoColor=050A1C" alt="FFmpeg" />
    <img src="https://img.shields.io/badge/Automated_Suite-41%2F41_Passing-10B981?style=for-the-badge&logo=vitest&logoColor=white" alt="41/41 Tests Passing" />
  </p>
</div>

---

## Overview

**FABLEARC** is a full-stack, security-hardened cinema streaming application and Electron desktop media center engineered with a **Midnight Navy & Electric Aqua-Cyan** design system. It combines a declarative Stremio addon protocol engine, an on-the-fly **FFmpeg 4K UHD & Multi-Audio remuxing pipeline**, an in-memory **9-stage hybrid recommendation & MMR diversity reranking engine**, a **Single-Flight L1/L2 caching proxy**, and a **3rd-Normal-Form (3NF) SQLite + Turso Cloud Embedded Replica** database (~378 bytes per active user).

---

## System Architecture

```mermaid
flowchart LR
  subgraph Client["FABLEARC Responsive Web & Electron Desktop UI (React 18 + HLS.js)"]
    Discover["Discover Catalogs & Natural-Language Search"]
    RecEngine["9-Stage Hybrid Recommender + MMR Diversity Reranker"]
    Player["4K Cinema Player + Multi-Audio + AutoSync Subtitles"]
    Admin["Role-Based Admin Console (RBAC)"]
  end

  subgraph Server["Hardened Backend Middleware & Media Engine"]
    Auth["Scrypt Auth + Sliding-Window Rate Limiter + Anti-Tamper Gate"]
    Proxy["Single-Flight Stremio Proxy + SSRF & Redirect Guard"]
    FFmpeg["FFmpeg Live Remuxer & FFprobe Audio Track Inspector"]
    DB["3NF SQLite Embedded Replica (node:sqlite / WebAssembly)"]
  end

  subgraph Cloud["External & Cloud Persistence"]
    Turso[("Turso LibSQL Cloud DB")]
    Addons["Verified HTTPS Stremio Addons (Cinemeta, OpenSubtitles, etc.)"]
  end

  Discover --> RecEngine
  RecEngine --> Proxy
  Player --> FFmpeg
  Admin --> Auth
  Auth --> DB
  DB <-->|"Write-Through + Startup Hydration"| Turso
  Proxy -->|"RFC1918 / IPv6 / Metadata SSRF Filter"| Addons
```

---

## Key Engineering Highlights

### 1. 4K UHD & Multi-Audio Live FFmpeg Streaming Pipeline
- **On-the-Fly Container Remuxing (`/api/media-stream`)**: Copies `H.264`/`HEVC` video bitstreams with zero quality loss (`-c:v copy`) while transcoding incompatible `EAC3` / `AC3` / `TrueHD` surround audio into browser-native stereo `AAC` in real time.
- **Language-Priority Audio Track Selection (`/api/media-probe`)**: Probes multi-audio MKV/MP4 containers via `ffprobe` and automatically sorts audio tracks with priority to **English → Hindi → Other languages** while preserving exact FFmpeg `0:a:<index>` stream mappings.
- **Decreasing Quality & Multi-Audio Stream Ranking**: Automatically ranks discovered streams from `4K UHD (2160p)` → `1080p FHD` → `720p HD` → `SD`, prioritizing `Multi-Audio` and `Dual Audio` releases within each resolution tier.

### 2. Zero-DB 9-Stage Hybrid Recommendation & MMR Reranking Engine (`src/intelligence/`)
- **Multi-Stage Retrieval & Intent Parsing (`executeHybridRecommendationPipeline`)**: Deduplicates multi-addon catalogs into canonical profiles, builds a hierarchical semantic taxonomy + stemmed lexical index, parses natural-language mood/era/genre constraints, and generates multi-channel candidates.
- **Personalized Hybrid Scoring & Explainability**: Combines lexical relevance, taxonomy affinity, user watch/watchlist taste vectors, and release-era signals while attaching human-readable reason labels (`primaryReasonLabel`) and per-stage latency diagnostics (`latencyMsByStage`).
- **Maximal Marginal Relevance (MMR) Slate Diversity**: Reranks top-K windows (`diversityReranker.ts`) to suppress franchise/subgenre clustering while preserving top-slot precision.

### 3. Ultra-Compact 3NF SQLite + Turso Cloud Embedded Replica
- **~378 Bytes Per Active User**: Normalizes providers (`provider_registry`) and media metadata (`media_catalog`) globally using `WITHOUT ROWID, STRICT` join tables (`user_providers`, `user_watch_history_v2`, `user_watchlist_v2`) and automatic Metahub URL compression.
- **Sub-Millisecond Reads + Cloud Durability**: Serves reads from the local SQLite replica in `< 0.1ms` while pipelining writes asynchronously to **Turso Cloud (`/v2/pipeline`)** and hydrating state automatically on cold container startups.
- **Cross-Runtime SQLite Engine**: Uses Node 22's native `node:sqlite` locally and transparently falls back to WebAssembly SQLite (`node-sqlite3-wasm`) on Node 20 cloud containers with zero native C++ ABI issues.

### 4. Defense-in-Depth Security Architecture (Strix E2E Verified)
- **Exhaustive SSRF & Open-Redirect Protection**: Blocks loopback (`127.0.0.0/8`, `::1`), RFC 1918 private LANs (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), CGNAT (`100.64.0.0/10`), AWS/GCP/Alibaba cloud metadata (`169.254.169.254`, `100.100.100.200`, `metadata.google.internal`, `fd00:ec2::254`), IPv6-mapped IPv4 (`[::ffff:127.0.0.1]`), octal/hex/integer IPs, and validates every HTTP `301/302/307/308` redirect hop manually.
- **Authentication, Session Revocation & RBAC**:
  - `scrypt` password hashing with timing-safe verification (`timingSafeEqual`) and HTTP response hash masking (`scrypt$<salt>…$REDACTED`).
  - `HttpOnly; SameSite=Strict` session cookies + `Bearer` token authentication.
  - Immediate session revocation across SQLite, in-memory `sessionCache`, and Turso Cloud upon password change, admin password reset, or role change.
  - Sliding-window brute-force rate limiting (`429 Too Many Requests` + `Retry-After`) on `/api/auth/login` and `/api/auth/change-password`.
- **FFmpeg Process Isolation**: Enforces `-protocol_whitelist http,https,tcp,tls,crypto`, argument flag guards, and a strict per-user concurrency cap (`MAX_ACTIVE_STREAMS_PER_USER = 2`).

### 5. Cinema Player, Subtitle AutoSync & Responsive Design
- **Non-AI Subtitle AutoSync & SDH Filter**: WebVTT/SRT parser with one-click Hearing-Impaired (`[SDH]`) bracket stripping and cue-capture delay synchronization.
- **Mobile-First Responsive UI & Desktop Shell**: Adaptive layouts across desktop (`1440px+`), tablet (`768px`), mobile (`480px`), and packaged Electron (`electron/main.cjs`) with touch-optimized player controls and aspect-ratio crop cycling (`Fit`, `Fill`, `16:9`, `21:9`, `2.39:1`, `4:3`).

---

## Project Structure

```text
├── electron/                   # Electron main & preload process shell for desktop builds
├── public/                     # FABLEARC vector favicon & brand assets
├── scripts/
│   └── manage-users.mjs        # CLI tool for user provisioning & Turso Cloud sync
├── src/
│   ├── addons/
│   │   └── stremioProtocol.ts  # Declarative Stremio protocol, Single-Flight L1 cache & stream ranker
│   ├── components/
│   │   ├── AdminDashboardView.tsx  # Admin RBAC console, user & addon management, DB diagnostics
│   │   ├── AuthGatePage.tsx        # Anti-tamper authentication gate modal
│   │   ├── CinemaPlayerModal.tsx   # 4K HLS/MP4/MKV player, audio/subtitle/crop popovers & Watch Party
│   │   └── PlatformLogoEmblem.tsx  # Custom SVG FABLEARC brand emblem & platform medallions
│   ├── intelligence/
│   │   ├── recommendationEngine.ts # Semantic clusters & unified recommendation facade
│   │   └── recommendations/        # 9-stage pipeline: dedup, taxonomy, lexical index, intent, ranking & MMR
│   ├── player/
│   │   └── subtitleEngine.ts   # WebVTT/SRT parser, SDH stripper & AutoSync calculator
│   ├── security/
│   │   └── securityGuards.ts   # SSRF validator, sliding-window rate limiter & external player guard
│   ├── server/
│   │   ├── redisCacheEngine.ts # Single-Flight L1 LRU + L2 Redis cache engine
│   │   └── streamzDb.ts        # 3NF SQLite + Turso Cloud replica database
│   ├── App.tsx                 # Main application shell, Discover catalog grid & state sync
│   └── styles.css              # Midnight Navy & Electric Aqua-Cyan responsive design system
├── tests/
│   ├── recommendationEngine.test.ts # 9 hybrid ranking, intent parsing & MMR diversity tests
│   ├── securityAndPlayer.test.ts    # 18 unit & integration tests (Security, Addons, Subtitles, 3NF DB)
│   └── strixSecurityE2E.test.ts     # 14 full-stack Strix E2E security & user-journey tests
└── vite.config.ts              # Backend API middlewares, Stremio proxy & FFmpeg transcode pipeline
```

---

## Quick Start

### 1. Install Dependencies (Node.js `>= 22.12.0`)
```bash
npm install
```

### 2. Configure Environment (Optional for Cloud Sync)
Copy `.env.example` to `.env` and add your free [Turso Cloud](https://turso.tech) credentials:
```env
TURSO_DATABASE_URL=libsql://your-db-name-your-username.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
```

### 3. Run the Automated Test Suite (`41 / 41 Tests`)
```bash
npm test
```

### 4. Start Development or Production Build
```bash
# Start local development server (http://localhost:5173)
npm run dev

# Typecheck and build for production
npm run build

# Start production preview server
npm start
```

---

## CLI User Management

Manage users or push local database state to Turso Cloud using the included CLI utility:

```bash
# List all registered users
npm run db:users -- list

# Create or update an administrator account
npm run db:users -- create --email=admin@fablearc.com --name="Admin" --password="StrongPassword1!" --role=admin

# Sync local SQLite tables to Turso Cloud
npm run db:users -- sync-turso
```
