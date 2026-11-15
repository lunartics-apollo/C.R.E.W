# Deployment (Cloudflare Pages)

**Status: not deployed.** No Cloudflare credentials were available in this session, so there is no public URL yet.

## Cloudflare Pages via Git
1. Push this folder to a GitHub or GitLab repository. Exclude `node_modules/` and `dist/`; `.gitignore` already does this.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Framework preset: **None**. Build command: `npm run build`. Build output directory: `dist`. Set the environment variable `NODE_VERSION=22` or newer.
4. Deploy, then open the `*.pages.dev` URL. The game is a single route at `/`, so no redirects are needed. Assets use relative paths (`base: './'`), so it also works from a sub-path.

## Direct upload (no Git)
```bash
npm run build
npx wrangler pages deploy dist --project-name borneo-sentinel
```
`wrangler` asks you to log in to your own Cloudflare account. Do that step yourself.

## Checks after deploying
- Open the URL in a private window. The menu should appear, and Start should work without login.
- `/?demo=1` should open the test lab with the balanced build on a first visit.
- DevTools should show no failed requests. The total transfer is about 1 MB gzipped.

## Judge demo script (2–3 minutes)
1. **Menu (10 s):** parallax Sarawak night, the ground dish tracking the CubeSat. Click **Judge Demo**.
2. **Test lab (40 s):** click *Run all pending*. The animated rigs run, and T4 passes because the demo uses 2 switches and 30/45 min timers. Lower *First transmission* to 10 min and re-run T4: it fails, citing NASA §6.7 and §6.9.1, with a fix. Restore it and re-run.
3. **Workshop detour (30 s):** *Back to workshop* → install the multispectral camera. The volume goes over, the director says "the dispenser door can't close", and the banner shows that tests are invalidated. Click **Undo**.
4. **MRR (15 s):** run the poll → seven stations GO → *Approve launch*.
5. **Launch (15 s):** watch the cinematic, or skip it.
6. **Operations (45 s):** first-contact Doppler tuner, then a capture decision with the cloud forecast, energy and storage. Turn on auto-downlink. Point out the ground track, the day/night terminator and the station circle. Show the storm anomaly card when it appears.
7. **Debrief (20 s):** the outcome derived from returned usable data, the score formula, the dataset table, and the *Redesign & retry* button.
