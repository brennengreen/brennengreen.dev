// Shift the sheet's foil with the mouse, like tilting a holo card. CSS ignores it under reduced motion.
for (const paper of document.querySelectorAll('.paper')) {
  let frame = 0;

  paper.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = paper.getBoundingClientRect();
      paper.style.setProperty('--foil-x', ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
      paper.style.setProperty('--foil-y', ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
    });
  });

  paper.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    paper.style.removeProperty('--foil-x');
    paper.style.removeProperty('--foil-y');
  });
}
