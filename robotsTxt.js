// robots.txt, read the way the crawlers read it: RFC 9309 and Google's open-source
// parser (github.com/google/robotstxt). The same rules Cituna's paid audit uses.
//   - Lines end at CRLF, LF or a lone CR. `#` starts a comment. Field names are
//     case-insensitive. Sitemap, Crawl-delay and unknown lines are ignored.
//   - Consecutive User-agent lines open one group. A crawler obeys every group
//     naming its product token, merged; only if none does, every `*` group.
//   - `*` matches any run, `$` anchors only as the last character, otherwise a
//     rule is a prefix match. The longest matching pattern wins, Allow wins a tie,
//     and an empty `Disallow:` matches nothing.

// `GPTBot/1.1` names GPTBot: the token is the leading run of letters, `-` and `_`.
function productToken(value) {
  if (/^\*(\s|$)/.test(value)) return '*';
  const m = /^[A-Za-z_-]+/.exec(value);
  return m ? m[0].toLowerCase() : '';
}

/** Parse robots.txt into user-agent groups. Never throws. */
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let sawRule = false;
  let src = String(text ?? '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  for (const raw of src.split(/\r\n|\r|\n/)) {
    const hash = raw.indexOf('#');
    const line = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!cur || sawRule) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
        sawRule = false;
      }
      cur.agents.push(productToken(value));
    } else if (field === 'allow' || field === 'disallow') {
      // A rule before any User-agent line belongs to no group.
      if (!cur) continue;
      cur.rules.push({ allow: field === 'allow', path: value });
      sawRule = true;
    }
  }
  return groups;
}

// Google's matcher: track every path position the pattern so far can end at.
// Linear in pattern x path, so a hostile file cannot make it backtrack.
function patternMatches(pattern, path) {
  let ends = [0];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '$' && i === pattern.length - 1) return ends.includes(path.length);
    if (ch === '*') {
      const from = ends[0];
      ends = [];
      for (let p = from; p <= path.length; p++) ends.push(p);
    } else {
      ends = ends.filter((p) => p < path.length && path[p] === ch).map((p) => p + 1);
      if (!ends.length) return false;
    }
  }
  return true;
}

/**
 * May `userAgent` fetch `path`? `matched` is the deciding rule as written in the
 * file (null when none applied) and `via` says which group decided.
 */
export function robotsDecision(groups, userAgent, path = '/') {
  const token = String(userAgent ?? '').trim().toLowerCase();
  const explicit = groups.filter((g) => g.agents.includes(token));
  const use = explicit.length ? explicit : groups.filter((g) => g.agents.includes('*'));
  if (!use.length) return { allowed: true, matched: null, via: 'no group names it' };
  const via = explicit.length ? `its own group` : 'the * group';
  let best = null;
  for (const g of use) {
    for (const r of g.rules) {
      if (!r.path || !patternMatches(r.path, path)) continue;
      const longer = !best || r.path.length > best.path.length;
      const tieToAllow = best && r.path.length === best.path.length && r.allow && !best.allow;
      if (longer || tieToAllow) best = r;
    }
  }
  if (!best) return { allowed: true, matched: null, via };
  return { allowed: best.allow, matched: `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}`, via };
}
