/* A friend's pane of stained glass, remembered in voronoi — the stock
   picture every source boots with, and the test card the toolbar's
   effect previews run over. Each call paints a fresh pane (the seeds
   are random); callers that want one shared pane cache the canvas. */

export function paintStainedGlass(): HTMLCanvasElement {
  const W = 480, H = 270;
  const seeds = Array.from({ length: 42 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    hue: Math.random() * 360,
    lum: 0.35 + Math.random() * 0.35,
  }));
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let d1 = 1e9, d2 = 1e9, best = seeds[0];
      for (const s of seeds) {
        const d = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (d < d1) { d2 = d1; d1 = d; best = s; }
        else if (d < d2) d2 = d;
      }
      const lead = Math.sqrt(d2) - Math.sqrt(d1) < 3.0;
      const i = (y * W + x) * 4;
      if (lead) { img.data[i] = 14; img.data[i + 1] = 12; img.data[i + 2] = 10; }
      else {
        const [r, g, b] = hsl(best.hue, 0.75, best.lum * (0.85 + 0.3 * Math.sin((x + y) * 0.05)));
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      }
      img.data[i + 3] = 255;
    }
  }
  const small = document.createElement('canvas');
  small.width = W; small.height = H;
  small.getContext('2d')!.putImageData(img, 0, 0);
  const cv = document.createElement('canvas');
  cv.width = 960; cv.height = 540;
  const cx = cv.getContext('2d')!;
  cx.imageSmoothingEnabled = true;
  cx.drawImage(small, 0, 0, cv.width, cv.height);
  return cv;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255 | 0, f(8) * 255 | 0, f(4) * 255 | 0];
}
