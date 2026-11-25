import { parseRobots, robotsDecision } from './robotsTxt.js';

// Classed from each vendor's own crawler documentation, never from the token's
// name: GPTBot and ClaudeBot are the TRAINING opt-outs, not the search crawlers.
// Perplexity-User is left out on purpose: Perplexity says it generally ignores
// robots.txt, so a reading for it would describe a gate that does not exist.
const GROUPS = [
  {
    key: 'search',
    title: 'AI search',
    note: 'Blocking these keeps the page out of that engine’s search answers.',
    bots: [
      ['OAI-SearchBot', 'ChatGPT search'],
      ['Claude-SearchBot', 'Claude search'],
      ['PerplexityBot', 'Perplexity search'],
    ],
  },
  {
    key: 'user',
    title: 'Opens a page a person asked for',
    note: 'Used when someone asks the assistant to read a link.',
    bots: [
      ['ChatGPT-User', 'ChatGPT'],
      ['Claude-User', 'Claude'],
    ],
  },
  {
    key: 'google',
    title: 'Google and Bing search',
    note: 'Google AI Overviews and AI Mode follow Googlebot, not Google-Extended.',
    bots: [
      ['Googlebot', 'Google Search, AI Overviews, AI Mode'],
      ['Bingbot', 'Bing search'],
    ],
  },
  {
    key: 'training',
    title: 'Model training',
    note: 'Opting out of training does not hide the page from AI search.',
    bots: [
      ['GPTBot', 'OpenAI model training'],
      ['ClaudeBot', 'Anthropic model training'],
      ['Google-Extended', 'Gemini training and Gemini app grounding'],
      ['Applebot-Extended', 'Apple model training'],
      ['CCBot', 'Common Crawl open dataset'],
      ['meta-externalagent', 'Meta AI training and indexing'],
      ['Amazonbot', 'Amazon, may train Amazon AI models'],
      ['Bytespider', 'ByteDance, purpose undocumented'],
      ['anthropic-ai', 'Older Anthropic token'],
    ],
  },
];

const UTM = 'utm_source=chrome_extension&utm_medium=extension&utm_campaign=ai_crawler_check';

// Runs inside the page, so every fetch is same-origin and needs no host permission.
// It must stay self-contained: chrome.scripting serialises the function source.
async function collect() {
  const get = async (path) => {
    try {
      const r = await fetch(path, { credentials: 'omit', cache: 'no-store' });
      const text = r.ok ? (await r.text()).slice(0, 512000) : '';
      return { status: r.status, ok: r.ok, type: r.headers.get('content-type') || '', text, finalUrl: r.url };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  };
  const head = async () => {
    try {
      const r = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
      return { status: r.status, xRobots: r.headers.get('x-robots-tag') };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  };
  const [robots, llms, page] = await Promise.all([get(location.origin + '/robots.txt'), get(location.origin + '/llms.txt'), head()]);
  const metas = [...document.querySelectorAll('meta[name]')]
    .filter((m) => /^(robots|googlebot|bingbot|gptbot|oai-searchbot|claudebot|perplexitybot)$/i.test(m.getAttribute('name') || ''))
    .map((m) => ({ name: m.getAttribute('name'), content: m.getAttribute('content') || '' }));
  const canonicalEl = document.querySelector('link[rel~="canonical"]');
  const types = new Set();
  let ldBlocks = 0;
  let ldErrors = 0;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const t = n['@type'];
    if (typeof t === 'string') types.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    ldBlocks++;
    try { walk(JSON.parse(s.textContent)); } catch { ldErrors++; }
  }
  return {
    url: location.href,
    robots,
    llms,
    page,
    metas,
    canonical: canonicalEl ? canonicalEl.href : null,
    ldBlocks,
    ldErrors,
    types: [...types].slice(0, 40),
  };
}

// ---------- rendering (textContent only: page data never becomes markup) ----------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function badge(label, tone) {
  return el('span', `badge ${tone}`, label);
}

function section(title, note) {
  const s = el('section', 'card');
  s.append(el('h2', null, title));
  if (note) s.append(el('p', 'note', note));
  return s;
}

function row(name, who, statusEl, detail) {
  const r = el('div', 'row');
  const left = el('div', 'row-left');
  left.append(el('div', 'bot', name), el('div', 'who', who));
  r.append(left, statusEl);
  if (detail) r.title = detail;
  return r;
}

// What robots.txt means for crawlers, by status: Google reads a 4xx as "no rules"
// and a 5xx as "blocked for now"; an HTML page at /robots.txt is a soft 404.
function robotsState(robots) {
  if (!robots || robots.error) return { kind: 'unreadable', groups: [] };
  if (robots.status >= 500) return { kind: 'server-error', groups: [] };
  if (!robots.ok) return { kind: 'missing', groups: [] };
  if (/html/i.test(robots.type) && /<html|<!doctype/i.test(robots.text)) return { kind: 'html', groups: [] };
  return { kind: 'found', groups: parseRobots(robots.text) };
}

