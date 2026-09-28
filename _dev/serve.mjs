#!/usr/bin/env node
// Local server for this static site. No dependencies.
//
//   node _dev/serve.mjs            the site plus the in-browser post editor
//   node _dev/serve.mjs --prod     exactly what GitHub Pages publishes: no editor, no API
//   node _dev/serve.mjs --bake     re-highlight the code blocks in every post, then exit
//   --port <n>                     default 8080
//
// The editor is injected into HTML responses on the fly, so nothing about it is ever written into a page.
// GitHub Pages builds this repo with Jekyll, which never publishes `_`-prefixed paths such as this folder.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeCodeBlocks, decodeEntities } from './highlight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = path.join(ROOT, 'blog');
const TEMPLATE = path.join(BLOG, '_post-template.html');
const BLOG_INDEX = path.join(BLOG, 'index.html');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

if (flag('--help') || flag('-h')) {
  console.log('usage: node _dev/serve.mjs [--prod] [--port 8080] [--bake]');
  process.exit(0);
}

const PROD = flag('--prod');
const PORT = Number(option('--port', process.env.PORT || 8080));
const HOST = '127.0.0.1';
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ORIGINS = new Set([...HOSTS].map((host) => `http://${host}`));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};
const PLACEHOLDERS = new Set(['Start writing here.', 'A short description of this post.']);
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);
const EDITOR_TAGS = '  <link rel="stylesheet" href="/_dev/editor.css" />\n  <script type="module" src="/_dev/editor.js"></script>\n';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

const isInside = (file, dir) => {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const stat = (file) => fs.stat(file).catch(() => null);
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
const prettyDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const urlFor = (dir) => `/${path.relative(ROOT, dir).split(path.sep).join('/')}/`;

async function writeAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

// Static files, served the way GitHub Pages serves them.

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendNotFound(req, res);
  }
  const segments = pathname.split('/').filter(Boolean);
  const editorAsset = !PROD && segments.length === 2 && segments[0] === '_dev' && !segments[1].startsWith('.');
  if (pathname.includes('\0') || (!editorAsset && segments.some((s) => s.startsWith('_') || s.startsWith('.')))) {
    return sendNotFound(req, res);
  }
  let file = path.join(ROOT, ...segments);
  if (!isInside(file, ROOT)) return sendNotFound(req, res);
  let info = await stat(file);
  if (info?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    file = path.join(file, 'index.html');
    info = await stat(file);
  } else if (!info && !path.extname(file)) {
    const page = `${file}.html`;
    const pageInfo = await stat(page);
    if (pageInfo?.isFile()) [file, info] = [page, pageInfo];
  }
  if (!info?.isFile()) return sendNotFound(req, res);
  return sendFile(req, res, file, 200);
}

async function sendFile(req, res, file, status) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  let data = await fs.readFile(file);
  if (!PROD && type.startsWith('text/html')) {
    const html = data.toString('utf8');
    data = Buffer.from(html.includes('</head>') ? html.replace('</head>', `${EDITOR_TAGS}</head>`) : html + EDITOR_TAGS);
  }
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function sendNotFound(req, res) {
  const page = path.join(ROOT, '404.html');
  if (await stat(page)) return sendFile(req, res, page, 404);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function sendJson(res, status, value) {
  const data = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => (size > limit ? reject(new HttpError(413, 'too large')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readBody(req, 5 * 1024 * 1024);
  try {
    return JSON.parse(body.toString('utf8') || '{}');
  } catch {
    fail(400, 'invalid JSON');
  }
}

// Posts: every blog/<folder>/index.html. A post with a noindex meta is a draft and is left off /blog/.

async function postFiles(dir = BLOG) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const folder = path.join(dir, entry.name);
    if (await stat(path.join(folder, 'index.html'))) files.push(path.join(folder, 'index.html'));
    files.push(...(await postFiles(folder)));
  }
  return files;
}

function readPost(html, file) {
  const title = (html.match(/<h1 class="post-title">([\s\S]*?)<\/h1>/) || [])[1];
  if (title === undefined) return null;
  const titleHtml = title.replace(/<[^>]*>/g, '').trim();
  return {
    path: urlFor(path.dirname(file)),
    title: decodeEntities(titleHtml),
    titleHtml,
    date: (html.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/) || [])[1] || '',
    draft: /<meta name="robots" content="noindex/.test(html),
  };
}

