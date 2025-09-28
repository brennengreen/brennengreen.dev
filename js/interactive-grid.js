/* Interactive media grid: hover + keyboard accessible expansion */
(function(){
  const qs = sel => document.querySelector(sel);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  function initCreditsFilter(){
    const bar = document.querySelector('.credits-filter');
    if(!bar) return;
    const buttons = Array.from(bar.querySelectorAll('.cf-btn'));
    const cards = Array.from(document.querySelectorAll('.credit-card'));
    buttons.forEach(btn => btn.addEventListener('click', () => {
      buttons.forEach(b=>{b.classList.remove('active'); b.setAttribute('aria-selected','false');});
      btn.classList.add('active'); btn.setAttribute('aria-selected','true');
      const mode = btn.dataset.filter;
      cards.forEach(card => {
        if(mode==='all' || card.dataset.kind === mode) {
          card.style.removeProperty('display');
          card.style.animation='fadeIn .35s ease';
        } else {
          card.style.display='none';
        }
      });
    }));
  }

  function setupVisibilityFilament(){
    const filament = document.querySelector('.hero-filament::before');
    // Pseudo element not directly selectable; skip advanced control for now.
    document.addEventListener('visibilitychange', () => {
      // Could toggle a class on body if future optimization needed.
    });
  }

  function init() {
    const tiles = qsa('[data-media-tile]');
    tiles.forEach(tile => {
      tile.addEventListener('mouseenter', () => focusTile(tile));
      tile.addEventListener('mouseleave', () => resetTile(tile));
      tile.addEventListener('focus', () => focusTile(tile));
      tile.addEventListener('blur', () => resetTile(tile));
      tile.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
            tile.classList.toggle('tile-lock');
          }
      });
    });
    initCreditsFilter();
    setupVisibilityFilament();
  }

  function focusTile(tile){
    tile.classList.add('tile-focus');
  }
  function resetTile(tile){
    if(!tile.classList.contains('tile-lock')) tile.classList.remove('tile-focus');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
