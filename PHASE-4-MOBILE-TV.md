# Phase 4 — Mobile, remote and installable app experience

MovieBox Web retains the existing cloud-hosted architecture, media storage keys, movie discovery, and live TV source logic. This phase improves UI controls and app navigation; it does not claim native Android TV, Apple TV, Roku or Samsung/Tizen app support.

## Live TV player
- **Previous / Next channel** in the video dialog, cycling through the currently loaded/search-filtered channel list (deduplicated by channel ID or title).
- **Fullscreen** button using the browser Fullscreen API with a WebKit video fullscreen fallback where available.
- **TV keyboard navigation:** arrow keys move focus between visible buttons/links; Enter activates the focused control through native browser keyboard behavior. The player uses Page Up/Page Down to switch channels and F to toggle fullscreen. Arrow keys on the video itself are left to browser video controls.
- The browser player, HTTPS source preference, automatic source failover, favorites and guide functionality are preserved.
- Touch targets are expanded, layout scales to narrow devices, and player/video surfaces respect mobile safe areas.

## Personal library
- The existing library player has a dedicated fullscreen control, without changing the VLC handoff or storage.

## Progressive Web App (PWA)
- App manifest includes Home, Live TV, Discover, and Library entry points and operating-system shortcuts.
- `pwa.js` registers the service worker across Home, Discover and Live TV. The homepage shows an **Install** button only where the browser offers an install prompt.
- PWA service worker caches only same-origin static app-shell pages and assets. It uses network-first navigation and has a clear offline fallback page. **It does not intentionally cache** IPTV playlists, stream URLs, movies, provider API calls, HLS/DASH video segments or protected content.
- On iOS, users can use Safari **Share → Add to Home Screen** when supported; no install prompt is promised.
- Some browsers require raster icons and other installability metadata beyond the existing SVG icon. Install prompts and launch shortcuts should be checked on each device.

## Manual testing checklist
1. Desktop: launch a Live TV stream, click next/previous channel, toggle fullscreen, exit.
2. Phone: select a channel, check usable touch buttons, safe area and native fullscreen behavior; check both portrait and landscape.
3. TV with keyboard/remote: use arrows, Enter, Page Up/Page Down and F; ensure focus never moves behind an open modal.
4. Install/PWA: install where prompted, launch via Home and Live TV shortcuts, disconnect and confirm offline fallback loads **without pretending video works offline**.
5. Regression: search a movie, open Watch, VLC handoff, EPG Now/Next, favorites and local library remain functional.

Automated GitHub workflow syntax checks validate `app.js`, `discover.js`, `live-tv.js`, `tv-guide.js`, `pwa.js` and `sw.js`. Successful playback and actual app installation are browser/device-specific and require manual verification.
