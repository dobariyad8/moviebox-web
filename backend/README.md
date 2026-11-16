# MovieBox Web API — Rust backend

This is a standalone HTTP adapter around the **actual** [MovieBox-TUI](https://github.com/mesamirh/MovieBox-Tui) Rust library, not a replacement/mock provider. It is independent of the Cloudflare Pages frontend.

## Implemented endpoints

| Route | Behavior |
| --- | --- |
| `GET /api/health` | Server health; does **not** claim provider connectivity |
| `GET /api/providers` | Registered upstream provider capabilities |
| `GET /api/search?provider=moviebox&query=example&page=1` | Calls upstream `MovieBoxService::search_typed` |
| `GET /api/details?provider=moviebox&id=...` | Calls upstream `MovieBoxService::details_typed` |
| `GET /api/streams?provider=moviebox&id=...&season=1&episode=1` | Calls upstream `ReleaseProvider::episode_streams`; **disabled until configured** |

The response shapes preserve upstream `CatalogItem`, `MediaDetails`, `ProviderCapabilities` and `Release` types. The backend does not transcode videos, proxy media, handle DRM, or guarantee browser playback. The streaming endpoint can return sensitive signed links and must be restricted to trusted callers.

## Requirements

- Rust toolchain compatible with upstream MovieBox-TUI (Rust 1.90+, subject to upstream dependencies).
- Internet connectivity for upstream providers and GitHub dependencies.
- Backend-capable hosting such as a container service. Cloudflare Pages alone does not run this native Rust server.

## Run locally

```bash
cd backend
cargo run --release
```

Then:

```bash
curl http://127.0.0.1:8080/api/health
curl 'http://127.0.0.1:8080/api/providers'
curl 'http://127.0.0.1:8080/api/search?provider=moviebox&query=example&page=1'
```

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Listening port |
| `FRONTEND_ORIGIN` | `https://moviebox-web-d7u.pages.dev` | The one permitted browser CORS origin |
| `STREAM_ACCESS_TOKEN` | Unset | When a strong token of at least 24 characters is set, permits stream lookup using a server-side bearer token. Keep it private. |
| `RUST_LOG` | `moviebox_web_api=info,tower_http=info` | Logging filter |

Authorized server-side callers can request source listings using an `Authorization: Bearer <token>` header. **Never expose this token in public browser code or a frontend environment variable.**

CORS is not authentication. For a public Internet deployment, add perimeter authentication and rate limits before exposing expensive provider calls.

## Container build

```bash
docker build -t moviebox-web-api ./backend
docker run --rm -p 8080:8080 -e PORT=8080 moviebox-web-api
```

This repo's `backend/Dockerfile` builds the Rust binary and serves it on `PORT`. Use a Docker-supporting host and point the build context to the `backend` folder.

## Development status

- [x] Exposes separate typed search, details and guarded release-discovery routes.
- [x] Uses the upstream Rust library directly (pinned Git revision).
- [x] Basic request validation and structured JSON errors.
- [ ] **Compile and runtime tests against the pinned upstream dependency** (not yet executed in the authoring environment).
- [ ] Backend deployment; currently **not online**.
- [ ] Strong deployment auth, rate limiting and monitoring.
- [ ] Secure browser-to-backend integration. The live frontend currently uses public metadata discovery.
- [ ] Stream quality / subtitle selection and browser playback compatibility.

### Licenses

The upstream project is available under MIT or Apache-2.0; see the source repository for original notices. This adapter is newly authored; preserve upstream attribution when redistributing third-party code.

## Watch Now integration (MovieBox Web Explore)

The frontend `discover.html` now offers Watch Now → Find sources → Select → Browser video / Open in VLC / Copy URL.

**One-time private setup:**
1. In Render Dashboard → `moviebox-web-api` → Environment, set `STREAM_ACCESS_TOKEN` to a newly generated long random value (at least 24 characters). This is unrelated to the provider credentials; it controls access to the private release-list endpoint.
2. Save and redeploy the backend.
3. In the MovieBox Explore page, open title → Details → Watch Now; manually enter the same secret into the Access token field. It is kept in memory only and cleared when the Watch dialog closes. Do not share it or put it into the repository.
4. Select season/episode (if present) → Find sources. Only provider mirrors marked `direct_file` with HTTPS and no additional request headers offer direct browser/VLC actions.

**Limits:** The UI deliberately cannot replay requests that need special cookies, headers, short-lived signatures or a multi-step resolver. A listed mirror isn't a verified playback link. Some direct HTTPS URLs still fail due to encoding, CORS, access restrictions, or source expiration. Browser support and VLC-app deep-link handling vary. The public API search/details routes are separate from source access; protect the service and avoid embedding secrets in shipped JavaScript.

The code should be tested on target devices after deployment; the automated Rust CI currently checks compilation and unit tests, not end-to-end playback.
