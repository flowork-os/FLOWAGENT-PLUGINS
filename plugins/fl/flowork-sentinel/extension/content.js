// Flowork Sentinel - Content Script for Web Pages
(function() {
  let isRecording = false;

  // Query background for recording status
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res && res.isRecording) {
      isRecording = true;
    }
  });

  // Listen to state changes
  chrome.runtime.onMessage?.addListener((msg) => {
    if (msg.type === 'RECORDING_STATE_CHANGED') {
      isRecording = msg.isRecording;
    }
  });

  // Calculate robust semantic selector
  function getBestSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';

    // 1. Data attributes (Suno, Facebook, Twitter, Modern Apps)
    if (el.hasAttribute('data-testid')) {
      return `[data-testid="${el.getAttribute('data-testid')}"]`;
    }
    if (el.hasAttribute('data-action')) {
      return `[data-action="${el.getAttribute('data-action')}"]`;
    }

    // 2. Semantic accessibility labels (Facebook uses this heavily!)
    if (el.hasAttribute('aria-label')) {
      return `[aria-label="${el.getAttribute('aria-label')}"]`;
    }

    // 3. Name or Placeholder
    if (el.hasAttribute('name')) {
      return `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
    }
    if (el.hasAttribute('placeholder')) {
      return `${el.tagName.toLowerCase()}[placeholder="${el.getAttribute('placeholder')}"]`;
    }

    // 4. Stable semantic ID
    if (el.id && !el.id.match(/^[0-9]+$/) && !el.id.includes(':') && el.id.length < 40) {
      return `#${el.id}`;
    }

    // 5. Button or input with unique text
    if (el.tagName === 'BUTTON' && el.textContent.trim().length > 0 && el.textContent.trim().length < 30) {
      return `//button[contains(text(), "${el.textContent.trim()}")]`;
    }

    // 6. Hierarchy path fallback
    let path = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\s+/).filter(c => c && !c.includes(':') && !c.match(/^[0-9]/)).slice(0, 2);
      if (classes.length) path += '.' + classes.join('.');
    }
    return path;
  }

  // Visual halo highlight for captured element
  function flashHighlight(el) {
    const originalOutline = el.style.outline;
    const originalShadow = el.style.boxShadow;
    el.style.outline = '2px solid #00f2fe';
    el.style.boxShadow = '0 0 12px rgba(0, 242, 254, 0.8)';
    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.boxShadow = originalShadow;
    }, 400);
  }

  // Intercept Clicks
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, a, input, select, textarea, [role="button"]') || e.target;
    const selector = getBestSelector(target);
    const text = (target.innerText || target.value || target.getAttribute('aria-label') || '').slice(0, 80).trim();

    flashHighlight(target);

    chrome.runtime.sendMessage({
      type: 'DOM_EVENT',
      event: {
        type: 'click',
        selector,
        text,
        url: window.location.href,
        tagName: target.tagName
      }
    });
  }, true);

  // Intercept Inputs
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      const isPassword = target.type === 'password';
      const selector = getBestSelector(target);
      const value = isPassword ? '********' : target.value;

      chrome.runtime.sendMessage({
        type: 'DOM_EVENT',
        event: {
          type: 'input',
          selector,
          value,
          isPassword,
          url: window.location.href
        }
      });
    }
  }, true);

  // Intercept Initial Page Load / Navigation
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    chrome.runtime.sendMessage({
      type: 'DOM_EVENT',
      event: {
        type: 'navigation',
        url: window.location.href,
        title: document.title
      }
    });
  }
})();