async function listPosts() {
  const posts = [];
  for (const file of await postFiles()) {
    const post = readPost(await fs.readFile(file, 'utf8'), file);
    if (post) posts.push(post);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

function postFile(urlPath) {
  const match = /^\/blog\/((?:[a-z0-9][a-z0-9-]*\/)+)$/.exec(String(urlPath || ''));
  if (!match) fail(400, 'not a post address');
  return path.join(BLOG, ...match[1].split('/').filter(Boolean), 'index.html');
}

function firstParagraphText(body) {
  const text = decodeEntities(((String(body).match(/<p>([\s\S]*?)<\/p>/) || [])[1] || '').replace(/<[^>]*>/g, ''));
  const line = oneLine(text);
  if (PLACEHOLDERS.has(line)) return '';
  return line.length > 160 ? `${line.slice(0, 157).replace(/\s+\S*$/, '')}…` : line;
}

function replaceBlock(html, start, end, replacement) {
  const i = html.indexOf(start);
  const j = i < 0 ? -1 : html.indexOf(end, i);
  if (j < 0) fail(500, `the post template is missing ${start.trim()}`);
  return html.slice(0, i) + replacement + html.slice(j + end.length);
}

// Builds a post from blog/_post-template.html so every post shares the current site chrome.
function composePost(template, post) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(post.date || '') ? post.date : fail(400, 'the date must look like YYYY-MM-DD');
  const title = oneLine(post.title) || fail(400, 'a post needs a title');
  const dek = oneLine(post.dek);
  const tags = oneLine(post.tags);
  const body = String(post.body ?? '').replace(/\s+$/, '') || '        <p></p>';
  const given = oneLine(post.description);
  const description = (PLACEHOLDERS.has(given) ? '' : given) || dek || firstParagraphText(body);

  const robots = '  <meta name="robots" content="noindex" />\n';
  if (!template.includes(robots)) fail(500, 'the post template lost its noindex line');
  let html = template.replace(robots, post.draft ? robots : '');
  html = html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeAttr(description)}" />`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeText(title)} | Brennen Green</title>`);
  const meta = `<time datetime="${date}">${prettyDate(date)}</time>${tags ? ` <span aria-hidden="true">&middot;</span> ${escapeText(tags)}` : ''}`;
  const header = [
    '      <header class="post-header">',
    `        <p class="post-meta">${meta}</p>`,
    `        <h1 class="post-title">${escapeText(title)}</h1>`,
    ...(dek ? [`        <p class="post-dek">${escapeText(dek)}</p>`] : []),
    '      </header>',
    '',
  ].join('\n');
  html = replaceBlock(html, '      <header class="post-header">', '      </header>\n', header);
  html = replaceBlock(html, '      <div class="post-body">', '      </div>\n    </article>', `      <div class="post-body">\n${body}\n      </div>\n    </article>`);
  return bakeCodeBlocks(html);
}

async function rebuildIndex() {
  const posts = (await listPosts()).filter((post) => !post.draft);
  const items = posts.map((post) =>
    [
      '          <li>',
      `            <a href="${post.path}">${post.titleHtml}</a>`,
      `            <time class="post-date" datetime="${post.date}">${prettyDate(post.date)}</time>`,
      '          </li>',
    ].join('\n'),
  );
  const list = items.length ? `<ol class="post-list">\n${items.join('\n')}\n        </ol>` : '<ol class="post-list"></ol>';
  const html = await fs.readFile(BLOG_INDEX, 'utf8');
  const next = html.replace(/<ol class="post-list">[\s\S]*?<\/ol>/, list);
  if (next !== html) await writeAtomic(BLOG_INDEX, next);
}

