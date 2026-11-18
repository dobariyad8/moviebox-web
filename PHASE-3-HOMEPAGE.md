# Phase 3 — Unified MovieBox homepage

The MovieBox Web homepage (`index.html` with `app.js` and `styles.css`) now unifies the existing features without moving or changing their storage keys.

## Sections

- A redesigned featured hero with movie/series search, routed to `discover.html?q=...` and handled by the existing Rust-backed Discover page
- One-click navigation to **Explore**, **Live TV**, the **TV Guide**, and adding local media
- Library metrics based on real entries on the device, not invented data
- **Continue watching** from the existing local library history; plays continue to use the existing player
- **Your movie watchlist**, pulled from the already-saved `moviebox-rust-watchlist-v1` metadata
- **Favorite live channels**, from `moviebox-live-favorites-v1`, linking to a specific channel in `live-tv.html?channel=...`
- **Your saved media**, from local-library favorites, and the local library
- Useful empty states and clear onboarding when there is no saved media

## Data and privacy

The homepage only reads browser localStorage for the current device:

| Storage key | Purpose |
| --- | --- |
| `moviebox-web-data-v1` | Personal library items, favorites and playback history |
| `moviebox-rust-watchlist-v1` | Movie and series saved in Discover |
| `moviebox-live-favorites-v1` | Channels saved in Live TV |

The dashboard does not contact third-party endpoints on its own. Remote movie searches happen only after a user searches in Explore; actual playback and EPG data are handled by existing dedicated pages. Shared browser storage lets those sections appear together without requesting an account. No viewing history is invented or inferred from a watchlist.

The home view remains responsive on mobile. The existing navigation and settings are retained, and same-page hash links now navigate without a reload. Home refreshes from localStorage on page restore and storage events; tab-local changes refresh when an entry is added or played.

The movie watchlist cards link to MovieBox Explore with the title filled in, not directly to a playback URL. Live favorites link to a channel by ID/title; when available the Live TV page opens the channel, including locally saved favorites. The TV Guide shortcut goes to `live-tv.html#guide`.

## Verification

GitHub JavaScript syntax check covers `app.js` and `live-tv.js`. Manual tests for Cloudflare deployment, browser runtime, mobile layouts, and channels from differing country lists remain necessary.
