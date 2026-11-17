---
description: FABLEARC Mandatory Engineering Charter, ECC Software Team Protocol, Render 5GB Guardrails, and Strict Approval Gate
---

# FABLEARC Mandatory Engineering & Workflow Charter

Every requirement, bug report, or feature request on **FABLEARC** (`/Users/rajat/personal/important_githubs/streamZ`) MUST strictly follow these 7 non-negotiable protocols:

## 1. Strict Explain-First & User-Approval Gate (ZERO Unauthorized Code Edits)
- **NEVER touch application code** (`src/`, `vite.config.ts`, `electron/`, `scripts/`, `tests/`, `package.json`) when the user presents a new bug, requirement, or follow-up change.
- **Step A (Analyze & Explain First)**: Trace the root cause, present the team analysis + exact files/functions to modify + trade-offs/bandwidth impact, and **STOP** to wait for explicit user permission (e.g., *"go ahead"*, *"yes please"*, *"proceed"*).
- **Step B (Follow-Up Changes)**: Even after completing an approved task, if the user asks for an adjustment or new change, **STOP and explain first again** before editing code.

## 2. ECC Complete Software Team Protocol
For every non-trivial bug fix or feature:
- **Multi-Role Planning (`dev-team` / `planner` / `architect`)**: Evaluate through **PM** (UX simplicity, zero technical jargon), **Architect** (Render 5 GB limit, Turso DB read/write minimization, CORS/CDN topology), **Developer** (edge cases, TypeScript type safety, clean state transitions), and **QA** (regression & E2E failure modes).
- **Post-Edit Review Gate (`typescript-reviewer` / `react-reviewer` / `security-reviewer` / `silent-failure-hunter`)**: Proactively audit changes before declaring completion.

## 3. Skill Discovery on Every New Requirement (`find-skills`)
- Whenever a new domain, UI pattern, playback problem, or testing requirement arrives, check installed skills first and run `npx -y skills find <domain keywords>` (`find-skills`) to see if a high-trust (>1K installs, reputable source) skill applies before designing the solution.

## 4. Graphify-First Codebase Knowledge (`graphify`)
- Always query `graphify-out/graph.json` (`graphify query` / `path` / `explain`) first when tracing cross-file dependencies (`App.tsx` ↔ `CinemaPlayerModal.tsx` ↔ `stremioProtocol.ts` ↔ `vite.config.ts` ↔ `streamzDb.ts` ↔ `recommendations/`) and run incremental `--update` after approved code changes.

## 5. Mandatory End-to-End (E2E) Testing (`e2e-testing` / `browser-qa` / Vitest Strix Suite)
- Every approved code change MUST pass:
  1. `npm run build` (`tsc -b && vite build`) with zero errors.
  2. Full automated E2E + security + unit test suite (`npm test -- --run`) including new regression tests reproducing the exact bug/flow.
  3. Live UI / click-path verification (`click-path-audit` / `browser` subagent / Playwright E2E) when UI or player state flows change.
- Do NOT leave background dev servers running unnecessarily after verification.

## 6. Historical FABLEARC Product & Infrastructure Guardrails
1. **Render 5 GB Free Outbound Bandwidth Limit (CRITICAL)**:
   - Frontend is hosted on Vercel (`https://fablearc.vercel.app`); Backend is on Render (`https://fablearc-backend.onrender.com`).
   - **NEVER proxy video bytes through Render.** Video must stream directly from HTTPS CDNs to the browser (`0 MB` Render video bandwidth).
   - Keep Render JSON responses tiny, cached, and compressed; avoid N+1 health-check/ping storms or unnecessary server-side probes.
2. **Database & Cloud Persistence (`Turso` + `node-sqlite3-wasm`)**:
   - Keep Turso Cloud 3NF read/write operations minimal (coalesced/debounced sync, session caching).
   - **Single-Active-Session Policy**: Logging in on a new device/browser automatically invalidates prior sessions for that user.
   - Closed registration: **Only Admins** can provision new user accounts; never hardcode user accounts; always redact password hashes (`scrypt$`) in API responses.
   - Human-readable timestamps in DB/Admin views.
3. **Stream Sorting, Health & Audio Rules**:
   - **Strict Quality-First Decreasing Order**: `4K (2160p)` → `1440p` → `1080p` → `720p` → `480p` → `360p` (never let a 1080p stream sort above 4K), then **Multi-Audio > Dual-Audio > Single-Audio**, then CDN compatibility & file size.
   - **Offline vs. Slow Streams**: Automatically remove confirmed `Offline` / `Blocked` streams and Discord/promo/donation spam, **but NEVER remove `Slow / Timeout` streams**.
   - **Audio Track Language Priority**: `English` first → `Hindi` second → `Other languages` third.
   - **Subtitles**: **OFF by default** when playback starts.
   - **30-Second Auto-Failover**: Automatically advance to the next working stream if a stream stalls/fails on startup, without false-triggering during manual forward/backward seeks.
   - **No External Torrent / WebTor / Download Buttons**: Play strictly inside FableArc's built-in cinema player; no download button, no "Paste direct video link", no Cinemeta trailer button on Details page.
4. **UI / UX Standards**:
   - **100% Responsive** across mobile phones, tablets, laptops, and ultrawide screens (no overlapping modals, no squeezed fonts, no sticky navbar covering the player, pure `#000` black letterbox bars in the video player).
   - **User-Friendly Copy**: Zero technical jargon (no *"querying"*, *"MATCHED BY..."*, or synthetic fake `% Match` numbers).
   - **Fair-Use Custom Code Logos**: Never use trademarked raw brand raster logos; use code-generated emblems (`PlatformLogoEmblem`).
   - **Zero-DB / Zero-API-Key Hybrid Recommendation Engine**: Suggestions & Similar Titles run 100% deterministically in-memory with optional `localStorage`-only personalization (`streaming-recommendations:v1`).
