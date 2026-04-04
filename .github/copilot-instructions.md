# Copilot Instructions — brennengreen.dev

## Architecture

Static personal portfolio site hosted on GitHub Pages (CNAME: `www.brennengreen.dev`). No build step, bundler, or framework — all pages are hand-authored HTML/CSS/JS served directly.

### Page structure

- **`/index.html`** — Main portfolio. Modern dark-theme design using `css/stylesheet.css` and `js/interactive-grid.js`. Sections: hero, experience timeline, credits (film/game), systems, portfolio media grid, contact.
- **`/graphics/index.html`** — Older graphics project archive. Self-contained styles (inline `<style>`), monospace font, simple card layout.
- **`/blog/index.html`** — Blog listing page. Same older inline-style approach as the graphics page.
- **`/blog/posts/{n}/index.html`** — Individual blog posts. Each is a standalone HTML file with its own inline styles and optional libraries (Prism.js for syntax highlighting, MathJax for math rendering).

The main page (`/index.html`) and the older subpages (`/graphics/`, `/blog/`) use **completely different design systems** — the main page uses CSS custom properties from `stylesheet.css` while subpages have their own inline styles with a white background and monospace font.

### Key files

- **`css/stylesheet.css`** — Design system for the main page. All theming lives in `:root` CSS custom properties (`--bg`, `--brand`, `--panel`, etc.). Uses utility classes (`.wrapper`, `.section`, `.panel`, `.grid`) and component-specific classes (`.xp-node`, `.credit-card`, `.media-tile`, `.sys-block`).
- **`js/interactive-grid.js`** — IIFE that handles media tile hover/focus/keyboard interactions and credits filtering. Attaches on `DOMContentLoaded`.
- **`blog/gen_posts.js`** and **`graphics/gen_posts.js`** — Identical stub scripts using Node.js `fs`/`path` imports (ES module syntax). Not functional in-browser; appear to be unfinished build-time utilities.

## Conventions

- **No build tooling** — Edit HTML/CSS/JS files directly. There is no `package.json`, no bundler, no transpilation step.
- **CSS custom properties for theming** — All colors, radii, shadows, fonts, and transitions on the main page use `var(--*)` tokens defined in `:root`. Respect these when adding styles.
- **BEM-like flat class naming** — Components use descriptive hyphenated classes (e.g., `.xp-card`, `.credit-meta`, `.sys-tag`). Data attributes control variants: `data-type="stack"`, `data-kind="game"`, `data-cat="perf"`.
- **Responsive breakpoints** — Three tiers: `960px`, `640px`, `560px`. Mobile adjustments are appended at the bottom of `stylesheet.css` near their related component rules.
- **Experience timeline pattern** — Collapsible entries use native `<details>`/`<summary>` elements with the `.xp-collapse` class. Expanded entries are plain `.xp-node > .xp-card`; collapsed entries add `.xp-collapsed` and wrap content in `<details>`.
- **Credits section** — Grouped by company using `.credits-group` with `.credits-label`. Cards use `data-kind` attribute (`film`, `game`, `app`) for color-coded category badges.
- **Font stack** — Serif (`Lora`) for headings, sans-serif (`Poppins`) for body, monospace (`Nanum Gothic Coding`) for code. Loaded via Google Fonts in `<head>`.
- **Line endings** — `.gitattributes` enforces LF (`text=auto eol=lf`), except `.cmd`/`.bat` files which use CRLF.
