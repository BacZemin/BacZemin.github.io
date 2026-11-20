/* ═══════════════════════════════════════════════════════════════
   app.js — renders site.yaml into a tiling-WM style terminal UI.
   You should not need to edit this file to update content;
   edit site.yaml instead.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // Add a theme here after adding its palette to assets/css/themes.css
  const THEMES = ['tokyo-night', 'catppuccin', 'gruvbox', 'nord', 'everforest', 'kanagawa', 'rose-pine-dawn', 'catppuccin-latte'];
  const WS = ['about', 'research', 'pubs', 'talks', 'skills', 'shell'];
  const CANONICAL = 'https://baczemin.github.io/';

  // ── tiny helpers ─────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isCoarse = () => matchMedia('(pointer: coarse)').matches;
  const isNarrow = () => matchMedia('(max-width: 900px)').matches;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  // js-yaml turns 2026-08-11 into a Date; 2025-06 stays a string. Normalise both.
  const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''));
  // minimal markdown: blank-line paragraphs, *em*, **strong**, `code`, [text](url)
  const md = (s) => String(s ?? '').trim().split(/\n\s*\n/).map((p) => '<p>' + esc(p.replace(/\s*\n\s*/g, ' '))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>') + '</p>').join('');
  const ext = (url) => /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : '';
  const link = (url, text, cls = '') => `<a class="${cls}" href="${esc(url)}"${ext(url)}>${esc(text)}</a>`;

  let S = null;                       // site data from site.yaml
  const state = { ws: null, focus: 0, sel: { research: 0, talks: 0, pubs: -1 }, query: '' };

  // ── boot ─────────────────────────────────────────────────────────
  async function boot() {
    const bootEl = $('#boot pre');
    try {
      const res = await fetch('site.yaml', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching site.yaml`);
      S = normalise(jsyaml.load(await res.text()));
    } catch (err) {
      bootEl.innerHTML = `<span class="c-red">[ FAIL ]</span> could not load site.yaml\n\n${esc(err.message)}\n\n` +
        (location.protocol === 'file:' ? '<span class="c-yellow">Opened as a file. Preview with:  python3 -m http.server 8000</span>'
          : '<span class="c-yellow">Check the line number above for a YAML typo (indentation, a stray colon, tabs).</span>');
      return;
    }
    render();
    bindGlobal();
    applyTheme(document.documentElement.dataset.theme, false);
    route();
    window.addEventListener('hashchange', route);
    if (/[?&]ref=qr\b/.test(location.search)) {
      setTimeout(() => toast('welcome', 'Scanned a QR code? Tap around below, or try the shell.'), 600);
    }
    tickClock(); setInterval(tickClock, 15000);
  }

  function normalise(d) {
    d.profile = d.profile || {};
    d.links = d.links || [];
    d.projects = (d.projects || []).map((p) => ({ ...p, id: p.id || slugify(p.title) }));
    d.publications = (d.publications || []).map((p) => ({ ...p, year: Number(p.year) || p.year }))
      .sort((a, b) => (b.year - a.year) || ((b.status !== 'published') - (a.status !== 'published')));
    d.talks = (d.talks || []).map((t) => ({ ...t, date: dstr(t.date), id: t.slug || slugify(dstr(t.date) + '-' + t.venue) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    d.experience = d.experience || [];
    d.awards = d.awards || [];
    d.skills = d.skills || [];
    d.gallery = (d.gallery || []).filter((g) => g && g.src);
    return d;
  }

  // ── rendering ────────────────────────────────────────────────────
  const pane = (cls, title, body, hint = '') =>
    `<section class="pane ${cls}" aria-label="${esc(title)}"><div class="pane-title">${esc(title)}${hint ? `<span class="hint">${hint}</span>` : ''}</div>${body}</section>`;

  function render() {
    $('#ws-pills').innerHTML = WS.map((w, i) =>
      `<button class="ws-pill" data-ws="${w}"><span class="n">${i + 1}</span>${w}</button>`).join('');
    $('#desktop').innerHTML = WS.map((w) => `<div class="ws ws-${w}" data-ws="${w}">${R[w]()}</div>`).join('');

    // pane focus on click
    $$('.pane').forEach((p) => p.addEventListener('mousedown', () => {
      const panes = $$('.ws.active .pane');
      setFocus(panes.indexOf(p));
    }));

    // list rows (research + talks)
    $$('.list').forEach((ul) => ul.addEventListener('click', (e) => {
      const row = e.target.closest('.row'); if (!row) return;
      const kind = ul.dataset.kind, i = Number(row.dataset.i);
      const wasOpen = row.getAttribute('aria-expanded') === 'true';
      select(kind, i, true);
      if (isNarrow()) row.setAttribute('aria-expanded', String(!wasOpen));
    }));

    // pubs search
    const q = $('#pub-q');
    q.addEventListener('input', () => { state.query = q.value; state.sel.pubs = -1; renderPubs(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { q.blur(); }
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); q.blur(); movePub(1); }
    });
    renderPubs();

    // buttons with data-go / data-act anywhere in the page
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-go],[data-act]'); if (!el) return;
      e.preventDefault();
      if (el.dataset.go) go(el.dataset.go);
      if (el.dataset.act) act(el.dataset.act);
    });

    // shell
    Term.mount($('#term'), termCtx());

    // meters animate in when skills opens
    startHelix();
  }

  const R = {
    about() {
      const p = S.profile;
      const counts = {
        pub: S.publications.filter((x) => x.status === 'published').length,
        prep: S.publications.filter((x) => x.status !== 'published').length,
        talk: S.talks.length,
      };
      const kv = [
        ['name', esc(p.name)],
        ['role', esc(p.role)],
        ['lab', `${p.lab_url ? link(p.lab_url, p.lab) : esc(p.lab)} @ ${esc(p.org)}`],
        ['focus', esc((p.focus || []).join(', '))],
        ['stack', esc(p.stack)],
        ['uptime', esc(uptime(p.phd_start))],
        ['papers', `${counts.pub} published${counts.prep ? ` · ${counts.prep} in prep` : ''}`],
        ['talks', `${counts.talk} talks &amp; posters`],
        ['loc', esc(p.location)],
      ].filter(([, v]) => v && v !== 'undefined');
      const sw = ['--red', '--orange', '--yellow', '--green', '--cyan', '--accent', '--accent2', '--fg']
        .map((c) => `<span style="background:var(${c})"></span>`).join('');
      const fetch = `
        <h1 class="hero">${esc(p.name)}<small>${esc(p.role)} · ${esc(p.org)}</small></h1>
        <div class="fetch">
          ${p.photo ? photoFig({ src: p.photo, alt: `Photo of ${p.name}` }, 'headshot', '4/5', 'onerror')
            : `<pre class="helix" id="helix" aria-hidden="true" title="a rotating DNA helix; yellow C's are methylated CpGs"></pre>`}
          <div class="fetch-info">
            <div class="who"><span class="u">${esc(p.short || 'me')}</span>@<span class="h">${esc(p.host || 'lab')}</span></div>
            <div class="rule">${'─'.repeat(40)}</div>
            <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
            <div class="swatches" aria-hidden="true">${sw}</div>
          </div>
        </div>
        <p class="tagline">${esc(p.tagline)}</p>
        <div class="cta">
          <button class="chip primary" data-go="pubs">▤ publications</button>
          <button class="chip" data-go="research">◆ research</button>
          ${p.cv ? `<a class="chip" href="${esc(p.cv)}" target="_blank" rel="noopener">↓ cv.pdf</a>` : ''}
          ${S.links.find((l) => l.label === 'email') ? `<a class="chip" href="${esc(S.links.find((l) => l.label === 'email').url)}">✉ email</a>` : ''}
        </div>`;
      const now = (p.now || []).length ? `<div class="sub">~/now.md</div><ul class="now">${p.now.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
      const links = `<ul class="linklist">${S.links.map((l) =>
        `<li><span class="k">${esc(l.label)}</span>${link(l.url, l.text || l.url)}</li>`).join('')}
        ${p.cv ? `<li><span class="k">cv</span><a href="${esc(p.cv)}" target="_blank" rel="noopener">cv.pdf</a></li>` : ''}</ul>${now}`;
      return pane('p-fetch', 'fastfetch', fetch) +
        pane('p-bio', '~/bio.md', `<div class="md">${md(p.bio)}</div>`) +
        (S.gallery.length ? pane('p-photos', '~/photos', renderGallery(), 'hover · click') : '') +
        pane('p-links', '~/.contact', links) +
        pane('p-log', 'journalctl --user -r', renderLog());
    },

    research() {
      const groups = [['thesis', 'thesis/'], ['software', 'software/'], ['side', 'side-projects/']];
      const icon = { thesis: '◆', software: '⌘', side: '◇' };
      let i = 0;
      const rows = groups.map(([k, label]) => {
        const items = S.projects.filter((p) => (p.kind || 'side') === k);
        if (!items.length) return '';
        return `<li class="group">${label}</li>` + items.map((p) => {
          const idx = S.projects.indexOf(p); i++;
          return `<li><button class="row" data-i="${idx}" role="option" aria-selected="false" aria-expanded="false">
              <span class="ico">${icon[k] || '·'}</span><span class="t">${esc(p.title)}</span><span class="m">${esc(p.years || '')}</span>
            </button><div class="inline-detail">${projectDetail(p, true)}</div></li>`;
        }).join('');
      }).join('');
      return pane('p-list', '~/research', `<ul class="list" data-kind="research" role="listbox" aria-label="Projects">${rows}</ul>`, 'j/k ↵') +
        pane('preview', 'preview', `<div id="research-preview"></div>`);
    },

    pubs() {
      const search = `<div class="search"><label for="pub-q">grep&nbsp;›</label>
        <input id="pub-q" type="search" placeholder="filter by title, author, journal, year…" autocomplete="off" spellcheck="false">
        <span class="count" id="pub-count"></span></div>
        <ol class="pubs" id="pubs" reversed></ol>`;
      return pane('p-pubs', '~/publications', search, '/ to search') +
        pane('p-stats', '~/publications/stats', renderPubStats());
    },

    talks() {
      let lastYear = '';
      const rows = S.talks.map((t, idx) => {
        const y = t.date.slice(0, 4);
        const head = y !== lastYear ? `<li class="group">${y}/</li>` : '';
        lastYear = y;
        const ico = t.type === 'poster' ? '▦' : '▶';
        return head + `<li><button class="row" data-i="${idx}" role="option" aria-selected="false" aria-expanded="false">
            <span class="ico">${ico}</span><span class="t">${esc(shortVenue(t.venue))} <span class="c-muted">— ${esc(t.title)}</span></span><span class="m">${esc(t.type || '')}</span>
          </button><div class="inline-detail">${talkDetail(t, true)}</div></li>`;
      }).join('');
      return pane('p-list', '~/talks', `<ul class="list" data-kind="talks" role="listbox" aria-label="Talks and posters">${rows}</ul>`, 'j/k ↵') +
        pane('preview', 'preview', `<div id="talks-preview"></div>`);
    },

    skills() {
      const meters = S.skills.map((s) => `
        <div class="meter" data-level="${Number(s.level) || 0}">
          <div class="meter-head"><span class="g">${esc(s.group)}</span><span class="pct">${Number(s.level) || 0}%</span></div>
          <div class="meter-track">${'<i></i>'.repeat(30)}</div>
          <div class="meter-items">${(s.items || []).map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        </div>`).join('');
      const hist = `<ul class="history">${S.experience.map((e) => `<li>
          <div class="w">${esc(e.when)}</div><div class="what">${esc(e.what)}</div>
          <div class="where">${esc(e.where)}</div>${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</li>`).join('')}</ul>`;
      const aw = S.awards.length ? `<ul class="log">${S.awards.map((a) =>
        `<li><span class="d">${esc(a.year)}</span><span class="lvl-award">award</span><span>${esc(a.what)}</span></li>`).join('')}</ul>` : '<p class="muted">—</p>';
      return pane('p-btop', 'btop — skills', `<div class="meters">${meters}</div>`) +
        pane('p-hist', '~/history', hist) +
        pane('p-awards', '~/awards', aw);
    },

    shell() {
      return pane('p-term', 'zsh — ~', `<div class="term" id="term"></div>`, 'type help');
    },
  };

  function uptime(start) {
    if (!start) return '';
    const [y, m] = dstr(start).split('-').map(Number);
    const now = new Date();
    let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - (m || 1));
    const yy = Math.floor(months / 12), mm = months % 12;
    return `${yy} year${yy === 1 ? '' : 's'}, ${mm} month${mm === 1 ? '' : 's'} (PhD)`;
  }

  const shortVenue = (v) => {
    const m = String(v || '').match(/\(([^)]+)\)/);
    return m ? m[1] : String(v || '');
  };

  function renderLog() {
    const ev = [
      ...S.talks.map((t) => ({ d: t.date, lvl: t.type === 'poster' ? 'poster' : 'talk', text: `${shortVenue(t.venue)} — ${t.title}`, href: `#talks/${t.id}` })),
      ...S.publications.filter((p) => p.status === 'published').map((p) => ({ d: String(p.year), lvl: 'pub', text: `${p.venue} — ${p.title}`, href: p.doi ? `https://doi.org/${p.doi}` : '#pubs' })),
      ...S.awards.map((a) => ({ d: String(a.year), lvl: 'award', text: a.what })),
    ].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 9);
    return `<ul class="log">${ev.map((e) => `<li><span class="d">${esc(e.d.slice(0, 7))}</span><span class="lvl-${e.lvl}">${e.lvl}</span>` +
      `<span>${e.href ? `<a href="${esc(e.href)}"${ext(e.href)}>${esc(e.text)}</a>` : esc(e.text)}</span></li>`).join('')}</ul>`;
  }

  function projectDetail(p, inline = false) {
    if (!p) return '<p class="empty">select a project</p>';
    const links = (p.links || []).map((l) => link(l.url, '↗ ' + l.label, 'chip')).join('');
    return `${inline ? '' : `<div class="ph">${esc(p.title)}</div>`}
      <div class="meta">${esc(p.kind || '')}${p.years ? ' · ' + esc(p.years) : ''}</div>
      <p>${esc(p.summary || '')}</p>
      ${p.detail ? md(p.detail) : ''}
      ${figBlock(p.image)}
      ${p.tags ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${links ? `<div class="actions">${links}</div>` : ''}`;
  }

  function talkDetail(t, inline = false) {
    if (!t) return '<p class="empty">select a talk</p>';
    const links = (t.links || []).map((l) => link(l.url, '↗ ' + l.label, 'chip')).join('');
    return `${inline ? '' : `<div class="ph">${esc(t.title)}</div>`}
      <div class="meta">${esc(t.venue)}<br>${esc(t.date)} · ${esc(t.type || 'talk')}</div>
      ${t.award ? `<div class="award">★ ${esc(t.award)}</div>` : ''}
      ${t.abstract ? md(t.abstract) : ''}
      ${figBlock(t.image)}
      <div class="actions">${links}
        <button class="chip" data-act="qr">▣ qr for this ${esc(t.type || 'talk')}</button>
      </div>`;
  }

  // ── photos: dithered canvas + real image revealed on hover/tap ───
  //  aspect: crop ratio like '3/2' ('' = keep the photo's own shape)
  function photoFig(ph, cls = '', aspect = '', fallback = '') {
    const style = aspect ? ` style="aspect-ratio:${aspect}"` : '';
    return `<figure class="photo ${cls}" data-aspect="${esc(aspect)}"${fallback ? ' data-fallback="helix"' : ''}${style} tabindex="0">
      <canvas aria-hidden="true"></canvas>
      <img class="real" src="${esc(ph.src)}" alt="${esc(ph.alt || ph.caption || '')}" decoding="async">
    </figure>`;
  }
  function figBlock(im) {
    if (!im) return '';
    if (typeof im === 'string') im = { src: im };
    return `<div class="fig">${photoFig(im, 'science')}${im.caption ? `<div class="cap">${esc(im.caption)}</div>` : ''}</div>`;
  }
  function renderGallery() {
    return `<div class="gallery">${S.gallery.map((g, i) => `<button class="thumb" data-lightbox="${i}" aria-label="Open photo: ${esc(g.caption || g.alt || '')}">
        ${photoFig(g, '', '3/2').replace(' tabindex="0"', '')}<span class="cap">${esc(g.caption || '')}</span></button>`).join('')}</div>`;
  }

  const hexRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

  function dither(fig) {
    const img = fig.querySelector('img.real'), cv = fig.querySelector('canvas');
    if (!img || !cv) return;
    const run = () => {
      if (!img.naturalWidth) return;
      const cell = fig.closest('.thumb') ? 1.5 : 2;                       // screen px per dither dot
      const box = fig.getBoundingClientRect().width || 240;
      const w = Math.max(48, Math.round(box / cell));
      const [aw, ah] = (fig.dataset.aspect || '').split('/').map(Number);
      const ratio = aw && ah ? ah / aw : img.naturalHeight / img.naturalWidth;
      const h = Math.round(w * ratio);
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true });
      // centre-crop the source to the target aspect (same as object-fit: cover)
      const sr = img.naturalHeight / img.naturalWidth;
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (sr > ratio) { sh = sw * ratio; sy = (img.naturalHeight - sh) * (fig.classList.contains('headshot') ? 0.25 : 0.5); }
      else { sw = sh / ratio; sx = (img.naturalWidth - sw) / 2; }
      g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h), px = data.data;
      // luminance + auto-levels so dark or washed-out photos still dither nicely
      const Lm = new Float32Array(w * h);
      let lo = 255, hi = 0;
      for (let k = 0; k < Lm.length; k++) { const v = lum([px[4 * k], px[4 * k + 1], px[4 * k + 2]]); Lm[k] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
      const span = Math.max(1, hi - lo);
      for (let k = 0; k < Lm.length; k++) Lm[k] = Math.min(1, Math.max(0, ((Lm[k] - lo) / span - 0.5) * 1.12 + 0.52));
      // Atkinson dithering (classic Macintosh look): diffuses 6/8 of the error, keeps faces readable
      const ink = hexRgb(cssVar('--fg')), paper = hexRgb(cssVar('--pane'));
      const [bright, dark] = lum(ink) > lum(paper) ? [ink, paper] : [paper, ink];
      const spread = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x, old = Lm[k], on = old > 0.5 ? 1 : 0, err = (old - on) / 8;
        for (const [dx, dy] of spread) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < w && yy < h) Lm[yy * w + xx] += err; }
        const c = on ? bright : dark;
        px[4 * k] = c[0]; px[4 * k + 1] = c[1]; px[4 * k + 2] = c[2]; px[4 * k + 3] = 255;
      }
      g.putImageData(data, 0, 0);
      fig.classList.add('ready');
    };
    const fail = () => {
      // missing headshot → fall back to the ASCII helix
      if (fig.dataset.fallback === 'helix') {
        fig.outerHTML = `<pre class="helix" id="helix" aria-hidden="true"></pre>`;
        startHelix();
      } else fig.classList.add('broken');
    };
    if (img.complete) { img.naturalWidth ? run() : fail(); }
    else {
      img.addEventListener('load', run, { once: true });
      img.addEventListener('error', fail, { once: true });
    }
  }
  const ditherIn = (root) => $$('.photo', root).forEach(dither);

  // tap to reveal on touch screens (hover does it on desktop)
  document.addEventListener('click', (e) => {
    const f = e.target.closest('.photo'); if (!f || f.closest('.thumb')) return;
    f.classList.toggle('revealed');
  });

  // ── lightbox ─────────────────────────────────────────────────────
  let lbIndex = 0;
  function lightbox(i) {
    const n = S.gallery.length; if (!n) return;
    lbIndex = (i + n) % n;
    const g = S.gallery[lbIndex];
    $('#lb-img').src = g.src; $('#lb-img').alt = g.alt || g.caption || '';
    $('#lb-cap').innerHTML = `${esc(g.caption || '')}${g.credit ? ` <span class="muted">· photo: ${esc(g.credit)}</span>` : ''}`;
    $('#lb-count').textContent = `${lbIndex + 1}/${n}`;
    openOverlay('lightbox');
  }

  function renderPubStats() {
    const years = {};
    S.publications.forEach((p) => {
      const y = p.year; years[y] = years[y] || { pub: 0, prep: 0 };
      years[y][p.status === 'published' ? 'pub' : 'prep']++;
    });
    const ys = Object.keys(years).sort();
    const max = Math.max(1, ...ys.map((y) => years[y].pub + years[y].prep));
    const bars = ys.map((y) => {
      const v = years[y];
      return `<div class="bar-col" title="${y}: ${v.pub} published${v.prep ? `, ${v.prep} in prep` : ''}">
        ${v.prep ? `<div class="bar-fill prep" style="height:${(v.prep / max) * 48}px"></div>` : ''}
        ${v.pub ? `<div class="bar-fill" style="height:${(v.pub / max) * 48}px"></div>` : ''}
        <div class="lbl">${String(y).slice(2)}</div></div>`;
    }).join('');
    const prof = S.links.filter((l) => ['orcid', 'scholar', 'pubmed', 'github'].includes(l.label))
      .map((l) => `<li><span class="k">${esc(l.label)}</span>${link(l.url, l.text || l.url)}</li>`).join('');
    const pub = S.publications.filter((p) => p.status === 'published').length;
    return `<div class="spark"><div class="bars">${bars}</div></div>
      <div class="stat"><span>published</span><span class="c-green">${pub}</span></div>
      <div class="stat"><span>in preparation</span><span class="c-orange">${S.publications.length - pub}</span></div>
      <div class="stat"><span>software packages</span><span class="c-cyan">${S.projects.filter((p) => p.kind === 'software').length}</span></div>
      <p class="muted small" style="margin-top:12px">profiles</p>
      <ul class="linklist">${prof}</ul>`;
  }

  function hl(text, q) {
    text = String(text ?? '');
    if (!q) return esc(text);
    const re = new RegExp(`(${q.split(/\s+/).filter(Boolean).map(reEsc).join('|')})`, 'ig');
    return text.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
  }
  function hlAuthors(a, q) {
    const me = S.profile.cite_name || 'Park JM';
    return String(a || '').split(me).map((part) => hl(part, q)).join(`<span class="me">${esc(me)}</span>`);
  }

  function filteredPubs() {
    const toks = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    return S.publications.filter((p) => {
      const hay = `${p.title} ${p.authors} ${p.venue} ${p.year} ${p.status} ${p.doi || ''}`.toLowerCase();
      return toks.every((t) => hay.includes(t));
    });
  }

  function renderPubs() {
    const list = filteredPubs(), q = state.query.trim();
    $('#pub-count').textContent = `${list.length}/${S.publications.length}`;
    $('#pubs').innerHTML = list.length ? list.map((p, i) => {
      const url = p.url || (p.doi ? `https://doi.org/${p.doi}` : '');
      const title = url ? `<a class="ti" href="${esc(url)}" target="_blank" rel="noopener">${hl(p.title, q)}</a>` : `<span class="ti">${hl(p.title, q)}</span>`;
      const badge = p.status && p.status !== 'published' ? ` <span class="badge ${esc(p.status)}">${esc(p.status)}</span>` : '';
      const ids = [
        p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">doi:${esc(p.doi)}</a>` : '',
        p.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" rel="noopener">pmid:${esc(p.pmid)}</a>` : '',
        p.pdf ? `<a href="${esc(p.pdf)}" target="_blank" rel="noopener">pdf</a>` : '',
        p.code ? `<a href="${esc(p.code)}" target="_blank" rel="noopener">code</a>` : '',
      ].filter(Boolean).join('');
      return `<li class="pub${i === state.sel.pubs ? ' sel' : ''}" data-i="${i}">
        <span class="yr">${hl(p.year, q)}</span>
        <div>${title}${badge}
          <div class="au">${hlAuthors(p.authors, q)}</div>
          <div class="ve"><i>${hl(p.venue, q)}</i>${p.cite ? ' ' + esc(p.cite) : ''}</div>
          ${ids ? `<div class="ids">${ids}</div>` : ''}
        </div></li>`;
    }).join('') : `<li class="muted">no matches for “${esc(q)}”</li>`;
  }

  function movePub(d) {
    const n = filteredPubs().length; if (!n) return;
    state.sel.pubs = Math.max(0, Math.min(n - 1, state.sel.pubs + d));
    renderPubs();
    $('#pubs .pub.sel')?.scrollIntoView({ block: 'nearest' });
  }

  // ── selection in yazi-style lists ────────────────────────────────
  function select(kind, i, fromClick = false) {
    const arr = kind === 'research' ? S.projects : S.talks;
    if (!arr.length) return;
    i = Math.max(0, Math.min(arr.length - 1, i));
    state.sel[kind] = i;
    $$(`.list[data-kind="${kind}"] .row`).forEach((r) => {
      const on = Number(r.dataset.i) === i;
      r.setAttribute('aria-selected', String(on));
      if (!on) r.setAttribute('aria-expanded', 'false');
      if (on && !fromClick) r.scrollIntoView({ block: 'nearest' });
    });
    $(`#${kind}-preview`).innerHTML = kind === 'research' ? projectDetail(arr[i]) : talkDetail(arr[i]);
    ditherIn($(`#${kind}-preview`));
    const sub = arr[i].id;
    const h = `#${kind}/${sub}`;
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    setPath(kind, sub);
  }

  // ── workspaces, routing, focus ───────────────────────────────────
  function go(ws, sub) {
    const h = '#' + ws + (sub ? '/' + sub : '');
    if (location.hash === h) route(); else location.hash = h;
  }

  function route() {
    const [ws0, ...rest] = location.hash.replace(/^#/, '').split('/');
    const ws = WS.includes(ws0) ? ws0 : 'about';
    const sub = decodeURIComponent(rest.join('/'));
    showWs(ws);
    if (ws === 'research' || ws === 'talks') {
      const arr = ws === 'research' ? S.projects : S.talks;
      const idx = sub ? arr.findIndex((x) => x.id === sub) : state.sel[ws];
      select(ws, idx < 0 ? 0 : idx);
      if (sub && isNarrow()) {
        const row = $(`.list[data-kind="${ws}"] .row[data-i="${idx}"]`);
        if (row) { row.setAttribute('aria-expanded', 'true'); setTimeout(() => row.scrollIntoView({ block: 'start' }), 50); }
      }
    } else {
      setPath(ws);
    }
  }

  function showWs(ws) {
    const prev = state.ws;
    if (prev === ws) return;
    const dir = prev && WS.indexOf(ws) < WS.indexOf(prev) ? 'enter-l' : 'enter-r';
    $$('.ws').forEach((el) => {
      const on = el.dataset.ws === ws;
      el.classList.toggle('active', on);
      el.classList.remove('enter-l', 'enter-r');
      if (on && prev) { void el.offsetWidth; el.classList.add(dir); }
    });
    $$('.ws-pill').forEach((b) => b.toggleAttribute('aria-current', false));
    $(`.ws-pill[data-ws="${ws}"]`)?.setAttribute('aria-current', 'page');
    state.ws = ws;
    setFocus(0);
    if (isNarrow()) window.scrollTo(0, 0);
    if (ws === 'skills') animateMeters();
    requestAnimationFrame(() => ditherIn($(`.ws[data-ws="${ws}"]`)));
    if (ws === 'shell' && !isCoarse()) setTimeout(() => $('#term input')?.focus(), 30);
    document.title = ws === 'about' ? S.profile.name : `${ws} · ${S.profile.name}`;
  }

  function setPath(ws, sub) {
    const p = S.profile;
    $('#bar-path').innerHTML = `<span class="p">${esc(p.short || 'me')}@${esc(p.host || 'lab')}</span>: ~/${esc(ws === 'about' ? '' : ws)}${sub ? '/' + esc(sub) : ''}`;
  }

  function setFocus(i) {
    const panes = $$('.ws.active .pane');
    if (!panes.length) return;
    state.focus = (i + panes.length) % panes.length;
    $$('.pane.focused').forEach((p) => p.classList.remove('focused'));
    panes[state.focus].classList.add('focused');
  }
  const focusedPane = () => $('.ws.active .pane.focused');

  function animateMeters() {
    $$('.meter').forEach((m) => {
      const cells = $$('.meter-track i', m);
      const on = Math.round((Number(m.dataset.level) / 100) * cells.length);
      cells.forEach((c, k) => {
        c.classList.remove('on'); c.style.background = ''; c.style.animationDelay = '';
        if (k >= on) return;
        const frac = k / cells.length;   // btop gradient: green → yellow → red
        c.style.background = frac < 0.5 ? 'var(--green)' : frac < 0.8 ? 'var(--yellow)' : 'var(--red)';
        c.style.animationDelay = `${18 * k}ms`;
        void c.offsetWidth; c.classList.add('on');
      });
    });
  }

  // ── themes ───────────────────────────────────────────────────────
  function applyTheme(name, announce = true) {
    if (!THEMES.includes(name)) name = THEMES[0];
    document.documentElement.dataset.theme = name;
    try { localStorage.setItem('theme', name); } catch (e) { /* private mode */ }
    $('#theme-name').textContent = name;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    $('meta[name="theme-color"]').setAttribute('content', bg);
    if (announce) toast('theme', name);
    if (S) ditherIn(document);
    if (!$('#qr').hidden) showQR();
  }
  const cycleTheme = (d = 1) => applyTheme(THEMES[(THEMES.indexOf(document.documentElement.dataset.theme) + d + THEMES.length) % THEMES.length]);

  // ── toasts (mako) ────────────────────────────────────────────────
  function toast(title, body) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<div class="tt">${esc(title)}</div><div>${esc(body)}</div>`;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ── clock ────────────────────────────────────────────────────────
  function tickClock() {
    const d = new Date();
    $('#bar-clock').textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
      '  ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // ── DNA helix (fastfetch logo) ───────────────────────────────────
  function startHelix() {
    const el = $('#helix'); if (!el) return;
    const H = 15, W = 23, mid = 11, Rr = 9;
    const seq = 'ACGTCGATCGGACGTTCGCACGA';
    const comp = { A: 'T', T: 'A', C: 'G', G: 'C' };
    // deterministic "methylation calls" for CpGs (most CpGs are methylated, as in real genomes)
    const meth = [...seq].map((b, i) => b === 'C' && seq[i + 1] === 'G' && (i * 7) % 5 !== 0);
    const methRev = [...seq].map((b, i) => b === 'G' && seq[i - 1] === 'C' && (i * 3) % 4 !== 0);
    let t = 0, last = 0;
    function frame(now) {
      if (state.ws === 'about' && !document.hidden && now - last > 85) {
        last = now; t += 0.11; draw();
      }
      if (!reducedMotion()) requestAnimationFrame(frame);
    }
    function draw() {
      const out = [];
      for (let y = 0; y < H; y++) {
        const ph = y * 0.5 + t, s = Math.sin(ph), c = Math.cos(ph);
        const x1 = Math.round(mid + Rr * s), x2 = Math.round(mid - Rr * s);
        const row = Array(W).fill(' ');
        const b = seq[y % seq.length], bc = comp[b];
        const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
        for (let x = lo + 1; x < hi; x++) row[x] = `<span class="bk">${hi - lo > 4 ? '─' : '·'}</span>`;
        const front1 = c > 0;
        const cls1 = meth[y % seq.length] ? 'me' : front1 ? 's1' : 'bk';
        const cls2 = methRev[y % seq.length] ? 'me' : !front1 ? 's2' : 'bk';
        const put = (x, ch, cls) => { row[x] = `<span class="${cls}">${ch}</span>`; };
        if (front1) { put(x2, bc, cls2); put(x1, b, cls1); } else { put(x1, b, cls1); put(x2, bc, cls2); }
        out.push(row.join(''));
      }
      el.innerHTML = out.join('\n');
    }
    draw();
    if (!reducedMotion()) requestAnimationFrame(frame);
  }

  // ── QR codes ─────────────────────────────────────────────────────
  function shareUrl(withRef = true) {
    // QR codes always point at the public site, even when previewing on localhost
    const base = S.profile.url || CANONICAL;
    return base + (withRef ? '?ref=qr' : '') + location.hash;
  }
  function qrSvg(text, fg, bg, quiet = 2) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), size = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
      (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '') + `<path d="${d}" fill="${fg}"/></svg>`, qr, n };
  }
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function showQR() {
    const url = shareUrl();
    $('#qr-code').innerHTML = qrSvg(url, cssVar('--fg'), cssVar('--pane')).svg;
    $('#qr-url').textContent = url;
    openOverlay('qr');
  }
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const qrName = (ext) => 'qr-' + (location.hash.replace(/^#/, '').replace(/[^a-z0-9]+/gi, '-') || 'home') + '.' + ext;
  function bindQR() {
    $('#qr-dl-theme').onclick = () => download(qrName('svg'), new Blob([qrSvg(shareUrl(), cssVar('--accent'), null).svg], { type: 'image/svg+xml' }));
    $('#qr-dl-mono').onclick = () => download(qrName('svg'), new Blob([qrSvg(shareUrl(), '#000000', '#ffffff').svg], { type: 'image/svg+xml' }));
    $('#qr-dl-png').onclick = () => {
      const { qr, n } = qrSvg(shareUrl(), '#000', null), q = 2, scale = 24, size = (n + q * 2) * scale;
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + q) * scale, (r + q) * scale, scale, scale);
      cv.toBlob((b) => download(qrName('png'), b), 'image/png');
    };
    $('#qr-copy').onclick = () => copy(shareUrl(false));
  }
  function copy(text) {
    (navigator.clipboard?.writeText(text) || Promise.reject()).then(
      () => toast('copied', text),
      () => { prompt('Copy this link:', text); });
  }

  // ── overlays: palette / help / qr ────────────────────────────────
  function openOverlay(id) {
    $$('.overlay').forEach((o) => (o.hidden = o.id !== id));
    if (id === 'palette') { const i = $('#palette-input'); i.value = ''; paletteFilter(); i.focus(); }
  }
  const closeOverlays = () => $$('.overlay').forEach((o) => (o.hidden = true));
  const overlayOpen = () => $$('.overlay').some((o) => !o.hidden);

  let palItems = [], palShown = [], palSel = 0;
  function paletteItems() {
    return [
      ...WS.map((w, i) => ({ label: `go ${w}`, hint: String(i + 1), run: () => go(w) })),
      ...S.projects.map((p) => ({ label: `project: ${p.title}`, hint: p.kind, run: () => go('research', p.id) })),
      ...S.talks.map((t) => ({ label: `talk: ${shortVenue(t.venue)} — ${t.title}`, hint: t.date.slice(0, 7), run: () => go('talks', t.id) })),
      ...S.publications.map((p) => ({ label: `paper: ${p.title}`, hint: String(p.year), run: () => p.doi ? window.open(`https://doi.org/${p.doi}`, '_blank', 'noopener') : go('pubs') })),
      ...THEMES.map((t) => ({ label: `theme: ${t}`, hint: 't', run: () => applyTheme(t) })),
      ...S.links.map((l) => ({ label: `open ${l.label}`, hint: l.text || '', run: () => openUrl(l.url) })),
      { label: 'download cv', hint: 'pdf', run: () => openUrl(S.profile.cv) },
      { label: 'qr code for this page', hint: 'q', run: showQR },
      { label: 'copy link to this page', hint: '', run: () => copy(shareUrl(false)) },
      { label: 'keyboard shortcuts', hint: '?', run: () => openOverlay('help') },
    ];
  }
  function paletteFilter() {
    const toks = $('#palette-input').value.toLowerCase().split(/\s+/).filter(Boolean);
    palShown = palItems.filter((it) => toks.every((t) => (it.label + ' ' + it.hint).toLowerCase().includes(t))).slice(0, 40);
    palSel = 0; paletteDraw();
  }
  function paletteDraw() {
    $('#palette-list').innerHTML = palShown.map((it, i) =>
      `<li role="option" data-i="${i}" aria-selected="${i === palSel}"><span>${esc(it.label)}</span><span class="k">${esc(it.hint)}</span></li>`).join('')
      || '<li class="muted">no match</li>';
    $('#palette-list li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function paletteRun(i) { const it = palShown[i]; if (!it) return; closeOverlays(); it.run(); }

  function openUrl(url) {
    if (!url) return;
    if (/^mailto:/.test(url)) location.href = url;
    else window.open(url, '_blank', 'noopener');
  }

  function act(a) {
    if (a === 'qr') showQR();
    if (a === 'palette') openOverlay('palette');
    if (a === 'help') openOverlay('help');
    if (a === 'theme') cycleTheme();
  }

  // ── global keyboard + buttons ────────────────────────────────────
  function bindGlobal() {
    palItems = paletteItems();
    $('#ws-pills').addEventListener('click', (e) => { const b = e.target.closest('.ws-pill'); if (b) go(b.dataset.ws); });
    $('#btn-theme').onclick = () => cycleTheme();
    $('#btn-help').onclick = () => openOverlay('help');
    $('#btn-qr').onclick = showQR;
    bindQR();
    document.addEventListener('click', (e) => { const t = e.target.closest('[data-lightbox]'); if (t) lightbox(Number(t.dataset.lightbox)); });
    $('#lb-prev').onclick = () => lightbox(lbIndex - 1);
    $('#lb-next').onclick = () => lightbox(lbIndex + 1);
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => ditherIn($('.ws.active')), 200); });
    $$('.overlay').forEach((o) => o.addEventListener('mousedown', (e) => { if (e.target === o) closeOverlays(); }));
    $('#palette-input').addEventListener('input', paletteFilter);
    $('#palette-list').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) paletteRun(Number(li.dataset.i)); });
    $('#palette-input').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); palSel = Math.min(palShown.length - 1, palSel + 1); paletteDraw(); }
      if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); palSel = Math.max(0, palSel - 1); paletteDraw(); }
      if (e.key === 'Enter') { e.preventDefault(); paletteRun(palSel); }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); overlayOpen() ? closeOverlays() : openOverlay('palette'); return; }
      if (e.key === 'Escape') { if (overlayOpen()) { closeOverlays(); return; } document.activeElement?.blur(); return; }
      if (!$('#lightbox').hidden && (e.key === 'ArrowRight' || e.key === 'l')) { lightbox(lbIndex + 1); return; }
      if (!$('#lightbox').hidden && (e.key === 'ArrowLeft' || e.key === 'h')) { lightbox(lbIndex - 1); return; }
      if (overlayOpen()) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key;
      if (/^[1-6]$/.test(k)) { go(WS[Number(k) - 1]); return; }
      if (k === 't') { cycleTheme(); return; }
      if (k === 'T') { cycleTheme(-1); return; }
      if (k === 'q') { showQR(); return; }
      if (k === '?') { openOverlay('help'); return; }
      if (k === ':') { e.preventDefault(); openOverlay('palette'); return; }
      if (k === '/') { e.preventDefault(); go('pubs'); setTimeout(() => $('#pub-q').focus(), 20); return; }
      if (k === '`' || k === '~') { e.preventDefault(); go('shell'); setTimeout(() => $('#term input')?.focus(), 30); return; }
      if (k === 'l' || k === 'ArrowRight') { e.preventDefault(); setFocus(state.focus + 1); return; }
      if (k === 'h' || k === 'ArrowLeft') { e.preventDefault(); setFocus(state.focus - 1); return; }

      const p = focusedPane(); if (!p) return;
      const listKind = p.querySelector('.list')?.dataset.kind;
      const inPubs = p.classList.contains('p-pubs');
      const down = k === 'j' || k === 'ArrowDown', up = k === 'k' || k === 'ArrowUp';
      if (down || up) {
        e.preventDefault();
        if (listKind) select(listKind, state.sel[listKind] + (down ? 1 : -1));
        else if (inPubs) movePub(down ? 1 : -1);
        else p.scrollBy({ top: down ? 60 : -60 });
        return;
      }
      if (k === 'g') { p.scrollTo({ top: 0 }); return; }
      if (k === 'G') { p.scrollTo({ top: p.scrollHeight }); return; }
      if (k === 'Enter') {
        if (listKind) {
          const item = (listKind === 'research' ? S.projects : S.talks)[state.sel[listKind]];
          const url = item?.links?.[0]?.url; if (url) openUrl(url);
        } else if (inPubs && state.sel.pubs >= 0) {
          const pub = filteredPubs()[state.sel.pubs];
          if (pub) openUrl(pub.url || (pub.doi ? `https://doi.org/${pub.doi}` : ''));
        }
      }
    });
  }

  // ── context handed to the shell (term.js) ────────────────────────
  function termCtx() {
    return {
      get S() { return S; },
      WS, THEMES, go, applyTheme, openUrl, showQR, copy, shareUrl, uptime, shortVenue, qrcode,
      theme: () => document.documentElement.dataset.theme,
      openPalette: () => openOverlay('palette'),
    };
  }

  boot();
})();
