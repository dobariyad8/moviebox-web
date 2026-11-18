# HTTP movie links in the MovieBox browser player

**Status: implemented in source code, not yet activated on Render or confirmed in a live movie playback test.**

When a movie search provider returns a direct HTTP video file without special headers, MovieBox Discover can request a short-lived HTTPS playback URL from the Rust API and use it in its in-app video player instead of opening VLC.

This is **not** a universal VLC replacement, DRM workaround, or unrestricted proxy. Only media you own or have permission to relay should be configured.

## Activation on Render

Set these **server-side** environment variables on `moviebox-web-api`:

- `STREAM_ACCESS_TOKEN`: a strong private token (at least 24 characters), **already used** by the source lookup endpoint. Keep it confidential. The operator must enter it in the Discover playback dialog. Do not commit it or set it in public frontend code.
- `MEDIA_PROXY_ALLOWED_HOSTS`: comma-separated, exact media hostnames **you are authorized to relay**. Example: `media.example.com,cdn.example.net` (examples only; replace with real approved hosts). No protocol, IP addresses, wildcards, path, ports, localhost, or internal/private hostnames.

If `MEDIA_PROXY_ALLOWED_HOSTS` is not configured, the gateway fails closed with a 503 response. **Do not set it to `*`** or to random hosts from search results.

1. Identify a direct HTTP `.mp4` (or another browser-decodable direct movie file) from a provider you are authorized to use.
2. Confirm the streaming provider permits server-side relaying; check bandwidth and outbound transfer costs on Render.
3. Put the **exact hostname** in `MEDIA_PROXY_ALLOWED_HOSTS` and configure `STREAM_ACCESS_TOKEN` privately on Render.
4. Deploy the backend commit that includes `backend/src/gateway.rs`.
5. Open `https://moviebox-web-d7u.pages.dev/discover.html`. Search a movie, select a title, enter the private API token, click **Find sources**, choose the approved HTTP direct-file source, and press **Play in browser**.
6. Confirm seeking, pause/resume, browser compatibility and failure handling on a test file before enabling additional hosts.

## Gateway design

- `POST /api/playback/prepare`: requires the private API bearer token; accepts a verified direct-file URL without custom request headers; checks a fixed hostname allowlist; creates a random opaque 4-hour lease identifier.
- `GET /api/playback/file/{token}`: retrieves the approved upstream video server-side over HTTP or HTTPS, pins to public DNS addresses, blocks local/private/multicast/loopback targets, disallows upstream redirects, forwards a **single byte Range** for seeking, and streams the movie back over Render HTTPS.
- Expired or unknown session tokens are rejected. No source credentials or upstream URL are embedded in the public playback URL. Server-side request/response caches are disabled for sensitive data.
- Rate control: maximum 10 concurrent video requests and 256 active sessions, maximum 12 GiB per response. The gateway can consume significant outbound traffic and infrastructure costs even when the source is free.
- Not supported: HTTP HLS playlist rewriting and segment relaying, headers/cookies required by upstream sources, non-direct resolver pages, DRM-protected content, subtitles requiring custom access, codec transcoding or multi-hop redirects.

## Security limitations

The playback URL is a short-lived bearer capability: anyone who possesses it before it expires can stream that lease. Treat it as sensitive and avoid sharing it. The backend checks `STREAM_ACCESS_TOKEN` only when creating the lease because native HTML5 `<video>` cannot provide a bearer header to every request. For public production use, add per-account authorization/quotas and stronger anti-abuse protection before allowing broad usage.

The gateway has explicit anti-SSRF safeguards, but any new allowed domain should still be reviewed for DNS behavior, external redirects, and terms of use. Media is not automatically licensed merely because its URL appears in MovieBox search.

## Testing

- [ ] GitHub `Backend Rust check` workflow passes `cargo check` and `cargo test` after the backend commit.
- [ ] GitHub `Frontend JavaScript syntax` workflow passes `tests/movie-http-playback.test.cjs`.
- [ ] Render deploy reflects the new backend commit and remains healthy.
- [ ] Approved direct HTTP MP4 with H.264/AAC plays inside MovieBox via HTTPS.
- [ ] Range seeking produces HTTP 206 responses and timeline navigation works.
- [ ] Unknown hosts, loopback/IP hosts, redirect responses, HTML content and expired leases fail closed.
- [ ] No accidentally public source token, provider cookies, or secret API keys appear in frontend code.
- [ ] Bandwidth usage, concurrent users and playback timeouts are acceptable.

Until the host allowlist is configured and a live test passes, HTTP movie playback is **not yet operational**. Browser codecs and providers may still prevent playback even when the HTTP-to-HTTPS gateway is enabled.
