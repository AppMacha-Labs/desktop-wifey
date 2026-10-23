// ElevenLabs audio tags: square-bracketed cues in the text it speaks, read as
// delivery ("[sulking]") or as sounds ("[sighs]"). Her lines can carry them for
// her voice; bubbles and her history never show them.

const TAG = /\s*\[[^\][\n]{1,40}\]\s*/g;

/** The line as it reads, without audio tags. */
export function stripAudioTags(text: string): string {
  return text
    .replace(TAG, ' ')
    .replace(/\s+([,.!?…])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Whether the line already opens with a tag. */
export function startsWithTag(text: string): boolean {
  return /^\s*\[[^\]]+\]/.test(text);
}
