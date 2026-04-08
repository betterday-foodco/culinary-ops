/**
 * BetterDay site-shell loader
 * ────────────────────────────
 * General-purpose "fetch-and-inject" loader for:
 *   1. Shared page shell parts (header, footer)   — <div data-shell="header">
 *   2. Site-wide facts via {{token}} substitution — {{contact.email}}
 *   3. CMS-editable content blocks (Phase 2)      — <div data-content="faq">
 *
 * USAGE ON A PAGE
 * ───────────────
 *   <body data-site="marketing">        ← or "app" for logged-in pages
 *
 *     <div data-shell="header"></div>   ← fetched from shared/marketing-header.html
 *     ...page content (can use {{contact.email}} anywhere in text / href / src / alt / title)
 *     <div data-shell="footer"></div>   ← fetched from shared/marketing-footer.html
 *
 *     <script src="shared/site-shell.js" defer></script>
 *   </body>
 *
 * To update the header / footer: edit shared/marketing-{header,footer}.html.
 * To update site facts (email, phone, socials): edit shared/site-data.json.
 *   (or — once Gurleen's /api/system-config/public is live — edit them in the
 *    admin dashboard and every page updates next cache TTL.)
 *
 * PATH RESOLUTION
 * ───────────────
 * The loader works out its own folder from its <script> src and uses that
 * as the base for fetching fragments + site-data. Pages at any depth work.
 *
 * PHASE 2 SWITCHOVER
 * ──────────────────
 * When the culinary-ops backend exposes GET /api/system-config/public,
 * set BETTERDAY_API_BASE before this script loads:
 *
 *   <script>window.BETTERDAY_API_BASE = 'https://culinary-ops-api.onrender.com/api';</script>
 *   <script src="shared/site-shell.js" defer></script>
 *
 * The loader will then fetch site data from the API instead of site-data.json,
 * and will also start populating <... data-content="..."> elements from
 * /api/content/<key>. Zero HTML changes required on any page.
 *
 * LOCAL DEVELOPMENT
 * ─────────────────
 * fetch() does NOT work from file:// URLs. Run a local HTTP server:
 *
 *   cd app
 *   python3 -m http.server 8000
 *
 * then open http://localhost:8000/betterday-v2_81.html. See shared/README.md.
 */
(function () {
  'use strict';

  // ── Work out the folder this script lives in, so fetches are root-relative
  //    to the shared/ directory no matter where the host page sits.
  const currentScript = document.currentScript
    || Array.from(document.scripts).find(s => /site-shell\.js(\?|$)/.test(s.src));
  const SHARED_BASE = currentScript
    ? new URL('.', currentScript.src).href  // e.g. https://site.com/app/shared/
    : 'shared/';

  const site = (document.body && document.body.dataset.site) || 'marketing';

  // Phase 1.5 ↔ Phase 2 switch: if BETTERDAY_API_BASE is set, pull site data
  // from the live culinary-ops endpoint; otherwise fall back to the local stub.
  const SITE_DATA_URL = window.BETTERDAY_API_BASE
    ? `${window.BETTERDAY_API_BASE}/system-config/public`
    : `${SHARED_BASE}site-data.json`;

  // ── Site data: load once, cache forever (for this page load)
  let _siteDataPromise = null;
  function loadSiteData() {
    if (!_siteDataPromise) {
      _siteDataPromise = fetch(SITE_DATA_URL)
        .then(r => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        })
        .catch(err => {
          console.error(`[site-shell] site-data load failed (${SITE_DATA_URL}):`, err);
          return {};  // graceful fallback: tokens render as raw {{...}}
        });
    }
    return _siteDataPromise;
  }

  // ── Template substitution: replace {{key.with.dots}} with data[key.with.dots]
  //    Keys are FLAT strings (not nested objects), matching SystemConfig storage.
  //    Missing keys are left unchanged (visible {{foo.bar}}) for easy debugging.
  const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
  function interpolate(str, data) {
    if (!str || typeof str !== 'string' || str.indexOf('{{') === -1) return str;
    return str.replace(TOKEN_RE, (match, key) => {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : match;
    });
  }

  // ── Walk the host page and substitute tokens in text nodes + key attributes.
  //    Called once on DOM ready; operates only on HTML that was present at
  //    parse time (fragments handle their own interpolation before injection).
  const INTERPOLATED_ATTRS = ['href', 'src', 'alt', 'title', 'aria-label', 'placeholder'];
  function interpolatePage(data) {
    // Text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf('{{') !== -1) textNodes.push(node);
    }
    textNodes.forEach(n => { n.nodeValue = interpolate(n.nodeValue, data); });

    // Attributes
    const selector = INTERPOLATED_ATTRS.map(a => `[${a}*="{{"]`).join(',');
    document.querySelectorAll(selector).forEach(el => {
      INTERPOLATED_ATTRS.forEach(attr => {
        const v = el.getAttribute(attr);
        if (v && v.indexOf('{{') !== -1) el.setAttribute(attr, interpolate(v, data));
      });
    });
  }

  // ── Inject a shared shell part (header, footer, etc.) with token substitution
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
        // Interpolate tokens before injection so the DOM never sees raw {{...}}.
        // Note: <style> tags inside the fragment ARE applied by the browser.
        // <script> tags are NOT executed (security) — put JS in site-shell.js
        // or page-level scripts, not in shell fragments.
        el.outerHTML = interpolate(html, data);
      })
      .catch(err => {
        console.error(`[site-shell] failed to load ${url}:`, err);
        el.innerHTML =
          `<div style="padding:16px;background:#fee;color:#900;` +
          `font-family:system-ui,sans-serif;font-size:13px;` +
          `border:1px solid #f99;border-radius:6px;margin:8px;">` +
          `site-shell: failed to load <code>${site}-${part}.html</code> ` +
          `(${err.message}). If you opened this file directly, see ` +
          `<code>shared/README.md</code> — you need a local HTTP server.` +
          `</div>`;
      });
  }

  // ── Inject CMS content (Phase 2 — disabled until window.BETTERDAY_API_BASE is set)
  function injectContent(el) {
    const API_BASE = window.BETTERDAY_API_BASE;
    if (!API_BASE) return;  // Phase 2 not enabled yet

    const key = el.dataset.content;
    if (!key) return;

    fetch(`${API_BASE}/content/${encodeURIComponent(key)}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(data => {
        if (data && typeof data.html === 'string') {
          el.innerHTML = data.html;
        }
      })
      .catch(err => {
        console.error(`[site-shell] content "${key}" failed:`, err);
      });
  }

  // ── Wire up on DOM ready
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    // Kick off shell injections immediately (they wait for site-data internally)
    document.querySelectorAll('[data-shell]').forEach(injectShellPart);

    // Interpolate tokens in the host page's static HTML once site data is loaded
    loadSiteData().then(data => interpolatePage(data));

    // Phase 2 content injection (no-op until API base is set)
    document.querySelectorAll('[data-content]').forEach(injectContent);
  });
})();
