# NuvioDesktop Reverse Engineering & Security Audit Report

## Executive Verdict: **NOT SAFE TO INSTALL**

Based on binary and JavaScript artifact reverse-engineering via **REA (`rea-agents@6.7.0`)** and systematic source-code security review (`security-review` skill), **`NuvioMedia/NuvioDesktop` is NOT safe to install or run on a personal machine.**

While the repository is licensed under GPL-3.0 and presents itself as an open-source Kotlin/Compose Multiplatform media center, it ships **over 150 pre-compiled, closed-source or unverified native binaries** directly inside the git repository, exposes an **unrestricted SSRF + credential-leaking native bridge to untrusted remote JavaScript scrapers**, **exfiltrates third-party API keys and private Jellyfin/Emby server tokens in plaintext to a centralized Supabase backend**, and **executes downloaded update installers and external URIs without cryptographic verification or scheme sanitization**.

---

## Part 1: REA Reverse Engineering Findings & Provenance

We inspected the shipped artifacts in `NuvioMedia/NuvioDesktop` using REA (`rea-agents@6.7.0`):

| Artifact Inspected | Format / Arch | SHA-256 Digest | REA Operation & Evidence ID |
| :--- | :--- | :--- | :--- |
| `composeApp/src/desktopMain/native/macos/engine/libnuvio_engine.dylib` | Mach-O Universal (`x86_64` + `arm64`, 16.6 MB) | `da76fd840b6a534b042fab8609eae130571846ca06f44a66ea247e074562743b` | `trace_dylib_resolution` (`ev_d555948d177cd1fa8fb70a00fe4631826895bbd61ee2e8a26259e24371068335`) |
| `composeApp/src/desktopMain/native/windows/engine/nuvio_engine.dll` | PE32+ DLL (`x86_64`, 11.6 MB) | `f087d39f3229e4b81e781c85d8095eeab7c83ff80794794498a4e1de0cba88e6` | `inspect_pe_resources` |
| `composeApp/libs/lib-nuvio-engine-android-0.1.5.aar` (`jni/x86_64/libnuvio_engine.so`) | ELF 64-bit (`x86_64`, 11.4 MB, stripped) | `896e3ea7710851c7001e53c3df7272488672fd63bdec38f67d5f8b7d3352dcf1` | `inspect_rust_binary` (`ev_7994fef04491897da83a9b593951f147edce3130540f33d3b95e7bfeb3f4563a`), `inspect_go_binary` (`ev_a9e6deb626f2743aa6d4b953d7c439c3d0f0d0c0692572bb8813ce4e4bc40312`) |
| `composeApp/src/desktopMain/resources/player-ui` (`controls.html`, `controls.js`, `party.js`, `loading-indicator.js`) | HTML/JS Web Bundle (313 KB) | `11f0eec6272fed9c29668c446cc9fc6ff950d9a3b10d1826136e4f7580e97ff2` | `analyze_javascript_application` (`ev_2d624f959efc843b07da6494e36bc53f78e038b576d23f89aa572b6472b0577e`) |

### Architectural Reconstruction of `NuvioDesktop`
1. **UI Shell (`composeApp`)**: Kotlin Multiplatform + Compose Desktop (`MainKt`), rendering catalog shelves, media detail pages, Stremio-compatible addon management, and Jellyfin/Emby media server integrations.
2. **Hybrid Native Player Bridge (`player_bridge.mm` / `player_bridge.cpp` + `player-ui`)**:
   - Embeds `libmpv` via OpenGL/Metal (`PlayerMetalView` / `NuvioPlayerOpenGLLayer`) for video decoding.
   - Overlays a native OS WebView (`WKWebView` on macOS, `WebView2` on Windows, `webkit2gtk-4.1` on Linux) loading `composeApp/src/desktopMain/resources/player-ui/controls.html`.
   - Reconstructed via REA (`ev_2d624f959efc843b07da6494e36bc53f78e038b576d23f89aa572b6472b0577e`): `controls.js` (151 KB) and `party.js` (32 KB) communicate bidirectionally with the C++/ObjC++ bridge via `window.webkit.messageHandlers` / `WKScriptMessageHandler` to control playback, subtitle styling/delay, audio tracks, skip intervals (IntroDB/AnimeSkip), and Watch Party synchronization/chat.
