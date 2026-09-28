// In-browser post editor. Only `node _dev/serve.mjs` injects this file (dev mode); the live site never sees it.
import { LANGUAGES, bakeCodeBlocks, codeBlock, escapeHtml, highlight, normalizeCode, resolveLanguage } from '/_dev/highlight.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeAttr = (s) => escapeHtml(String(s)).replace(/"/g, '&quot;');
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const prettyDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const prevent = (event) => event.preventDefault();

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'value') el.value = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

async function api(method, url, body, raw = false) {
  const response = await fetch(`/_dev/api${url}`, {
    method,
    headers: { 'X-Dev-Editor': '1', ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}) },
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
  return data;
}

const path = location.pathname.replace(/index\.html$/, '');
const page = { header: $('.post-header'), title: $('.post-title'), body: $('.post-body'), dek: null };
page.isPost = Boolean(page.header && page.title && page.body && /^\/blog\/(?:[a-z0-9][a-z0-9-]*\/)+$/.test(path));

const DRAFT_KEY = `dev-editor:unsaved:${path}`;
const state = { editing: false, dirty: false, saving: false, html: null, fields: null, descriptionAuto: true, range: null };
const ui = h('div', { class: 'dev-ui' });
document.body.append(ui);

function toast(message, kind = 'info') {
  const el = h('div', { class: `dev-toast dev-toast-${kind}`, role: 'status' }, message);
  ui.append(el);
  setTimeout(() => el.classList.add('dev-toast-out'), 3200);
  setTimeout(() => el.remove(), 3600);
}

// Dock: always there in dev, never on the live site.

let postsPanel = null;
const dock = h(
  'div',
  { class: 'dev-dock', role: 'toolbar', 'aria-label': 'Blog editor (dev server only)' },
  h('span', { class: 'dev-badge', title: 'Only the dev server shows this' }, 'dev'),
  h('button', { class: 'dev-btn', type: 'button', onclick: () => togglePosts() }, 'posts'),
  h('button', { class: 'dev-btn', type: 'button', onclick: () => togglePosts(true) }, '+ new post'),
  page.isPost && h('button', { class: 'dev-btn dev-btn-main', type: 'button', onclick: () => startEditing() }, 'edit post'),
);
ui.append(dock);

function closePosts() {
  postsPanel?.remove();
  postsPanel = null;
}

