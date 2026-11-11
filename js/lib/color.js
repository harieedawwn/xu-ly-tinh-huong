// WCAG contrast helpers used to choose the text colour on each tổ colour.

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick ink or white, whichever has the higher measured contrast. */
export function pickText(bg, ink = '#111111', light = '#FFFFFF') {
  return contrast(bg, ink) >= contrast(bg, light) ? ink : light;
}
