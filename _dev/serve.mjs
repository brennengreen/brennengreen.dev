#!/usr/bin/env node
// Local server for this static site. No dependencies.
//
//   node _dev/serve.mjs            the site plus the in-browser post editor
//   node _dev/serve.mjs --prod     exactly what GitHub Pages publishes: no editor, no API
//   node _dev/serve.mjs --bake     rebuild every post from the template (re-highlighting its code), refresh the
//                                  blog index, feed, sitemap and llms.txt, then exit
//   --port <n>                     default 8080
//
// The editor is injected into HTML responses on the fly, so nothing about it is ever written into a page.
// Saving a post refreshes its search and share tags, the blog index, blog/feed.xml, sitemap.xml and llms.txt.
// GitHub Pages builds this repo with Jekyll, which never publishes `_`-prefixed paths such as this folder.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeCodeBlocks, decodeEntities } from './highlight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = path.join(ROOT, '_dev');
const BLOG = path.join(ROOT, 'blog');
const TEMPLATE = path.join(BLOG, '_post-template.html');
const BLOG_INDEX = path.join(BLOG, 'index.html');
const FEED = path.join(BLOG, 'feed.xml');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const LLMS = path.join(ROOT, 'llms.txt');
// Absolute URLs for canonical links, share tags, the feed and the sitemap: the custom domain in CNAME.
const SITE = `https://${(await fs.readFile(path.join(ROOT, 'CNAME'), 'utf8')).trim()}`;
const AUTHOR = { '@type': 'Person', '@id': `${SITE}/#person`, name: 'Brennen Green', url: `${SITE}/` };
const SHARE_IMAGE = { url: `${SITE}/assets/og.jpg`, width: 1200, height: 630 };
// Where the template takes a published post's canonical link, share tags and structured data. It's a comment, so a
// post copied from the template by hand never claims the wrong canonical URL before it's baked.
const SEO_MARKER = '  <!-- search and share tags: _dev/serve.mjs fills these in for published posts -->\n';
const LD_START = '  <script type="application/ld+json">\n';
const LD_END = '  </script>\n';

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
const absolute = (url) => new URL(url, `${SITE}/`).href;
// Structured data as a head script; `<` is escaped so no string in it can close the script early.
const jsonLd = (value) => `${LD_START}${JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/^/gm, '  ')}\n${LD_END}`;

async function writeAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

