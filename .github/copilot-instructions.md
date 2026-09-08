# Copilot Instructions - brennengreen.dev

## Architecture

Static site hosted on GitHub Pages at `www.brennengreen.dev`.
There is no package manifest, build step, bundler, or framework.

- `index.html` is fully self-contained: an inline `<style>` block plus a centered list of role/company lines. There is no separate CSS file.
- `404.html` matches the homepage so retired and unknown URLs show the same content. Keep their markup in sync.
- Styles are inlined in `<head>`: a dark charcoal/black background, system font stack, and per-company brand colors (xbox green, dreamworks rainbow gradient, blizzard blue, twitch purple, intel blue). Company names render lowercase.
- `bg_resume.pdf` at the repo root is linked from the resume link using a root-relative path so it resolves at any URL depth.
- `resume.md` is the machine-readable resume and is advertised from both HTML pages using a `text/markdown` alternate link.
- Keep `CNAME` for the existing custom domain.
- The former portfolio, articles, downloads, artwork, and animated smoke/dust backdrop have been removed from this branch.

## Design and behavior

- Keep the background dark grey/black with no imagery.
- Company names use their brand color; role text stays neutral/dim for contrast.
- Do not add external fonts, analytics, or runtime dependencies; use the system font stack.
- Respect `prefers-reduced-motion`: entrance animations only run when motion is not reduced.
- Use shared CSS custom properties for the palette and flat, hyphenated class names.
- Do not restore private source documents or contact details without an explicit request.
- `.gitattributes` enforces LF, except for `.cmd` and `.bat` files.
