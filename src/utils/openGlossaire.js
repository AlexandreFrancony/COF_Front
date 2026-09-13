// Opens (or refocuses/renavigates) a single small popup window for the glossaire — reused
// across clicks via a fixed window name, so it reads as one persistent reference panel kept
// beside the app rather than a new browser tab stealing focus every time.
export function openGlossaire(url) {
  const width = 480;
  const height = 720;
  const popup = window.open(
    url,
    'cof-glossaire',
    `width=${width},height=${height},resizable=yes,scrollbars=yes`
  );
  if (popup) popup.focus();
  return popup;
}

// A click that should keep the browser's native behavior (open in a new tab, not a popup):
// middle-click, or a modifier held to force a new-tab/new-window per the OS convention.
export function isPlainLeftClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
