# Reusable Modal Pattern

The overlay + panel pattern used for both the tuning chooser and scale chooser.

## Structure

```html
<div id="modal" class="fixed inset-0 z-50 hidden modal-overlay bg-black/60 backdrop-blur-sm flex items-center justify-center">
    <div class="modal-panel bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        <!-- header -->
        <!-- body (scrollable) -->
        <!-- footer / action buttons -->
    </div>
</div>
```

## CSS transitions

```css
.modal-overlay {
    opacity: 0;
    transition: opacity 0.2s ease-out;
}
.modal-overlay.open { opacity: 1; }
.modal-panel {
    transform: scale(0.95);
    transition: transform 0.2s ease-out;
}
.modal-overlay.open .modal-panel {
    transform: scale(1);
}
```

Key: the `.open` class is added **after** removing `hidden`, with a `void offsetWidth`
reflow to force the browser to recognize the initial state before transition.

## Open / close cycle

```js
function openModal() {
    let modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    void modal.offsetWidth;  // force reflow
    modal.classList.add('open');
}

function closeModal() {
    let modal = document.getElementById('modal');
    modal.classList.remove('open');
    setTimeout(() => modal.classList.add('hidden'), 200);  // match transition duration
}
```

## Event wiring

- Close on ✕ button click
- Close on overlay click (check `e.target.id === 'modal'` to avoid bubbling from panel)
- Close on Escape key (optional, not yet implemented)
- Apply button triggers selection logic then closes

## Content patterns

### Tabbed content (scale chooser)
- Sticky header with search + tab buttons
- Tab content divs toggled via `.hidden`
- Real-time search filters visible items across active tab

### Preset grid + custom section (tuning chooser)
- Grid of preset buttons; active state highlighted
- "Custom" preset reveals additional controls
- Apply button validates and persists

## Z-index stacking

- Modal overlay: `z-50`
- Back link on guitar.html: `z-50` (same level, modal takes precedence via DOM order)
- Everything else on guitar.html: default (`z-0` or unstyled)

## When to use this pattern

- Any user choice with >3 options
- Any choice that needs explanation/context (modal provides space)
- Any choice that should not navigate away from the current page

## When NOT to use

- Simple binary choices (use inline toggle)
- Choices that need the full page context (use hash routing like main app)
