/* ============================================================
   json-viewer.js – JSON Viewer with formatted + tree views
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM refs ----
  const inputEl = document.getElementById('jv-input');
  const outputSection = document.getElementById('jv-output-section');
  const formattedOutput = document.getElementById('jv-formatted-output');
  const treeOutput = document.getElementById('jv-tree-output');
  const errorEl = document.getElementById('jv-error');
  const pathBar = document.getElementById('jv-path-bar');
  const pathText = document.getElementById('jv-path-text');

  const formatBtn = document.getElementById('jv-format-btn');
  const copyBtn = document.getElementById('jv-copy-btn');
  const minifyBtn = document.getElementById('jv-minify-btn');
  const clearBtn = document.getElementById('jv-clear-btn');
  const sampleBtn = document.getElementById('jv-sample-btn');
  const expandAllBtn = document.getElementById('jv-expand-all');
  const collapseAllBtn = document.getElementById('jv-collapse-all');
  const searchToggle = document.getElementById('jv-search-toggle');
  const searchBox = document.getElementById('jv-search-box');
  const searchInput = document.getElementById('jv-search-input');
  const searchCount = document.getElementById('jv-search-count');

  const viewTabs = document.querySelectorAll('#jv-output-section .view-tab');
  const formattedView = document.getElementById('jv-formatted-view');
  const treeView = document.getElementById('jv-tree-view');

  const propsPanel = document.getElementById('jv-props-panel');
  const propsBody = document.getElementById('jv-props-body');

  let currentData = null;
  let currentFormatted = '';

  /**
   * Get the type string for a value.
   */
  function getType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Show properties panel for a selected node.
   */
  function showPropsPanel(key, value, type) {
    propsBody.innerHTML = '';

    const rows = [
      ['Key', key],
      ['Type', type.charAt(0).toUpperCase() + type.slice(1)],
    ];

    if (type === 'string') {
      rows.push(['Length', String(value.length)]);
      rows.push(['Value', value.length > 200 ? value.substring(0, 200) + '...' : value]);
    } else if (type === 'array') {
      rows.push(['Length', String(value.length)]);
    } else if (type === 'object') {
      rows.push(['Keys', String(Object.keys(value).length)]);
    } else if (type === 'number') {
      rows.push(['Value', String(value)]);
    } else if (type === 'boolean') {
      rows.push(['Value', String(value)]);
    } else if (type === 'null') {
      rows.push(['Value', 'null']);
    }

    rows.forEach(([prop, val]) => {
      const tr = document.createElement('tr');
      const tdProp = document.createElement('td');
      tdProp.textContent = prop;
      const tdVal = document.createElement('td');
      tdVal.textContent = val;
      tdVal.className = 'props-value';
      tr.appendChild(tdProp);
      tr.appendChild(tdVal);
      propsBody.appendChild(tr);
    });

    showEl(propsPanel);
  }

  // ---- Sample JSON ----
  const SAMPLE_JSON = JSON.stringify({
    firstName: "John",
    lastName: "Smith",
    age: 32,
    isActive: true,
    balance: null,
    address: {
      streetAddress: "21 2nd Street",
      city: "New York",
      state: "NY",
      postalCode: "10021"
    },
    phoneNumbers: [
      { type: "home", number: "212 555-1234" },
      { type: "fax", number: "646 555-4567" }
    ],
    tags: ["developer", "blogger", "speaker"]
  }, null, 2);

  // ---- View Tab Switching ----
  function getActiveViewId() {
    return formattedView.classList.contains('active') ? 'formatted' : 'tree';
  }

  viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      viewTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const view = tab.dataset.view;
      formattedView.classList.toggle('active', view === 'formatted');
      treeView.classList.toggle('active', view === 'tree');

      // Re-collect matches for the newly active view if search is active
      if (searchVisible && searchInput.value.trim()) {
        collectMatchesForActiveView();
      }
    });
  });

  // ---- Format / Parse ----
  function format() {
    hideError(errorEl);
    hideEl(outputSection);
    hideEl(pathBar);
    currentData = null;
    currentFormatted = '';

    const raw = inputEl.value.trim();
    if (!raw) {
      showError(errorEl, 'Please paste some JSON.');
      return;
    }

    const { data, error } = tryParseJSON(raw);
    if (error) {
      // Attempt auto-fix: single quotes → double quotes
      const fixed = raw.replace(/'/g, '"');
      const retry = tryParseJSON(fixed);
      if (retry.error) {
        showError(errorEl, 'Invalid JSON: ' + error);
        return;
      }
      currentData = retry.data;
    } else {
      currentData = data;
    }

    currentFormatted = JSON.stringify(currentData, null, 2);

    // Render formatted view
    formattedOutput.innerHTML = syntaxHighlightJSON(currentFormatted);

    // Render tree view
    treeOutput.innerHTML = '';
    const treeRoot = buildTree(currentData, 'root', true);
    treeRoot.classList.add('tree-node-root');
    treeOutput.appendChild(treeRoot);

    showEl(outputSection);
  }

  // ---- Tree Builder ----

  /**
   * Recursively build a DOM tree for a JSON value.
   * @param {*} value - The JSON value
   * @param {string} key - The key name (or index)
   * @param {boolean} isRoot - Whether this is the root node
   * @returns {HTMLElement}
   */
  function buildTree(value, key, isRoot) {
    const node = document.createElement('div');
    node.className = 'tree-node';
    const type = getType(value);

    if (value !== null && typeof value === 'object') {
      const isArray = Array.isArray(value);
      const count = isArray ? value.length : Object.keys(value).length;
      const openBracket = isArray ? '[' : '{';
      const closeBracket = isArray ? ']' : '}';

      // Header line (toggle + badge + key + bracket + count)
      const headerLine = document.createElement('div');
      headerLine.className = 'tree-line';

      const toggle = document.createElement('button');
      toggle.className = 'tree-toggle';
      toggle.innerHTML = '&#9660;'; // ▼
      toggle.title = 'Collapse';
      headerLine.appendChild(toggle);

      if (!isRoot) {
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = isNaN(key) ? `"${key}"` : key;
        headerLine.appendChild(keySpan);
        headerLine.appendChild(document.createTextNode(': '));
      }

      const openSpan = document.createElement('span');
      openSpan.className = 'tree-bracket';
      openSpan.textContent = openBracket;
      headerLine.appendChild(openSpan);

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'tree-size';
      sizeSpan.textContent = isArray ? `${count} items` : `${count} keys`;
      headerLine.appendChild(sizeSpan);

      // Path data + store value reference for props panel
      headerLine.dataset.path = key;
      headerLine._nodeValue = value;
      headerLine._nodeType = isArray ? 'array' : 'object';

      node.appendChild(headerLine);

      // Children container
      const children = document.createElement('div');
      children.className = 'tree-children';

      if (isArray) {
        value.forEach((item, i) => {
          children.appendChild(buildTree(item, String(i), false));
        });
      } else {
        Object.entries(value).forEach(([k, v]) => {
          children.appendChild(buildTree(v, k, false));
        });
      }

      node.appendChild(children);

      // Closing bracket
      const closeLine = document.createElement('div');
      closeLine.className = 'tree-line';
      const closeSpan = document.createElement('span');
      closeSpan.className = 'tree-bracket';
      closeSpan.textContent = closeBracket;
      closeLine.appendChild(closeSpan);
      node.appendChild(closeLine);

      // Toggle expand/collapse
      let collapsed = false;
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        collapsed = !collapsed;
        children.classList.toggle('tree-collapsed-children', collapsed);
        closeLine.classList.toggle('hidden', collapsed);
        toggle.innerHTML = collapsed ? '&#9654;' : '&#9660;'; // ▶ / ▼
        toggle.title = collapsed ? 'Expand' : 'Collapse';

        if (collapsed) {
          const preview = isArray ? `[...${count} items]` : `{...${count} keys}`;
          sizeSpan.textContent = preview;
        } else {
          sizeSpan.textContent = isArray ? `${count} items` : `${count} keys`;
        }
      });

      // Click header line to show path + properties
      headerLine.addEventListener('click', () => {
        showPath(headerLine);
        showPropsPanel(key, value, isArray ? 'array' : 'object');
      });

    } else {
      // Primitive value
      const line = document.createElement('div');
      line.className = 'tree-line';

      if (!isRoot) {
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = isNaN(key) ? `"${key}"` : key;
        line.appendChild(keySpan);
        line.appendChild(document.createTextNode(': '));
      }

      const valSpan = document.createElement('span');
      valSpan.className = 'tree-value-clickable';
      if (typeof value === 'string') {
        valSpan.classList.add('tree-string');
        const displayVal = value.length > 120 ? value.substring(0, 120) + '...' : value;
        valSpan.textContent = `"${displayVal}"`;
        valSpan.title = 'Click to copy value';
      } else if (typeof value === 'number') {
        valSpan.classList.add('tree-number');
        valSpan.textContent = String(value);
        valSpan.title = 'Click to copy value';
      } else if (typeof value === 'boolean') {
        valSpan.classList.add('tree-boolean');
        valSpan.textContent = String(value);
        valSpan.title = 'Click to copy value';
      } else if (value === null) {
        valSpan.classList.add('tree-null');
        valSpan.textContent = 'null';
        valSpan.title = 'Click to copy value';
      }

      // Click-to-copy on the value
      valSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const copyVal = value === null ? 'null' : typeof value === 'string' ? value : String(value);
        copyToClipboard(copyVal, 'Value');
      });

      line.appendChild(valSpan);

      // Path data
      line.dataset.path = key;
      line._nodeValue = value;
      line._nodeType = type;

      // Click to show path + properties
      line.addEventListener('click', () => {
        showPath(line);
        showPropsPanel(key, value, type);
      });

      node.appendChild(line);
    }

    return node;
  }

  // ---- Show JSON Path ----
  function showPath(lineEl) {
    const parts = [];
    let el = lineEl;

    while (el) {
      if (el.dataset && el.dataset.path !== undefined && el.dataset.path !== '') {
        const key = el.dataset.path;
        if (key === 'root') {
          parts.unshift('root');
        } else if (/^\d+$/.test(key)) {
          parts.unshift(`[${key}]`);
        } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
          parts.unshift(`.${key}`);
        } else {
          parts.unshift(`["${key}"]`);
        }
      }
      el = el.parentElement;
    }

    let path = parts.join('');
    // Clean up leading dot after root
    path = path.replace('root.', 'root.');

    pathText.textContent = path;
    showEl(pathBar);
  }

  // ---- Expand All / Collapse All ----
  function setAllCollapsed(collapsed) {
    const toggles = treeOutput.querySelectorAll('.tree-toggle');
    toggles.forEach(toggle => {
      const node = toggle.closest('.tree-node');
      if (!node) return;
      const children = node.querySelector('.tree-children');
      const closeLine = node.querySelector(':scope > .tree-line:last-child');

      if (children) {
        children.classList.toggle('tree-collapsed-children', collapsed);
      }
      // Re-find the actual close bracket line (the last .tree-line child of this node)
      const treeLines = node.querySelectorAll(':scope > .tree-line');
      if (treeLines.length > 1) {
        const last = treeLines[treeLines.length - 1];
        last.classList.toggle('hidden', collapsed);
      }
      toggle.innerHTML = collapsed ? '&#9654;' : '&#9660;';
      toggle.title = collapsed ? 'Expand' : 'Collapse';

      // Update size label
      const sizeSpan = toggle.parentElement.querySelector('.tree-size');
      if (sizeSpan) {
        const text = sizeSpan.textContent;
        const match = text.match(/(\d+)\s+(items|keys)/);
        if (match) {
          const count = match[1];
          const type = match[2];
          if (collapsed) {
            sizeSpan.textContent = type === 'items' ? `[...${count} items]` : `{...${count} keys}`;
          } else {
            sizeSpan.textContent = `${count} ${type}`;
          }
        }
      }
    });
  }

  expandAllBtn.addEventListener('click', () => setAllCollapsed(false));
  collapseAllBtn.addEventListener('click', () => setAllCollapsed(true));

  // ---- Search with navigation ----
  let searchVisible = false;
  let allMatchElements = [];  // all .tree-highlight spans across both views
  let activeMatchIndex = -1;

  const searchPrevBtn = document.getElementById('jv-search-prev');
  const searchNextBtn = document.getElementById('jv-search-next');

  searchToggle.addEventListener('click', () => {
    searchVisible = !searchVisible;
    searchBox.style.display = searchVisible ? 'flex' : 'none';
    if (searchVisible) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      clearSearchHighlights();
      resetSearchState();
    }
  });

  function resetSearchState() {
    allMatchElements = [];
    activeMatchIndex = -1;
    searchCount.textContent = '';
    updateNavButtons();
  }

  function updateNavButtons() {
    const hasMatches = allMatchElements.length > 0;
    searchPrevBtn.disabled = !hasMatches;
    searchNextBtn.disabled = !hasMatches;
  }

  function updateCountLabel() {
    const total = allMatchElements.length;
    if (total === 0) {
      searchCount.textContent = '0 matches';
    } else {
      searchCount.textContent = `${activeMatchIndex + 1} / ${total}`;
    }
  }

  function setActiveMatch(index) {
    // Remove active class from previous
    if (activeMatchIndex >= 0 && activeMatchIndex < allMatchElements.length) {
      allMatchElements[activeMatchIndex].classList.remove('tree-highlight-active');
    }

    activeMatchIndex = index;

    if (activeMatchIndex >= 0 && activeMatchIndex < allMatchElements.length) {
      const el = allMatchElements[activeMatchIndex];
      el.classList.add('tree-highlight-active');

      // Scroll the element into view
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }

    updateCountLabel();
  }

  function navigateNext() {
    if (allMatchElements.length === 0) return;
    const next = (activeMatchIndex + 1) % allMatchElements.length;
    setActiveMatch(next);
  }

  function navigatePrev() {
    if (allMatchElements.length === 0) return;
    const prev = (activeMatchIndex - 1 + allMatchElements.length) % allMatchElements.length;
    setActiveMatch(prev);
  }

  function performSearch() {
    const query = searchInput.value.trim().toLowerCase();
    clearSearchHighlights();
    resetSearchState();

    if (!query) return;

    // Highlight in formatted view
    if (currentFormatted) {
      const highlighted = highlightInFormatted(currentFormatted, query);
      formattedOutput.innerHTML = highlighted.html;
    }

    // Highlight in tree view
    const treeLines = treeOutput.querySelectorAll('.tree-line');
    treeLines.forEach(line => {
      const text = line.textContent.toLowerCase();
      if (text.includes(query)) {
        expandParents(line);
        highlightTextInElement(line, query);
      }
    });

    // Collect matches only from the active view
    collectMatchesForActiveView();
  }

  /**
   * Collect highlight elements from the currently visible view only,
   * reset index, and jump to the first match.
   */
  function collectMatchesForActiveView() {
    // Clear previous active highlight
    if (activeMatchIndex >= 0 && activeMatchIndex < allMatchElements.length) {
      allMatchElements[activeMatchIndex].classList.remove('tree-highlight-active');
    }

    const activeView = getActiveViewId();
    const selector = activeView === 'formatted'
      ? '#jv-formatted-output .tree-highlight'
      : '#jv-tree-output .tree-highlight';

    allMatchElements = Array.from(document.querySelectorAll(selector));
    activeMatchIndex = -1;

    updateNavButtons();

    if (allMatchElements.length > 0) {
      setActiveMatch(0);
    } else {
      searchCount.textContent = '0 matches';
    }
  }

  searchInput.addEventListener('input', () => {
    performSearch();
  });

  // Enter = go to next, Shift+Enter = go to previous
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (allMatchElements.length === 0) {
        performSearch();
      } else if (e.shiftKey) {
        navigatePrev();
      } else {
        navigateNext();
      }
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      clearSearchHighlights();
      resetSearchState();
    }
  });

  searchNextBtn.addEventListener('click', navigateNext);
  searchPrevBtn.addEventListener('click', navigatePrev);

  function clearSearchHighlights() {
    // Remove all highlights (both regular and active)
    document.querySelectorAll('.tree-highlight, .tree-highlight-active').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      }
    });

    // Re-render formatted output without highlights
    if (currentFormatted) {
      formattedOutput.innerHTML = syntaxHighlightJSON(currentFormatted);
    }
  }

  function highlightTextInElement(el, query) {
    // Walk text nodes and wrap matches
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(textNode => {
      const text = textNode.textContent;
      const lower = text.toLowerCase();
      const idx = lower.indexOf(query);
      if (idx === -1) return;

      const before = text.substring(0, idx);
      const match = text.substring(idx, idx + query.length);
      const after = text.substring(idx + query.length);

      const span = document.createElement('span');
      span.className = 'tree-highlight';
      span.textContent = match;

      const parent = textNode.parentNode;
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(span);
      if (after) frag.appendChild(document.createTextNode(after));
      parent.replaceChild(frag, textNode);
    });
  }

  function highlightInFormatted(json, query) {
    // First syntax highlight, then overlay search highlights
    let html = syntaxHighlightJSON(json);
    let count = 0;

    // We need to search in the text content, not the HTML
    // Simple approach: search in the original JSON string and note positions
    const lower = json.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(query, idx)) !== -1) {
      count++;
      idx += query.length;
    }

    // Highlight in the HTML by wrapping matches carefully
    // Use a temporary element to manipulate
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const walker = document.createTreeWalker(temp, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      const tLower = text.toLowerCase();
      if (!tLower.includes(query)) return;

      const parts = [];
      let lastIdx = 0;
      let searchIdx = 0;
      while ((searchIdx = tLower.indexOf(query, lastIdx)) !== -1) {
        if (searchIdx > lastIdx) {
          parts.push(document.createTextNode(text.substring(lastIdx, searchIdx)));
        }
        const highlight = document.createElement('span');
        highlight.className = 'tree-highlight';
        highlight.textContent = text.substring(searchIdx, searchIdx + query.length);
        parts.push(highlight);
        lastIdx = searchIdx + query.length;
      }
      if (lastIdx < text.length) {
        parts.push(document.createTextNode(text.substring(lastIdx)));
      }

      const frag = document.createDocumentFragment();
      parts.forEach(p => frag.appendChild(p));
      textNode.parentNode.replaceChild(frag, textNode);
    });

    return { html: temp.innerHTML, count };
  }

  function expandParents(el) {
    let parent = el.parentElement;
    while (parent && !parent.classList.contains('tree-container')) {
      if (parent.classList.contains('tree-collapsed-children')) {
        parent.classList.remove('tree-collapsed-children');
        // Update the toggle button
        const node = parent.parentElement;
        if (node) {
          const toggle = node.querySelector(':scope > .tree-line .tree-toggle');
          if (toggle) {
            toggle.innerHTML = '&#9660;';
            toggle.title = 'Collapse';
          }
          // Show closing bracket
          const treeLines = node.querySelectorAll(':scope > .tree-line');
          if (treeLines.length > 1) {
            treeLines[treeLines.length - 1].classList.remove('hidden');
          }
        }
      }
      parent = parent.parentElement;
    }
  }

  // ---- Events ----
  formatBtn.addEventListener('click', format);

  copyBtn.addEventListener('click', () => {
    if (currentFormatted) {
      copyToClipboard(currentFormatted, 'Formatted JSON');
    }
  });

  minifyBtn.addEventListener('click', () => {
    if (currentData !== null) {
      const minified = JSON.stringify(currentData);
      copyToClipboard(minified, 'Minified JSON');
    }
  });

  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    currentData = null;
    currentFormatted = '';
    hideEl(outputSection);
    hideEl(pathBar);
    hideEl(propsPanel);
    hideError(errorEl);
    searchInput.value = '';
    searchCount.textContent = '';
  });

  sampleBtn.addEventListener('click', () => {
    inputEl.value = SAMPLE_JSON;
    hideError(errorEl);
  });

  // Format on Ctrl/Cmd + Enter
  inputEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      format();
    }
  });

})();
