// Tiny pixel-art sprite renderer: each sprite is a grid of chars mapped to colors.
// Usage: <span class="sprite" data-sprite="cubesat" data-scale="4"></span>
(function () {
  const palette = {
    P: "#2f4bd6", L: "#6f8cff", B: "#9aa3c7", W: "#e6e9f7", C: "#3de0ff",
    H: "#555b80", A: "#ffb43d", Y: "#ffd23d", G: "#5cff8a", R: "#ff5470",
    K: "#07081a", D: "#1f8a4c",
  };

  const sprites = {
    cubesat: [
      "..........AA..........",
      "..........A...........",
      "PPPPPPP.BBBBBB.PPPPPPP",
      "PLPLPLP.BWWWWB.PLPLPLP",
      "PPPPPPPHBWCCWBHPPPPPPP",
      "PLPLPLP.BWCCWB.PLPLPLP",
      "PPPPPPP.BWWWWB.PPPPPPP",
      "........BBBBBB........",
    ],
    design: [
      "......YY", ".....YYY", "....YYY.", "...YYY..",
      "..YYY...", ".PYY....", "PPP.....", "PP......",
    ],
    build: [
      ".GG..GG.", ".GG..GG.", ".GGGGGG.", "..GGGG..",
      "...GG...", "...GG...", "...GG...", "...GG...",
    ],
    test: [
      "CCCCCCCC", "C......C", "C.....GC", "C....G.C",
      "CG..G..C", "C.GG...C", "C......C", "CCCCCCCC",
    ],
    launch: [
      "...WW...", "..WWWW..", "..WCCW..", "..WWWW..",
      ".RWWWWR.", "RR.WW.RR", "...AA...", "..A..A..",
    ],
    play: [
      "AA......", "AAAA....", "AAAAAA..", "AAAAAAAA",
      "AAAAAAAA", "AAAAAA..", "AAAA....", "AA......",
    ],
    rocket: [
      ".....WW.....",
      "....WWWW....",
      "....WRRW....",
      "...WWWWWW...",
      "...WWCCWW...",
      "...WCCCCW...",
      "...WWCCWW...",
      "...WWWWWW...",
      "...WWWWWW...",
      "...WBBBBW...",
      "..RWWWWWWR..",
      ".RRWWWWWWRR.",
      "RRRWBWWBWRRR",
      "RR..BBBB..RR",
      "....HHHH....",
    ],
    flame: [
      "....AAAA....",
      "...AYYYYA...",
      "...AYWWYA...",
      "....AYYA....",
      ".....AA.....",
      "......A.....",
    ],
  };

  function render(rows, scale) {
    const w = rows[0].length, h = rows.length;
    let rects = "";
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (palette[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[ch]}"/>`;
      });
    });
    return `<svg width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${rects}</svg>`;
  }

  document.querySelectorAll(".sprite[data-sprite]").forEach((el) => {
    const rows = sprites[el.dataset.sprite];
    if (rows) el.innerHTML = render(rows, Number(el.dataset.scale) || 4);
  });
})();