function render(data, url) {
  const out = document.getElementById('out');
  out.textContent = '';
  const path = url.pathname + url.search;
  const state = robotsState(data.robots);

  const summary = section('robots.txt');
  const sumText = {
    found: `Found at ${url.origin}/robots.txt. Results below are for this exact path.`,
    missing: 'No robots.txt here, so every crawler may read every page.',
    html: 'robots.txt returns a web page, not rules, so crawlers treat every page as allowed.',
    'server-error': 'robots.txt returns a server error. Google treats that as blocking the whole site until it answers again.',
    unreadable: 'Could not read robots.txt from this page. It may redirect to another host: open that host and check again.',
  }[state.kind];
  summary.append(el('p', 'body', sumText));
  out.append(summary);

  // The header counts the AI search and fetch crawlers; Googlebot is reported apart.
  const counts = { blocked: 0, checked: 0, googleBlocked: false };
  for (const g of GROUPS) {
    const s = section(g.title, g.note);
    for (const [name, who] of g.bots) {
      let status;
      let detail = '';
      if (state.kind === 'unreadable') {
        status = badge('Unknown', 'muted');
      } else if (state.kind === 'server-error') {
        status = badge('Blocked', g.key === 'training' ? 'muted' : 'bad');
      } else {
        const d = robotsDecision(state.groups, name, path);
        detail = d.matched ? `${d.matched} (from ${d.via})` : `No rule matches (${d.via})`;
        if (g.key === 'training') status = d.allowed ? badge('Allowed', 'muted') : badge('Opted out', 'muted');
        else status = d.allowed ? badge('Allowed', 'good') : badge('Blocked', 'bad');
        if (g.key === 'search' || g.key === 'user') {
          counts.checked++;
          if (!d.allowed) counts.blocked++;
        }
        if (name === 'Googlebot' && !d.allowed) counts.googleBlocked = true;
      }
      s.append(row(name, who, status, detail));
    }
    out.append(s);
  }

  // Page-level signals that also decide whether an answer engine can use the page.
  const sig = section('This page');
  const xr = data.page && data.page.xRobots;
  const noindexMeta = data.metas.find((m) => /noindex|none/i.test(m.content));
  const nosnippetMeta = data.metas.find((m) => /nosnippet|max-snippet:\s*0\b/i.test(m.content));
  const metaText = data.metas.length ? data.metas.map((m) => `${m.name}: ${m.content}`).join('; ') : 'None';
  sig.append(row('Meta robots', metaText, noindexMeta ? badge('noindex', 'bad') : nosnippetMeta ? badge('No snippet', 'warn') : badge('OK', 'good')));
  sig.append(row('X-Robots-Tag', xr || 'None', xr && /noindex|none/i.test(xr) ? badge('noindex', 'bad') : xr && /nosnippet/i.test(xr) ? badge('No snippet', 'warn') : badge('OK', 'good')));

  let canonText = 'None';
  let canonBadge = badge('None', 'muted');
  if (data.canonical) {
    canonText = data.canonical;
    const same = stripHash(data.canonical) === stripHash(url.href);
    canonBadge = same ? badge('Self', 'good') : badge('Elsewhere', 'warn');
  }
  sig.append(row('Canonical', canonText, canonBadge));

  const typesText = data.types.length ? data.types.join(', ') : 'No JSON-LD found';
  const ldBadge = data.ldErrors ? badge(`${data.ldErrors} broken`, 'warn') : data.types.length ? badge(`${data.types.length} type${data.types.length > 1 ? 's' : ''}`, 'good') : badge('None', 'muted');
  sig.append(row('Structured data', typesText, ldBadge));

  const llms = data.llms || {};
  const llmsFound = llms.ok && !/html/i.test(llms.type || '') && llms.text.trim().length > 0;
  const llmsLines = llmsFound ? llms.text.split(/\r?\n/).filter((l) => l.trim()).length : 0;
  sig.append(row('llms.txt', llmsFound ? `${llmsLines} lines at ${url.origin}/llms.txt` : 'Not found. Optional: Google says Search ignores it.', llmsFound ? badge('Found', 'good') : badge('None', 'muted')));
  out.append(sig);

  const verdict = counts.blocked ? `${counts.blocked} of ${counts.checked} AI crawlers blocked` : 'AI crawlers allowed';
  document.getElementById('where').textContent = counts.checked
    ? `${url.host}: ${verdict}${counts.googleBlocked ? ', Googlebot blocked' : ''}`
    : url.host;
}

function stripHash(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    return x.href.replace(/\/$/, '');
  } catch {
    return u;
  }
}

function showMessage(text) {
  const out = document.getElementById('out');
  out.textContent = '';
  const s = section('Nothing to check here');
  s.append(el('p', 'body', text));
  out.append(s);
}

function setCta(host) {
  const cta = document.getElementById('cta');
  if (!host) {
    cta.href = `https://cituna.com/?${UTM}`;
    return;
  }
  cta.textContent = `See what AI engines say about ${host}`;
  cta.href = `https://cituna.com/?url=${encodeURIComponent(host)}&${UTM}`;
}

async function main() {
  // Demo mode for screenshots and tests: popup.html?demo=fixture.json&url=...
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo');
  if (demo && /^[\w-]+\.json$/.test(demo)) {
    const data = await (await fetch(`demo/${demo}`)).json();
    const url = new URL(data.url);
    setCta(url.hostname.replace(/^www\./, ''));
    render(data, url);
    if (params.get('scroll') === 'end') {
      const out = document.getElementById('out');
      out.scrollTop = out.scrollHeight;
    }
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url;
  try { url = new URL(tab && tab.url); } catch { url = null; }
  if (!url || !/^https?:$/.test(url.protocol)) {
    setCta(null);
    document.getElementById('where').textContent = 'Open a website to check it';
    showMessage('This check works on ordinary web pages (http and https). Open a site and click the icon again.');
    return;
  }
  const host = url.hostname.replace(/^www\./, '');
  setCta(host);
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collect });
    if (!res || !res.result) throw new Error('no result');
    render(res.result, new URL(res.result.url));
  } catch {
    document.getElementById('where').textContent = url.host;
    showMessage('Chrome does not let extensions read this page (the Chrome Web Store and some built-in pages are protected). Try it on another site.');
  }
}

main();
