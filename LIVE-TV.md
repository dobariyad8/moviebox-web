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
