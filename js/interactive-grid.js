/* Interactive media grid: hover + keyboard accessible expansion */
(function(){
  const qs = sel => document.querySelector(sel);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  /* --- Scroll-reveal via IntersectionObserver --- */
  function initScrollReveal(){
    const els = qsa('.reveal, .reveal-scale');
    if(!('IntersectionObserver' in window)){ els.forEach(el => el.classList.add('revealed')); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {threshold:0.12, rootMargin:'0px 0px -40px 0px'});
    els.forEach(el => observer.observe(el));
  }

  /* --- Scroll progress bar --- */
  function initScrollProgress(){
    const bar = qs('.scroll-progress');
    if(!bar) return;
    function update(){
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = h > 0 ? (window.scrollY / h * 100) + '%' : '0%';
    }
    window.addEventListener('scroll', update, {passive:true});
    update();
  }

  /* --- Active nav link highlighting --- */
  function initActiveNav(){
    const sections = qsa('section[id]');
    const navLinks = qsa('.nav .links a[href^="#"]');
    if(!sections.length || !navLinks.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          const id = entry.target.getAttribute('id');
          navLinks.forEach(link => {
            link.classList.toggle('nav-active', link.getAttribute('href') === '#' + id);
          });
        }
      });
    }, {threshold:0.15, rootMargin:'-80px 0px -40% 0px'});
    sections.forEach(s => observer.observe(s));
  }

  /* --- Mobile nav toggle --- */
  function initMobileNav(){
    const toggle = qs('.nav-toggle');
    const links = qs('.nav .links');
    if(!toggle || !links) return;
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('nav-open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open);
    });
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('nav-open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

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
    initScrollReveal();
    initScrollProgress();
    initActiveNav();
    initMobileNav();
  }

  function focusTile(tile){
    tile.classList.add('tile-focus');
  }
  function resetTile(tile){
    if(!tile.classList.contains('tile-lock')) tile.classList.remove('tile-focus');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
