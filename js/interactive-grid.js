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
      const pct = h > 0 ? (window.scrollY / h) : 0;
      bar.style.width = (pct * 100) + '%';
      bar.style.opacity = pct > 0.004 ? '1' : '0';
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

  /* --- Credits reel: click a frame to fly it into a centered detail modal --- */
  function initCreditsReel(){
    const cards = qsa('.credit-card');
    const modal = qs('#creditModal');
    if(!cards.length || !modal) return;

    const dialog   = modal.querySelector('.cm-dialog');
    const elBg     = modal.querySelector('.cm-bg');
    const elImg    = modal.querySelector('.cm-img');
    const elCompany= modal.querySelector('.cm-company');
    const elTitle  = modal.querySelector('.cm-title');
    const elBadges = modal.querySelector('.cm-badges');
    const elDesc   = modal.querySelector('.cm-desc');
    const elArchive= modal.querySelector('.cm-archive');
    const elExt    = modal.querySelector('.cm-ext');
    const closeBtn = modal.querySelector('.cm-close');
    const reduce   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastFocused = null, activeCard = null;

    const show = (el, on) => { if(el) el.style.display = on ? '' : 'none'; };
    const kindLabel = k => k === 'film' ? 'Feature Film' : k === 'app' ? 'Platform' : 'Game';

    function setBadges(kind, role){
      elBadges.innerHTML = '';
      if(kind){
        const b = document.createElement('span');
        b.className = 'cm-badge kind-' + kind;
        b.textContent = kindLabel(kind);
        elBadges.appendChild(b);
      }
      if(role){
        const r = document.createElement('span');
        r.className = 'cm-badge';
        r.textContent = role;
        elBadges.appendChild(r);
      }
    }

    function populate(card){
      const img = card.querySelector('img');
      const h4  = card.querySelector('.credit-meta h4');
      const sp  = card.querySelector('.credit-meta span');
      const title   = (h4 && h4.textContent.trim()) || card.getAttribute('title') || '';
      const role    = sp ? sp.textContent.trim() : '';
      const kind    = card.dataset.kind || '';
      const group   = card.closest('.credits-group');
      const label   = group && group.querySelector('.credits-label');
      const company = label ? label.textContent.trim() : '';
      const src     = img ? img.getAttribute('src') : '';

      elImg.setAttribute('src', src);
      elImg.setAttribute('alt', img ? (img.getAttribute('alt') || title) : title);
      elImg.style.objectFit = (img && img.style.objectFit) ? img.style.objectFit : 'contain';
      elBg.style.backgroundImage = src ? 'url("' + src + '")' : 'none';

      elCompany.textContent = company; show(elCompany, !!company);
      elTitle.textContent = title;
      setBadges(kind, role);

      const desc = card.dataset.desc || '';
      elDesc.textContent = desc; show(elDesc, !!desc);

      const archive = card.dataset.archive || '';
      if(archive) elArchive.setAttribute('href', archive);
      show(elArchive, !!archive);

      const href = card.dataset.href || '';
      if(href){
        elExt.setAttribute('href', href);
        elExt.innerHTML = (card.dataset.hrefLabel || 'Visit') + ' <span aria-hidden="true">\u2197</span>';
      }
      show(elExt, !!href);
    }

    /* origin the dialog's grow/shrink from the clicked frame's centre */
    function flipFrom(card){
      const r = card.getBoundingClientRect();
      const dx = (r.left + r.width / 2) - window.innerWidth / 2;
      const dy = (r.top + r.height / 2) - window.innerHeight / 2;
      dialog.style.setProperty('--cm-dx', dx.toFixed(1) + 'px');
      dialog.style.setProperty('--cm-dy', dy.toFixed(1) + 'px');
    }

    function open(card){
      lastFocused = document.activeElement;
      activeCard = card;
      populate(card);
      card.classList.add('is-active');
      modal.hidden = false;
      flipFrom(card);
      void modal.offsetWidth;           /* flush the from-transform before animating in */
      document.body.classList.add('cm-lock');
      modal.classList.add('open');
      if(closeBtn) closeBtn.focus({preventScroll:true});
      document.addEventListener('keydown', onKey, true);
    }

    function finishClose(){
      modal.hidden = true;
      document.body.classList.remove('cm-lock');
      if(activeCard) activeCard.classList.remove('is-active');
      if(lastFocused && lastFocused.focus) lastFocused.focus({preventScroll:true});
      activeCard = null;
    }

    function close(){
      if(!modal.classList.contains('open')) return;
      document.removeEventListener('keydown', onKey, true);
      if(activeCard) flipFrom(activeCard);   /* retreat back toward the frame */
      modal.classList.remove('open');
      if(reduce){ finishClose(); return; }
      let done = false;
      const end = () => { if(done) return; done = true; dialog.removeEventListener('transitionend', onEnd); finishClose(); };
      const onEnd = e => { if(e.target === dialog && e.propertyName === 'transform') end(); };
      dialog.addEventListener('transitionend', onEnd);
      setTimeout(end, 700);
    }

    function onKey(e){
      if(e.key === 'Escape'){ e.preventDefault(); close(); return; }
      if(e.key === 'Tab'){
        const f = Array.from(modal.querySelectorAll('a[href], button:not([disabled])'))
          .filter(el => el.offsetParent !== null && el.style.display !== 'none');
        if(!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    }

    cards.forEach(card => {
      card.addEventListener('click', () => open(card));
      card.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(card); }
      });
    });
    modal.querySelectorAll('[data-cm-close]').forEach(el => el.addEventListener('click', close));
  }

  /* Hover-to-play: media tiles that swap a still for an animated loop on hover/focus */
  function initHoverPlay(){
    qsa('.media-hoverplay').forEach(tile => {
      const img = tile.querySelector('img');
      const gif = tile.dataset.gif;
      const still = tile.dataset.still || (img && img.getAttribute('src'));
      if(!img || !gif) return;
      let warmed = false;
      const warm = () => { if(!warmed){ warmed = true; new Image().src = gif; } };
      tile.addEventListener('pointerenter', warm); // lazy-load loop on first approach
      tile.addEventListener('mouseenter', () => { img.src = gif; });
      tile.addEventListener('mouseleave', () => { img.src = still; });
      tile.addEventListener('focusin', () => { warm(); img.src = gif; });
      tile.addEventListener('focusout', () => { img.src = still; });
    });
  }

  function init() {
    initHoverPlay();
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
    initCreditsReel();
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
