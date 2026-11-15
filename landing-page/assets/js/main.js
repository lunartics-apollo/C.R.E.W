(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  /* =========================================================
     Smooth scroll (Lenis), wired into GSAP's ticker
     ========================================================= */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    if (hasGSAP) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    lenis.stop();
  }

  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id === "#" || id === "#top" ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else if (target === 0) scrollTo({ top: 0 });
    else target.scrollIntoView();
  }));

  /* =========================================================
     Text scramble
     ========================================================= */
  const GLYPHS = "!<>-_/[]{}=+*^?#%&$01░▒▓█";
  function scramble(el, duration = 600) {
    const final = (el.dataset.text ??= el.textContent);
    const len = final.length;
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const shown = Math.floor(p * len);
      let out = "";
      for (let i = 0; i < len; i++) {
        const c = final[i];
        out += i < shown || c === " " ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  if (!reduce) $$("[data-scramble]").forEach((el) => el.addEventListener("mouseenter", () => scramble(el, 450)));

  /* =========================================================
     Starfields
     ========================================================= */
  $$("canvas.stars").forEach((sky) => {
    const ctx = sky.getContext("2d");
    let stars = [], shooting = null, visible = true;
    const resize = () => {
      sky.width = sky.offsetWidth;
      sky.height = sky.offsetHeight;
      const count = Math.floor((sky.width * sky.height) / 4200);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * sky.width, y: Math.random() * sky.height,
        s: Math.random() < 0.85 ? 2 : 4, p: Math.random() * 6.28, sp: 0.5 + Math.random(),
      }));
    };
    const draw = (t) => {
      if (visible) {
        ctx.clearRect(0, 0, sky.width, sky.height);
        for (const st of stars) {
          const a = 0.25 + 0.75 * Math.abs(Math.sin(st.p + (t / 1000) * st.sp));
          ctx.fillStyle = `rgba(239,233,218,${a.toFixed(2)})`;
          ctx.fillRect(st.x | 0, st.y | 0, st.s, st.s);
        }
        if (!shooting && Math.random() < 0.004) shooting = { x: Math.random() * sky.width, y: Math.random() * sky.height * 0.5, life: 0 };
        if (shooting) {
          for (let i = 0; i < 8; i++) {
            ctx.fillStyle = `rgba(255,180,61,${(1 - i / 8).toFixed(2)})`;
            ctx.fillRect((shooting.x - i * 6) | 0, (shooting.y - i * 3) | 0, 4, 4);
          }
          shooting.x += 12; shooting.y += 6;
          if (++shooting.life > 40) shooting = null;
        }
      }
      if (!reduce) requestAnimationFrame(draw);
    };
    resize();
    addEventListener("resize", resize);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(sky);
    requestAnimationFrame(draw);
  });

  /* =========================================================
     Pixel globe zoomed on Borneo — real coastlines (assets/js/borneo-map.js),
     Sarawak outlined, drifting clouds, Bayer-dithered shading
     ========================================================= */
  const planet = $(".planet");
  const MAP = window.CREW_MAP;
  if (planet && MAP) {
    const ctx = planet.getContext("2d");
    const N = planet.width, R = N / 2 - 1, C = N / 2;
    const VIEW = { lon: 113.6, lat: 1.4, radius: 10 }; // globe centre + how many degrees the disc spans (zoom)
    const KCH = { lon: 110.34, lat: 1.55 };
    const rad = Math.PI / 180;

    const bits = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const landBits = bits(MAP.land), sarBits = bits(MAP.sarawak);
    const cell = (lon, lat) => {
      const x = Math.floor((lon - MAP.lon0) / MAP.step), y = Math.floor((MAP.lat1 - lat) / MAP.step);
      return x < 0 || y < 0 || x >= MAP.w || y >= MAP.h ? -1 : y * MAP.w + x;
    };
    const has = (b, i) => i >= 0 && (b[i >> 3] >> (i & 7)) & 1;
    const nearLand = (lon, lat) => {
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) if (has(landBits, cell(lon + ox * MAP.step, lat + oy * MAP.step))) return true;
      return false;
    };

    // Screen pixel -> lat/lon. Orthographic disc, with the angular distance from centre scaled to VIEW.radius.
    const phi0 = VIEW.lat * rad, lam0 = VIEW.lon * rad;
    const toGeo = (nx, ny) => {
      const r = Math.hypot(nx, ny);
      const c = Math.asin(Math.min(1, r)) * (VIEW.radius / 90);
      const az = Math.atan2(nx, -ny);
      const lat = Math.asin(Math.sin(phi0) * Math.cos(c) + Math.cos(phi0) * Math.sin(c) * Math.cos(az));
      const lon = lam0 + Math.atan2(Math.sin(az) * Math.sin(c) * Math.cos(phi0), Math.cos(c) - Math.sin(phi0) * Math.sin(lat));
      return [lon / rad, lat / rad];
    };
    // lat/lon -> screen pixel (inverse of the above), used for markers
    const toScreen = (lon, lat) => {
      const p = lat * rad, l = lon * rad;
      const c = Math.acos(Math.sin(phi0) * Math.sin(p) + Math.cos(phi0) * Math.cos(p) * Math.cos(l - lam0));
      const az = Math.atan2(Math.sin(l - lam0) * Math.cos(p), Math.cos(phi0) * Math.sin(p) - Math.sin(phi0) * Math.cos(p) * Math.cos(l - lam0));
      const r = Math.sin(Math.min(Math.PI / 2, c * (90 / VIEW.radius)));
      return [C + r * Math.sin(az) * R, C - r * Math.cos(az) * R];
    };

    const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const noise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y) => noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.1;
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
    const shades = [0.5, 0.72, 0.9, 1.06];

    // 1) classify every pixel once: 0 space, 1 deep, 2 shallow, 3 land, 4 sarawak
    const kind = new Uint8Array(N * N), geo = new Float32Array(N * N * 2), lightLvl = new Uint8Array(N * N);
    let sx = 0, sy = 0, sn = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, nx = (x + 0.5 - C) / R, ny = (y + 0.5 - C) / R, r = Math.hypot(nx, ny);
      if (r > 1) continue;
      const [lon, lat] = toGeo(nx, ny);
      geo[i * 2] = lon; geo[i * 2 + 1] = lat;
      const ci = cell(lon, lat);
      kind[i] = has(sarBits, ci) ? 4 : has(landBits, ci) ? 3 : nearLand(lon, lat) ? 2 : 1;
      if (kind[i] === 4) { sx += x; sy += y; sn++; }
      const z = Math.sqrt(1 - r * r), light = Math.max(0, -nx * 0.5 - ny * 0.45 + z * 0.75);
      lightLvl[i] = Math.max(0, Math.min(3, Math.floor(light * 3.3 + (bayer[(y % 4) * 4 + (x % 4)] - 0.5) * 0.9)));
    }

    // 2) bake the static surface
    const base = ctx.createImageData(N, N), bd = base.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, k = kind[i], o = i * 4;
      if (!k) continue;
      const lon = geo[i * 2], lat = geo[i * 2 + 1];
      let col;
      if (k === 1) col = [22, 58, 160];
      else if (k === 2) col = [38, 118, 205];
      else {
        const n = fbm(lon * 2.2, lat * 2.2);
        col = k === 4
          ? (n > 0.62 ? [36, 140, 74] : n > 0.45 ? [58, 178, 92] : [96, 204, 110])   // Sarawak: brighter greens
          : (n > 0.62 ? [22, 92, 54] : n > 0.45 ? [34, 124, 66] : [62, 150, 78]);
        // Sarawak outline in amber (screen-space edge)
        if (k === 4 && [i - 1, i + 1, i - N, i + N].some((j) => kind[j] !== 4)) col = [255, 180, 61];
      }
      const s = col[0] === 255 ? 1 : shades[lightLvl[i]];
      bd[o] = Math.min(255, col[0] * s); bd[o + 1] = Math.min(255, col[1] * s); bd[o + 2] = Math.min(255, col[2] * s); bd[o + 3] = 255;
      const r = Math.hypot(x + 0.5 - C, y + 0.5 - C);
      if (r > R - 1.2) { bd[o] = 61; bd[o + 1] = 224; bd[o + 2] = 255; } // atmosphere rim
    }

    // Zoom origin for the scroll effect = Sarawak's centre on screen; place the label too.
    const art = $(".hero__art"), tag = $(".planet__tag");
    if (sn) {
      const px = (sx / sn + 0.5) / N, py = (sy / sn + 0.5) / N; // 0..1 within the canvas (canvas sits at inset 14%)
      art.style.transformOrigin = `${(14 + px * 72).toFixed(2)}% ${(14 + py * 72).toFixed(2)}%`;
    }
    const [kx, ky] = toScreen(KCH.lon, KCH.lat);
    if (tag) { tag.style.left = `${14 + (kx / N) * 72}%`; tag.style.top = `${14 + (ky / N) * 72}%`; }

    // 3) per frame: copy base, drift clouds, blink Kuching
    const img = ctx.createImageData(N, N), d = img.data;
    let t = 0, visible = true;
    const draw = () => {
      d.set(bd);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (!kind[i]) continue;
        const lon = geo[i * 2], lat = geo[i * 2 + 1];
        const c = fbm((lon + t * 0.12) * 1.1 + 7, lat * 1.8 + 3);
        const edge = c > 0.76 || (c > 0.72 && bayer[(y % 4) * 4 + (x % 4)] > 0.5); // dithered cloud edges
        if (edge && kind[i] !== 4) {
          const o = i * 4, s = shades[lightLvl[i]];
          d[o] = 236 * s; d[o + 1] = 240 * s; d[o + 2] = Math.min(255, 255 * s);
        }
      }
      const on = Math.floor(t * 2) % 2 === 0, bx = Math.round(kx), by = Math.round(ky);
      const dot = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= N || y >= N) return; const o = (y * N + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; };
      for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) dot(bx + ox, by + oy, on ? 255 : 255, on ? 84 : 230, on ? 112 : 220);
      const ring = 2 + (Math.floor(t * 6) % 5);
      if (on) for (let a = -ring; a <= ring; a++) { dot(bx + a, by - ring, 255, 84, 112); dot(bx + a, by + ring + 1, 255, 84, 112); dot(bx - ring, by + a, 255, 84, 112); dot(bx + ring + 1, by + a, 255, 84, 112); }
      ctx.putImageData(img, 0, 0);
    };
    draw();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(planet);
    if (!reduce) setInterval(() => { if (visible) { t += 0.12; draw(); } }, 120);
  }

  /* =========================================================
     Video — click-to-load. Plays assets/video/crew-pitch-v3.webm (data-video-src);
     falls back to a Google Drive preview (data-drive-id) when there is no file.
     ========================================================= */
  const video = $(".video-wrap");
  if (video) {
    const src = (video.dataset.videoSrc || "").trim();
    const id = (video.dataset.driveId || "").trim();
    const msg = $(".js-video-msg", video);
    if (!src && !id) video.dataset.cursor = "SOON";
    $(".video__poster", video).addEventListener("click", () => {
      if (!src && !id) { msg.dataset.text = "Teaser coming soon. Stand by."; scramble(msg, 700); return; }
      if (src) {
        video.innerHTML = `<video src="${src}" controls autoplay playsinline preload="auto" title="C.R.E.W pitch video"></video>`;
      } else {
        video.innerHTML = `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(id)}/preview" allow="autoplay; fullscreen" allowfullscreen title="C.R.E.W teaser"></iframe>`;
      }
      delete video.dataset.cursor;
      cursorReset();
    });
  }

  /* =========================================================
     Custom cursor + magnetic buttons
     ========================================================= */
  const cur = $(".cursor");
  const label = $(".cursor__label");
  let cursorReset = () => {};
  if (cur && finePointer && hasGSAP && !reduce) {
    root.classList.add("has-cursor");
    const xTo = gsap.quickTo(cur, "x", { duration: 0.18, ease: "power3" });
    const yTo = gsap.quickTo(cur, "y", { duration: 0.18, ease: "power3" });
    addEventListener("mousemove", (e) => { xTo(e.clientX); yTo(e.clientY); cur.classList.remove("is-hidden"); });
    document.addEventListener("mouseleave", () => cur.classList.add("is-hidden"));
    cursorReset = () => { cur.classList.remove("is-active", "is-link"); };
    document.addEventListener("mouseover", (e) => {
      const t = e.target.closest("[data-cursor], a, button");
      if (!t) return cursorReset();
      if (t.dataset.cursor) { label.textContent = t.dataset.cursor; cur.classList.add("is-active"); cur.classList.remove("is-link"); }
      else { cur.classList.add("is-link"); cur.classList.remove("is-active"); }
    });

    $$(".magnetic").forEach((el) => {
      const mx = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      const my = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * 0.3);
        my((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener("mouseleave", () => { mx(0); my(0); });
    });
  }

  /* =========================================================
     Clock, year, share
     ========================================================= */
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuching", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const clocks = $$(".js-clock");
  const tickClock = () => clocks.forEach((c) => (c.textContent = fmt.format(new Date())));
  tickClock(); setInterval(tickClock, 1000);
  $$(".js-year").forEach((y) => (y.textContent = new Date().getFullYear()));

  const share = $(".js-share"), status = $(".share-status");
  if (share) share.addEventListener("click", async () => {
    const data = { title: "C.R.E.W", text: "Design, test, launch and fly your own CubeSat over Sarawak!", url: location.href.split("#")[0] };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url);
      status.textContent = "Link copied. Send it to your crew!";
    } catch (_) { status.textContent = data.url; }
  });

  /* =========================================================
     Hero title split
     ========================================================= */
  const title = $(".hero__title");
  if (title) {
    title.innerHTML = [...title.textContent.trim()]
      .map((ch) => `<span class="m" aria-hidden="true"><span class="c${ch === "." ? " c--dot" : ""}">${ch}</span></span>`)
      .join("");
  }

  /* =========================================================
     Without GSAP: drop the loader and stop here
     ========================================================= */
  if (!hasGSAP) {
    root.classList.remove("is-loading");
    $(".loader")?.remove();
    $(".pixel-wipe").style.display = "none";
    return;
  }

  /* =========================================================
     Scroll animations
     ========================================================= */
  const altText = $(".js-alt"), altBar = $(".altimeter");
  const setAlt = (p) => {
    const km = Math.round(p * 500);
    altText.textContent = String(km).padStart(3, "0");
    altBar.style.setProperty("--p", (Math.round(p * 20) / 20).toFixed(2)); // snap to 20 steps
  };

  // Split statement into words, keeping inline markup.
  function splitWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) frag.append(part);
        else { const s = document.createElement("span"); s.className = "w"; s.textContent = part; frag.append(s); }
      });
      n.replaceWith(frag);
    });
    return $$(".w", el);
  }

  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // Hero: pin, fade the UI, and dive the globe into Sarawak
    // (the globe code sets .hero__art's transform-origin to Sarawak's position)
    gsap.timeline({ scrollTrigger: { trigger: ".hero", start: "top top", end: "+=110%", scrub: 0.6, pin: true } })
      .to(".hero__bottom, .hero__meta, .planet__tag, .orbit", { opacity: 0, duration: 0.2, ease: "none" }, 0)
      .to(".hero__title", { yPercent: -50, opacity: 0, duration: 0.45, ease: "power1.in" }, 0)
      .to(".hero__art", { scale: 4.2, duration: 1, ease: "power2.in" }, 0);

    // Mouse parallax on the planet
    if (finePointer) {
      const art = $(".hero__art-mouse");
      const ax = gsap.quickTo(art, "x", { duration: 1.2, ease: "power3" });
      const ay = gsap.quickTo(art, "y", { duration: 1.2, ease: "power3" });
      $(".hero").addEventListener("mousemove", (e) => {
        ax((e.clientX / innerWidth - 0.5) * -40);
        ay((e.clientY / innerHeight - 0.5) * -30);
      });
    }

    // Statement: words light up as you scroll
    $$("[data-reveal-words]").forEach((el) => {
      gsap.fromTo(splitWords(el), { opacity: 0.12 }, {
        opacity: 1, stagger: 0.1, ease: "none",
        scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 50%", scrub: true },
      });
    });

    // Generic reveals: stepped rise
    $$("[data-reveal]").forEach((el) => {
      gsap.from(el, { y: 48, opacity: 0, duration: 0.8, ease: "steps(6)", scrollTrigger: { trigger: el, start: "top 88%" } });
    });

    // Counters
    $$("[data-count]").forEach((el) => {
      const end = Number(el.dataset.count), pad = el.textContent.length, o = { v: 0 };
      if (end === 0) return;
      gsap.to(o, {
        v: end, duration: 1.6, ease: "power2.out",
        onUpdate: () => (el.textContent = String(Math.round(o.v)).padStart(pad, "0")),
        scrollTrigger: { trigger: el, start: "top 90%" },
      });
    });

    // Trailer: frame opens up in pixel steps
    gsap.fromTo(".video-wrap", { clipPath: "inset(12% 16%)" }, {
      clipPath: "inset(0% 0%)", ease: "steps(14)",
      scrollTrigger: { trigger: ".video-wrap", start: "top 90%", end: "center 55%", scrub: true },
    });

  });

  // Mission: pinned horizontal track on desktop
  mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
    const trk = $(".mission__track");
    const dist = () => trk.scrollWidth - innerWidth;
    const tween = gsap.to(trk, {
      x: () => -dist(), ease: "none",
      scrollTrigger: {
        trigger: ".mission", start: "top top", end: () => "+=" + dist(),
        pin: true, scrub: 1, invalidateOnRefresh: true, onUpdate: (s) => setAlt(s.progress),
      },
    });
    $$(".stage__sprite").forEach((s) => {
      gsap.from(s, {
        yPercent: 60, rotate: -12, ease: "steps(10)",
        scrollTrigger: { trigger: s, containerAnimation: tween, start: "left 100%", end: "center 60%", scrub: true },
      });
    });
    $$(".stage__num").forEach((n) => {
      gsap.from(n, { xPercent: 50, opacity: 0, ease: "none", scrollTrigger: { trigger: n, containerAnimation: tween, start: "left 100%", end: "left 60%", scrub: true } });
    });
  });
  mm.add("(max-width: 899px), (prefers-reduced-motion: reduce)", () => {
    ScrollTrigger.create({ trigger: ".mission", start: "top center", end: "bottom center", onUpdate: (s) => setAlt(s.progress) });
  });

  // Launch: pinned countdown, rocket lifts off
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const launch = $(".launch"), count = $(".launch__count");
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: launch, start: "top top", end: "+=120%", pin: true, scrub: 0.6,
        onUpdate: (s) => {
          const p = s.progress;
          count.textContent = p < 0.55 ? "T-0" + Math.max(0, 3 - Math.floor((p / 0.55) * 4)) : "LIFTOFF";
          launch.classList.toggle("is-ignited", p > 0.35 && p < 0.98);
        },
      },
    });
    tl.to({}, { duration: 0.55 })
      .to(".launch__rocket", { y: () => -(innerHeight + 300), ease: "power2.in", duration: 0.45 });
  });
  mm.add("(prefers-reduced-motion: reduce)", () => { $(".launch__count").textContent = "LIFTOFF"; });

  // Footer wordmark (created after the pins so its trigger position accounts for them)
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.from(".footer__big", { yPercent: 60, opacity: 0, ease: "steps(8)", duration: 1, scrollTrigger: { trigger: ".footer", start: "top 85%" } });
  });

  /* =========================================================
     Boot sequence: loader → pixel dissolve → hero intro
     ========================================================= */
  const intro = gsap.timeline({ paused: true });
  if (!reduce) {
    intro
      .from(".hero__title .c", { yPercent: 110, duration: 0.7, ease: "steps(7)", stagger: 0.07 })
      .from(".hero__art-in", { scale: 0.3, opacity: 0, duration: 1, ease: "steps(10)" }, 0)
      .from(".hero__meta > *", { opacity: 0, y: -12, duration: 0.4, stagger: 0.08, ease: "steps(4)" }, 0.3)
      .add(() => $$("[data-scramble-in]").forEach((el, i) => setTimeout(() => scramble(el, 800), i * 160)), 0.4)
      .from(".hero__ctas .btn, .hero__scroll", { opacity: 0, y: 24, duration: 0.5, stagger: 0.08, ease: "steps(5)" }, 0.5);
  }

  const pct = $(".js-pct"), segs = $$(".loader__bar i");
  // Only wait for fonts (so the title doesn't swap mid-animation), and never longer than 1s.
  let isReady = false;
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => (isReady = true));
  setTimeout(() => (isReady = true), 1000);

  const MIN = reduce ? 0 : 500, t0 = performance.now();
  let shown = 0;
  const boot = (now) => {
    const timeP = MIN ? Math.min(1, (now - t0) / MIN) : 1;
    const target = isReady ? timeP : Math.min(timeP, 0.86);
    shown += (target - shown) * 0.35;
    if (isReady && timeP >= 1 && shown > 0.99) shown = 1;
    pct.textContent = String(Math.round(shown * 100)).padStart(3, "0");
    const lit = Math.round(shown * segs.length);
    segs.forEach((s, i) => s.classList.toggle("on", i < lit));
    if (shown < 1) return requestAnimationFrame(boot);

    setTimeout(() => {
      $(".loader").remove();
      root.classList.remove("is-loading");
      scrollTo(0, 0);
      ScrollTrigger.refresh();
      intro.play();
      PixelWipe.reveal(reduce ? 1 : 420).then(() => lenis && lenis.start());
    }, 0);
  };
  requestAnimationFrame(boot);
})();
