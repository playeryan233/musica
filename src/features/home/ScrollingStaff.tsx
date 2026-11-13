import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BRAVURA_FAMILY, MUSIC_GLYPHS, ensureBravuraFont } from '../../shared/bravura';

/**
 * A decorative, endlessly scrolling staff for the home page. The notes are
 * random on every visit: a random walk inside the five lines, mixed quarter /
 * eighth / sixteenth / half values, bar lines every 4/4 bar. Two copies of the
 * phrase are rendered side by side and a linear CSS animation slides the track
 * by exactly one phrase width, so the loop is seamless.
 */

const STAFF_SPACE = 10;
const PX_PER_SECOND = 90;
const BEATS_PER_BAR = 4;
/** The phrase is at least this wide so it always covers the container. */
const MIN_PHRASE_WIDTH = 3000;
/** Extra phrase width beyond the measured container, so no gap can appear. */
const PHRASE_MARGIN = 600;

const NOTE_HEAD_SCALE = 0.9;
const STEM_WIDTH_FACTOR = 0.12;
const STEM_LENGTH_FACTOR = 3.4;

type Duration = 0.25 | 0.5 | 1 | 2;

const DURATION_CHOICES: Duration[] = [1, 1, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 2];

interface PhraseNote {
  x: number;
  /** Staff steps from the middle line: 0 = middle line, 1 = space above. */
  pitch: number;
  duration: Duration;
}

interface Phrase {
  notes: PhraseNote[];
  bars: number[];
  width: number;
}

/** Horizontal room a note value takes, loosely proportional to its duration. */
function noteWidth(duration: Duration): number {
  return 18 + duration * 28;
}

function buildPhrase(minWidth: number): Phrase {
  const notes: PhraseNote[] = [];
  const bars: number[] = [];
  let x = 48;
  let beat = 0;
  let pitch = 0;

  while (x < minWidth) {
    const duration = DURATION_CHOICES[Math.floor(Math.random() * DURATION_CHOICES.length)];
    // Random walk that never leaves the staff, so every note stays readable.
    pitch = Math.max(-4, Math.min(4, pitch + (Math.random() < 0.5 ? -1 : 1)));

    notes.push({ x, pitch, duration });
    const nextBeat = beat + duration;
    if (Math.floor(nextBeat / BEATS_PER_BAR) > Math.floor(beat / BEATS_PER_BAR)) {
      bars.push(x + noteWidth(duration) * 0.5);
    }
    beat = nextBeat;
    x += noteWidth(duration);
  }

  return { notes, bars, width: x };
}

interface NoteProps {
  note: PhraseNote;
  offset: number;
}

function Note({ note, offset }: NoteProps) {
  const space = STAFF_SPACE;
  const headEm = space * 4 * NOTE_HEAD_SCALE;
  const headHalfWidth = 0.1475 * headEm;
  const headAttach = 0.042 * headEm;
  const stemLength = STEM_LENGTH_FACTOR * space;
  const stemUp = note.pitch <= 0;

  const attach = stemUp ? -headAttach : headAttach;
  const tip = stemUp ? -stemLength : stemLength;
  const stemX = stemUp ? headHalfWidth : -headHalfWidth;
  const flagEm = 4 * space;
  const flag =
    note.duration <= 0.25
      ? stemUp
        ? MUSIC_GLYPHS.flag16thUp
        : MUSIC_GLYPHS.flag16thDown
      : note.duration <= 0.5
        ? stemUp
          ? MUSIC_GLYPHS.flag8thUp
          : MUSIC_GLYPHS.flag8thDown
        : null;

  const y = -(note.pitch * space) / 2;
  const left = note.x + offset;

  return (
    <span className="home-staff-note" style={{ left, transform: `translateY(${y}px)` }}>
      <span className="home-staff-head" style={{ fontSize: headEm }}>
        {MUSIC_GLYPHS.noteheadBlack}
      </span>
      <span
        className="home-staff-stem"
        style={{
          left: stemX,
          top: Math.min(attach, tip),
          height: Math.abs(attach - tip),
          width: STEM_WIDTH_FACTOR * space,
        }}
      />
      {flag && (
        <span
          className="home-staff-flag"
          style={{ fontSize: flagEm, left: stemX, top: tip - 0.5 * flagEm }}
        >
          {flag}
        </span>
      )}
    </span>
  );
}

export function ScrollingStaff() {
  const [phraseWidth, setPhraseWidth] = useState(() =>
    typeof window === 'undefined'
      ? MIN_PHRASE_WIDTH
      : Math.max(MIN_PHRASE_WIDTH, Math.ceil(window.innerWidth) + PHRASE_MARGIN),
  );
  const [fontReady, setFontReady] = useState(() => {
    if (typeof document === 'undefined' || !document.fonts) return false;
    return document.fonts.check(`16px ${BRAVURA_FAMILY}`);
  });

  const phrase = useMemo(() => buildPhrase(phraseWidth), [phraseWidth]);

  useEffect(() => {
    ensureBravuraFont();
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) {
      setFontReady(true);
      return;
    }
    let cancelled = false;
    fonts
      .load(`16px ${BRAVURA_FAMILY}`)
      .then(() => {
        if (!cancelled) setFontReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the phrase wider than the container when the window grows.
  useEffect(() => {
    const measure = () => {
      const next = Math.max(MIN_PHRASE_WIDTH, Math.ceil(window.innerWidth) + PHRASE_MARGIN);
      setPhraseWidth((current) => (next > current ? next : current));
    };
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const staffHeight = STAFF_SPACE * 4;
  const durationSeconds = Math.max(18, phrase.width / PX_PER_SECOND);
  const trackStyle = {
    '--shift': `-${phrase.width}px`,
    animationDuration: `${durationSeconds.toFixed(1)}s`,
  } as CSSProperties;

  return (
    <div
      className={`home-staff${fontReady ? ' is-font-ready' : ''}`}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((line) => (
        <span
          key={line}
          className="home-staff-line"
          style={{ top: `calc(50% + ${(line - 2) * STAFF_SPACE}px)` }}
        />
      ))}

      <div className="home-staff-clip">
        <div className="home-staff-track" style={trackStyle}>
          {[0, phrase.width].map((offset) => (
            <span key={`copy-${offset}`}>
              {phrase.bars.map((bar) => (
                <span
                  key={`bar-${offset}-${bar}`}
                  className="home-staff-bar"
                  style={{
                    left: bar + offset,
                    top: `calc(50% - ${staffHeight / 2}px)`,
                    height: staffHeight,
                  }}
                />
              ))}
              {phrase.notes.map((note) => (
                <Note key={`note-${offset}-${note.x}`} note={note} offset={offset} />
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
