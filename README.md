# baczemin.github.io

Personal site of **Jaemin (Jamie) Park**: a terminal / tiling-window-manager style page in the spirit of Omarchy and Hyprland.

**Live:** https://baczemin.github.io

No build step, no npm, no framework. It is static HTML, CSS and JS, and all the content comes from **one file: `site.yaml`**.

---

## Updating content (what you'll do 95% of the time)

1. Open `site.yaml` and edit it. Usually that means copying an existing entry and changing it:
   - **New paper** goes under `publications:`. Set `status: published | preprint | in-prep | submitted`. Your name (`Park JM`) is highlighted automatically.
   - **New talk or poster** goes under `talks:`. Give it a `slug:` to get a deep link (see QR codes below).
   - **New project or package** goes under `projects:`, with `kind: thesis | software | side`.
   - **Bio, tagline, "now" list** live under `profile:`.
   - **Skills** live under `skills:`. `level` (0–100) sets how full the btop meter is.
2. Preview it locally:
   ```bash
   cd ~/BacZemin.github.io
   python3 -m http.server 8000      # then open http://localhost:8000
   ```
   If you made a YAML typo, the page says so and gives the line number. The usual causes are tabs instead of spaces, or an unquoted `: ` inside text.
3. Publish it:
   ```bash
   git add -A && git commit -m "add <thing>" && git push
   ```
   GitHub Pages redeploys in about a minute.

**New CV:** replace `assets/cv.pdf` and use the same filename.

## QR codes for slides

- Open the page you want people to land on, then press **`q`** (or click `▣ qr` in the top bar).
- Download it as **svg (theme)** (accent colour, transparent background, for dark slides), **svg (black)** (for white slides) or **png**.
- QR codes always point to `https://baczemin.github.io/?ref=qr…`, even when you make them from localhost. Visitors who arrive that way see a small "welcome" note.
- **One QR per talk:** add a `slug: bioc2026` to the talk in `site.yaml`, open `#talks/bioc2026`, and press `q`. Scanning it opens that talk's abstract and links.
- From the shell, the `qr` command prints a scannable QR code in text.

## Keyboard (press `?` on the site)

| key | action |
|---|---|
| `1`–`6` | switch workspace (about, research, pubs, talks, skills, shell) |
| `h` / `l`, `←` / `→` | move focus between panes |
| `j` / `k`, `↑` / `↓` | move through a list; `Enter` opens the item |
| `/` | search publications |
| `:` or `Ctrl+K` | command palette |
| `t` / `T` | next / previous theme |
| `q` | QR code for the current page |
| `` ` `` | jump to the shell |

URL tricks:
- `?theme=rose-pine-dawn` forces a theme, which is good for bright rooms and projectors.
- `#pubs` and `#research/bread` deep-link straight to a view.

## Files

```
site.yaml              ← content (edit this)
index.html             page shell + SEO metadata (edit the <head> if your name/affiliation changes)
assets/css/themes.css  colour themes; to add one, copy a block and add its name to THEMES in app.js
assets/css/tui.css     layout
assets/js/app.js       renders site.yaml; routing, keyboard, palette, QR
assets/js/term.js      the shell; add commands to CMDS
assets/cv.pdf          your CV
assets/img/og.png      preview image shown when the link is shared (1200×630 screenshot)
vendor/                js-yaml 4.1.0, qrcode-generator 1.4.4 (MIT), stored in the repo
assets/fonts/          JetBrains Mono (OFL), stored in the repo
404.html               "cd: no such file or directory"
```

## Custom domain later (optional)

Buy a domain, then add a `CNAME` file containing it (e.g. `jaeminpark.com`). Point the DNS at GitHub Pages and change `profile.url` in `site.yaml`. Old QR codes keep working, because `baczemin.github.io` redirects to the custom domain.

## Hosting elsewhere

The whole folder is static, so you can copy it to any web server (nginx, Caddy, Netlify, Cloudflare Pages) and it works as-is.
