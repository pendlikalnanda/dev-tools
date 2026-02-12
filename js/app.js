/* ============================================================
   app.js – Tab navigation & shared utilities
   ============================================================ */

(function () {
  'use strict';

  // ---- Tab Navigation ----
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      panels.forEach(p => p.classList.remove('active'));
      const panel = document.getElementById(target);
      if (panel) panel.classList.add('active');
    });
  });

  // ---- Shared Utilities ----

  /**
   * Copy text to clipboard and show a toast.
   */
  window.copyToClipboard = function (text, label) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(label ? `${label} copied!` : 'Copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(label ? `${label} copied!` : 'Copied to clipboard!');
    });
  };

  /**
   * Show a brief toast notification.
   */
  window.showToast = function (message) {
    // Remove any existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 2200);
  };

  /**
   * Syntax-highlight a JSON string for display in a <pre>.
   * Returns an HTML string with <span> classes.
   */
  window.syntaxHighlightJSON = function (json) {
    if (typeof json !== 'string') {
      json = JSON.stringify(json, null, 2);
    }
    // Escape HTML
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return json.replace(
      /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|\bnull\b|[{}\[\],])/g,
      function (match) {
        let cls = 'syn-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'syn-key';
          } else {
            cls = 'syn-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'syn-boolean';
        } else if (/null/.test(match)) {
          cls = 'syn-null';
        } else if (/[{}\[\],]/.test(match)) {
          cls = 'syn-bracket';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      }
    );
  };

  /**
   * Show/hide an element by toggling .hidden
   */
  window.showEl = function (el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.classList.remove('hidden');
  };

  window.hideEl = function (el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.classList.add('hidden');
  };

  /**
   * Set error message in an error element.
   */
  window.showError = function (el, message) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  };

  window.hideError = function (el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) {
      el.textContent = '';
      el.classList.add('hidden');
    }
  };

  /**
   * Try to parse JSON, returns { data, error }.
   */
  window.tryParseJSON = function (str) {
    try {
      return { data: JSON.parse(str), error: null };
    } catch (e) {
      return { data: null, error: e.message };
    }
  };

  /**
   * Escape HTML entities in a string.
   */
  window.escapeHTML = function (str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

})();
