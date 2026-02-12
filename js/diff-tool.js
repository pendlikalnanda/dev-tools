/* ============================================================
   diff-tool.js – Side-by-side file diff with jsdiff
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM refs ----
  const leftInput = document.getElementById('diff-left');
  const rightInput = document.getElementById('diff-right');
  const formatSelect = document.getElementById('diff-format');
  const compareBtn = document.getElementById('diff-compare-btn');
  const swapBtn = document.getElementById('diff-swap-btn');
  const clearBtn = document.getElementById('diff-clear-btn');
  const outputSection = document.getElementById('diff-output-section');
  const outputEl = document.getElementById('diff-output');
  const statsEl = document.getElementById('diff-stats');
  const errorEl = document.getElementById('diff-error');

  // ---- Compare Logic ----
  function compare() {
    hideError(errorEl);
    hideEl(outputSection);

    let leftText = leftInput.value;
    let rightText = rightInput.value;

    if (!leftText.trim() && !rightText.trim()) {
      showError(errorEl, 'Please paste content into at least one side.');
      return;
    }

    const format = formatSelect.value;

    // If JSON mode, normalize both sides
    if (format === 'json') {
      const leftParsed = tryParseJSON(leftText.trim());
      const rightParsed = tryParseJSON(rightText.trim());

      if (leftText.trim() && leftParsed.error) {
        showError(errorEl, 'File A contains invalid JSON: ' + leftParsed.error);
        return;
      }
      if (rightText.trim() && rightParsed.error) {
        showError(errorEl, 'File B contains invalid JSON: ' + rightParsed.error);
        return;
      }

      leftText = leftParsed.data !== null ? JSON.stringify(leftParsed.data, null, 2) : '';
      rightText = rightParsed.data !== null ? JSON.stringify(rightParsed.data, null, 2) : '';
    }

    // Compute line-level diff
    const lineDiff = Diff.diffLines(leftText, rightText);

    renderSideBySide(lineDiff, leftText, rightText);
    showEl(outputSection);
  }

  // ---- Side-by-Side Renderer ----
  function renderSideBySide(changes, leftText, rightText) {
    outputEl.innerHTML = '';

    const leftSide = document.createElement('div');
    leftSide.className = 'diff-side';
    const rightSide = document.createElement('div');
    rightSide.className = 'diff-side';

    // Headers
    const leftHeader = document.createElement('div');
    leftHeader.className = 'diff-side-header';
    leftHeader.textContent = 'File A (Original)';
    leftSide.appendChild(leftHeader);

    const rightHeader = document.createElement('div');
    rightHeader.className = 'diff-side-header';
    rightHeader.textContent = 'File B (Modified)';
    rightSide.appendChild(rightHeader);

    let leftLineNum = 1;
    let rightLineNum = 1;
    let additions = 0;
    let removals = 0;

    changes.forEach(change => {
      const lines = change.value.replace(/\n$/, '').split('\n');

      if (change.added) {
        // Added lines — show on right, empty on left
        lines.forEach(line => {
          leftSide.appendChild(createDiffLine('', '', 'diff-line-empty'));
          rightSide.appendChild(createDiffLine(rightLineNum, line, 'diff-line-add'));
          rightLineNum++;
          additions++;
        });
      } else if (change.removed) {
        // Removed lines — show on left, empty on right
        lines.forEach(line => {
          leftSide.appendChild(createDiffLine(leftLineNum, line, 'diff-line-remove'));
          rightSide.appendChild(createDiffLine('', '', 'diff-line-empty'));
          leftLineNum++;
          removals++;
        });
      } else {
        // Unchanged
        lines.forEach(line => {
          leftSide.appendChild(createDiffLine(leftLineNum, line, ''));
          rightSide.appendChild(createDiffLine(rightLineNum, line, ''));
          leftLineNum++;
          rightLineNum++;
        });
      }
    });

    // Now do a second pass — try to pair up adjacent remove+add blocks for word-level diff
    pairAndHighlightWordDiffs(leftSide, rightSide);

    outputEl.appendChild(leftSide);
    outputEl.appendChild(rightSide);

    // Stats
    const parts = [];
    if (additions > 0) parts.push(`+${additions} added`);
    if (removals > 0) parts.push(`-${removals} removed`);
    if (additions === 0 && removals === 0) parts.push('No differences');
    statsEl.textContent = parts.join(', ');
  }

  function createDiffLine(lineNum, content, className) {
    const line = document.createElement('div');
    line.className = 'diff-line' + (className ? ' ' + className : '');

    const numEl = document.createElement('span');
    numEl.className = 'diff-line-num';
    numEl.textContent = lineNum;

    const contentEl = document.createElement('span');
    contentEl.className = 'diff-line-content';
    contentEl.textContent = content;

    line.appendChild(numEl);
    line.appendChild(contentEl);

    return line;
  }

  /**
   * Find adjacent remove + add blocks and apply word-level diff highlighting.
   */
  function pairAndHighlightWordDiffs(leftSide, rightSide) {
    const leftLines = Array.from(leftSide.querySelectorAll('.diff-line'));
    const rightLines = Array.from(rightSide.querySelectorAll('.diff-line'));

    // Skip header (index 0 is the header div, but it's not a .diff-line)
    // Find sequences of remove on left paired with add on right
    let i = 0;
    while (i < leftLines.length && i < rightLines.length) {
      const leftLine = leftLines[i];
      const rightLine = rightLines[i];

      const isLeftRemove = leftLine.classList.contains('diff-line-remove');
      const isRightAdd = rightLine.classList.contains('diff-line-add');
      const isLeftEmpty = leftLine.classList.contains('diff-line-empty');
      const isRightEmpty = rightLine.classList.contains('diff-line-empty');

      // If left is remove and right is empty, and right's next is add and left's next is empty,
      // they belong to a paired change block — but jsdiff outputs remove block then add block.
      // Our current side-by-side render already places removes on left with empties on right,
      // and adds on right with empties on left. We need to find where remove block and add block
      // are adjacent.

      // Actually let's re-pair: find consecutive remove-empty and empty-add runs
      if (isLeftRemove && isRightEmpty) {
        // Start of a remove block
        const removeStart = i;
        let removeEnd = i;
        while (removeEnd + 1 < leftLines.length &&
               leftLines[removeEnd + 1].classList.contains('diff-line-remove') &&
               rightLines[removeEnd + 1].classList.contains('diff-line-empty')) {
          removeEnd++;
        }

        // Check if the next block is an add block
        const addStart = removeEnd + 1;
        if (addStart < leftLines.length &&
            leftLines[addStart].classList.contains('diff-line-empty') &&
            rightLines[addStart].classList.contains('diff-line-add')) {

          let addEnd = addStart;
          while (addEnd + 1 < leftLines.length &&
                 leftLines[addEnd + 1].classList.contains('diff-line-empty') &&
                 rightLines[addEnd + 1].classList.contains('diff-line-add')) {
            addEnd++;
          }

          // Pair up the blocks for word-level diff
          const removeCount = removeEnd - removeStart + 1;
          const addCount = addEnd - addStart + 1;
          const pairCount = Math.min(removeCount, addCount);

          for (let j = 0; j < pairCount; j++) {
            const removeLineEl = leftLines[removeStart + j];
            const addLineEl = rightLines[addStart + j];

            const removeContent = removeLineEl.querySelector('.diff-line-content');
            const addContent = addLineEl.querySelector('.diff-line-content');

            if (removeContent && addContent) {
              applyWordDiff(removeContent, addContent);
            }

            // Also make the paired lines look like "changed" (yellow bg)
            removeLineEl.classList.remove('diff-line-remove');
            removeLineEl.classList.add('diff-line-remove');
            addLineEl.classList.remove('diff-line-add');
            addLineEl.classList.add('diff-line-add');
          }

          // Re-arrange: move paired adds next to removes for a true side-by-side feel
          // We need to restructure: instead of [remove, remove, empty, empty] [empty, empty, add, add]
          // make it [remove, remove] [add, add] side by side.
          // To do this, we need to swap DOM positions.
          rearrangePairedBlock(leftSide, rightSide, leftLines, rightLines,
            removeStart, removeEnd, addStart, addEnd);

          i = addEnd + 1;
          continue;
        }

        i = removeEnd + 1;
        continue;
      }

      i++;
    }
  }

  /**
   * Rearrange DOM so that remove lines and add lines appear side by side.
   */
  function rearrangePairedBlock(leftSide, rightSide, leftLines, rightLines,
    removeStart, removeEnd, addStart, addEnd) {

    const removeCount = removeEnd - removeStart + 1;
    const addCount = addEnd - addStart + 1;
    const maxCount = Math.max(removeCount, addCount);

    // We need to restructure this block.
    // Currently: rows [removeStart..removeEnd] have remove on left, empty on right
    //            rows [addStart..addEnd] have empty on left, add on right

    // Goal: rows should be paired. For each pair, left=remove, right=add.
    // Extra removes or adds get empty counterparts.

    for (let j = 0; j < maxCount; j++) {
      const removeIdx = removeStart + j;
      const addIdx = addStart + j;

      if (j < removeCount && j < addCount) {
        // Pair: put the add line's content into the right side of the remove row
        // and remove the separate add row
        const rightAddLine = rightLines[addIdx];
        const rightEmptyLine = rightLines[removeIdx];

        // Copy add content into the empty slot
        rightEmptyLine.className = rightAddLine.className;
        rightEmptyLine.innerHTML = rightAddLine.innerHTML;

        // Mark the old add row as empty on both sides
        leftLines[addIdx].className = 'diff-line';
        leftLines[addIdx].style.display = 'none';
        rightAddLine.className = 'diff-line';
        rightAddLine.style.display = 'none';
      }
    }
  }

  /**
   * Apply word-level diff highlighting to two content elements.
   */
  function applyWordDiff(removeEl, addEl) {
    const removeText = removeEl.textContent;
    const addText = addEl.textContent;

    const wordDiff = Diff.diffWords(removeText, addText);

    removeEl.innerHTML = '';
    addEl.innerHTML = '';

    wordDiff.forEach(part => {
      if (part.added) {
        const span = document.createElement('span');
        span.className = 'diff-word-add';
        span.textContent = part.value;
        addEl.appendChild(span);
      } else if (part.removed) {
        const span = document.createElement('span');
        span.className = 'diff-word-remove';
        span.textContent = part.value;
        removeEl.appendChild(span);
      } else {
        removeEl.appendChild(document.createTextNode(part.value));
        addEl.appendChild(document.createTextNode(part.value));
      }
    });
  }

  // ---- Events ----
  compareBtn.addEventListener('click', compare);

  swapBtn.addEventListener('click', () => {
    const tmp = leftInput.value;
    leftInput.value = rightInput.value;
    rightInput.value = tmp;
  });

  clearBtn.addEventListener('click', () => {
    leftInput.value = '';
    rightInput.value = '';
    hideEl(outputSection);
    hideError(errorEl);
    statsEl.textContent = '';
  });

  // Compare on Ctrl/Cmd + Enter from either input
  [leftInput, rightInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        compare();
      }
    });
  });

})();