async function createPost({ title }) {
  const name = oneLine(title) || fail(400, 'a post needs a title');
  const base = slugify(name) || 'post';
  let slug = base;
  for (let n = 2; await stat(path.join(BLOG, slug)); n += 1) slug = `${base}-${n}`;
  const html = composePost(await fs.readFile(TEMPLATE, 'utf8'), {
    title: name,
    date: today(),
    draft: true,
    body: '        <p>Start writing here.</p>',
  });
  await fs.mkdir(path.join(BLOG, slug));
  await writeAtomic(path.join(BLOG, slug, 'index.html'), html);
  console.log(`  created blog/${slug}/index.html (draft)`);
  return { path: `/blog/${slug}/` };
}

async function savePost(post) {
  const file = postFile(post.path);
  if (!(await stat(file))) fail(404, 'no such post');
  if (typeof post.body !== 'string') fail(400, 'the body must be HTML text');
  const html = composePost(await fs.readFile(TEMPLATE, 'utf8'), { ...post, draft: Boolean(post.draft) });
  await writeAtomic(file, html);
  await rebuildIndex();
  console.log(`  saved ${path.relative(ROOT, file)}${post.draft ? ' (draft)' : ''}`);
  return { path: post.path, draft: Boolean(post.draft) };
}

async function upload(req, url) {
  const file = postFile(url.searchParams.get('path'));
  if (!(await stat(file))) fail(404, 'no such post');
  const dir = path.dirname(file);
  const original = String(url.searchParams.get('name') || 'image.png');
  const ext = path.extname(original).toLowerCase();
  if (!IMAGE_TYPES.has(ext)) fail(415, `${ext || 'that file'} isn't an image type the site uses`);
  const base = slugify(path.basename(original, ext)) || 'image';
  let name = `${base}${ext}`;
  for (let n = 2; await stat(path.join(dir, name)); n += 1) name = `${base}-${n}${ext}`;
  const data = await readBody(req, 40 * 1024 * 1024);
  if (!data.length) fail(400, 'the upload was empty');
  await fs.writeFile(path.join(dir, name), data);
  console.log(`  added ${path.relative(ROOT, path.join(dir, name))}`);
  return { src: `${urlFor(dir)}${name}` };
}

// Only this machine and this page's origin may call the API: blocks DNS rebinding and cross-site requests.
function checkCaller(req) {
  if (!HOSTS.has(req.headers.host)) fail(403, 'forbidden host');
  if (req.method === 'GET') return;
  if (req.headers['x-dev-editor'] !== '1') fail(403, 'missing editor header');
  if (req.headers.origin && !ORIGINS.has(req.headers.origin)) fail(403, 'forbidden origin');
}

async function handleApi(req, res, url) {
  checkCaller(req);
  const route = `${req.method} ${url.pathname.slice('/_dev/api'.length)}`;
  if (route === 'GET /posts') return sendJson(res, 200, (await listPosts()).map(({ titleHtml, ...post }) => post));
  if (route === 'POST /posts') return sendJson(res, 201, await createPost(await readJson(req)));
  if (route === 'PUT /post') return sendJson(res, 200, await savePost(await readJson(req)));
  if (route === 'POST /upload') return sendJson(res, 201, await upload(req, url));
  fail(404, 'no such endpoint');
}

async function bakeAll() {
  let changed = 0;
  for (const file of await postFiles()) {
    const html = await fs.readFile(file, 'utf8');
    const baked = bakeCodeBlocks(html);
    if (baked === html) continue;
    await writeAtomic(file, baked);
    changed += 1;
    console.log(`  baked ${path.relative(ROOT, file)}`);
  }
  console.log(`${changed} post${changed === 1 ? '' : 's'} updated`);
}

if (flag('--bake')) {
  await bakeAll();
} else {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    try {
      if (!PROD && url.pathname.startsWith('/_dev/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        return res.end();
      }
      await serveStatic(req, res, url);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      if (!res.headersSent) sendJson(res, status, { error: error.message });
      else res.end();
    }
  });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `port ${PORT} is already in use; try --port ${PORT + 1}` : error.message);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`brennengreen.dev at http://${HOST}:${PORT}/`);
    console.log(PROD ? '  production preview: what GitHub Pages publishes, no editor' : '  dev: blog editor on (--prod serves exactly what GitHub Pages publishes)');
  });
}
