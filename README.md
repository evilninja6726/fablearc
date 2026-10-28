# streamZ — Hardened Open-Source Desktop & Web Media Center

`streamZ` is a clean-room, security-hardened media center and private screening room built after reverse-engineering and auditing [`NuvioMedia/NuvioDesktop`](https://github.com/NuvioMedia/NuvioDesktop) with **REA (`rea-agents@6.7.0`)** and the **`security-review`** & **`frontend-design`** skills.

See [`SECURITY_AUDIT_AND_RE_REPORT.md`](./SECURITY_AUDIT_AND_RE_REPORT.md) for the complete binary/source reverse-engineering evidence and the 6 vulnerabilities discovered in `NuvioDesktop`.

---

## Key Features & Security Remediations

1. **Zero Binary Blobs (`[VULN-001]` Fixed)**:
   - 100% auditable TypeScript + React source tree. No opaque `libnuvio_engine.dylib` / `.dll` / `.so` or pre-compiled `.jar`/`.aar` binaries.
2. **Declarative JSON-Only Stremio Addons + SSRF Guard (`[VULN-002]` Fixed)**:
   - Supports Stremio-compatible `manifest.json` catalogs & streams without downloading or executing arbitrary remote QuickJS `.js` scrapers.
   - `validateAddonOrStreamUrl()` blocks loopback (`127.0.0.0/8`, `localhost`, `::1`), cloud metadata (`169.254.169.254`), and private LAN IPs by default.
3. **WebCrypto SHA-256 Artifact Verification (`[VULN-003]` Fixed)**:
   - `verifyArtifactSha256()` verifies cryptographic SHA-256 digests before trusting any update payload.
4. **Local-Only PBKDF2 + AES-256-GCM Credential Vault (`[VULN-004]` Fixed)**:
   - Encrypts optional TMDB, Jellyfin/Emby, and Debrid API keys locally at rest using WebCrypto `PBKDF2-SHA256` (100,000 iterations) + `AES-256-GCM`. Zero cloud exfiltration or telemetry.
5. **Cinema Player, Non-AI Subtitle AutoSync & Watch Party**:
   - Adaptive HLS (`hls.js`) & 1080p MP4 playback, custom subtitle styling, SDH bracket stripping (`stripSdh`), Cue-Capture AutoSync delay calculator, IntroDB skip prompts, and multi-window `BroadcastChannel` Watch Party sync + chat.

---

## Quick Start

```bash
cd /Users/rajat/personal/important_githubs/streamZ
npm install
npm test
npm run dev
```
