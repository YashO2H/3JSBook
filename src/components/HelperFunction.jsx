export async function svgStringToPngBlobUrl(svgString, width, height, backgroundColor = '#ffffff', scale = 2) {
  // 1. Create a blob URL for the SVG
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  // 2. Load it into an Image
  const img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);

  // 3. Determine target dimensions
  const w = width || img.naturalWidth;
  const h = height || img.naturalHeight;
  const dpr = window.devicePixelRatio || 1;
  const qualityScale = dpr * scale;

  // 4. Create a high‑DPI canvas with no alpha
  const canvas = document.createElement('canvas');
  canvas.width = w * qualityScale;
  canvas.height = h * qualityScale;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.scale(qualityScale, qualityScale);

  // 5. Fill a solid background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, w, h);

  // 6. Draw the SVG
  ctx.drawImage(img, 0, 0, w, h);

  // 7. Export as PNG blob URL
  return new Promise((resolve) => {
    canvas.toBlob(blob => {
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}