# MovieBox browser-first movie playback

Updated November 18, 2026.

## Implemented

The Discover movie-source dialog includes **Play in browser**, fullscreen, and a standard HTML5 video player. Compatible direct HTTPS movie sources can be played without VLC.

The player uses:
- Native browser video playback for formats the browser supports, such as suitably encoded MP4.
- HLS.js (version pinned to 1.6.13, as already used for the Live TV page) for HTTPS `.m3u8` manifests when supported by the browser.
- Native HLS playback on compatible browsers (for example, Safari) when HLS.js is not supported.

Browser playback is offered only when a release mirror is declared a **direct file**, is HTTPS, and does not require provider-specific request headers. The app still protects release lookup with its existing `STREAM_ACCESS_TOKEN` mechanism and preserves the **Open in VLC** and **Copy URL** alternatives.

## Why HTTP and HTTPS are not interchangeable in a browser

The production site is served over HTTPS. Browsers enforce mixed-content security rules. An ordinary HTTP-only video link may be blocked or upgraded to HTTPS automatically, which still fails if the server does not support HTTPS. Browser JavaScript cannot disable mixed-content enforcement. CORS, codec availability, DRM, session requirements, signed URLs, and regional restrictions are separate constraints.

VLC is a native media player with capabilities and network access patterns different from a web page; a browser cannot be made universally VLC-compatible with JavaScript alone.

## Safe architecture for authorized HTTP-only and exotic-codec streams

For media you own or are explicitly allowed to relay:
1. Use a **server-controlled origin allowlist** for approved upstream media hosts, never an arbitrary public URL proxy.
2. Terminate HTTPS at your own media delivery hostname. Fetch upstream media server-side with strict SSRF protections: reject private/loopback/link-local targets, validate redirects and DNS resolutions, bound redirects/timeouts, restrict methods, headers, byte ranges, and response size.
3. Restrict access to authorized accounts and implement streaming bandwidth limits, connection limits and abuse protections.
4. Correctly implement byte-range requests for seekable playback and rewrite HLS manifests and segment URLs only for approved origins.
5. When the browser cannot decode the container or codec, **transcode authorized media** to broadly compatible H.264/AAC (MP4 or HLS). This is resource-intensive and may require paid compute/storage.
6. Respect upstream authorization, media licenses, signed URLs and regional access controls. Do not forward provider cookies/headers to arbitrary clients.

**Not implemented:** A general-purpose HTTP-to-HTTPS proxy, DRM bypass, arbitrary provider cookie forwarding, or automatic transcoding. None of these can be safely promised for arbitrary movie-provider links. Existing Render source lookup is unchanged.

## Verification checklist

- [ ] Load a direct HTTPS H.264/AAC MP4 and verify Play in browser / seek / volume / fullscreen on mobile and desktop.
- [ ] Load an authorized HTTPS HLS URL with CORS permission on Chrome/Firefox; verify HLS.js.
- [ ] Try a supported native-HLS device; verify playback without HLS.js.
- [ ] Verify HTTP and protected-header sources remain identified as unsupported browser direct playback.
- [ ] Confirm private-token source lookup is still protected.
- [ ] Verify unavailable/mismatched media shows an error and VLC fallback remains available.

JavaScript syntax and HLS URL detection checks were run. Live browser playback depends on actual user-provided sources and hasn't been independently confirmed.
