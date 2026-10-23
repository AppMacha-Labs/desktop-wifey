const GLYPHS = ['❤️', '💕', '💗', '✨', '🩷'];

/** Floating hearts when she gets pets. Purely cosmetic. */
export function burstHearts(layer: HTMLElement, count = 5): void {
  for (let i = 0; i < count; i++) {
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    h.style.left = `${35 + Math.random() * 30}%`;
    h.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    h.style.setProperty('--delay', `${i * 60}ms`);
    h.style.fontSize = `${14 + Math.random() * 12}px`;
    layer.append(h);
    h.addEventListener('animationend', () => h.remove());
  }
}