3. **Closed-Source Native P2P Engine (`libnuvio_engine` + `nuvio-engine-jvm-0.1.5.jar`)**:
   - Loaded via JNA (`com.nuvio.engine.internal.JnaNuvioNativeApi`).
   - Symbol & string extraction from `libnuvio_engine.dylib` reveals 23 exported C ABI functions (`_nuvio_engine_create`, `_nuvio_engine_add_torrent`, `_nuvio_engine_prepare_stream`, `_nuvio_engine_poll_event`, etc.) wrapping **`libtorrent/2.0.12.0`** and **`boost_1_86_0`** (`/nuvio-engine/dependencies/sources/boost_1_86_0/...`).
   - Starts a local HTTP streaming proxy on `http://127.0.0.1:<port>` and joins the global BitTorrent DHT (`dht.libtorrent.org:25401`).
   - The source code for `nuvio-engine` is **not included** in the repository (`../nuvio-engine` is referenced externally in `composeApp/build.gradle.kts:497`).
4. **QuickJS Remote Scraper Runtime (`features/plugins`)**:
   - Downloads remote JavaScript scraper files from user-configured manifest URLs and executes them inside a QuickJS VM (`com.dokar.quickjs.QuickJs`) with custom host bridges (`FetchBridge`, `DomBridge`, `CryptoBridge`, `WasmBridge`, `UrlBridge`, `HostFunctions`).

---

## Part 2: High-Confidence Security Findings (`security-review`)

### Summary
- **Findings**: 6 (2 Critical, 3 High, 1 Medium)
- **Risk Level**: **Critical**
- **Confidence**: **High** (verified directly in source and shipped binary artifacts)

---

### [VULN-001] Supply-Chain Risk: 150+ Unverified, Ad-Hoc Signed / Stripped Binary Blobs in Source Repo (Critical)
- **Location**:
  - `composeApp/src/desktopMain/native/macos/engine/libnuvio_engine.dylib`
  - `composeApp/src/desktopMain/native/windows/engine/nuvio_engine.dll`
  - `composeApp/src/desktopMain/native/linux/engine/libnuvio_engine.so`
  - `composeApp/libs/lib-nuvio-engine-android-0.1.5.aar` & `composeApp/libs/nuvio-engine-jvm-0.1.5.jar`
  - `composeApp/src/desktopMain/native/macos/runtime/{arm64,x86_64}/*.dylib` (138 pre-compiled `.dylib` binaries)
- **Confidence**: High
- **Issue**: Even when "building from source" (`./gradlew :composeApp:run`), Gradle packages and executes pre-compiled native binaries committed directly to the git tree (`build.gradle.kts:958-983`). `codesign -dvvv` and REA `trace_dylib_resolution` confirm `libnuvio_engine.dylib` is **ad-hoc signed** (`Signature=adhoc`, `TeamIdentifier=not set`), and `libnuvio_engine.so` is **stripped**. No source code or reproducible build provenance is provided for `libnuvio_engine`.
- **Impact**: Running the app (or building it from source) executes opaque native machine code with full user privileges, network access, and filesystem access.

---

### [VULN-002] Remote JS Plugin SSRF to Localhost/LAN & API Key Theft via Host Bridge (Critical)
- **Location**:
  - `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/network/FetchBridge.kt:25-73`
  - `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.desktop.kt:100-132`
  - `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/host/HostFunctions.kt:56`
- **Confidence**: High
- **Issue**:
  1. `PluginRepository.kt:425` automatically downloads remote `.js` scraper code (`val code = httpGetText(codeUrl)`) on startup/refresh and executes it in `PluginRuntime.kt`.
  2. `FetchBridge.kt` binds `__native_fetch` into QuickJS, which delegates directly to `httpRequestRaw` (`AddonPlatform.desktop.kt:100`) using `OkHttpClient` with `followRedirects(true)` and **zero URL scheme, loopback, or private-IP validation**.
  3. `HostFunctions.kt:56` exposes `runtime.function("__get_tmdb_api_key") { TmdbSettingsRepository.effectiveApiKey() }` to every QuickJS plugin.
- **Evidence**:
  ```kotlin
  // FetchBridge.kt:25
  runtime.asyncFunction("__native_fetch") { args ->
      val url = args.getOrNull(0)?.toString() ?: ""
      val method = args.getOrNull(1)?.toString() ?: "GET"
      ...
      performNativeFetch(url, method, headersJson, bodyKind, body, followRedirects)
  }
  // HostFunctions.kt:56
  runtime.function("__get_tmdb_api_key") { TmdbSettingsRepository.effectiveApiKey() }
  ```
- **Impact**: Any malicious or compromised third-party plugin repository can execute arbitrary HTTP requests (`GET`, `POST`, `PUT`, `DELETE`) against services on `127.0.0.1` / `localhost` (including the local `nuvio_engine` HTTP server, local Jellyfin/Emby servers, or local developer daemons), scan the user's LAN, steal the user's TMDB API key, and exfiltrate all responses externally.

---

### [VULN-003] Unauthenticated Auto-Updater Executes Downloaded Installers Without Checksum or Signature Verification (High)
- **Location**:
  - `composeApp/src/commonMain/kotlin/com/nuvio/app/features/updater/AppUpdaterRepository.kt:119-148`
  - `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/updater/AppUpdaterPlatform.desktop.kt:86-177, 353-369`
