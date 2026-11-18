# Live TV (iptv-org)

The `Live TV` tab now opens `live-tv.html`, a browser-friendly, mobile-responsive view of publicly listed IPTV streams from https://github.com/iptv-org/iptv.

Features:
- Country, category, and worldwide playlists, sourced on demand from https://iptv-org.github.io/iptv/
- Search within the loaded playlist and paginate channel cards
- Favorite channels saved on the local device
- Browser playback using native video/HLS support where available, with optional hls.js
- VLC external-player attempts for HTTP/HTTPS streams, including the existing Windows `movieboxvlc://` protocol handler

No extra Render backend or token is needed. This is a catalog of community-submitted links, **not a playback guarantee**. Sources can be offline, geoblocked, restricted, CORS-blocked, or require unavailable headers; HTTP cannot be embedded in the site's HTTPS page. Third parties host all content. The site neither hosts media nor overrides access controls.

Original playlist: https://iptv-org.github.io/iptv/index.m3u. Country and category paths are described in https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md.

To add more regions or groups, edit `countries` or `categories` in `live-tv.js`. To change the default, edit `state.selected` (currently `us`).

The `Live TV` tab links from both desktop and mobile navigation. Old manually imported channels remain in the local library, unchanged.

## Watch a particular channel in the browser

Click the channel's **Watch** button. The player prefers HTTPS URLs from the current playlist, tries native playback or HLS.js as applicable, and automatically tries another HTTPS URL for the same channel if playback fails (including a startup timeout). The **HTTPS channels only** checkbox filters out HTTP listings. In the player, you can still switch source manually. The former full-playlist VLC button has been removed because the main Live TV workflow is one channel at a time.

Browser playback is not identical to opening an M3U playlist in VLC: a playlist can load and show channels even if the individual source is unreachable. Browser playback also requires HTTPS and the stream host permitting cross-origin access for HLS.js, plus a supported codec. The app doesn't proxy, transcode, or bypass stream permissions. VLC remains an optional per-channel fallback.

## Phase 1: playback reliability (November 2026)

- After a channel actually starts playing, its HTTPS URL is recorded as **Played here** in browser localStorage and preferred on future visits.
- Failed attempts are recorded as **Failed recently** and deprioritized for 30 minutes where alternative URLs exist. Observations expire after 14 days and storage is bounded to the most recent 1200 URLs.
- If a channel cannot start in 15 seconds, HLS.js reports a fatal error, or a previously playing stream stalls for 15 seconds, the player tries another HTTPS mirror from the same playlist.
- Manual source selection still overrides automatic priority. A channel with only HTTP sources cannot play embedded on the HTTPS site.
- **Reset status history** clears local observations; the app never claims to know global channel availability. The local observations are not sent to a backend.
- Browser autoplay restrictions are not treated as channel failures; press the Play control to begin.

Limitations: This is device-observed and opportunistic, not active global health monitoring. Streams may be blocked by CORS, region rules, access controls, missing media codecs, or external server downtime. No proxy, DRM bypass, or transcoding is introduced. Functional device playback and Cloudflare deployment require verification.

## Phase 2: XMLTV Electronic Program Guide

The Live TV page now includes a **What's on TV?** panel. The iptv-org project publishes a directory of available guide sources at `https://iptv-org.github.io/api/guides.json`, but does **not** provide a guaranteed universal EPG schedule for every streamed channel.

How to use:
1. Select a country or category to load the associated channels.
2. Click **Find public guide sources**. This matches current playlist `tvg-id` values (including feed suffix handling) against the published guide directory and ranks source URLs by match count.
3. Select an XMLTV source and click **Use selected source**. Alternatively, enter an external XMLTV HTTP(S) URL or upload a local `.xml`, `.xmltv`, or `.xml.gz` guide file.
4. Loaded program schedules show **Now** and **Next** beneath matching channel cards. Select **Guide** for a channel's schedule (up to 48 hours), with times displayed in the viewer's local time zone. **Watch channel** opens the existing browser player.
5. Optionally enable **Remember guide URL on this device** to reload the URL when you return. Uploaded guide files are not saved; no program listings or authentication tokens are stored by the application. Clear guide removes remembered URL.

Files: `tv-guide.js` implements XMLTV parsing, source discovery and program times; the guide UI is in `live-tv.html` and `live-tv.css`, integrated with `live-tv.js`.

**Practical limits:** Public EPG sources may be missing, temporarily unavailable, require authentication, have inaccurate schedule data, or block cross-origin browser requests (CORS). The page offers file upload as a fallback. Uploaded and downloaded guides are processed in the browser. DecompressionStream is required for `.gz` when the browser receives compressed bytes; a source file larger than 12 MB compressed or 30 MB expanded is rejected. TV channels with no matching schedule explicitly show **No guide available**; no schedules are guessed. This feature does not create or host program data.
