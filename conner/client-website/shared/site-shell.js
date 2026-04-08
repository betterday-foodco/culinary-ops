/**
 * BetterDay client-website — site-shell loader
 * ─────────────────────────────────────────────
 * Same pattern as conner/app/shared/site-shell.js but cleaned up for
 * the canonical client-website:
 *   - Loads site facts from ../../brand/site-info.seed.json (offline dev)
 *     or from culinary-ops /api/system-config/public (when BETTERDAY_API_BASE
 *     is set)
 *   - Strips the `public.` prefix from seed-file keys so the same
 *     {{contact.email}} templates work regardless of data source
 *   - Fetches shared HTML fragments (header, footer) and injects them
 *     into <div data-shell="header|footer"> placeholders
 *   - Substitutes {{key}} tokens in fragments + host page body
 *
 * USAGE ON A PAGE
 * ───────────────
 *   <!DOCTYPE html>
 *   <html lang="en">
 *   <head>
 *     ...
 *     <link rel="stylesheet" href="/brand/tokens.css">
 *   </head>
 *   <body data-site="marketing">
 *
 *     <div data-shell="header"></div>
 *     ...page content (use {{contact.email}} etc. anywhere in text or href/src/alt)
 *     <div data-shell="footer"></div>
 *
 *     <script src="shared/site-shell.js" defer></script>
 *   </body>
 *   </html>
 *
 * LOCAL DEVELOPMENT
 * ─────────────────
 * Run a local HTTP server from the culinary-ops repo root (NOT from inside
 * client-website/) so both /brand/ and /conner/client-website/ are reachable:
 *
 *   cd ~/Downloads/culinary-ops   # or wherever your clone lives
 *   python3 -m http.server 8000
 *
 * Then open:
 *   http://localhost:8000/conner/client-website/
 *
 * PHASE 2 SWITCHOVER
 * ──────────────────
 * When the production culinary-ops API is live, set BETTERDAY_API_BASE
 * in a <script> tag BEFORE this one:
 *
 *   <script>window.BETTERDAY_API_BASE = 'https://culinary-ops-api.onrender.com/api';</script>
 *   <script src="shared/site-shell.js" defer></script>
 *
 * The loader will fetch from /api/system-config/public instead of the seed
 * file, admin edits propagate on next cache TTL, no HTML changes needed.
 */
(function () {
  'use strict';

  // Work out the folder this script lives in, so fetches are relative to
  // shared/ no matter where the host page sits.
  const currentScript = document.currentScript
    || Array.from(document.scripts).find(s => /site-shell\.js(\?|$)/.test(s.src));
  const SHARED_BASE = currentScript
    ? new URL('.', currentScript.src).href
    : 'shared/';

  // brand/site-info.seed.json sits at culinary-ops/brand/ — from
  // conner/client-website/shared/ that's three levels up.
  const SEED_URL = new URL('../../../brand/site-info.seed.json', SHARED_BASE).href;

  const site = (document.body && document.body.dataset.site) || 'marketing';

  // Phase 1.5 ↔ Phase 2 switch
  const SITE_DATA_URL = window.BETTERDAY_API_BASE
    ? `${window.BETTERDAY_API_BASE}/system-config/public`
    : SEED_URL;

  // ─────────────────────────────────────────────────────────────────────
  // Site data loader (memoized, cached for this page load)
  // ─────────────────────────────────────────────────────────────────────
  let _siteDataPromise = null;
  function loadSiteData() {
    if (!_siteDataPromise) {
      _siteDataPromise = fetch(SITE_DATA_URL)
        .then(r => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        })
        .then(raw => {
          // Normalize: strip `public.` prefix so templates use clean keys.
          // Works for both the API response (prefixes already stripped server
          // side) AND the seed file (prefixes present). Also drops underscore
          // comment/meta keys.
          const out = {};
          for (const [k, v] of Object.entries(raw || {})) {
            if (k.startsWith('_')) continue;  // skip _comment, _security, _update_process
            const clean = k.startsWith('public.') ? k.slice(7) : k;
            out[clean] = v;
          }
          return out;
        })
        .catch(err => {
          console.error(`[site-shell] site-data load failed (${SITE_DATA_URL}):`, err);
          return {};  // graceful fallback — tokens render as raw {{...}}
        });
    }
    return _siteDataPromise;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Token substitution — replace {{key.path}} with data[key.path]
  // ─────────────────────────────────────────────────────────────────────
  const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
  function interpolate(str, data) {
    if (!str || typeof str !== 'string' || str.indexOf('{{') === -1) return str;
    return str.replace(TOKEN_RE, (match, key) =>
      Object.prototype.hasOwnProperty.call(data, key) ? data[key] : match
    );
  }

  // Walk the host page's static HTML and substitute tokens in text nodes +
  // common user-facing attributes.
  const INTERPOLATED_ATTRS = ['href', 'src', 'alt', 'title', 'aria-label', 'placeholder'];
  function interpolatePage(data) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf('{{') !== -1) textNodes.push(node);
    }
    textNodes.forEach(n => { n.nodeValue = interpolate(n.nodeValue, data); });

    const selector = INTERPOLATED_ATTRS.map(a => `[${a}*="{{"]`).join(',');
    document.querySelectorAll(selector).forEach(el => {
      INTERPOLATED_ATTRS.forEach(attr => {
        const v = el.getAttribute(attr);
        if (v && v.indexOf('{{') !== -1) el.setAttribute(attr, interpolate(v, data));
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Shell fragment injection (header, footer)
  // ─────────────────────────────────────────────────────────────────────
  function injectShellPart(el) {
    const part = el.dataset.shell;
    if (!part) return;

    const url = `${SHARED_BASE}${site}-${part}.html`;
    Promise.all([
      fetch(url).then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.text();
      }),
      loadSiteData(),
    ])
      .then(([html, data]) => {
        // Interpolate tokens before injection so the DOM never shows raw {{...}}.
        // <style> tags inside the fragment ARE applied by the browser.
        // <script> tags are NOT executed — put JS in site-shell.js or page scripts.
        el.outerHTML = interpolate(html, data);
      })
      .catch(err => {
        console.error(`[site-shell] failed to load ${url}:`, err);
        el.innerHTML =
          `<div style="padding:16px;background:#fee;color:#900;` +
          `font-family:system-ui,sans-serif;font-size:13px;` +
          `border:1px solid #f99;border-radius:6px;margin:8px;">` +
          `site-shell: failed to load <code>${site}-${part}.html</code> ` +
          `(${err.message}). If you opened this file from file://, you need ` +
          `a local HTTP server — see <code>shared/README.md</code>.` +
          `</div>`;
      });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Phase 2 CMS content injection (inert until BETTERDAY_API_BASE is set)
  // ─────────────────────────────────────────────────────────────────────
  function injectContent(el) {
    const API_BASE = window.BETTERDAY_API_BASE;
    if (!API_BASE) return;
    const key = el.dataset.content;
    if (!key) return;

    fetch(`${API_BASE}/content/${encodeURIComponent(key)}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(data => {
        if (data && typeof data.html === 'string') el.innerHTML = data.html;
      })
      .catch(err => {
        console.error(`[site-shell] content "${key}" failed:`, err);
      });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Wire everything up on DOM ready
  // ─────────────────────────────────────────────────────────────────────
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    document.querySelectorAll('[data-shell]').forEach(injectShellPart);
    loadSiteData().then(data => interpolatePage(data));
    document.querySelectorAll('[data-content]').forEach(injectContent);
  });
})();
