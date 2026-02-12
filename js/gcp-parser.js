/* ============================================================
   gcp-parser.js – Parse GCP JSON logs and extract message payload
   ============================================================ */

(function () {
  'use strict';

  const inputEl = document.getElementById('gcp-input');
  const outputSection = document.getElementById('gcp-output-section');
  const outputEl = document.getElementById('gcp-output');
  const errorEl = document.getElementById('gcp-error');
  const parseBtn = document.getElementById('gcp-parse-btn');
  const copyBtn = document.getElementById('gcp-copy-btn');
  const clearBtn = document.getElementById('gcp-clear-btn');
  const sampleBtn = document.getElementById('gcp-sample-btn');

  let lastParsedJSON = '';

  // ---- Sample GCP log ----
  const SAMPLE_LOG = JSON.stringify({
    insertId: "bmtblidtk3ikucry",
    jsonPayload: {
      timestamp: "2026-02-10 09:37:39",
      span_id: "3d07d165257462e8",
      level: "info",
      service: "oms-middleware",
      trace_id: "dc98de4ef0a76eebad493a7b5fc4f912",
      correlationId: "66b4de22-69f2-4983-ac04-5a1b3c053b37",
      trace_flags: "01",
      message: 'Started processing Shipment Update topic Events - {"payload":{"shipment_id":"17707162574121508307","shipment":{"credit_note_id":null,"parent_id":"","status":"placed","fynd_order_id":"FY698AFC610192F44DC9","tags":["bag"],"meta":{"sla":1770733800,"order_type":"HomeDelivery","shipment_type":"3P","payment_status":"Unpaid"}}}}'
    },
    resource: {
      type: "k8s_container",
      labels: { project_id: "my-project", cluster_name: "prod-cluster" }
    },
    severity: "INFO",
    timestamp: "2026-02-10T09:37:39.123456Z",
    logName: "projects/my-project/logs/stdout"
  }, null, 2);

  // ---- Parse Logic ----
  function parse() {
    hideError(errorEl);
    hideEl(outputSection);
    lastParsedJSON = '';

    const raw = inputEl.value.trim();
    if (!raw) {
      showError(errorEl, 'Please paste a GCP log entry.');
      return;
    }

    // Try to parse the outer JSON
    const { data, error } = tryParseJSON(raw);
    if (error) {
      // Maybe it's multiple log lines — try the first line
      const firstLine = raw.split('\n').find(l => l.trim().startsWith('{'));
      if (firstLine) {
        const retry = tryParseJSON(firstLine.trim());
        if (retry.error) {
          showError(errorEl, 'Invalid JSON: ' + error);
          return;
        }
        return processLogEntry(retry.data);
      }
      showError(errorEl, 'Invalid JSON: ' + error);
      return;
    }

    processLogEntry(data);
  }

  function processLogEntry(logObj) {
    // Try common GCP log structures
    let message = null;

    // Path 1: jsonPayload.message
    if (logObj.jsonPayload && typeof logObj.jsonPayload.message === 'string') {
      message = logObj.jsonPayload.message;
    }
    // Path 2: textPayload
    else if (typeof logObj.textPayload === 'string') {
      message = logObj.textPayload;
    }
    // Path 3: jsonPayload itself (if no message field, show the whole jsonPayload)
    else if (logObj.jsonPayload) {
      lastParsedJSON = JSON.stringify(logObj.jsonPayload, null, 2);
      renderOutput(lastParsedJSON);
      return;
    }
    // Path 4: Just show the input as-is if we can't find a known structure
    else {
      showError(errorEl, 'Could not find jsonPayload.message or textPayload in this log entry. Showing full object.');
      lastParsedJSON = JSON.stringify(logObj, null, 2);
      renderOutput(lastParsedJSON);
      return;
    }

    // Try to extract JSON from the message string
    const extracted = extractJSONFromMessage(message);
    if (extracted) {
      lastParsedJSON = JSON.stringify(extracted, null, 2);
    } else {
      // No embedded JSON found — show the raw message
      lastParsedJSON = message;
    }

    renderOutput(lastParsedJSON);
  }

  /**
   * Given a message string like:
   *   "Started processing Shipment Update topic Events - {\"payload\":{...}}"
   * Find the first '{' or '[', extract from there, and parse as JSON.
   */
  function extractJSONFromMessage(message) {
    // Find the first occurrence of { or [
    const braceIdx = message.indexOf('{');
    const bracketIdx = message.indexOf('[');

    let startIdx = -1;
    if (braceIdx === -1 && bracketIdx === -1) return null;
    if (braceIdx === -1) startIdx = bracketIdx;
    else if (bracketIdx === -1) startIdx = braceIdx;
    else startIdx = Math.min(braceIdx, bracketIdx);

    const candidate = message.substring(startIdx);

    // Try parsing directly
    const result = tryParseJSON(candidate);
    if (result.data !== null) return result.data;

    // Sometimes the JSON is double-escaped — try unescaping once
    try {
      const unescaped = candidate.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const result2 = tryParseJSON(unescaped);
      if (result2.data !== null) return result2.data;
    } catch (_) {}

    // Try JSON.parse on the whole message (maybe it's just a JSON string)
    const wholeResult = tryParseJSON(message);
    if (wholeResult.data !== null) return wholeResult.data;

    return null;
  }

  function renderOutput(text) {
    // Check if it's valid JSON for syntax highlighting
    const parsed = tryParseJSON(text);
    if (parsed.data !== null) {
      outputEl.innerHTML = syntaxHighlightJSON(JSON.stringify(parsed.data, null, 2));
    } else {
      outputEl.textContent = text;
    }
    showEl(outputSection);
  }

  // ---- Events ----
  parseBtn.addEventListener('click', parse);

  copyBtn.addEventListener('click', () => {
    if (lastParsedJSON) {
      copyToClipboard(lastParsedJSON, 'JSON');
    }
  });

  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    lastParsedJSON = '';
    hideEl(outputSection);
    hideError(errorEl);
  });

  sampleBtn.addEventListener('click', () => {
    inputEl.value = SAMPLE_LOG;
    hideError(errorEl);
  });

  // Parse on Ctrl/Cmd + Enter
  inputEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      parse();
    }
  });

})();
