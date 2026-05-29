#!/usr/bin/env node
// Devlog static site generator
// Reads devlog/posts/*.md, writes devlog/index.html + devlog/<slug>.html
// Zero deps. Run with: node devlog/build.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const POSTS_DIR = path.join(ROOT, 'posts');
const SITE = 'https://valadares.app.br';

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    meta[kv[1]] = v;
  }
  return { meta, body: m[2] };
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInline(s) {
  // code inline
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      out.push(`<pre><code${lang ? ` class="lang-${lang}"` : ''}>${escHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl}>${renderInline(escHtml(h[2]))}</h${lvl}>`);
      i++;
      continue;
    }

    // hr
    if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // blockquote
    if (line.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote>${renderInline(escHtml(buf.join(' ')))}</blockquote>`);
      continue;
    }

    // list (bullet)
    if (/^[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        buf.push(`<li>${renderInline(escHtml(lines[i].replace(/^[-*]\s+/, '')))}</li>`);
        i++;
      }
      out.push(`<ul>${buf.join('')}</ul>`);
      continue;
    }

    // list (numbered)
    if (/^\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        buf.push(`<li>${renderInline(escHtml(lines[i].replace(/^\d+\.\s+/, '')))}</li>`);
        i++;
      }
      out.push(`<ol>${buf.join('')}</ol>`);
      continue;
    }

    // blank
    if (line.trim() === '') {
      i++;
      continue;
    }

    // paragraph (consume until blank/structural)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|>|---|\d+\.\s|[-*]\s)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(escHtml(buf.join(' ')))}</p>`);
  }
  return out.join('\n');
}

const HEAD_COMMON = (title, description, canonical, ogImage) => `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta property="og:site_name" content="Valadares">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(description)}">
<meta name="twitter:image" content="${ogImage}">`;

const STYLE = `<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0805; --bg-card: #1a1410; --bg-elev: #241b14; --border: #3a2d20;
  --gold: #d4a847; --gold-bright: #f0c060; --blood: #8b2020; --blood-bright: #c83030;
  --text: #e0d8c8; --text-dim: #8a7e6a; --green: #4ab040;
}
html, body { background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.7; overflow-x: hidden; }
body { background-image: radial-gradient(circle at 20% 10%, rgba(212, 168, 71, 0.06), transparent 40%), radial-gradient(circle at 80% 80%, rgba(139, 32, 32, 0.06), transparent 40%); background-attachment: fixed; }
a { color: var(--gold); text-decoration: none; }
a:hover { color: var(--gold-bright); text-decoration: underline; }
nav { position: sticky; top: 0; z-index: 100; background: rgba(10, 8, 5, 0.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; }
.nav-brand { font-family: "Cinzel", Georgia, serif; font-size: 22px; font-weight: 700; color: var(--gold); letter-spacing: 2px; }
.nav-brand::before { content: "✦ "; color: var(--gold-bright); }
.nav-links { display: flex; gap: 24px; }
.nav-links a { color: var(--text-dim); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
.nav-links a:hover { color: var(--gold); text-decoration: none; }
.nav-links a.active { color: var(--gold); }
main { max-width: 820px; margin: 0 auto; padding: 60px 24px 80px; }
.page-title { font-family: "Cinzel", Georgia, serif; font-size: clamp(36px, 6vw, 56px); color: var(--gold); letter-spacing: 4px; text-align: center; margin-bottom: 12px; text-shadow: 0 0 20px rgba(212, 168, 71, 0.3); }
.page-sub { text-align: center; color: var(--text-dim); margin-bottom: 56px; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }
.post-list { list-style: none; display: flex; flex-direction: column; gap: 16px; }
.post-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 24px; transition: all 0.2s ease; display: block; color: inherit; text-decoration: none; }
.post-card:hover { border-color: var(--gold); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); text-decoration: none; color: inherit; }
.post-card-meta { color: var(--text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; display: flex; gap: 12px; flex-wrap: wrap; }
.post-card-title { font-family: "Cinzel", Georgia, serif; font-size: 22px; color: var(--gold-bright); margin-bottom: 10px; letter-spacing: 1px; }
.post-card-summary { color: var(--text-dim); font-size: 14px; line-height: 1.6; }
.tag { display: inline-block; background: var(--bg-elev); color: var(--gold); padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 700; }
article header { margin-bottom: 40px; text-align: center; border-bottom: 1px solid var(--border); padding-bottom: 32px; }
article h1 { font-family: "Cinzel", Georgia, serif; font-size: clamp(28px, 5vw, 44px); color: var(--gold); letter-spacing: 2px; margin-bottom: 16px; line-height: 1.2; }
article .meta { color: var(--text-dim); font-size: 13px; text-transform: uppercase; letter-spacing: 2px; display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
article h2 { font-family: "Cinzel", Georgia, serif; color: var(--gold-bright); font-size: 26px; margin: 48px 0 16px; letter-spacing: 1px; }
article h3 { color: var(--gold-bright); font-size: 19px; margin: 32px 0 12px; }
article h4 { color: var(--gold); font-size: 16px; margin: 24px 0 8px; }
article p { margin-bottom: 16px; color: var(--text); }
article ul, article ol { margin: 0 0 20px 24px; color: var(--text); }
article li { margin-bottom: 6px; }
article a { color: var(--gold-bright); border-bottom: 1px dotted var(--gold); }
article a:hover { color: var(--gold); text-decoration: none; border-bottom-style: solid; }
article code { background: var(--bg-elev); color: var(--gold); padding: 2px 6px; border-radius: 3px; font-size: 13px; font-family: ui-monospace, "Consolas", monospace; }
article pre { background: var(--bg-card); border: 1px solid var(--border); border-left: 3px solid var(--gold); padding: 16px 20px; border-radius: 4px; overflow-x: auto; margin: 20px 0; }
article pre code { background: none; padding: 0; color: var(--text); font-size: 13px; line-height: 1.5; }
article blockquote { border-left: 3px solid var(--blood-bright); background: var(--bg-elev); padding: 12px 20px; margin: 20px 0; color: var(--text-dim); font-style: italic; }
article hr { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
article strong { color: var(--gold-bright); }
.back-link { display: inline-block; margin-top: 60px; padding: 12px 24px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 4px; color: var(--gold); text-transform: uppercase; letter-spacing: 2px; font-size: 13px; }
.back-link:hover { background: var(--gold); color: var(--bg); text-decoration: none; }
footer { border-top: 1px solid var(--border); padding: 40px 24px; text-align: center; color: var(--text-dim); font-size: 13px; }
footer a { margin: 0 12px; }
@media (max-width: 600px) {
  .nav-links { display: none; }
  main { padding: 40px 16px 60px; }
  .page-title { letter-spacing: 2px; }
  article h2 { font-size: 22px; }
}
</style>`;

