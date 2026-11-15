# C.R.E.W — Landing Page

Static landing page for C.R.E.W (pixel-art CubeSat mission sim). Plain HTML/CSS/JS, so there is no build step and GitHub Pages serves it as-is.

```
index.html          Landing page (Hero, Briefing, Trailer, Mission stages, Final CTA)
play/index.html     Play page, embeds the game from /game in an iframe
game/               Put the Godot web export here (index.html, .wasm, .pck, .js)
assets/css|js|img   Styles, scripts, images
assets/vendor       GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13 (self-hosted, no CDN)
assets/fonts        Silkscreen, JetBrains Mono, Space Grotesk (self-hosted, latin subset)
```

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages
1. Push this folder to a GitHub repo.
2. Go to repo **Settings → Pages → Build and deployment**, set Source to *Deploy from a branch*, Branch `main`, folder `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`.

## Adding the game (Godot)
1. In Godot: **Project → Export → Add… → Web**.
2. **Turn OFF "Thread Support"** (Godot 4.3+). GitHub Pages can't send the COOP/COEP headers that threaded builds need, so leaving it on gives a blank screen or a SharedArrayBuffer error.
3. Export as `index.html` into the `game/` folder and commit everything Godot outputs.
4. Watch the size: GitHub blocks files over 100 MB. Keep the `.pck`/`.wasm` small, or host the build on itch.io and point `GAME_URL` in `play/index.html` at it.

## Adding the teaser video (Google Drive)
1. In Drive, right-click the video, choose **Share**, and set **General access** to *Anyone with the link*.
2. Copy the ID from the link: `drive.google.com/file/d/`**`THIS_PART`**`/view`.
3. Paste it into `data-drive-id=""` in `index.html` (Trailer section).

Drive previews can be slow or get rate-limited for popular files. If that happens, upload to YouTube and swap the iframe src.

## Replacing placeholders
- **Copy:** all text in `index.html` is sample copy.
- **Screenshots:** replace `<span>SCREENSHOT 0X</span>` inside `.stage__shot` with `<img src="assets/img/design.png" alt="...">`.
- **Globe:** `assets/js/borneo-map.js` holds the land + Sarawak masks (Natural Earth 50m land, public domain; the Sarawak outline is an approximation for illustration). View centre/zoom is `VIEW` in `assets/js/main.js`.
- **Pixel sprites:** edit the grids in `assets/js/sprites.js` (each letter maps to a color in `palette`).
- **Colors & type scale:** CSS variables at the top of `assets/css/style.css`.
- **Fonts:** pixel font (`--display`) for headings, buttons and numbers only; mono (`--mono`) for small labels; Space Grotesk (`--sans`) for all paragraphs.
