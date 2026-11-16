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
