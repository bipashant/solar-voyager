// Narration files: every caption in a lesson has a pre-rendered neural-voice recording, named by a hash of
// its text, so editing a caption only ever means re-rendering that one line (tools/narrate.py). Shared by the
// player (to find the file) and by tools/narration-extract.mjs (to list what needs recording), so the two
// can never disagree about a name.

// What the caption says with the markup taken off.
export const plain = (html) => html
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

// Two 32-bit FNV-1a hashes with different seeds, as 16 hex characters. A collision among a few hundred lines
// is not a thing that will happen, and it needs no crypto API (which is async and needs https).
export function lineId(html) {
  const s = plain(html);
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    b ^= b >>> 13;
  }
  return a.toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export const narrationUrl = (base, lesson, html) => `${base}${lesson}/${lineId(html)}.mp3`;

// Written for the eye, said for the ear: how a caption should be pronounced. Used when recording, not when
// displaying, so the page can keep its symbols.
export function spoken(html) {
  return plain(html)
    .replace(/\bkm\/h\b/g, 'kilometres per hour')
    .replace(/\bkm\/s\b/g, 'kilometres per second')
    .replace(/(\d)\s?km\b/g, '$1 kilometres')
    .replace(/\bkm\b/g, 'kilometres')
    .replace(/(\d)\s?°/g, '$1 degrees')
    .replace(/°/g, ' degrees')
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/\b1 AU\b/g, 'one astronomical unit')
    .replace(/\bAU\b/g, 'astronomical units')
    .replace(/\bUTC\b/g, 'U T C')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, '$1 $2') // 18:17 -> "eighteen seventeen", not "eighteen colon seventeen"
    .replace(/(\d+) min\b/g, '$1 minutes')
    .replace(/\bmin\/s\b/g, 'minutes per second')
    .replace(/\s+—\s+/g, ', ').replace(/—/g, ', ')
    .replace(/\s+–\s+/g, ', ')
    .replace(/(\d)–(\d)/g, '$1 to $2')
    .replace(/×/g, ' times ')
    .replace(/²/g, ' squared').replace(/³/g, ' cubed')
    .replace(/\s{2,}/g, ' ').trim();
}
