/* =========================================================================
   ARK Config Creator — renderer UI kit.

   Small, dependency-free DOM helpers shared by every renderer script. Before
   this file existed the same button factory was written four times, the same
   labelled-field factory three times, and the same capped-log appender three
   times — each copy drifting slightly from the others.

   Loaded as a classic <script> immediately after icons.js, so `uiIcon()` is
   available by the time any of these helpers are *called*.
   ========================================================================= */
'use strict';

/* ---------------------------------------------------------------------------
   Text escaping
   --------------------------------------------------------------------------- */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes a value for interpolation into HTML — including into a
 * single-quoted attribute. The renderer builds markup by string concatenation
 * in many places, so this must stay conservative.
 */
function esc(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/* ---------------------------------------------------------------------------
   Element factories
   --------------------------------------------------------------------------- */

/**
 * Creates an element, optionally setting a class and inner HTML, and appends
 * it to `parent` when one is given.
 *
 * @param {string} tag
 * @param {{ className?: string, html?: string, text?: string, parent?: Node, attrs?: Record<string,string> }} [options]
 */
function uiElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.html !== undefined) element.innerHTML = options.html;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) element.setAttribute(name, value);
  }
  if (options.parent) options.parent.appendChild(element);
  return element;
}

/**
 * The single button factory for the renderer.
 *
 * @param {Node} parent            where to append the button
 * @param {{
 *   html?: string, text?: string, title?: string,
 *   variant?: 'primary'|'danger'|'', small?: boolean,
 *   disabled?: boolean, className?: string,
 *   onClick?: (event: MouseEvent) => unknown
 * }} options
 * @returns {HTMLButtonElement}
 */
function uiButton(parent, options = {}) {
  const classes = ['btn'];
  if (options.small) classes.push('small');
  if (options.variant) classes.push(options.variant);
  if (options.className) classes.push(options.className);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = classes.join(' ');
  if (options.html !== undefined) button.innerHTML = options.html;
  else if (options.text !== undefined) button.textContent = options.text;
  if (options.title) button.title = options.title;
  if (options.disabled) button.disabled = true;
  if (options.onClick) button.addEventListener('click', options.onClick);
  if (parent) parent.appendChild(button);
  return button;
}

/**
 * A labelled text/number input in the standard `.builder-field` wrapper.
 *
 * @param {Node} parent
 * @param {{
 *   label: string, id?: string, type?: string, value?: string|number,
 *   placeholder?: string, hint?: string, autocomplete?: string
 * }} options
 * @returns {HTMLInputElement} the input itself (the wrapper is its parentNode)
 */
function uiField(parent, options = {}) {
  const wrapper = uiElement('div', { className: 'builder-field' });
  uiElement('label', { text: options.label || '', parent: wrapper });

  const input = document.createElement('input');
  input.type = options.type || 'text';
  input.autocomplete = options.autocomplete || 'off';
  if (options.id) input.id = options.id;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.value !== undefined && options.value !== null) input.value = String(options.value);
  wrapper.appendChild(input);

  if (options.hint) uiElement('p', { className: 'opt-help', text: options.hint, parent: wrapper });
  if (parent) parent.appendChild(wrapper);
  return input;
}

/**
 * The markup-string equivalent of `uiField`, for the places that build a whole
 * step or card as one HTML template (the setup wizard, mod cards).
 */
function uiFieldMarkup(options = {}) {
  const attributes = [
    'id="' + esc(options.id || '') + '"',
    'type="' + esc(options.type || 'text') + '"',
    'value="' + esc(options.value === undefined || options.value === null ? '' : options.value) + '"',
    'placeholder="' + esc(options.placeholder || '') + '"',
    'autocomplete="off"',
  ].join(' ');
  return '<div class="builder-field">'
    + '<label>' + esc(options.label || '') + '</label>'
    + '<input ' + attributes + '>'
    + (options.hint ? '<p class="opt-help">' + esc(options.hint) + '</p>' : '')
    + '</div>';
}

/** A `.opt-help` paragraph used for inline status messages. */
function uiStatusLine(parent, text) {
  return uiElement('p', { className: 'opt-help', text: text || '', parent });
}

/* ---------------------------------------------------------------------------
   Capped log buffer
   --------------------------------------------------------------------------- */

/**
 * A bounded list of log lines that can render itself into one or more <pre>
 * elements, keeping each scrolled to the bottom.
 *
 * Replaces three hand-rolled copies of "push, slice to a limit, join, set
 * textContent, scroll to bottom".
 *
 * @param {{ limit?: number }} [options]
 */
function createLogBuffer(options = {}) {
  const limit = options.limit || 200;
  let lines = [];

  /** Writes the buffer into a <pre>, unhiding it and pinning it to the bottom. */
  function paint(element) {
    if (!element) return;
    element.hidden = false;
    element.textContent = lines.join('\n');
    element.scrollTop = element.scrollHeight;
  }

  return {
    get limit() { return limit; },
    /** @returns {string[]} a copy — callers must not mutate the buffer directly */
    lines() { return lines.slice(); },
    isEmpty() { return lines.length === 0; },
    text() { return lines.join('\n'); },
    push(message) {
      if (message === undefined || message === null || message === '') return;
      lines.push(String(message));
      if (lines.length > limit) lines = lines.slice(-limit);
    },
    replace(nextLines) {
      lines = (nextLines || []).map(String).slice(-limit);
    },
    clear() { lines = []; },
    paint,
    /** Paints into every element id given, skipping ones not in the DOM. */
    paintInto(...elementIds) {
      for (const id of elementIds) paint(document.getElementById(id));
    },
  };
}

/* ---------------------------------------------------------------------------
   Misc
   --------------------------------------------------------------------------- */

/**
 * Wraps an async click handler so the button disables itself while the work is
 * in flight and is always re-enabled afterwards — including when the handler
 * throws. Several flows previously left a control permanently dead on error.
 *
 * @param {HTMLButtonElement} button
 * @param {() => Promise<unknown>} work
 */
async function withBusyButton(button, work) {
  const wasDisabled = button.disabled;
  button.disabled = true;
  try {
    return await work();
  } finally {
    button.disabled = wasDisabled;
  }
}