const NAV = (active) => `<nav>
  <a href="/" class="nav-brand">VALADARES</a>
  <div class="nav-links">
    <a href="/" ${active === 'home' ? 'class="active"' : ''}>Home</a>
    <a href="/devlog" ${active === 'devlog' ? 'class="active"' : ''}>Devlog</a>
    <a href="/ranking">Ranking</a>
    <a href="/jogar">Jogar</a>
  </div>
</nav>`;

const FOOTER = `<footer>
  <div>
    <a href="/">Home</a>·
    <a href="/devlog">Devlog</a>·
    <a href="/jogar">Jogar</a>·
    <a href="/ranking">Ranking</a>·
    <a href="/privacy">Privacidade</a>·
    <a href="/terms">Termos</a>
  </div>
  <div style="margin-top: 12px;">© 2026 Valadares · RPG online tile-based</div>
</footer>`;

function fmtDate(d) {
  // d = 'YYYY-MM-DD'
  const [y, m, day] = d.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function buildPostHtml(post) {
  const url = `${SITE}/devlog/${post.slug}`;
  const og = `${SITE}/og.jpg`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
${HEAD_COMMON(post.title + ' — Devlog Valadares', post.summary, url, og)}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": ${JSON.stringify(post.title)},
  "description": ${JSON.stringify(post.summary)},
  "datePublished": "${post.date}",
  "author": { "@type": "Organization", "name": "Valadares" },
  "publisher": { "@type": "Organization", "name": "Valadares", "url": "${SITE}/" },
  "image": "${og}",
  "url": "${url}"
}
</script>
${STYLE}
</head>
<body>
${NAV('devlog')}
<main>
<article>
  <header>
    <h1>${escHtml(post.title)}</h1>
    <div class="meta">
      <span>📅 ${fmtDate(post.date)}</span>
      ${(post.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')}
    </div>
  </header>
  ${post.html}
</article>
<a href="/devlog" class="back-link">← Voltar ao Devlog</a>
</main>
${FOOTER}
</body>
</html>
`;
}

function buildIndexHtml(posts) {
  const url = `${SITE}/devlog`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
${HEAD_COMMON('Devlog Valadares — Bastidores do desenvolvimento', 'Notas de desenvolvimento, lançamentos, sprints e bastidores do Valadares — RPG tile-based online.', url, `${SITE}/og.jpg`)}
${STYLE}
</head>
<body>
${NAV('devlog')}
<main>
<h1 class="page-title">DEVLOG</h1>
<p class="page-sub">Notas dos bastidores · sprints · marcos · lições aprendidas</p>
<ul class="post-list">
${posts.map(p => `<li>
  <a href="/devlog/${p.slug}" class="post-card">
    <div class="post-card-meta">
      <span>${fmtDate(p.date)}</span>
      ${(p.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')}
    </div>
    <div class="post-card-title">${escHtml(p.title)}</div>
    <div class="post-card-summary">${escHtml(p.summary)}</div>
  </a>
</li>`).join('\n')}
</ul>
</main>
${FOOTER}
</body>
</html>
`;
}

// ── BUILD ──────────────────────────────────────────────
const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
const posts = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  if (!meta.slug || !meta.title || !meta.date) {
    console.warn(`[skip] ${file}: missing slug/title/date`);
    continue;
  }
  posts.push({
    slug: meta.slug,
    title: meta.title,
    date: meta.date,
    summary: meta.summary || '',
    tags: Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []),
    html: renderMarkdown(body)
  });
}

// sort by date desc
posts.sort((a, b) => b.date.localeCompare(a.date));

// write individual posts
for (const post of posts) {
  const out = path.join(ROOT, `${post.slug}.html`);
  fs.writeFileSync(out, buildPostHtml(post));
  console.log(`[post] ${post.slug}.html  (${post.date} — ${post.title})`);
}

// write index
fs.writeFileSync(path.join(ROOT, 'index.html'), buildIndexHtml(posts));
console.log(`[index] index.html  (${posts.length} posts)`);
console.log('Done.');
