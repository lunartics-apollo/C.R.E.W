# C.R.E.W — Landing Page

Static landing page for C.R.E.W, a pixel-art space mission game set in Sarawak. Plain HTML, CSS and JavaScript, so there is no build step.

The game itself is a separate site. Every **Play** button opens it in a **new tab**: `https://crew-station.vercel.app` (three links in `index.html`; search for `crew-station`).

```
index.html          Landing page (Hero, Briefing, Trailer, Mission stages, Final CTA)
assets/css|js       Styles and scripts
assets/vendor       GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13 (self-hosted, no CDN)
assets/fonts        Silkscreen, JetBrains Mono, Space Grotesk (self-hosted, latin subset)
```

## Run locally
```bash
python -m http.server 8000
# open http://localhost:8000
```

## Deploy
It is a static site: upload this folder as it is. On Vercel, run `npx vercel` from this folder (Framework: Other, no build command, output directory `.`). On GitHub Pages, serve the folder root.

## The pitch video
The Trailer section plays `assets/video/crew-pitch-v3.mp4` (30 s, H.264 + AAC, about 35 MB) when you click the poster. It loads only on click. To swap the video, replace that file, or change `data-video-src` in `index.html`.

If there is no `data-video-src`, the section falls back to a Google Drive preview: put the file ID (the part between `/d/` and `/view` in the share link) into `data-drive-id`.

## Content
- **Story:** the Premier of Sarawak calls, the team meets, you build, test, launch and fly a 3U CubeSat over the Rajang River for ten days, then read a debrief. The five stages in the Mission section follow that order.
- **Screenshots:** replace `<span>SCREENSHOT 0X</span>` inside `.stage__shot` with `<img src="assets/img/shot-01.png" alt="...">` when you have game screenshots.
- **Globe:** `assets/js/borneo-map.js` holds the land + Sarawak masks (Natural Earth 50m land, public domain; the Sarawak outline is an approximation for illustration). View centre/zoom is `VIEW` in `assets/js/main.js`.
- **Pixel sprites:** edit the grids in `assets/js/sprites.js`.
- **Colors & type scale:** CSS variables at the top of `assets/css/style.css`.