async function togglePosts(focusNew = false) {
  if (postsPanel && !focusNew) return closePosts();
  if (!postsPanel) {
    const input = h('input', { class: 'dev-input', placeholder: 'Title of the new post', 'aria-label': 'Title of the new post' });
    const list = h('ul', { class: 'dev-post-list' }, h('li', { class: 'dev-muted' }, 'loading…'));
    const form = h(
      'form',
      {
        class: 'dev-row',
        onsubmit: async (event) => {
          event.preventDefault();
          if (!input.value.trim()) return input.focus();
          try {
            const { path: next } = await api('POST', '/posts', { title: input.value });
            sessionStorage.setItem('dev-editor:open', next);
            location.href = next;
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      input,
      h('button', { class: 'dev-btn dev-btn-main', type: 'submit' }, 'create'),
    );
    postsPanel = h('div', { class: 'dev-panel dev-posts' }, form, list);
    ui.append(postsPanel);
    try {
      const posts = await api('GET', '/posts');
      list.replaceChildren(
        ...(posts.length
          ? posts.map((post) =>
              h(
                'li',
                {},
                h('a', { href: post.path, 'aria-current': post.path === path ? 'page' : null }, post.title),
                h('span', { class: post.draft ? 'dev-pill' : 'dev-muted' }, post.draft ? 'draft' : prettyDate(post.date)),
              ),
            )
          : [h('li', { class: 'dev-muted' }, 'No posts yet')]),
      );
    } catch (error) {
      list.replaceChildren(h('li', { class: 'dev-error' }, error.message));
    }
  }
  if (focusNew) $('input', postsPanel)?.focus();
}

// Selection helpers.

const exec = (command, value = null) => document.execCommand(command, false, value);
const insertHtml = (html) => exec('insertHTML', html);
const BLOCK_SELECTOR = 'p, h2, h3, h4, li, blockquote, td, th';

function anchorElement() {
  const node = getSelection().anchorNode;
  return node ? (node.nodeType === 1 ? node : node.parentElement) : null;
}

function selectionIn(el) {
  const sel = getSelection();
  return sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
}

function currentBlock() {
  const block = anchorElement()?.closest(BLOCK_SELECTOR);
  return block && block !== page.body && page.body.contains(block) ? block : null;
}

function selectNode(node, contents = false) {
  const range = document.createRange();
  if (contents) range.selectNodeContents(node);
  else range.selectNode(node);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function restoreRange(range) {
  page.body.focus({ preventScroll: true });
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function bodyRange() {
  const sel = getSelection();
  if (sel.rangeCount && page.body.contains(sel.getRangeAt(0).commonAncestorContainer)) return sel.getRangeAt(0).cloneRange();
  return state.range && page.body.contains(state.range.commonAncestorContainer) ? state.range.cloneRange() : null;
}

function focusBody() {
  if (selectionIn(page.body)) return;
  const range = bodyRange();
  if (range) return restoreRange(range);
  const end = document.createRange();
  end.selectNodeContents(page.body);
  end.collapse(false);
  restoreRange(end);
}

function rectOf(range) {
  const rects = range.getClientRects();
  if (rects.length) return rects[rects.length - 1];
  const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  return node.getBoundingClientRect();
}

// Popovers.

let popover = null;
function openPopover(anchor, content, onClose) {
  closePopover();
  const el = h('div', { class: 'dev-panel dev-popover', role: 'dialog' }, content);
  ui.append(el);
  const box = el.getBoundingClientRect();
  const below = anchor.bottom + 10;
  const top = below + box.height > innerHeight - 100 ? anchor.top - box.height - 10 : below;
  el.style.top = `${Math.max(10, top)}px`;
  el.style.left = `${Math.min(Math.max(10, anchor.left), innerWidth - box.width - 10)}px`;
  popover = { el, onClose };
  return el;
}

function closePopover() {
  if (!popover) return;
  const { el, onClose } = popover;
  popover = null;
  el.remove();
  onClose?.();
}

document.addEventListener('mousedown', (event) => {
  if (popover && !popover.el.contains(event.target) && !event.target.closest?.('.dev-toolbar')) closePopover();
  if (postsPanel && !postsPanel.contains(event.target) && !dock.contains(event.target)) closePosts();
});

// Formatting commands.

function setBlock(tag) {
  if (tag === 'blockquote') return toggleQuote();
  exec('formatBlock', `<${currentBlock()?.localName === tag ? 'p' : tag}>`);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el.localName === 'ul' || el.localName === 'ol' ? el.lastElementChild || el : el);
  range.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Swaps whole top-level blocks for new markup in one undoable step; the new element keeps the caret.
function replaceBlocks(nodes, html) {
  const range = document.createRange();
  range.setStartBefore(nodes[0]);
  range.setEndAfter(nodes[nodes.length - 1]);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  insertHtml(html.replace(/^<([a-z0-9]+)/, '<$1 data-dev-new=""'));
  const added = $('[data-dev-new]', page.body);
  if (!added) return;
  added.removeAttribute('data-dev-new');
  placeCaretAtEnd(added);
}

function selectedBlocks() {
  const range = bodyRange();
  if (!range) return [];
  const blocks = [...page.body.children].filter((el) => range.intersectsNode(el) && /^(p|h[2-4]|blockquote|ul|ol)$/.test(el.localName));
  if (blocks.length) return blocks;
  const block = currentBlock();
  let top = block;
  while (top && top.parentElement !== page.body) top = top.parentElement;
  return top ? [top] : [];
}

const listItems = (block) =>
  /^(ul|ol)$/.test(block.localName) ? block.innerHTML : block.localName === 'blockquote' && block.querySelector('p') ? [...block.children].map((child) => `<li>${child.innerHTML}</li>`).join('') : `<li>${block.innerHTML.trim() || '<br>'}</li>`;

function toggleList(tag) {
  const list = anchorElement()?.closest('ul, ol');
  if (list && page.body.contains(list)) {
    if (list.localName === tag) return replaceBlocks([list], [...list.children].map((li) => `<p>${li.innerHTML.trim() || '<br>'}</p>`).join(''));
    return replaceBlocks([list], `<${tag}>${list.innerHTML}</${tag}>`);
  }
  const blocks = selectedBlocks();
  if (!blocks.length) return insertHtml(`<${tag}><li><br></li></${tag}>`);
  replaceBlocks(blocks, `<${tag}>${blocks.map(listItems).join('')}</${tag}>`);
}

function toggleQuote() {
  const quote = anchorElement()?.closest('blockquote');
  if (quote && page.body.contains(quote)) {
    const hasBlocks = [...quote.children].some((child) => /^(p|h[2-4]|ul|ol|pre|table)$/.test(child.localName));
    return replaceBlocks([quote], hasBlocks ? quote.innerHTML : `<p>${quote.innerHTML.trim() || '<br>'}</p>`);
  }
  const blocks = selectedBlocks().filter((block) => block.localName !== 'blockquote');
  if (!blocks.length) return insertHtml('<blockquote><br></blockquote>');
  const inner = blocks.length === 1 && blocks[0].localName === 'p' ? blocks[0].innerHTML.trim() || '<br>' : blocks.map((block) => block.outerHTML).join('');
  replaceBlocks(blocks, `<blockquote>${inner}</blockquote>`);
}

function inlineCode() {
  const code = anchorElement()?.closest('code');
  if (code && page.body.contains(code) && !code.closest('pre')) {
    selectNode(code);
    return insertHtml(escapeHtml(code.textContent));
  }
  const text = getSelection().toString();
  insertHtml(`<code data-dev-new="">${escapeHtml(text || 'code')}</code>\u200b`);
  const added = $('code[data-dev-new]', page.body);
  if (!added) return;
  added.removeAttribute('data-dev-new');
  if (!text) selectNode(added, true);
}

function openLink() {
  const range = bodyRange();
  if (!range) return;
  const link = anchorElement()?.closest('a');
  const input = h('input', { class: 'dev-input', placeholder: 'https://… or /blog/…', value: link?.getAttribute('href') || '', 'aria-label': 'Link address' });
  const apply = () => {
    const url = input.value.trim();
    closePopover();
    restoreRange(range);
    if (link && page.body.contains(link)) {
      if (url) link.setAttribute('href', url);
      else {
        selectNode(link);
        exec('unlink');
      }
    } else if (url) {
      if (range.collapsed) insertHtml(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`);
      else exec('createLink', url);
    }
    markDirty();
    updateToolbar();
  };
  const form = h(
    'form',
    { class: 'dev-row', onsubmit: (event) => (event.preventDefault(), apply()) },
    input,
    h('button', { class: 'dev-btn dev-btn-main', type: 'submit' }, 'apply'),
    link && h('button', { class: 'dev-btn', type: 'button', onclick: () => ((input.value = ''), apply()) }, 'remove'),
  );
  openPopover(rectOf(range), form);
  input.focus();
  input.select();
}

function selectImage(img) {
  img.classList.add('dev-selected');
  const alt = h('input', { class: 'dev-input', value: img.getAttribute('alt') || '', placeholder: 'Describe the image', 'aria-label': 'Alt text' });
  alt.addEventListener('input', () => {
    img.setAttribute('alt', alt.value);
    markDirty();
  });
  const remove = () => {
    closePopover();
    selectNode(img);
    exec('delete');
    markDirty();
  };
  const content = h('div', { class: 'dev-row' }, h('span', { class: 'dev-label' }, 'alt'), alt, h('button', { class: 'dev-btn', type: 'button', onclick: remove }, 'remove'));
  openPopover(img.getBoundingClientRect(), content, () => img.classList.remove('dev-selected'));
  alt.focus();
}

function pickImage() {
  const range = bodyRange();
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml', multiple: true, hidden: true });
  input.addEventListener('change', () => {
    uploadImages([...input.files], range);
    input.remove();
  });
  ui.append(input);
  input.click();
}

const imageSize = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth ? ` width="${img.naturalWidth}" height="${img.naturalHeight}"` : '');
    img.onerror = () => resolve('');
    img.src = src;
  });
const altFromName = (name = '') => (/^(image|pasted|screenshot)\b/i.test(name) ? '' : name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim());

async function uploadImages(files, range) {
  for (const file of files) {
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const name = file.name && !/^image\.\w+$/i.test(file.name) ? file.name : `pasted-${Date.now().toString(36)}.${ext}`;
    setStatus(`uploading ${name}…`);
    try {
      const { src } = await api('POST', `/upload?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`, file, true);
      const size = await imageSize(src);
      if (range) restoreRange(range);
      else focusBody();
      range = null;
      insertHtml(`<img src="${escapeAttr(src)}" alt="${escapeAttr(altFromName(file.name))}"${size} loading="lazy" />`);
      decorate();
      markDirty();
    } catch (error) {
      toast(error.message, 'error');
    }
  }
  setStatus();
}

function insertTable() {
  const row = (cell) => `<tr>${`<${cell}><br></${cell}>`.repeat(3)}</tr>`;
  insertHtml(`<table><thead>${row('th')}</thead><tbody>${row('td')}${row('td')}</tbody></table><p><br></p>`);
}

function tableTab(event) {
  const cell = anchorElement()?.closest('td, th');
  if (!cell || !page.body.contains(cell)) return false;
  event.preventDefault();
  const table = cell.closest('table');
  const cells = $$('th, td', table);
  let next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
  if (!next && !event.shiftKey) {
    const row = document.createElement('tr');
    row.innerHTML = [...cell.closest('tr').children].map(() => '<td><br></td>').join('');
    (table.tBodies[0] || table).append(row);
    next = row.firstElementChild;
    markDirty();
  }
  if (next) selectNode(next, true);
  return true;
}

function clearFormatting() {
  exec('removeFormat');
  for (const code of $$('code', page.body)) {
    if (!code.closest('pre') && getSelection().containsNode(code, true)) code.replaceWith(...code.childNodes);
  }
  exec('formatBlock', '<p>');
}

// Code blocks: edited in a small code editor with live highlighting, then baked into the post.

const indentUnit = (text) => {
  const spaced = text.match(/^ +(?=\S)/gm);
  if (/^\t/m.test(text) || !spaced) return '\t';
  return ' '.repeat(Math.min(...spaced.map((s) => s.length)) >= 4 ? 4 : 2);
};

function insertText(text) {
  if (document.execCommand('insertText', false, text)) return;
  const input = document.activeElement;
  input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
  input.dispatchEvent(new Event('input'));
}

function openCodePanel(pre = null, preset = {}) {
  closePopover();
  const range = pre ? null : bodyRange();
  const code = pre?.querySelector('code');
  let lang = resolveLanguage(pre ? (code?.className.match(/language-([\w+#-]+)/) || [])[1] : preset.lang || localStorage.getItem('dev-editor:lang') || 'cpp');
  const original = code ? code.textContent : preset.code || '';

  const select = h(
    'select',
    { class: 'dev-select', 'aria-label': 'Language' },
    Object.entries(LANGUAGES).map(([id, label]) => h('option', { value: id, selected: id === lang }, label)),
  );
  if (!LANGUAGES[lang]) select.prepend(h('option', { value: lang, selected: true }, lang));
  const numbers = h('div', { class: 'dev-code-numbers' });
  const view = h('code', { class: 'dev-code-view' });
  const input = h('textarea', { class: 'dev-code-input', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-label': 'Code' });
  input.value = original;

  const sync = () => {
    view.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
    numbers.style.transform = `translateY(${-input.scrollTop}px)`;
  };
  const render = () => {
    view.innerHTML = highlight(input.value, lang, { raw: true });
    numbers.textContent = Array.from({ length: input.value.split('\n').length }, (_, i) => i + 1).join('\n');
    sync();
  };
  const close = () => {
    backdrop.remove();
    if (range) restoreRange(range);
  };
  const apply = () => {
    const source = normalizeCode(input.value);
    backdrop.remove();
    if (!source) {
      if (pre) {
        selectNode(pre);
        exec('delete');
        markDirty();
      } else if (range) restoreRange(range);
      return;
    }
    localStorage.setItem('dev-editor:lang', lang);
    if (pre) {
      selectNode(pre);
      insertHtml(codeBlock(source, lang));
    } else {
      if (range) restoreRange(range);
      else focusBody();
      insertHtml(`${codeBlock(source, lang)}<p><br></p>`);
    }
    decorate();
    markDirty();
  };

  select.addEventListener('change', () => {
    lang = select.value;
    render();
    input.focus();
  });
  input.addEventListener('input', render);
  input.addEventListener('scroll', sync);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      apply();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const { value, selectionStart: start, selectionEnd: end } = input;
      const unit = indentUnit(value);
      if (!event.shiftKey && start === end) return insertText(unit);
      const from = value.lastIndexOf('\n', start - 1) + 1;
      const to = end > start && value[end - 1] === '\n' ? end - 1 : end;
      const lines = value.slice(from, to).split('\n');
      const next = lines.map((line) => (event.shiftKey ? line.replace(/^(\t| {1,4})/, '') : unit + line)).join('\n');
      input.setSelectionRange(from, to);
      insertText(next);
      input.setSelectionRange(from, from + next.length);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const { value, selectionStart: start } = input;
      const line = value.slice(value.lastIndexOf('\n', start - 1) + 1, start);
      insertText(`\n${line.match(/^[\t ]*/)[0]}${/[{([:]\s*$/.test(line) ? indentUnit(value) : ''}`);
    }
  });

  const backdrop = h(
    'div',
    { class: 'dev-modal', onmousedown: (event) => event.target === backdrop && input.value === original && close() },
    h(
      'div',
      { class: 'dev-panel dev-code-panel', role: 'dialog', 'aria-label': 'Code block' },
      h(
        'div',
        { class: 'dev-row' },
        select,
        h('span', { class: 'dev-hint' }, `tab indents · ${MOD}↵ ${pre ? 'updates' : 'inserts'}`),
        h('span', { class: 'dev-spacer' }),
        pre && h('button', { class: 'dev-btn', type: 'button', onclick: () => ((input.value = ''), apply()) }, 'remove'),
        h('button', { class: 'dev-btn', type: 'button', onclick: close }, 'cancel'),
        h('button', { class: 'dev-btn dev-btn-main', type: 'button', onclick: apply }, pre ? 'update' : 'insert'),
      ),
      h('div', { class: 'dev-code-stage' }, h('div', { class: 'dev-code-gutter', 'aria-hidden': 'true' }, numbers), h('pre', { class: 'dev-code-pre', 'aria-hidden': 'true' }, view), input),
    ),
  );
  ui.append(backdrop);
  render();
  input.focus();
}

// Markdown-style shortcuts at the start of a paragraph: "## ", "### ", "- ", "1. ", "> ", "```lang" + Enter, "---" + Enter.

function markdownShortcut(event) {
  const sel = getSelection();
  if (!sel.isCollapsed || (event.key !== ' ' && event.key !== 'Enter')) return false;
  const block = currentBlock();
  if (!block || block.localName !== 'p' || block.parentElement !== page.body) return false;
  const before = document.createRange();
  before.setStart(block, 0);
  before.setEnd(sel.anchorNode, sel.anchorOffset);
  const text = before.toString();
  const take = () => {
    event.preventDefault();
    sel.removeAllRanges();
    sel.addRange(before);
    if (text) exec('delete');
  };
  if (event.key === ' ') {
    const action = {
      '##': () => exec('formatBlock', '<h2>'),
      '###': () => exec('formatBlock', '<h3>'),
      '-': () => toggleList('ul'),
      '*': () => toggleList('ul'),
      '1.': () => toggleList('ol'),
      '>': () => toggleQuote(),
    }[text];
    if (!action) return false;
    take();
    action();
    return true;
  }
  if (block.textContent.trim() !== text.trim()) return false;
  const fence = /^```([\w+#-]*)$/.exec(text.trim());
  if (fence) {
    take();
    openCodePanel(null, { lang: fence[1] || undefined });
    return true;
  }
  if (/^(---|\*\*\*)$/.test(text.trim())) {
    take();
    exec('insertHorizontalRule');
    return true;
  }
  return false;
}

// Keeping the markup clean: only the elements a post uses survive, in the site's formatting.

const ALLOWED = {
  p: [], h2: ['id'], h3: ['id'], h4: ['id'], strong: [], em: [], s: [], code: [], a: ['href', 'title'], sub: [], sup: [], kbd: [], mark: [],
  ul: [], ol: ['start'], li: [], blockquote: [], br: [], hr: [], img: ['class', 'src', 'alt', 'width', 'height', 'loading'],
  table: [], thead: [], tbody: [], tr: [], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'],
};
const RENAME = { b: 'strong', i: 'em', strike: 's', del: 's', h1: 'h2', h5: 'h4', h6: 'h4' };
const DROP = new Set(['script', 'style', 'meta', 'link', 'title', 'head', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'canvas', 'video', 'audio', 'button', 'input', 'select', 'textarea']);
const BLOCKISH = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img']);
const NESTING = new Set(['ul', 'ol', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'li']);

function rename(el, tag) {
  const next = el.ownerDocument.createElement(tag);
  for (const attr of el.attributes) next.setAttribute(attr.name, attr.value);
  next.append(...el.childNodes);
  el.replaceWith(next);
  return next;
}

function rebuildPre(pre) {
  const code = pre.querySelector('code') || pre;
  const lang = (code.className.match(/\blanguage-([\w+#-]+)/) || [])[1] || pre.dataset.lang || 'plaintext';
  const holder = pre.ownerDocument.createElement('div');
  holder.innerHTML = codeBlock(code.textContent, lang);
  return holder.firstChild;
}

function cleanTree(parent, paste) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.data = node.data.replace(/\u200b/g, '').replace(/\u00a0/g, (nbsp, i, text) => (i === 0 || i === text.length - 1 || /\s/.test(text[i - 1]) || /\s/.test(text[i + 1]) ? ' ' : nbsp));
      if (!node.data) node.remove();
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      continue;
    }
    let el = node;
    const name = el.localName;
    if (name === 'math') continue;
    if (paste && (name === 'b' || name === 'strong') && /font-weight:\s*(normal|[1-5]00)/i.test(el.getAttribute('style') || '')) {
      cleanTree(el, paste);
      el.replaceWith(...el.childNodes);
      continue;
    }
    if (paste && name === 'span' && /font-weight:\s*(bold|[6-9]00)/i.test(el.getAttribute('style') || '')) el = rename(el, 'strong');
    else if (paste && name === 'span' && /font-style:\s*italic/i.test(el.getAttribute('style') || '')) el = rename(el, 'em');
    if (name === 'pre') {
      el.replaceWith(rebuildPre(el));
      continue;
    }
    if (DROP.has(name)) {
      el.remove();
      continue;
    }
    if (name === 'div' || name === 'section' || name === 'article') {
      if ([...el.children].some((child) => BLOCKISH.has(child.localName) || child.localName === 'div')) {
        cleanTree(el, paste);
        el.replaceWith(...el.childNodes);
        continue;
      }
      el = rename(el, 'p');
    } else if (RENAME[name]) el = rename(el, RENAME[name]);
    if (!(el.localName in ALLOWED)) {
      cleanTree(el, paste);
      el.replaceWith(...el.childNodes);
      continue;
    }
    for (const attr of [...el.attributes]) {
      const keep =
        ALLOWED[el.localName].includes(attr.name) &&
        !(paste && (attr.name === 'id' || attr.name === 'class')) &&
        !((attr.name === 'href' || attr.name === 'src') && /^\s*(javascript|vbscript):/i.test(attr.value));
      if (!keep) el.removeAttribute(attr.name);
      else if (attr.name === 'class') {
        const classes = attr.value.split(/\s+/).filter((c) => c && !c.startsWith('dev-'));
        if (classes.length) el.setAttribute('class', classes.join(' '));
        else el.removeAttribute('class');
      }
    }
    if (el.localName === 'img' && !/^\/(?!\/)/.test(el.getAttribute('src') || '')) {
      el.remove();
      continue;
    }
    if (el.localName === 'a' && !el.hasAttribute('href')) {
      cleanTree(el, paste);
      el.replaceWith(...el.childNodes);
      continue;
    }
    cleanTree(el, paste);
  }
}

function splitParagraph(p) {
  const out = [];
  let run = null;
  for (const node of [...p.childNodes]) {
    if (node.nodeType === 1 && BLOCKISH.has(node.localName) && node.localName !== 'img') {
      run = null;
      out.push(node);
    } else {
      if (!run) out.push((run = p.ownerDocument.createElement('p')));
      run.append(node);
    }
  }
  p.replaceWith(...out);
}

const isEmptyBlock = (el) => /^(p|h[2-4]|li|blockquote)$/.test(el.localName) && !el.textContent.trim() && !el.querySelector('img, math, hr');

function tidy(root) {
  for (const p of $$('p', root).reverse()) {
    if ([...p.children].some((child) => BLOCKISH.has(child.localName) && child.localName !== 'img')) splitParagraph(p);
  }
  for (const li of $$('li', root)) {
    if (li.children.length === 1 && li.firstElementChild.localName === 'p' && !li.textContent.replace(li.firstElementChild.textContent, '').trim()) li.firstElementChild.replaceWith(...li.firstElementChild.childNodes);
  }
  for (const el of $$('p, h2, h3, h4, li, blockquote, td, th', root).reverse()) {
    while (el.lastChild?.nodeName === 'BR' && el.childNodes.length > 1) el.lastChild.remove();
    if (isEmptyBlock(el) && !/^t[dh]$/.test(el.localName)) el.remove();
  }
  for (const p of $$('p', root)) {
    const kids = [...p.childNodes].filter((n) => !(n.nodeType === 3 && !n.data.trim()) && n.nodeName !== 'BR');
    if (kids.length === 1 && kids[0].nodeName === 'IMG' && p.parentElement === root) p.replaceWith(kids[0]);
  }
  for (const el of $$('strong, em, s, code', root)) {
    let next = el.nextSibling;
    while (next && next.nodeType === 1 && next.localName === el.localName && !next.attributes.length && !el.attributes.length) {
      el.append(...next.childNodes);
      next.remove();
      next = el.nextSibling;
    }
  }
  let run = [];
  const wrap = () => {
    if (run.some((n) => (n.nodeType === 3 ? n.data.trim() : n.nodeName !== 'BR'))) {
      const p = root.ownerDocument.createElement('p');
      run[0].before(p);
      p.append(...run);
    } else run.forEach((n) => n.nodeName === 'BR' && n.remove());
    run = [];
  };
  for (const node of [...root.childNodes]) {
    if (node.nodeType === 1 && BLOCKISH.has(node.localName)) wrap();
    else run.push(node);
  }
  wrap();
}

const selfClose = (html) => html.replace(/<(img|hr|br)\b([^>]*?)\s*\/?>/g, '<$1$2 />');
const startTag = (el) => `<${el.localName}${[...el.attributes].map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join('')}>`;

function formatChildren(parent, depth, top = false) {
  const pad = ' '.repeat(depth);
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const holder = parent.ownerDocument.createElement('div');
    holder.append(...run.map((n) => n.cloneNode(true)));
    const html = selfClose(holder.innerHTML).replace(/\s+/g, ' ').trim();
    if (html) out.push(pad + html);
    run = [];
  };
  for (const node of parent.childNodes) {
    if (!(node.nodeType === 1 && BLOCKISH.has(node.localName))) {
      run.push(node);
      continue;
    }
    flush();
    const name = node.localName;
    if (top && (name === 'h2' || name === 'h3') && out.length) out.push('');
    if (NESTING.has(name) && [...node.children].some((child) => BLOCKISH.has(child.localName) && child.localName !== 'img')) {
      out.push(pad + startTag(node), ...formatChildren(node, depth + 2), `${pad}</${name}>`);
    } else if (name === 'img' || name === 'hr') {
      out.push(pad + startTag(node).replace(/>$/, ' />'));
    } else if (name === 'pre') {
      out.push(pad + node.outerHTML);
    } else {
      out.push(pad + selfClose(node.outerHTML).replace(/\s+/g, ' ').trim());
    }
  }
  flush();
  return out;
}

function inertHolder(html) {
  const holder = document.implementation.createHTMLDocument('').createElement('div');
  holder.innerHTML = html;
  return holder;
}

function cleanFragment(html) {
  const holder = inertHolder(html);
  cleanTree(holder, true);
  return holder.innerHTML;
}

function serializeBody() {
  const holder = inertHolder(state.html ? bakeCodeBlocks(state.html.value) : page.body.innerHTML);
  cleanTree(holder, false);
  tidy(holder);
  return formatChildren(holder, 8, true).join('\n');
}

// Edit mode.

let toolbar = null;
let statusEl = null;
let draftSwitch = null;
let autosaveTimer = 0;

function readFields() {
  const meta = $('.post-meta', page.header);
  const dek = $('.post-dek', page.header);
  return {
    title: oneLine(page.title.textContent),
    dek: oneLine(dek?.textContent),
    date: $('time', meta || page.header)?.getAttribute('datetime') || today(),
    tags: meta ? oneLine(meta.textContent.split('·').slice(1).join('·')) : '',
    description: $('meta[name="description"]')?.getAttribute('content') || '',
    draft: Boolean($('meta[name="robots"][content*="noindex"]')),
  };
}

// Mirrors the server: with no description of its own, a post uses its summary line, else its first paragraph.
function firstParagraphText() {
  const line = oneLine(page.body.querySelector('p')?.textContent);
  return line.length > 160 ? `${line.slice(0, 157).replace(/\s+\S*$/, '')}…` : line;
}

function collectFields() {
  const dek = oneLine(page.dek.textContent);
  const f = state.fields;
  return { path, title: oneLine(page.title.textContent), dek, date: f.date, tags: f.tags, description: state.descriptionAuto ? dek : f.description, draft: f.draft };
}

function renderMeta() {
  const meta = $('.post-meta', page.header);
  if (!meta) return;
  const { date, tags } = state.fields;
  meta.innerHTML = `<time datetime="${date}">${prettyDate(date)}</time>${tags ? ` <span aria-hidden="true">&middot;</span> ${escapeHtml(tags)}` : ''}`;
}

function decorate() {
  for (const pre of $$('pre', page.body)) {
    if (pre.getAttribute('contenteditable') !== 'false') pre.setAttribute('contenteditable', 'false');
  }
  for (const img of $$('img', page.body)) img.draggable = false;
}

function setStatus(text) {
  if (!statusEl) return;
  statusEl.textContent = text ?? (state.dirty ? 'unsaved changes' : 'saved');
  statusEl.dataset.state = text ? 'busy' : state.dirty ? 'dirty' : 'clean';
}

function markDirty() {
  if (!state.editing) return;
  state.dirty = true;
  setStatus();
  for (const el of [page.title, page.dek]) el.classList.toggle('dev-empty', !el.textContent.trim());
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), fields: collectFields(), descriptionAuto: state.descriptionAuto, html: Boolean(state.html), body: state.html ? state.html.value : page.body.innerHTML }));
    } catch {
      // Storage full or disabled: the unsaved-changes prompt still guards the work.
    }
  }, 700);
}

function setDraft(draft) {
  if (state.fields.draft === draft) return;
  state.fields.draft = draft;
  updateDraftSwitch();
  markDirty();
}

function updateDraftSwitch() {
  for (const button of $$('button', draftSwitch)) button.setAttribute('aria-pressed', String((button.dataset.state === 'draft') === state.fields.draft));
}

function openSettings(anchor) {
  const f = state.fields;
  const date = h('input', { class: 'dev-input', type: 'date', value: f.date, required: true });
  const tags = h('input', { class: 'dev-input', value: f.tags, placeholder: 'OpenGL, C++, Math' });
  const description = h('textarea', { class: 'dev-input dev-textarea', rows: '3', placeholder: 'For search and link previews. Empty uses the summary line.' });
  description.value = state.descriptionAuto ? '' : f.description;
  date.addEventListener('input', () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return;
    f.date = date.value;
    renderMeta();
    markDirty();
  });
  tags.addEventListener('input', () => {
    f.tags = oneLine(tags.value);
    renderMeta();
    markDirty();
  });
  description.addEventListener('input', () => {
    f.description = oneLine(description.value);
    state.descriptionAuto = !f.description;
    markDirty();
  });
  const field = (label, input) => h('label', { class: 'dev-field' }, h('span', { class: 'dev-label' }, label), input);
  openPopover(anchor, h('div', { class: 'dev-form' }, field('date', date), field('tags', tags), field('description', description), h('p', { class: 'dev-hint' }, 'address ', h('code', {}, path))));
  date.focus();
}

function toggleHtml() {
  if (state.html) {
    const area = state.html;
    state.html = null;
    page.body.innerHTML = bakeCodeBlocks(area.value);
    area.remove();
    page.body.hidden = false;
    decorate();
    toolbar.classList.remove('dev-html-mode');
    focusBody();
    return;
  }
  const area = h('textarea', { class: 'dev-html', spellcheck: 'false', 'aria-label': 'Post HTML' });
  area.value = serializeBody().replace(/^ {8}/gm, '');
  const fit = () => {
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + 4}px`;
  };
  area.addEventListener('input', () => {
    fit();
    markDirty();
  });
  page.body.hidden = true;
  page.body.after(area);
  state.html = area;
  toolbar.classList.add('dev-html-mode');
  fit();
  area.focus({ preventScroll: true });
}

const TOOLS = [
  [
    { id: 'p', label: '¶', title: `Paragraph (${MOD}⌥0)`, run: () => setBlock('p') },
    { id: 'h2', label: 'H2', title: `Heading (${MOD}⌥2)`, run: () => setBlock('h2') },
    { id: 'h3', label: 'H3', title: `Subheading (${MOD}⌥3)`, run: () => setBlock('h3') },
  ],
  [
    { id: 'bold', label: 'B', class: 'dev-bold', title: `Bold (${MOD}B)`, run: () => exec('bold') },
    { id: 'italic', label: 'I', class: 'dev-italic', title: `Italic (${MOD}I)`, run: () => exec('italic') },
    { id: 'strike', label: 'S', class: 'dev-strike', title: `Strikethrough (${MOD}⇧X)`, run: () => exec('strikeThrough') },
    { id: 'code', label: '‹›', title: `Inline code (${MOD}E)`, run: inlineCode },
    { id: 'link', label: 'link', title: `Link (${MOD}K)`, run: openLink },
  ],
  [
    { id: 'ul', label: '• list', title: `Bulleted list (${MOD}⇧8, or "- ")`, run: () => toggleList('ul') },
    { id: 'ol', label: '1. list', title: `Numbered list (${MOD}⇧7, or "1. ")`, run: () => toggleList('ol') },
    { id: 'quote', label: '“ ”', title: `Quote (${MOD}⇧9, or "> ")`, run: () => setBlock('blockquote') },
  ],
  [
    { id: 'codeblock', label: '{ }', title: `Code block (${MOD}⌥C, or \`\`\`)`, toggle: false, run: () => openCodePanel() },
    { id: 'image', label: 'image', title: 'Image (or paste / drop one in)', toggle: false, run: pickImage },
    { id: 'table', label: 'table', title: 'Table (Tab moves between cells)', toggle: false, run: insertTable },
    { id: 'hr', label: '—', title: 'Divider (or ---)', toggle: false, run: () => exec('insertHorizontalRule') },
  ],
  [
    { id: 'undo', label: '↶', title: `Undo (${MOD}Z)`, toggle: false, run: () => exec('undo') },
    { id: 'redo', label: '↷', title: `Redo (${MOD}⇧Z)`, toggle: false, run: () => exec('redo') },
    { id: 'clear', label: 'Tx', title: 'Clear formatting', toggle: false, run: clearFormatting },
    { id: 'html', label: '</>', title: 'Edit the HTML', html: true, run: toggleHtml },
  ],
];

function runTool(tool) {
  if (state.html && !tool.html) return;
  if (!state.html) focusBody();
  tool.run();
  if (!state.html && tool.id !== 'html') markDirty();
  updateToolbar();
}

function buildToolbar() {
  const button = (tool) =>
    h(
      'button',
      { class: `dev-tool${tool.class ? ` ${tool.class}` : ''}`, type: 'button', title: tool.title, 'aria-label': tool.title, 'data-tool': tool.id, 'aria-pressed': tool.toggle === false ? null : 'false', onmousedown: prevent, onclick: () => runTool(tool) },
      tool.label,
    );
  statusEl = h('span', { class: 'dev-status', role: 'status' });
  draftSwitch = h(
    'div',
    { class: 'dev-switch', role: 'group', 'aria-label': 'Visibility' },
    h('button', { class: 'dev-tool', type: 'button', 'data-state': 'draft', title: 'Draft: left off /blog/ and marked noindex', onmousedown: prevent, onclick: () => setDraft(true) }, 'draft'),
    h('button', { class: 'dev-tool', type: 'button', 'data-state': 'published', title: 'Published: listed on /blog/', onmousedown: prevent, onclick: () => setDraft(false) }, 'published'),
  );
  toolbar = h(
    'div',
    { class: 'dev-toolbar', role: 'toolbar', 'aria-label': 'Post formatting' },
    h('div', { class: 'dev-tools' }, TOOLS.map((group) => h('div', { class: 'dev-group' }, group.map(button)))),
    h(
      'div',
      { class: 'dev-actions' },
      h('button', { class: 'dev-tool', type: 'button', title: 'Date, tags and description', onmousedown: prevent, onclick: (event) => openSettings(event.currentTarget.getBoundingClientRect()) }, 'details'),
      draftSwitch,
      statusEl,
      h('button', { class: 'dev-btn dev-btn-main', type: 'button', title: `Save (${MOD}S)`, onmousedown: prevent, onclick: save }, 'save'),
      h('button', { class: 'dev-btn', type: 'button', title: 'Stop editing', onclick: stopEditing }, 'done'),
    ),
  );
  ui.append(toolbar);
  updateDraftSwitch();
  setStatus();
}

function updateToolbar() {
  if (!toolbar) return;
  const inside = !state.html && selectionIn(page.body);
  const block = inside ? currentBlock() : null;
  const el = inside ? anchorElement() : null;
  const on = {
    p: block?.localName === 'p' && !block.closest('blockquote'),
    h2: block?.localName === 'h2',
    h3: block?.localName === 'h3',
    bold: inside && document.queryCommandState('bold') && !/^h[2-4]$/.test(block?.localName),
    italic: inside && document.queryCommandState('italic'),
    strike: inside && document.queryCommandState('strikeThrough'),
    code: Boolean(el?.closest('code')),
    link: Boolean(el?.closest('a')),
    ul: Boolean(el?.closest('ul')),
    ol: Boolean(el?.closest('ol')),
    quote: Boolean(el?.closest('blockquote')),
    html: Boolean(state.html),
  };
  for (const button of $$('[data-tool]', toolbar)) {
    if (button.dataset.tool in on && button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(Boolean(on[button.dataset.tool])));
  }
}

function offerRestore() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!saved) return;
  const current = collectFields();
  const same = !saved.html && saved.body === page.body.innerHTML && ['title', 'dek', 'date', 'tags', 'draft'].every((key) => saved.fields[key] === current[key]);
  if (same) return localStorage.removeItem(DRAFT_KEY);
  const bar = h(
    'div',
    { class: 'dev-restore' },
    h('span', {}, `Unsaved edits from ${new Date(saved.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`),
    h('button', { class: 'dev-btn', type: 'button', onclick: () => (restoreUnsaved(saved), bar.remove()) }, 'restore'),
    h('button', { class: 'dev-btn', type: 'button', onclick: () => (localStorage.removeItem(DRAFT_KEY), bar.remove()) }, 'discard'),
  );
  ui.append(bar);
}

function restoreUnsaved(saved) {
  page.title.textContent = saved.fields.title;
  page.dek.textContent = saved.fields.dek;
  Object.assign(state.fields, { date: saved.fields.date, tags: saved.fields.tags, draft: saved.fields.draft, description: saved.fields.description });
  state.descriptionAuto = saved.descriptionAuto;
  page.body.innerHTML = saved.html ? bakeCodeBlocks(saved.body) : saved.body;
  renderMeta();
  decorate();
  updateDraftSwitch();
  markDirty();
}

function startEditing({ fresh = false } = {}) {
  if (!page.isPost || state.editing) return;
  state.editing = true;
  state.fields = readFields();
  state.descriptionAuto = [state.fields.dek, firstParagraphText(), '', 'Start writing here.', 'A short description of this post.'].includes(state.fields.description);
  document.documentElement.classList.add('dev-editing');
  dock.hidden = true;
  closePosts();

  page.dek = $('.post-dek', page.header) || page.title.insertAdjacentElement('afterend', h('p', { class: 'post-dek' }));
  const plain = (el, placeholder) => {
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = true;
    el.dataset.devPlaceholder = placeholder;
    el.classList.toggle('dev-empty', !el.textContent.trim());
    el.addEventListener('input', markDirty);
    el.addEventListener('paste', (event) => (event.preventDefault(), insertText(oneLine(event.clipboardData.getData('text/plain')))));
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (el === page.title) page.dek.focus();
        else {
          const start = document.createRange();
          start.selectNodeContents(page.body);
          start.collapse(true);
          restoreRange(start);
        }
      } else if ((event.metaKey || event.ctrlKey) && /^Key[BIU]$/.test(event.code)) event.preventDefault();
    });
  };
  plain(page.title, 'Title');
  plain(page.dek, 'One-line summary (optional)');
  $('.post-meta', page.header)?.addEventListener('click', (event) => openSettings(event.currentTarget.getBoundingClientRect()));

  page.body.contentEditable = 'true';
  page.body.spellcheck = true;
  exec('defaultParagraphSeparator', 'p');
  exec('styleWithCSS', false);
  decorate();
  page.body.addEventListener('input', () => {
    decorate();
    markDirty();
  });
  page.body.addEventListener('click', (event) => {
    const pre = event.target.closest('pre');
    if (pre && page.body.contains(pre)) return openCodePanel(pre);
    const img = event.target.closest('img');
    if (img && page.body.contains(img)) return selectImage(img);
    const link = event.target.closest('a');
    if (link && (event.metaKey || event.ctrlKey)) window.open(link.href, '_blank', 'noopener');
  });
  page.body.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    const images = [...data.files].filter((file) => file.type.startsWith('image/'));
    event.preventDefault();
    if (images.length) return uploadImages(images, bodyRange());
    const html = data.getData('text/html');
    if (html) return insertHtml(cleanFragment(html));
    const text = data.getData('text/plain').replace(/\r\n?/g, '\n');
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
    if (paragraphs.length > 1) insertHtml(paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''));
    else if (text) insertText(text);
  });
  page.body.addEventListener('dragover', (event) => {
    if ([...event.dataTransfer.items].some((item) => item.kind === 'file')) event.preventDefault();
  });
  page.body.addEventListener('drop', (event) => {
    const images = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault();
    const at = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    uploadImages(images, at && page.body.contains(at.startContainer) ? at : bodyRange());
  });

  buildToolbar();
  if (fresh) localStorage.removeItem(DRAFT_KEY);
  else offerRestore();
  if (fresh) {
    const first = page.body.querySelector('p');
    if (first) {
      selectNode(first, true);
      page.body.focus({ preventScroll: true });
    }
  } else focusBody();
  updateToolbar();
}

async function save() {
  if (!state.editing || state.saving) return;
  const fields = collectFields();
  if (!fields.title) {
    toast('Give the post a title first', 'error');
    return page.title.focus();
  }
  state.saving = true;
  setStatus('saving…');
  try {
    await api('PUT', '/post', { ...fields, body: serializeBody() });
    state.dirty = false;
    clearTimeout(autosaveTimer);
    localStorage.removeItem(DRAFT_KEY);
    document.title = `${fields.title} | Brennen Green`;
    setStatus(fields.draft ? 'saved as draft' : 'saved');
  } catch (error) {
    setStatus('not saved');
    toast(error.message, 'error');
  } finally {
    state.saving = false;
  }
}

function stopEditing() {
  if (state.dirty && !confirm('Discard unsaved changes?')) return;
  state.dirty = false;
  localStorage.removeItem(DRAFT_KEY);
  location.reload();
}

function shortcut(event) {
  const key = event.code;
  if (event.altKey) return { Digit0: () => setBlock('p'), Digit2: () => setBlock('h2'), Digit3: () => setBlock('h3'), KeyC: () => openCodePanel() }[key];
  if (event.shiftKey) return { KeyX: () => exec('strikeThrough'), Digit7: () => toggleList('ol'), Digit8: () => toggleList('ul'), Digit9: () => setBlock('blockquote') }[key];
  return { KeyB: () => exec('bold'), KeyI: () => exec('italic'), KeyU: () => {}, KeyE: inlineCode, KeyK: openLink }[key];
}

document.addEventListener('keydown', (event) => {
  if (!state.editing) return;
  const cmd = event.metaKey || event.ctrlKey;
  if (event.key === 'Escape' && popover) return closePopover();
  if (cmd && event.code === 'KeyS') {
    event.preventDefault();
    return save();
  }
  if (state.html || !selectionIn(page.body) || document.querySelector('.dev-modal')) return;
  if (event.key === 'Tab' && tableTab(event)) return;
  if (!cmd && markdownShortcut(event)) return markDirty();
  const run = cmd && shortcut(event);
  if (!run) return;
  event.preventDefault();
  run();
  markDirty();
  updateToolbar();
});

document.addEventListener('selectionchange', () => {
  if (!state.editing) return;
  const range = bodyRange();
  if (range) state.range = range;
  updateToolbar();
});

addEventListener('scroll', () => popover && !popover.el.contains(document.activeElement) && closePopover(), { passive: true });

addEventListener('beforeunload', (event) => {
  if (!state.editing || !state.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

if (page.isPost && sessionStorage.getItem('dev-editor:open') === path) {
  sessionStorage.removeItem('dev-editor:open');
  startEditing({ fresh: true });
}
