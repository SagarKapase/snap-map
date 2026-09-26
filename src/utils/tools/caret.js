/**
 * Putting the cursor where a tool said the problem is.
 *
 * This is the entire reason these tools report a line and a column rather
 * than a character offset: the number is only useful if clicking it takes
 * you there.
 */

/** Move the caret to a reported place, and scroll it into view. */
export const goToPlace = (textarea, place) => {
  if (!textarea || !place) return;
  textarea.focus();
  const offset = Math.min(place.offset ?? 0, textarea.value.length);
  textarea.setSelectionRange(offset, offset);
  // A textarea will not scroll to a selection on its own, so the line is
  // placed a few rows down from the top where it can actually be read.
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  textarea.scrollTop = Math.max(0, ((place.line || 1) - 4) * lineHeight);
};