async function writeIfChanged(file, data) {
  if ((await fs.readFile(file, 'utf8').catch(() => null)) !== data) await writeAtomic(file, data);
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
  if (!PROD && type.startsWith('text/html') && !isInside(file, DEV)) {
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
    description: decodeEntities((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ''),
    draft: /<meta name="robots" content="noindex/.test(html),
  };
}

// Reads back every field composePost wrote, so --bake can rebuild a post from the current template.
function parsePost(html) {
  const pick = (re) => (html.match(re) || [])[1];
  const title = pick(/<h1 class="post-title">([\s\S]*?)<\/h1>/);
  const meta = pick(/<p class="post-meta">([\s\S]*?)<\/p>/);
  const open = '      <div class="post-body">\n';
  const start = html.indexOf(open);
  const end = html.lastIndexOf('\n      </div>\n    </article>');
  if (title === undefined || meta === undefined || start < 0 || end < start) return null;
  return {
    title: decodeEntities(title),
    date: pick(/<time datetime="(\d{4}-\d{2}-\d{2})"/) || '',
    tags: decodeEntities((meta.split('<span aria-hidden="true">&middot;</span>')[1] || '').trim()),
    dek: decodeEntities(pick(/<p class="post-dek">([\s\S]*?)<\/p>/) || ''),
    description: decodeEntities(pick(/<meta name="description" content="([^"]*)"/) || ''),
    draft: /<meta name="robots" content="noindex/.test(html),
    body: html.slice(start + open.length, end),
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

// A post shares its first sizeable image, else the site's card.
function shareImage(body, pageUrl) {
  for (const [tag] of String(body).matchAll(/<img\b[^>]*>/g)) {
    const attr = (name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
    const src = attr('src');
    const width = Number(attr('width')) || 0;
    const height = Number(attr('height')) || 0;
    if (!src || src.startsWith('data:') || (width && width < 400)) continue;
    return { url: new URL(decodeEntities(src), pageUrl).href, width, height };
  }
  return SHARE_IMAGE;
}

// Canonical link, share tags and structured data for a published post, all from its own fields.
function seoBlock({ path: postPath, title, description, date, tags, body }) {
  const url = absolute(postPath);
  const image = shareImage(body, url);
  const lines = [
    `  <link rel="canonical" href="${url}" />`,
    '  <meta name="author" content="Brennen Green" />',
    '  <meta property="og:type" content="article" />',
    '  <meta property="og:site_name" content="Brennen Green" />',
    `  <meta property="og:title" content="${escapeAttr(title)}" />`,
    ...(description ? [`  <meta property="og:description" content="${escapeAttr(description)}" />`] : []),
    `  <meta property="og:url" content="${url}" />`,
    `  <meta property="og:image" content="${escapeAttr(image.url)}" />`,
    ...(image.width && image.height ? [`  <meta property="og:image:width" content="${image.width}" />`, `  <meta property="og:image:height" content="${image.height}" />`] : []),
    `  <meta property="article:published_time" content="${date}" />`,
    '  <meta name="twitter:card" content="summary_large_image" />',
  ];
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    ...(description ? { description } : {}),
    datePublished: date,
    url,
    mainEntityOfPage: url,
    image: image.url,
    ...(tags ? { keywords: tags } : {}),
    inLanguage: 'en',
    author: AUTHOR,
  };
  return `${lines.join('\n')}\n${jsonLd(data)}`;
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
  if (!template.includes(SEO_MARKER)) fail(500, 'the post template lost its search and share tags line');
  // Replacer functions keep a `$` in a title or description literal.
  let html = template.replace(robots, post.draft ? robots : '');
  html = html.replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${escapeAttr(description)}" />`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeText(title)} | Brennen Green</title>`);
  // Drafts are noindex and unlisted, so they carry no canonical link, share tags or structured data.
  html = html.replace(SEO_MARKER, () => (post.draft ? '' : seoBlock({ path: post.path, title, description, date, tags, body })));
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

// Everything that lists published posts: the blog index and its structured data, the Atom feed, the sitemap,
// and the Writing section of llms.txt. Files are only rewritten when their content changes.
async function rebuildListings() {
  const posts = (await listPosts()).filter((post) => !post.draft);
  const newest = posts.map((post) => post.date).sort().pop() || today();

  const items = posts.map((post) =>
    [
      '          <li>',
      `            <a href="${post.path}">${post.titleHtml}</a>`,
      `            <time class="post-date" datetime="${post.date}">${prettyDate(post.date)}</time>`,
      '          </li>',
    ].join('\n'),
  );
  const list = items.length ? `<ol class="post-list">\n${items.join('\n')}\n        </ol>` : '<ol class="post-list"></ol>';
  let index = (await fs.readFile(BLOG_INDEX, 'utf8')).replace(/<ol class="post-list">[\s\S]*?<\/ol>/, () => list);
  if (index.includes(LD_START)) {
    const blog = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      '@id': `${SITE}/blog/#blog`,
      url: `${SITE}/blog/`,
      name: 'Writing',
      inLanguage: 'en',
      author: AUTHOR,
      blogPost: posts.map((post) => ({ '@type': 'BlogPosting', headline: post.title, url: absolute(post.path), datePublished: post.date })),
    };
    index = replaceBlock(index, LD_START, LD_END, jsonLd(blog));
  }
  await writeIfChanged(BLOG_INDEX, index);

  const urls = [{ loc: `${SITE}/` }, { loc: `${SITE}/blog/`, lastmod: newest }, ...posts.map((post) => ({ loc: absolute(post.path), lastmod: post.date }))];
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(({ loc, lastmod }) => `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`),
    '</urlset>',
    '',
  ].join('\n');
  await writeIfChanged(SITEMAP, sitemap);

  const stamp = (date) => `${date}T00:00:00Z`;
  const feed = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title>Brennen Green</title>',
    '  <subtitle>Writing</subtitle>',
    `  <link href="${SITE}/blog/" />`,
    `  <link rel="self" href="${SITE}/blog/feed.xml" />`,
    `  <id>${SITE}/blog/</id>`,
    `  <updated>${stamp(newest)}</updated>`,
    '  <author>',
    '    <name>Brennen Green</name>',
    `    <uri>${SITE}/</uri>`,
    '  </author>',
    ...posts.flatMap((post) => [
      '  <entry>',
      `    <title>${escapeText(post.title)}</title>`,
      `    <link href="${absolute(post.path)}" />`,
      `    <id>${absolute(post.path)}</id>`,
      `    <published>${stamp(post.date)}</published>`,
      `    <updated>${stamp(post.date)}</updated>`,
      ...(post.description ? [`    <summary>${escapeText(post.description)}</summary>`] : []),
      '  </entry>',
    ]),
    '</feed>',
    '',
  ].join('\n');
  await writeIfChanged(FEED, feed);

  const llms = await fs.readFile(LLMS, 'utf8').catch(() => null);
  const heading = '\n## Writing\n';
  if (llms?.includes(heading)) {
    const start = llms.indexOf(heading) + heading.length;
    const next = llms.indexOf('\n## ', start);
    const link = (post) => `- [${post.title.replace(/[[\]]/g, '\\$&')}](${absolute(post.path)}): ${prettyDate(post.date)}.${post.description ? ` ${post.description}` : ''}`;
    const section = `\n${posts.map(link).join('\n')}\n`;
    await writeIfChanged(LLMS, llms.slice(0, start) + section + (next < 0 ? '' : llms.slice(next)));
  }
}

async function createPost({ title }) {
  const name = oneLine(title) || fail(400, 'a post needs a title');
  const base = slugify(name) || 'post';
  let slug = base;
  for (let n = 2; await stat(path.join(BLOG, slug)); n += 1) slug = `${base}-${n}`;
  const html = composePost(await fs.readFile(TEMPLATE, 'utf8'), {
    path: `/blog/${slug}/`,
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
  await rebuildListings();
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
  const template = await fs.readFile(TEMPLATE, 'utf8');
  let changed = 0;
  for (const file of await postFiles()) {
    const name = path.relative(ROOT, file);
    const html = await fs.readFile(file, 'utf8');
    const fields = parsePost(html);
    let next;
    try {
      next = fields ? composePost(template, { ...fields, path: urlFor(path.dirname(file)) }) : bakeCodeBlocks(html);
    } catch (error) {
      console.log(`  skipped ${name}: ${error.message}`);
      continue;
    }
    if (!fields) console.log(`  ${name} doesn't follow the post template, so only its code was re-highlighted`);
    if (next === html) continue;
    await writeAtomic(file, next);
    changed += 1;
    console.log(`  rebuilt ${name}`);
  }
  await rebuildListings();
  console.log(`${changed} post${changed === 1 ? '' : 's'} updated; blog index, feed, sitemap and llms.txt are current`);
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
