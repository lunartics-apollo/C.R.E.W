// Pixel-dissolve transition. A full-screen grid of squares appears/disappears in random order.
// PixelWipe.reveal() dissolves the cover away; PixelWipe.cover() fills the screen (e.g. before navigating).
window.PixelWipe = (function () {
  const COLOR = "#07081a";
  let cvs, ctx, cols, rows, size;

  function setup() {
    cvs = document.querySelector(".pixel-wipe");
    if (!cvs) {
      cvs = document.createElement("canvas");
      cvs.className = "pixel-wipe";
      document.body.appendChild(cvs);
    }
    ctx = cvs.getContext("2d");
    size = Math.max(28, Math.round(Math.max(innerWidth, innerHeight) / 22));
    cols = Math.ceil(innerWidth / size);
    rows = Math.ceil(innerHeight / size);
    cvs.width = cols * size;
    cvs.height = rows * size;
    cvs.style.width = cvs.width + "px";
    cvs.style.height = cvs.height + "px";
  }

  function order() {
    const a = Array.from({ length: cols * rows }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function run(mode, duration) {
    setup();
    cvs.style.display = "block";
    ctx.fillStyle = COLOR;
    if (mode === "reveal") ctx.fillRect(0, 0, cvs.width, cvs.height);
    else ctx.clearRect(0, 0, cvs.width, cvs.height);
    cvs.style.background = "transparent";

    const seq = order(), total = seq.length;
    let done = 0;
    const start = performance.now();
    return new Promise((resolve) => {
      const frame = (now) => {
        const target = Math.min(total, Math.floor(((now - start) / duration) * total));
        for (; done < target; done++) {
          const i = seq[done], x = (i % cols) * size, y = ((i / cols) | 0) * size;
          if (mode === "reveal") ctx.clearRect(x, y, size, size);
          else ctx.fillRect(x, y, size, size);
        }
        if (done < total) requestAnimationFrame(frame);
        else {
          if (mode === "reveal") cvs.style.display = "none";
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  // Links marked data-transition dissolve the screen before navigating.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-transition]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    run("cover", 450).then(() => { location.href = a.href; });
  });

  // Coming back via the back button restores a covered page from cache: uncover it.
  window.addEventListener("pageshow", (e) => { if (e.persisted) run("reveal", 400); });

  return {
    reveal: (d = 650) => run("reveal", d),
    cover: (d = 450) => run("cover", d),
  };
})();
