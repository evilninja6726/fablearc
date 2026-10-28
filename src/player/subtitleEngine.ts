export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SubtitleStyleConfig {
  enabled: boolean;
  delayMs: number;
  fontSizePx: number;
  textColor: string;
  bgOpacity: number;
  bottomOffsetPct: number;
  bold: boolean;
  outline: boolean;
  stripSdh: boolean;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyleConfig = {
  enabled: true,
  delayMs: 0,
  fontSizePx: 22,
  textColor: '#EAE6DF',
  bgOpacity: 0.65,
  bottomOffsetPct: 9,
  bold: false,
  outline: true,
  stripSdh: false,
};

function parseTimestampMs(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length < 2 || parts.length > 3) return null;

  let hours = 0;
  let minutes = 0;
  let secondsAndMs = '';

  if (parts.length === 3) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    secondsAndMs = parts[2];
  } else {
    minutes = Number(parts[0]);
    secondsAndMs = parts[1];
  }

  const [secPart, msPart = '0'] = secondsAndMs.split('.');
  const seconds = Number(secPart);
  const millis = Number(msPart.padEnd(3, '0').slice(0, 3));

  if ([hours, minutes, seconds, millis].some((n) => Number.isNaN(n) || n < 0)) {
    return null;
  }

  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + millis;
}

/**
 * Parses WebVTT or SRT subtitle text into structured cues without executing HTML/scripts.
 */
export function parseSubtitles(rawText: string): SubtitleCue[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;

    const arrowLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (arrowLineIndex === -1) continue;

    const timingLine = lines[arrowLineIndex];
    const [rawStart, rawRest] = timingLine.split('-->');
    if (!rawStart || !rawRest) continue;

    const rawEnd = rawRest.trim().split(/\s+/)[0];
    const startMs = parseTimestampMs(rawStart);
    const endMs = parseTimestampMs(rawEnd);
    if (startMs === null || endMs === null || endMs <= startMs) continue;

    // Strip any HTML tags from cue text to prevent DOM XSS
    const textLines = lines
      .slice(arrowLineIndex + 1)
      .map((l) => l.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean);

    if (textLines.length === 0) continue;

    cues.push({
      id: `cue-${i}-${startMs}`,
      startMs,
      endMs,
      text: textLines.join('\n'),
    });
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Strips SDH (Subtitles for the Deaf and Hard of Hearing) bracketed sound descriptions
 * and musical notes when stripSdh is enabled (modeled after NuvioDesktop's stripSdh).
 */
export function formatCueText(text: string, stripSdh: boolean): string {
  if (!stripSdh) return text;
  return text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[♪♫]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Finds the active subtitle cue at `playbackPositionMs` accounting for `delayMs`.
 * Positive `delayMs` shifts subtitles later; negative `delayMs` shifts them earlier.
 */
export function findActiveCue(
  cues: SubtitleCue[],
  playbackPositionMs: number,
  delayMs: number,
  stripSdh = false,
): string | null {
  const effectiveTimeMs = playbackPositionMs - delayMs;
  for (const cue of cues) {
    if (effectiveTimeMs >= cue.startMs && effectiveTimeMs <= cue.endMs) {
      const formatted = formatCueText(cue.text, stripSdh);
      return formatted || null;
    }
  }
  return null;
}

/**
 * Non-AI Subtitle AutoSync helper (modeled after NuvioDesktop's Cue-Capture AutoSync):
 * Given a selected dialogue cue and the current video playback position, computes the exact
 * subtitle delay (in ms) needed to align that cue with the spoken line right now.
 */
export function computeAutoSyncDelayMs(cueStartMs: number, currentPlaybackMs: number): number {
  const rawOffset = currentPlaybackMs - cueStartMs;
  return Math.max(-30000, Math.min(30000, Math.round(rawOffset / 50) * 50));
}
