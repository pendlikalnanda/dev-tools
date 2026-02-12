/* ============================================================
   curl-parser.js – Parse cURL commands into structured parts
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM refs ----
  const inputEl = document.getElementById('curl-input');
  const outputSection = document.getElementById('curl-output-section');
  const errorEl = document.getElementById('curl-error');
  const parseBtn = document.getElementById('curl-parse-btn');
  const sampleBtn = document.getElementById('curl-sample-btn');

  const methodEl = document.getElementById('curl-method');
  const urlEl = document.getElementById('curl-url');
  const paramsSection = document.getElementById('curl-params-section');
  const paramsTableBody = document.querySelector('#curl-params-table tbody');
  const headersSection = document.getElementById('curl-headers-section');
  const headersTableBody = document.querySelector('#curl-headers-table tbody');
  const bodySection = document.getElementById('curl-body-section');
  const bodyOutput = document.getElementById('curl-body-output');
  const reconstructedEl = document.getElementById('curl-reconstructed');

  const copyUrlBtn = document.getElementById('curl-copy-url-btn');
  const copyParamsBtn = document.getElementById('curl-copy-params-btn');
  const copyHeadersBtn = document.getElementById('curl-copy-headers-btn');
  const copyBodyBtn = document.getElementById('curl-copy-body-btn');
  const copyReconstructedBtn = document.getElementById('curl-copy-reconstructed-btn');

  let lastParsed = null;

  // ---- Sample cURL ----
  const SAMPLE_CURL = `curl 'https://api.example.com/v2/users?page=1&limit=25&sort=created_at' \\
  -X POST \\
  -H 'Accept: application/json' \\
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjo0Mn0.fake' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Request-ID: 9f8b3c2a-1d4e-5f6a-7b8c-9d0e1f2a3b4c' \\
  --data-raw '{"name":"John Doe","email":"john@example.com","role":"admin"}'`;

  // ---- Parser ----

  /**
   * Parse a cURL command string into structured parts.
   * Returns { method, url, baseUrl, queryParams, headers, body, cookies, flags }
   */
  function parseCurl(curlStr) {
    // Normalize: join continuation lines (backslash + newline)
    let normalized = curlStr
      .replace(/\\\s*\n/g, ' ')
      .replace(/\\\s*\r\n/g, ' ')
      .trim();

    // Remove leading 'curl' keyword
    if (normalized.toLowerCase().startsWith('curl ')) {
      normalized = normalized.substring(5).trim();
    } else if (normalized.toLowerCase() === 'curl') {
      throw new Error('Empty cURL command.');
    }

    const result = {
      method: 'GET',
      url: '',
      baseUrl: '',
      queryParams: [],
      headers: [],
      body: null,
      cookies: [],
      compressed: false,
      insecure: false,
      location: false,
    };

    // Tokenize respecting quotes
    const tokens = tokenize(normalized);

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];

      if (token === '-X' || token === '--request') {
        i++;
        if (i < tokens.length) result.method = tokens[i].toUpperCase();
      } else if (token === '-H' || token === '--header') {
        i++;
        if (i < tokens.length) {
          const headerStr = tokens[i];
          const colonIdx = headerStr.indexOf(':');
          if (colonIdx > 0) {
            const key = headerStr.substring(0, colonIdx).trim();
            const value = headerStr.substring(colonIdx + 1).trim();
            // Check for Cookie header
            if (key.toLowerCase() === 'cookie') {
              result.cookies.push(value);
            }
            result.headers.push({ key, value });
          }
        }
      } else if (token === '-d' || token === '--data' || token === '--data-raw' ||
                 token === '--data-binary' || token === '--data-urlencode' ||
                 token === '--data-ascii') {
        i++;
        if (i < tokens.length) {
          result.body = tokens[i];
          // If body is set and method is still GET, change to POST
          if (result.method === 'GET') result.method = 'POST';
        }
      } else if (token === '-b' || token === '--cookie') {
        i++;
        if (i < tokens.length) result.cookies.push(tokens[i]);
      } else if (token === '-u' || token === '--user') {
        i++;
        if (i < tokens.length) {
          // Basic auth: user:pass
          result.headers.push({ key: 'Authorization', value: 'Basic ' + btoa(tokens[i]) });
        }
      } else if (token === '--compressed') {
        result.compressed = true;
      } else if (token === '-k' || token === '--insecure') {
        result.insecure = true;
      } else if (token === '-L' || token === '--location') {
        result.location = true;
      } else if (token === '-A' || token === '--user-agent') {
        i++;
        if (i < tokens.length) {
          result.headers.push({ key: 'User-Agent', value: tokens[i] });
        }
      } else if (token === '-e' || token === '--referer') {
        i++;
        if (i < tokens.length) {
          result.headers.push({ key: 'Referer', value: tokens[i] });
        }
      } else if (token.startsWith('-') && !token.startsWith('--')) {
        // Unknown short flag — skip its argument if it seems to have one
        // (heuristic: skip next token if it doesn't start with -)
        if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          i++;
        }
      } else if (token.startsWith('--')) {
        // Unknown long flag — skip next token if applicable
        if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          i++;
        }
      } else {
        // This is the URL
        if (!result.url) {
          result.url = token;
        }
      }

      i++;
    }

    if (!result.url) {
      throw new Error('No URL found in cURL command.');
    }

    // Parse URL into base + query params
    try {
      const urlObj = new URL(result.url);
      result.baseUrl = urlObj.origin + urlObj.pathname;
      urlObj.searchParams.forEach((value, key) => {
        result.queryParams.push({ key, value });
      });
    } catch (e) {
      result.baseUrl = result.url;
    }

    return result;
  }

  /**
   * Tokenize a string respecting single/double quotes.
   * "curl -H 'Content-Type: application/json'" → ["curl", "-H", "Content-Type: application/json"]
   */
  function tokenize(str) {
    const tokens = [];
    let i = 0;
    const len = str.length;

    while (i < len) {
      // Skip whitespace
      while (i < len && /\s/.test(str[i])) i++;
      if (i >= len) break;

      const ch = str[i];

      if (ch === "'" || ch === '"') {
        // Quoted token
        const quote = ch;
        i++; // skip opening quote
        let token = '';
        while (i < len && str[i] !== quote) {
          if (str[i] === '\\' && i + 1 < len) {
            // Escaped char inside quotes
            i++;
            token += str[i];
          } else {
            token += str[i];
          }
          i++;
        }
        i++; // skip closing quote
        tokens.push(token);
      } else if (ch === '$' && i + 1 < len && str[i + 1] === "'") {
        // $'...' ANSI-C quoting
        i += 2;
        let token = '';
        while (i < len && str[i] !== "'") {
          if (str[i] === '\\' && i + 1 < len) {
            i++;
            if (str[i] === 'n') token += '\n';
            else if (str[i] === 't') token += '\t';
            else if (str[i] === 'r') token += '\r';
            else if (str[i] === '\\') token += '\\';
            else if (str[i] === "'") token += "'";
            else token += '\\' + str[i];
          } else {
            token += str[i];
          }
          i++;
        }
        i++; // skip closing quote
        tokens.push(token);
      } else {
        // Unquoted token
        let token = '';
        while (i < len && !/\s/.test(str[i])) {
          if (str[i] === '\\' && i + 1 < len) {
            i++;
            token += str[i];
          } else {
            token += str[i];
          }
          i++;
        }
        tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * Reconstruct a clean cURL command from parsed parts.
   */
  function reconstructCurl(parsed) {
    const parts = ['curl'];

    if (parsed.method !== 'GET') {
      parts.push(`-X ${parsed.method}`);
    }

    parts.push(`'${parsed.url}'`);

    parsed.headers.forEach(h => {
      parts.push(`  -H '${h.key}: ${h.value}'`);
    });

    if (parsed.body) {
      const escaped = parsed.body.replace(/'/g, "'\\''");
      parts.push(`  --data-raw '${escaped}'`);
    }

    if (parsed.compressed) parts.push('  --compressed');
    if (parsed.insecure) parts.push('  -k');
    if (parsed.location) parts.push('  -L');

    return parts.join(' \\\n');
  }

  // ---- Render ----
  function render(parsed) {
    // Method
    methodEl.textContent = parsed.method;
    methodEl.className = 'parsed-value badge-method method-' + parsed.method.toLowerCase();

    // URL
    urlEl.textContent = parsed.url;

    // Query Params
    paramsTableBody.innerHTML = '';
    if (parsed.queryParams.length > 0) {
      parsed.queryParams.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><code>${escapeHTML(p.key)}</code></td><td><code>${escapeHTML(decodeURIComponent(p.value))}</code></td>`;
        paramsTableBody.appendChild(tr);
      });
      showEl(paramsSection);
    } else {
      hideEl(paramsSection);
    }

    // Headers
    headersTableBody.innerHTML = '';
    if (parsed.headers.length > 0) {
      parsed.headers.forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><code>${escapeHTML(h.key)}</code></td><td class="value-cell"><code>${escapeHTML(h.value)}</code></td>`;
        headersTableBody.appendChild(tr);
      });
      showEl(headersSection);
    } else {
      hideEl(headersSection);
    }

    // Body
    if (parsed.body) {
      // Try to pretty-print if JSON
      const jsonResult = tryParseJSON(parsed.body);
      if (jsonResult.data !== null) {
        bodyOutput.innerHTML = syntaxHighlightJSON(JSON.stringify(jsonResult.data, null, 2));
      } else {
        bodyOutput.textContent = parsed.body;
      }
      showEl(bodySection);
    } else {
      hideEl(bodySection);
    }

    // Reconstructed
    reconstructedEl.textContent = reconstructCurl(parsed);

    showEl(outputSection);
  }

  // ---- Main parse action ----
  function doParse() {
    hideError(errorEl);
    hideEl(outputSection);
    lastParsed = null;

    const raw = inputEl.value.trim();
    if (!raw) {
      showError(errorEl, 'Please paste a cURL command.');
      return;
    }

    try {
      lastParsed = parseCurl(raw);
      render(lastParsed);
    } catch (e) {
      showError(errorEl, e.message || 'Failed to parse cURL command.');
    }
  }

  // ---- Events ----
  parseBtn.addEventListener('click', doParse);

  sampleBtn.addEventListener('click', () => {
    inputEl.value = SAMPLE_CURL;
    hideError(errorEl);
  });

  copyUrlBtn.addEventListener('click', () => {
    if (lastParsed) copyToClipboard(lastParsed.url, 'URL');
  });

  copyParamsBtn.addEventListener('click', () => {
    if (lastParsed && lastParsed.queryParams.length) {
      const obj = {};
      lastParsed.queryParams.forEach(p => { obj[p.key] = decodeURIComponent(p.value); });
      copyToClipboard(JSON.stringify(obj, null, 2), 'Query params');
    }
  });

  copyHeadersBtn.addEventListener('click', () => {
    if (lastParsed && lastParsed.headers.length) {
      const obj = {};
      lastParsed.headers.forEach(h => { obj[h.key] = h.value; });
      copyToClipboard(JSON.stringify(obj, null, 2), 'Headers');
    }
  });

  copyBodyBtn.addEventListener('click', () => {
    if (lastParsed && lastParsed.body) {
      const jsonResult = tryParseJSON(lastParsed.body);
      const text = jsonResult.data !== null ? JSON.stringify(jsonResult.data, null, 2) : lastParsed.body;
      copyToClipboard(text, 'Body');
    }
  });

  copyReconstructedBtn.addEventListener('click', () => {
    if (lastParsed) copyToClipboard(reconstructCurl(lastParsed), 'cURL');
  });

  inputEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doParse();
    }
  });

})();
