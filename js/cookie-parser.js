/* ============================================================
   cookie-parser.js – Parse cookie strings into readable table
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM refs ----
  const inputEl = document.getElementById('cookie-input');
  const formatSelect = document.getElementById('cookie-format');
  const outputSection = document.getElementById('cookie-output-section');
  const errorEl = document.getElementById('cookie-error');
  const parseBtn = document.getElementById('cookie-parse-btn');
  const sampleBtn = document.getElementById('cookie-sample-btn');
  const clearBtn = document.getElementById('cookie-clear-btn');
  const copyJsonBtn = document.getElementById('cookie-copy-json-btn');
  const countEl = document.getElementById('cookie-count');
  const tableBody = document.querySelector('#cookie-table tbody');
  const decodedSection = document.getElementById('cookie-decoded-section');
  const decodedEl = document.getElementById('cookie-decoded');

  let lastParsedCookies = [];

  /**
   * Safely decode a URL-encoded string.
   * Only decodes if the value contains valid %XX sequences.
   * Returns { decoded, wasEncoded } where wasEncoded is true if decoding changed the value.
   */
  function safeDecode(value) {
    // Check if value contains any valid percent-encoded sequences
    if (!/%[0-9A-Fa-f]{2}/.test(value)) {
      return { decoded: value, wasEncoded: false };
    }
    try {
      const decoded = decodeURIComponent(value);
      return { decoded, wasEncoded: decoded !== value };
    } catch (_) {
      // Contains % but not valid encoding -- try replacing only valid sequences
      try {
        const decoded = value.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        return { decoded, wasEncoded: decoded !== value };
      } catch (_2) {
        return { decoded: value, wasEncoded: false };
      }
    }
  }

  // ---- Sample cookies ----
  const SAMPLE_HEADER = `session=abc123def456; theme=dark; lang=en-US; _ga=GA1.2.123456789.1234567890; user_prefs=%7B%22notifications%22%3Atrue%2C%22timezone%22%3A%22UTC%22%7D; csrf_token=a1b2c3d4e5f6; _fbp=fb.1.1234567890.987654321`;

  const SAMPLE_SET_COOKIE = `Set-Cookie: session=abc123def456; Domain=.example.com; Path=/; Expires=Thu, 15 Feb 2026 12:00:00 GMT; HttpOnly; Secure; SameSite=Lax
Set-Cookie: theme=dark; Path=/; Max-Age=31536000
Set-Cookie: _ga=GA1.2.123456789.1234567890; Domain=.example.com; Path=/; Expires=Sun, 10 Feb 2028 09:37:39 GMT`;

  // ---- Attribute names (case-insensitive) ----
  const KNOWN_ATTRIBUTES = ['domain', 'path', 'expires', 'max-age', 'samesite', 'secure', 'httponly', 'partitioned'];

  // ---- Parser ----

  /**
   * Parse a cookie header string: "name1=val1; name2=val2"
   * Returns an array of { name, value, decoded, domain, path, expires, flags }
   */
  function parseCookieHeader(str) {
    const cookies = [];
    // Split on ; but not within quoted values
    const parts = str.split(/;\s*/);

    parts.forEach(part => {
      part = part.trim();
      if (!part) return;

      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) return; // Skip flags without values in a header context

      const name = part.substring(0, eqIdx).trim();
      const value = part.substring(eqIdx + 1).trim();

      if (!name) return;

      const { decoded, wasEncoded } = safeDecode(value);

      cookies.push({
        name,
        value,
        decoded: wasEncoded ? decoded : null,
        domain: '',
        path: '',
        expires: '',
        flags: [],
      });
    });

    return cookies;
  }

  /**
   * Parse Set-Cookie lines. Each line may have attributes.
   * Input: one or more lines starting with optional "Set-Cookie:" prefix.
   */
  function parseSetCookieLines(str) {
    const cookies = [];
    const lines = str.split('\n');

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      // Strip "Set-Cookie:" prefix
      if (/^set-cookie:\s*/i.test(line)) {
        line = line.replace(/^set-cookie:\s*/i, '');
      }

      const parts = line.split(/;\s*/);
      if (parts.length === 0) return;

      // First part is name=value
      const first = parts[0].trim();
      const eqIdx = first.indexOf('=');
      if (eqIdx === -1) return;

      const name = first.substring(0, eqIdx).trim();
      const value = first.substring(eqIdx + 1).trim();

      if (!name) return;

      const { decoded, wasEncoded } = safeDecode(value);

      const cookie = {
        name,
        value,
        decoded: wasEncoded ? decoded : null,
        domain: '',
        path: '',
        expires: '',
        maxAge: '',
        flags: [],
      };

      // Parse remaining attributes
      for (let i = 1; i < parts.length; i++) {
        const attr = parts[i].trim();
        if (!attr) continue;

        const attrEq = attr.indexOf('=');
        if (attrEq === -1) {
          // Flag without value (Secure, HttpOnly, etc.)
          cookie.flags.push(attr);
        } else {
          const attrName = attr.substring(0, attrEq).trim().toLowerCase();
          const attrValue = attr.substring(attrEq + 1).trim();

          if (attrName === 'domain') cookie.domain = attrValue;
          else if (attrName === 'path') cookie.path = attrValue;
          else if (attrName === 'expires') cookie.expires = attrValue;
          else if (attrName === 'max-age') cookie.maxAge = attrValue;
          else if (attrName === 'samesite') cookie.flags.push('SameSite=' + attrValue);
          else cookie.flags.push(attr);
        }
      }

      cookies.push(cookie);
    });

    return cookies;
  }

  /**
   * Auto-detect format and parse.
   */
  function autoParse(str) {
    const trimmed = str.trim();

    // If it contains "Set-Cookie:" or has attributes like Domain=, Path=, HttpOnly
    if (/set-cookie:/i.test(trimmed) ||
        /;\s*(Domain|Path|Expires|Max-Age|HttpOnly|Secure|SameSite)\s*[=;]/i.test(trimmed)) {
      return parseSetCookieLines(trimmed);
    }

    // Otherwise treat as a simple cookie header
    return parseCookieHeader(trimmed);
  }

  // ---- Render ----
  function render(cookies) {
    tableBody.innerHTML = '';
    let hasDecoded = false;

    cookies.forEach(cookie => {
      const tr = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.innerHTML = `<code class="cookie-name">${escapeHTML(cookie.name)}</code>`;

      const valueCell = document.createElement('td');
      valueCell.className = 'value-cell';
      const displayVal = cookie.value.length > 80 ? cookie.value.substring(0, 80) + '...' : cookie.value;
      valueCell.innerHTML = `<code>${escapeHTML(displayVal)}</code>`;
      valueCell.title = cookie.value;

      const domainCell = document.createElement('td');
      domainCell.textContent = cookie.domain || '-';

      const pathCell = document.createElement('td');
      pathCell.textContent = cookie.path || '-';

      const expiresCell = document.createElement('td');
      if (cookie.expires) {
        expiresCell.textContent = cookie.expires;
        // Check if expired
        try {
          const expDate = new Date(cookie.expires);
          if (expDate < new Date()) {
            expiresCell.classList.add('expired');
            expiresCell.title = 'This cookie has expired';
          }
        } catch (_) {}
      } else if (cookie.maxAge) {
        expiresCell.textContent = `Max-Age: ${cookie.maxAge}s`;
      } else {
        expiresCell.textContent = 'Session';
        expiresCell.classList.add('session-cookie');
      }

      const flagsCell = document.createElement('td');
      if (cookie.flags.length > 0) {
        flagsCell.innerHTML = cookie.flags.map(f => `<span class="cookie-flag">${escapeHTML(f)}</span>`).join(' ');
      } else {
        flagsCell.textContent = '-';
      }

      tr.appendChild(nameCell);
      tr.appendChild(valueCell);
      tr.appendChild(domainCell);
      tr.appendChild(pathCell);
      tr.appendChild(expiresCell);
      tr.appendChild(flagsCell);
      tableBody.appendChild(tr);

      if (cookie.decoded) hasDecoded = true;
    });

    countEl.textContent = `${cookies.length} cookie${cookies.length !== 1 ? 's' : ''}`;

    // Show decoded values section if any values were URL-encoded
    if (hasDecoded) {
      decodedEl.innerHTML = '';
      cookies.filter(c => c.decoded).forEach(c => {
        const item = document.createElement('div');
        item.className = 'decoded-item';

        const label = document.createElement('strong');
        label.textContent = c.name + ':';
        item.appendChild(label);
        item.appendChild(document.createTextNode('\n'));

        // Try to pretty-print if it looks like JSON
        const jsonResult = tryParseJSON(c.decoded);
        if (jsonResult.data !== null) {
          const pre = document.createElement('pre');
          pre.className = 'decoded-json';
          pre.innerHTML = syntaxHighlightJSON(JSON.stringify(jsonResult.data, null, 2));
          item.appendChild(pre);
        } else {
          item.appendChild(document.createTextNode(c.decoded));
        }

        decodedEl.appendChild(item);
      });
      showEl(decodedSection);
    } else {
      hideEl(decodedSection);
    }

    showEl(outputSection);
  }

  // ---- Main parse action ----
  function doParse() {
    hideError(errorEl);
    hideEl(outputSection);
    lastParsedCookies = [];

    const raw = inputEl.value.trim();
    if (!raw) {
      showError(errorEl, 'Please paste a cookie string.');
      return;
    }

    const format = formatSelect.value;

    try {
      if (format === 'header') {
        lastParsedCookies = parseCookieHeader(raw);
      } else if (format === 'set-cookie') {
        lastParsedCookies = parseSetCookieLines(raw);
      } else {
        lastParsedCookies = autoParse(raw);
      }

      if (lastParsedCookies.length === 0) {
        showError(errorEl, 'No cookies could be parsed from the input.');
        return;
      }

      render(lastParsedCookies);
    } catch (e) {
      showError(errorEl, e.message || 'Failed to parse cookies.');
    }
  }

  // ---- Events ----
  parseBtn.addEventListener('click', doParse);

  sampleBtn.addEventListener('click', () => {
    const format = formatSelect.value;
    if (format === 'set-cookie') {
      inputEl.value = SAMPLE_SET_COOKIE;
    } else {
      inputEl.value = SAMPLE_HEADER;
    }
    hideError(errorEl);
  });

  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    lastParsedCookies = [];
    hideEl(outputSection);
    hideError(errorEl);
  });

  copyJsonBtn.addEventListener('click', () => {
    if (lastParsedCookies.length) {
      const obj = {};
      lastParsedCookies.forEach(c => {
        obj[c.name] = c.decoded || c.value;
      });
      copyToClipboard(JSON.stringify(obj, null, 2), 'Cookies JSON');
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doParse();
    }
  });

})();
