/* ═══════════════════════════════════════════════════════════════
   term.js — the interactive shell in workspace 6.
   To add a command: add an entry to CMDS below.
   Each command gets (args, ctx) and returns HTML lines (array or string).
   ═══════════════════════════════════════════════════════════════ */
window.Term = (() => {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const a = (url, text) => `<a href="${esc(url)}"${/^https?:/.test(url) ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`;
  const pad = (s, n) => String(s).padEnd(n);
  const SECTIONS = ['bio', 'contact', 'cv', 'projects', 'pubs', 'talks', 'skills', 'history'];

  let ctx, out, input, hist = [], hi = 0;

  const CMDS = {
    help: {
      desc: 'list commands',
      run: () => [
        '<span class="c-accent b">available commands</span>',
        ...Object.entries(CMDS).filter(([, c]) => !c.hidden)
          .map(([k, c]) => `  <span class="c-green">${pad(k, 10)}</span><span class="c-muted">${esc(c.desc)}</span>`),
        '',
        '<span class="c-muted">tab completes · ↑/↓ history · ctrl+l clears · 1–6 switch workspace outside the shell</span>',
      ],
    },
    whoami: {
      desc: 'who is this',
      run: () => {
        const p = ctx.S.profile;
        return [`<span class="b">${esc(p.name)}</span>`, `${esc(p.role)} — ${esc(p.lab)}, ${esc(p.org)}`, `<span class="c-muted">${esc(p.tagline)}</span>`];
      },
    },
    ls: {
      desc: 'list sections',
      run: (args) => {
        const dir = (args[0] || '').replace(/^~?\/?/, '').replace(/\/$/, '');
        if (!dir) return [SECTIONS.map((s) => `<span class="c-accent">${s}/</span>`).join('  ')];
        if (dir === 'projects' || dir === 'research') return ctx.S.projects.map((p) => `<span class="c-accent2">${pad(p.kind || '', 9)}</span> ${esc(p.id)}  <span class="c-muted">${esc(p.title)}</span>`);
        if (dir === 'talks') return ctx.S.talks.map((t) => `<span class="c-muted">${t.date.slice(0, 7)}</span>  ${esc(t.id)}`);
        if (dir === 'pubs') return ctx.S.publications.map((p, i) => `<span class="c-yellow">[${i + 1}]</span> ${p.year} ${esc(p.title)}`);
        return [`ls: cannot access '${esc(dir)}': No such file or directory`];
      },
    },
    cat: {
      desc: 'cat <section>  — print a section',
      run: (args) => {
        const S = ctx.S, what = (args[0] || '').replace(/\.(md|txt|yaml)$/, '').replace(/^~?\/?/, '');
        switch (what) {
          case 'bio': return String(S.profile.bio || '').trim().split('\n').map(esc);
          case 'contact': return S.links.map((l) => `${pad(l.label, 9)}${a(l.url, l.text || l.url)}`);
          case 'cv': return CMDS.cv.run();
          case 'projects': case 'research': return CMDS.ls.run(['projects']);
          case 'pubs': return CMDS.pubs.run([]);
          case 'talks': return CMDS.talks.run();
          case 'skills': return S.skills.map((s) => `<span class="c-accent b">${pad(s.group, 24)}</span>${bar(s.level)} <span class="c-muted">${(s.items || []).slice(0, 4).map(esc).join(', ')}</span>`);
          case 'history': return S.experience.map((e) => `<span class="c-muted">${pad(e.when, 16)}</span>${esc(e.what)} <span class="c-accent">@ ${esc(e.where)}</span>`);
          case '': return ['usage: cat &lt;' + SECTIONS.join('|') + '&gt;'];
          default: return [`cat: ${esc(what)}: No such file or directory`];
        }
      },
    },
    pubs: {
      desc: 'pubs [query] — search publications',
      run: (args) => {
        const q = args.join(' ').toLowerCase();
        const list = ctx.S.publications.filter((p) => !q || `${p.title} ${p.authors} ${p.venue} ${p.year}`.toLowerCase().includes(q));
        if (!list.length) return [`no publications match “${esc(q)}”`];
        return list.flatMap((p) => [
          `<span class="c-yellow">${p.year}</span> ${p.doi ? a('https://doi.org/' + p.doi, p.title) : esc(p.title)}${p.status !== 'published' ? ` <span class="c-orange">(${esc(p.status)})</span>` : ''}`,
          `     <span class="c-accent2">${esc(p.venue)}</span>`,
        ]);
      },
    },
    talks: {
      desc: 'list talks & posters',
      run: () => ctx.S.talks.map((t) => `<span class="c-muted">${t.date.slice(0, 7)}</span> <span class="${t.type === 'poster' ? 'c-cyan' : 'c-green'}">${pad(t.type || 'talk', 7)}</span>${a('#talks/' + t.id, ctx.shortVenue(t.venue))} <span class="c-muted">— ${esc(t.title)}</span>`),
    },
    cd: {
      desc: 'cd <workspace>  — jump to a workspace',
      run: (args) => {
        const w = (args[0] || 'about').replace(/^~?\/?/, '').replace(/\/$/, '') || 'about';
        const map = { projects: 'research', publications: 'pubs', '..': 'about', '~': 'about' };
        const ws = map[w] || w;
        if (!ctx.WS.includes(ws)) return [`cd: no such workspace: ${esc(w)}  <span class="c-muted">(${ctx.WS.join(', ')})</span>`];
        setTimeout(() => ctx.go(ws), 120);
        return [];
      },
    },
    open: {
      desc: 'open <project|link>  — e.g. open bread, open github',
      run: (args) => {
        const k = (args[0] || '').toLowerCase();
        if (!k) return ['usage: open &lt;' + [...ctx.S.links.map((l) => l.label), ...ctx.S.projects.map((p) => p.id)].join('|') + '&gt;'];
        const l = ctx.S.links.find((x) => x.label === k);
        if (l) { ctx.openUrl(l.url); return [`opening ${esc(l.url)} …`]; }
        const p = ctx.S.projects.find((x) => x.id === k || x.title.toLowerCase() === k);
        if (p) { setTimeout(() => ctx.go('research', p.id), 120); return [`→ ~/research/${esc(p.id)}`]; }
        const t = ctx.S.talks.find((x) => x.id === k);
        if (t) { setTimeout(() => ctx.go('talks', t.id), 120); return [`→ ~/talks/${esc(t.id)}`]; }
        return [`open: ${esc(k)}: not found`];
      },
    },
    cv: {
      desc: 'download my CV',
      run: () => { ctx.openUrl(ctx.S.profile.cv); return [`opening ${a(ctx.S.profile.cv, 'cv.pdf')} …`]; },
    },
    contact: {
      desc: 'how to reach me',
      run: () => CMDS.cat.run(['contact']),
    },
    theme: {
      desc: 'theme [name] — list or switch colour themes',
      run: (args) => {
        if (!args[0]) return ctx.THEMES.map((t) => (t === ctx.theme() ? `<span class="c-green">● ${t}</span>` : `  ${t}`));
        if (!ctx.THEMES.includes(args[0])) return [`theme: unknown theme '${esc(args[0])}'`];
        ctx.applyTheme(args[0]); return [`theme → ${esc(args[0])}`];
      },
    },
    neofetch: {
      desc: 'system info',
      run: () => {
        const S = ctx.S, p = S.profile;
        return [
          `<span class="c-green b">${esc(p.short)}</span>@<span class="c-accent2 b">${esc(p.host)}</span>`,
          '<span class="c-muted">───────────────────────</span>',
          `<span class="c-accent">OS</span>      PhD (${esc(p.org)})`,
          `<span class="c-accent">Kernel</span>  ${esc(p.lab)}`,
          `<span class="c-accent">Uptime</span>  ${esc(ctx.uptime(p.phd_start))}`,
          `<span class="c-accent">Shell</span>   ${esc(p.stack)}`,
          `<span class="c-accent">Papers</span>  ${S.publications.length}`,
          `<span class="c-accent">Talks</span>   ${S.talks.length}`,
          `<span class="c-accent">Theme</span>   ${esc(ctx.theme())}`,
          ['--red', '--orange', '--yellow', '--green', '--cyan', '--accent', '--accent2'].map((v) => `<span style="color:var(${v})">███</span>`).join(''),
        ];
      },
    },
    qr: {
      desc: 'QR code linking to this site',
      run: () => {
        const url = ctx.shareUrl(true).replace(/#.*$/, '');
        const q = ctx.qrcode(0, 'L'); q.addData(url); q.make();
        const n = q.getModuleCount(), lines = [];
        // two QR rows per text line using half blocks; inverted (light modules on dark bg) for terminals
        for (let r = -1; r < n + 1; r += 2) {
          let s = '';
          for (let c = -1; c < n + 1; c++) {
            const top = r >= 0 && r < n && c >= 0 && c < n && q.isDark(r, c);
            const bot = r + 1 >= 0 && r + 1 < n && c >= 0 && c < n && q.isDark(r + 1, c);
            s += top && bot ? ' ' : top ? '▄' : bot ? '▀' : '█';
          }
          lines.push(s);
        }
        return [`<div class="term-qr">${lines.join('\n')}</div>`, `<span class="c-muted">${esc(url)} — or press q for a downloadable version</span>`];
      },
    },
    date: { desc: 'print the date', run: () => [new Date().toString()] },
    echo: { desc: 'echo text', run: (args) => [esc(args.join(' '))] },
    history: { desc: 'command history', run: () => hist.map((h, i) => `${String(i + 1).padStart(4)}  ${esc(h)}`) },
    clear: { desc: 'clear the screen', run: () => { out.innerHTML = ''; return null; } },
    exit: { desc: 'leave the shell', run: () => { setTimeout(() => ctx.go('about'), 150); return ['logout']; } },

    // ── easter eggs ──
    sudo: { hidden: true, run: () => [`${esc(ctx.S.profile.short)} is not in the sudoers file. This incident will be reported.`] },
    rm: { hidden: true, run: (args) => (args.join(' ').includes('-rf') ? ['<span class="c-red">nice try.</span> the methylome is backed up in triplicate.'] : ['rm: missing operand']) },
    vim: { hidden: true, run: () => ['you are now trapped in vim. just kidding — this is a website. (:q)'] },
    nvim: { hidden: true, run: () => CMDS.vim.run() },
    ':q': { hidden: true, run: () => ['…you were never in vim.'] },
    methylate: {
      hidden: true,
      run: (args) => {
        const s = (args[0] || 'ACGTTCGACGGATCG').toUpperCase().replace(/[^ACGT]/g, '');
        return [s.replace(/CG/g, '<span class="c-yellow b">ᵐC</span>G'), '<span class="c-muted">all CpGs methylated. (bisulfite would disagree.)</span>'];
      },
    },
    ssh: { hidden: true, run: () => ['ssh: connect to host hpc: permission denied (publickey). the cluster is busy aligning reads.'] },
    pwd: { hidden: true, run: () => ['/home/' + esc(ctx.S.profile.short)] },
  };

  function bar(level) {
    const n = Math.round((Number(level) || 0) / 5);
    return `<span class="c-green">${'■'.repeat(n)}</span><span class="c-muted">${'·'.repeat(20 - n)}</span>`;
  }

  function promptHtml() {
    const p = ctx.S.profile;
    return `<span class="prompt"><span class="u">${esc(p.short)}</span>@<span class="h">${esc(p.host)}</span> <span class="d">~</span> ❯</span>`;
  }

  function print(lines) {
    if (lines == null) return;
    (Array.isArray(lines) ? lines : [lines]).forEach((l) => {
      const d = document.createElement('div'); d.className = 'line'; d.innerHTML = l; out.appendChild(d);
    });
  }

  function exec(raw) {
    const line = raw.trim();
    print(`${promptHtml()} ${esc(line)}`);
    if (line) { hist.push(line); hi = hist.length; }
    if (!line) return scroll();
    const [cmd, ...args] = line.split(/\s+/);
    const c = CMDS[cmd.toLowerCase()];
    try {
      print(c ? c.run(args) : [`zsh: command not found: ${esc(cmd)}  <span class="c-muted">(try help)</span>`]);
    } catch (e) {
      print([`<span class="c-red">${esc(e.message)}</span>`]);
    }
    scroll();
  }
  const scroll = () => { const p = out.closest('.pane'); if (p) p.scrollTop = p.scrollHeight; };

  function complete() {
    const v = input.value, parts = v.split(/\s+/);
    let pool;
    if (parts.length <= 1) pool = Object.keys(CMDS).filter((k) => !CMDS[k].hidden);
    else if (parts[0] === 'theme') pool = ctx.THEMES;
    else if (parts[0] === 'cd') pool = ctx.WS;
    else if (parts[0] === 'cat' || parts[0] === 'ls') pool = SECTIONS;
    else if (parts[0] === 'open') pool = [...ctx.S.links.map((l) => l.label), ...ctx.S.projects.map((p) => p.id), ...ctx.S.talks.map((t) => t.id)];
    else return;
    const last = parts[parts.length - 1];
    const hits = pool.filter((k) => k.startsWith(last));
    if (hits.length === 1) { parts[parts.length - 1] = hits[0]; input.value = parts.join(' ') + ' '; }
    else if (hits.length > 1) { print(`${promptHtml()} ${esc(v)}`); print([hits.join('  ')]); scroll(); }
  }

  function mount(el, context) {
    ctx = context;
    el.innerHTML = `<div class="term-out"></div>
      <div class="term-in">${promptHtml()}<input type="text" aria-label="shell input" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"></div>
      <div class="term-chips">${['help', 'whoami', 'pubs', 'ls projects', 'talks', 'neofetch', 'qr', 'theme'].map((c) => `<button class="chip" data-cmd="${c}">${c}</button>`).join('')}</div>`;
    out = el.querySelector('.term-out');
    input = el.querySelector('input');

    print([
      `<span class="c-muted">Last login: ${new Date().toDateString()} on ttys001</span>`,
      `Welcome. Type <span class="c-green">help</span> to see what you can do, or tap a command below.`,
      '',
    ]);

    el.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cmd]');
      if (chip) { exec(chip.dataset.cmd); return; }
      if (!e.target.closest('a') && !window.getSelection()?.toString()) input.focus({ preventScroll: true });
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { exec(input.value); input.value = ''; }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = hist[--hi]; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; }
      else if (e.ctrlKey && e.key === 'l') { e.preventDefault(); out.innerHTML = ''; }
      else if (e.ctrlKey && e.key === 'c') { print(`${promptHtml()} ${esc(input.value)}^C`); input.value = ''; }
      else if (e.key === 'Escape') { input.blur(); }
    });
  }

  return { mount };
})();
