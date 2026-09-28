# Dev tools

Everything in `_dev/` is local-only. GitHub Pages builds this site with Jekyll,
which never publishes `_`-prefixed paths, so none of it reaches
www.brennengreen.dev. Don't add a `.nojekyll` file: that turns Jekyll off and
would publish this folder.

## Run the site

```sh
node _dev/serve.mjs            # http://127.0.0.1:8080/ with the post editor
node _dev/serve.mjs --prod     # exactly what GitHub Pages publishes: no editor, no API
node _dev/serve.mjs --bake     # re-highlight the code blocks in every post, then exit
node _dev/serve.mjs --port 9000
```

No install step: it's plain Node. The editor is added to pages as they are
served, so nothing about it is ever written into the site's files. Its save API
only answers requests from this machine and this page.

## Write a post

1. Click **+ new post** in the corner, give it a title, and press Enter. It
   opens as a draft at `/blog/<title>/`.
2. Type into the page itself. The title, the summary line under it, and the
   body are all editable, and what you see is how it will look.
3. Use the toolbar or shortcuts:
   - `⌘B` bold, `⌘I` italic, `⌘⇧X` strikethrough, `⌘E` inline code, `⌘K` link
   - `⌘⌥2` / `⌘⌥3` headings, `⌘⌥0` paragraph, `⌘⇧7` / `⌘⇧8` lists, `⌘⇧9` quote
   - Markdown at the start of a line: `## `, `### `, `- `, `1. `, `> `,
     `---` then Enter, and ```` ```python ```` then Enter for a code block
   - `⌘⌥C` or `{ }` opens the code editor: pick a language, Tab indents,
     `⌘↵` inserts. Click any code block in a post to edit it again.
   - Paste or drop images straight in; they're saved next to the post. Click
     an image to set its alt text.
   - **table**, **—** divider, **Tx** clear formatting, **</>** edit the HTML
4. **details** sets the date, tags and description. Flip **draft** to
   **published** when it's ready, then `⌘S` to save.

Saving writes `blog/<slug>/index.html` from `blog/_post-template.html`, bakes
the code highlighting in, and rebuilds the list on `/blog/`. Drafts are marked
noindex and left off that list. Unsaved work is kept in the browser, so a
reload offers to restore it.

Commit the new folder when you're happy with it. Drafts are real files too, so
leave a draft's folder uncommitted until it's published.

## Without the editor

Copy `blog/_post-template.html` to `blog/<slug>/index.html`, fill it in,
remove the noindex line, and add a link to the `<ol class="post-list">` in
`blog/index.html`, newest first. Write code as
`<pre><code class="language-glsl">…</code></pre>` and run
`node _dev/serve.mjs --bake` to add the highlighting and line numbers.

`blog/posts/1/` is the 2020 Mandelbrot post, kept at its original address so
old links still work.

## Files

- `serve.mjs` is the server, the save API, and `--bake`.
- `highlight.mjs` is the syntax highlighter, shared by the server and the editor.
- `editor.js` and `editor.css` are the in-page editor.