- **Confidence**: High
- **Issue**: `AppUpdaterPlatform.downloadUpdateAsset` downloads an `.msi`, `.exe`, `.dmg`, `.deb`, `.rpm`, or `.AppImage` from `assetUrl` checking only `Content-Length` (`downloadedBytes != totalBytes`), with **no SHA-256 hash verification and no signature verification**, and immediately executes it via `ProcessBuilder`.
- **Evidence**:
  ```kotlin
  // AppUpdaterPlatform.desktop.kt:365-366
  append("if cp -f -- $downloaded $target; then ")
  append("chmod +x -- $target; rm -f -- $downloaded; exec $target; ")
  ```
- **Impact**: A compromised release asset, MITM/redirect, or poisoned update channel results in immediate arbitrary code execution.

---

### [VULN-004] Plaintext Cloud Exfiltration & Unencrypted Disk Storage of Third-Party Credentials (High)
- **Location**:
  - `composeApp/src/commonMain/kotlin/com/nuvio/app/core/sync/ProviderCredentialSync.kt:123-216`
  - `composeApp/src/commonMain/kotlin/com/nuvio/app/core/sync/MediaServerSync.kt:111-122`
  - `composeApp/src/desktopMain/kotlin/com/nuvio/app/core/storage/DesktopStorage.kt:163-168`
  - `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/servers/ServerStorage.desktop.kt:5-20`
- **Confidence**: High
- **Issue**:
  1. When signed into a Nuvio account, `ProviderCredentialSync` automatically uploads the user's private **Real-Debrid, TorBox, Premiumize, AllDebrid, TMDB, MDBList, AnimeSkip, and IntroDB API keys** in plaintext JSON (`sync_push_provider_credentials`) to Nuvio's centralized Supabase server.
  2. `MediaServerSync` automatically uploads the user's **private Jellyfin/Emby server URLs, usernames, and authentication tokens** (`SyncedServer.token`) in plaintext JSON (`sync_push_media_servers`) to Nuvio's Supabase server.
  3. On disk, `DesktopStorage.kt` writes all credentials (`server_credentials.properties`, `nuvio_auth.properties`, etc.) as **unencrypted Java `.properties` files** without OS Keychain encryption or `0600` permission hardening.
- **Evidence**:
  ```kotlin
  // ProviderCredentialSync.kt:124
  SupabaseProvider.client.postgrest.rpc(
      function = "sync_push_provider_credentials",
      parameters = credentialParams(snapshot),
  )
  ```
- **Impact**: Anyone with access to Nuvio's Supabase database (or a database breach) obtains users' paid Debrid API keys and direct authentication tokens to their home Jellyfin/Emby media servers.

---

### [VULN-005] Arbitrary URI / Local File Execution via `ExternalPlayerPlatform` (High)
- **Location**: `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/player/ExternalPlayerPlatform.desktop.kt:41-67`
- **Confidence**: High
- **Issue**: When opening a stream in an external player, `openUri(request.sourceUrl)` accepts any URI returned by an untrusted addon/plugin. If the URI scheme is `file://`, it calls `desktop.open(File(uri))`; otherwise it falls back to `rundll32 url.dll,FileProtocolHandler <rawUri>`, `open <rawUri>`, or `xdg-open <rawUri>`.
- **Evidence**:
  ```kotlin
  if (uri.scheme.equals("file", ignoreCase = true)) {
      desktop.open(File(uri))
  } else {
      desktop.browse(uri)
  }
  ```
- **Impact**: A malicious addon can return a `file://` path or custom OS URI scheme (`ms-msdt:`, `search-ms:`, etc.) to launch local executables or trigger OS protocol handler vulnerabilities.

---

### [VULN-006] Path Traversal in Media Downloader (`DownloadsPlatformDownloader.desktop.kt`) (Medium)
- **Location**: `composeApp/src/desktopMain/kotlin/com/nuvio/app/features/downloads/DownloadsPlatformDownloader.desktop.kt:48-49`
- **Confidence**: High
- **Issue**: `request.destinationFileName` is joined directly to `downloadsDir` (`File(downloadsDir, request.destinationFileName)`) without stripping directory separators or `..` segments, and `if (destination.exists()) destination.delete()` deletes any existing file at the resolved path before overwriting it.
- **Evidence**:
  ```kotlin
  val destination = File(downloadsDir, request.destinationFileName)
  val tempFile = File(downloadsDir, "${request.destinationFileName}.part")
  ```
- **Impact**: If an addon/stream metadata supplies `../../...` in the filename, files outside the `downloads` directory can be overwritten.
