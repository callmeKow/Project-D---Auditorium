import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Piano,
  RefreshCw,
  Volume2,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Music,
  Cpu,
  Keyboard,
  Play,
  Square,
  RotateCcw,
} from 'lucide-react';
import type { InstrumentType } from '@vmw/contracts';
import { audioEngine } from '../../audio/audioEngine';
import { realtimeStore } from '../../realtime/realtimeStore';

export type MusiccaInstrumentTab = 'PIANO' | 'GUITAR' | 'BASS' | 'VIOLIN' | 'DRUMS';

interface GrandPianoSimulatorProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  instrument?: InstrumentType;
  onChangeInstrument?: (inst: InstrumentType) => void;
  venueTitle?: string;
}

interface PianoKeyDef {
  semitoneOffset: number; // 0 = C3 (base MIDI 48 when octaveShift = 0)
  noteBase: string;
  octaveOffset: number;
  isBlack: boolean;
  primaryKeyLabel: string;
  codes: string[];
}

// 29-key (C3 to E5) 2-tier QWERTY Virtual Piano layout (Musicca / MultiplayerPiano standard)
const PIANO_KEY_DEFS: PianoKeyDef[] = [
  // Lower Octave (Left Hand: Z..M white, S D G H J black)
  { semitoneOffset: 0, noteBase: 'C', octaveOffset: 0, isBlack: false, primaryKeyLabel: 'Z', codes: ['KeyZ'] },
  { semitoneOffset: 1, noteBase: 'C#', octaveOffset: 0, isBlack: true, primaryKeyLabel: 'S', codes: ['KeyS'] },
  { semitoneOffset: 2, noteBase: 'D', octaveOffset: 0, isBlack: false, primaryKeyLabel: 'X', codes: ['KeyX'] },
  { semitoneOffset: 3, noteBase: 'D#', octaveOffset: 0, isBlack: true, primaryKeyLabel: 'D', codes: ['KeyD'] },
  { semitoneOffset: 4, noteBase: 'E', octaveOffset: 0, isBlack: false, primaryKeyLabel: 'C', codes: ['KeyC'] },
  { semitoneOffset: 5, noteBase: 'F', octaveOffset: 0, isBlack: false, primaryKeyLabel: 'V', codes: ['KeyV'] },
  { semitoneOffset: 6, noteBase: 'F#', octaveOffset: 0, isBlack: true, primaryKeyLabel: 'G', codes: ['KeyG'] },
  { semitoneOffset: 7, noteBase: 'G', octaveOffset: 0, isBlack: false, primaryKeyLabel: 'B', codes: ['KeyB'] },
  { semitoneOffset: 8, noteBase: 'G#', octaveOffset: 0, isBlack: true, primaryKeyLabel: 'H', codes: ['KeyH'] },
  { semitoneOffset: 9, noteBase: 'A', octaveOffset: 0, isBlack: false, primaryKeyLabel: 'N', codes: ['KeyN'] },
  { semitoneOffset: 10, noteBase: 'A#', octaveOffset: 0, isBlack: true, primaryKeyLabel: 'J', codes: ['KeyJ'] },
  { semitoneOffset: 11, noteBase: 'B', octaveOffset: 0, isBlack: false, primaryKeyLabel: 'M', codes: ['KeyM'] },

  // Middle & Upper Octave (Right Hand: Q..P white, 2 3 5 6 7 9 0 black, plus , . / bottom row continuity)
  { semitoneOffset: 12, noteBase: 'C', octaveOffset: 1, isBlack: false, primaryKeyLabel: 'Q', codes: ['KeyQ', 'Comma'] },
  { semitoneOffset: 13, noteBase: 'C#', octaveOffset: 1, isBlack: true, primaryKeyLabel: '2', codes: ['Digit2', 'KeyL'] },
  { semitoneOffset: 14, noteBase: 'D', octaveOffset: 1, isBlack: false, primaryKeyLabel: 'W', codes: ['KeyW', 'Period'] },
  { semitoneOffset: 15, noteBase: 'D#', octaveOffset: 1, isBlack: true, primaryKeyLabel: '3', codes: ['Digit3', 'Semicolon'] },
  { semitoneOffset: 16, noteBase: 'E', octaveOffset: 1, isBlack: false, primaryKeyLabel: 'E', codes: ['KeyE', 'Slash'] },
  { semitoneOffset: 17, noteBase: 'F', octaveOffset: 1, isBlack: false, primaryKeyLabel: 'R', codes: ['KeyR'] },
  { semitoneOffset: 18, noteBase: 'F#', octaveOffset: 1, isBlack: true, primaryKeyLabel: '5', codes: ['Digit5'] },
  { semitoneOffset: 19, noteBase: 'G', octaveOffset: 1, isBlack: false, primaryKeyLabel: 'T', codes: ['KeyT'] },
  { semitoneOffset: 20, noteBase: 'G#', octaveOffset: 1, isBlack: true, primaryKeyLabel: '6', codes: ['Digit6'] },
  { semitoneOffset: 21, noteBase: 'A', octaveOffset: 1, isBlack: false, primaryKeyLabel: 'Y', codes: ['KeyY'] },
  { semitoneOffset: 22, noteBase: 'A#', octaveOffset: 1, isBlack: true, primaryKeyLabel: '7', codes: ['Digit7'] },
  { semitoneOffset: 23, noteBase: 'B', octaveOffset: 1, isBlack: false, primaryKeyLabel: 'U', codes: ['KeyU'] },

  // High Register Extension (C5 to E5)
  { semitoneOffset: 24, noteBase: 'C', octaveOffset: 2, isBlack: false, primaryKeyLabel: 'I', codes: ['KeyI'] },
  { semitoneOffset: 25, noteBase: 'C#', octaveOffset: 2, isBlack: true, primaryKeyLabel: '9', codes: ['Digit9'] },
  { semitoneOffset: 26, noteBase: 'D', octaveOffset: 2, isBlack: false, primaryKeyLabel: 'O', codes: ['KeyO'] },
  { semitoneOffset: 27, noteBase: 'D#', octaveOffset: 2, isBlack: true, primaryKeyLabel: '0', codes: ['Digit0'] },
  { semitoneOffset: 28, noteBase: 'E', octaveOffset: 2, isBlack: false, primaryKeyLabel: 'P', codes: ['KeyP'] },
];

// Musicca 4-Row Keyboard Matrix for String Instruments (Guitar, Bass, Violin: Frets 0..9 across 4 rows)
const STRING_ROW_KEYS: Array<Array<{ code: string; label: string; fret: number }>> = [
  // Row 1 (Top String): 1 2 3 4 5 6 7 8 9 0
  [
    { code: 'Digit1', label: '1', fret: 0 },
    { code: 'Digit2', label: '2', fret: 1 },
    { code: 'Digit3', label: '3', fret: 2 },
    { code: 'Digit4', label: '4', fret: 3 },
    { code: 'Digit5', label: '5', fret: 4 },
    { code: 'Digit6', label: '6', fret: 5 },
    { code: 'Digit7', label: '7', fret: 6 },
    { code: 'Digit8', label: '8', fret: 7 },
    { code: 'Digit9', label: '9', fret: 8 },
    { code: 'Digit0', label: '0', fret: 9 },
  ],
  // Row 2 (2nd String): Q W E R T Y U I O P
  [
    { code: 'KeyQ', label: 'Q', fret: 0 },
    { code: 'KeyW', label: 'W', fret: 1 },
    { code: 'KeyE', label: 'E', fret: 2 },
    { code: 'KeyR', label: 'R', fret: 3 },
    { code: 'KeyT', label: 'T', fret: 4 },
    { code: 'KeyY', label: 'Y', fret: 5 },
    { code: 'KeyU', label: 'U', fret: 6 },
    { code: 'KeyI', label: 'I', fret: 7 },
    { code: 'KeyO', label: 'O', fret: 8 },
    { code: 'KeyP', label: 'P', fret: 9 },
  ],
  // Row 3 (3rd String): A S D F G H J K L ;
  [
    { code: 'KeyA', label: 'A', fret: 0 },
    { code: 'KeyS', label: 'S', fret: 1 },
    { code: 'KeyD', label: 'D', fret: 2 },
    { code: 'KeyF', label: 'F', fret: 3 },
    { code: 'KeyG', label: 'G', fret: 4 },
    { code: 'KeyH', label: 'H', fret: 5 },
    { code: 'KeyJ', label: 'J', fret: 6 },
    { code: 'KeyK', label: 'K', fret: 7 },
    { code: 'KeyL', label: 'L', fret: 8 },
    { code: 'Semicolon', label: ';', fret: 9 },
  ],
  // Row 4 (4th String): Z X C V B N M , . /
  [
    { code: 'KeyZ', label: 'Z', fret: 0 },
    { code: 'KeyX', label: 'X', fret: 1 },
    { code: 'KeyC', label: 'C', fret: 2 },
    { code: 'KeyV', label: 'V', fret: 3 },
    { code: 'KeyB', label: 'B', fret: 4 },
    { code: 'KeyN', label: 'N', fret: 5 },
    { code: 'KeyM', label: 'M', fret: 6 },
    { code: 'Comma', label: ',', fret: 7 },
    { code: 'Period', label: '.', fret: 8 },
    { code: 'Slash', label: '/', fret: 9 },
  ],
];

// Open string MIDI pitches per Musicca string instrument (ordered top visual string -> bottom visual string)
const GUITAR_STRINGS = [
  { name: 'E4', openMidi: 64, rowIdx: 0, thickness: 'h-[1.5px]' },
  { name: 'B3', openMidi: 59, rowIdx: 1, thickness: 'h-[2px]' },
  { name: 'G3', openMidi: 55, rowIdx: 2, thickness: 'h-[2.5px]' },
  { name: 'D3', openMidi: 50, rowIdx: 3, thickness: 'h-[3px]' },
  { name: 'A2', openMidi: 45, rowIdx: -1, thickness: 'h-[3.5px]' },
  { name: 'E2', openMidi: 40, rowIdx: -1, thickness: 'h-[4px]' },
];

const BASS_STRINGS = [
  { name: 'G2', openMidi: 43, rowIdx: 0, thickness: 'h-[2.5px]' },
  { name: 'D2', openMidi: 38, rowIdx: 1, thickness: 'h-[3px]' },
  { name: 'A1', openMidi: 33, rowIdx: 2, thickness: 'h-[3.5px]' },
  { name: 'E1', openMidi: 28, rowIdx: 3, thickness: 'h-[4.5px]' },
];

const VIOLIN_STRINGS = [
  { name: 'E5', openMidi: 76, rowIdx: 0, thickness: 'h-[1.5px]' },
  { name: 'A4', openMidi: 69, rowIdx: 1, thickness: 'h-[2px]' },
  { name: 'D4', openMidi: 62, rowIdx: 2, thickness: 'h-[2.5px]' },
  { name: 'G3', openMidi: 55, rowIdx: 3, thickness: 'h-[3px]' },
];

// Guitar Quick Strum Chords (Musicca Highlight & Spacebar Strum)
const GUITAR_CHORDS: Array<{ id: string; label: string; notes: number[] }> = [
  { id: 'C', label: 'C Major', notes: [48, 52, 55, 60, 64] },
  { id: 'G', label: 'G Major', notes: [43, 47, 50, 55, 59, 67] },
  { id: 'Am', label: 'A Minor', notes: [45, 52, 57, 60, 64] },
  { id: 'F', label: 'F Major', notes: [41, 48, 53, 57, 60, 65] },
  { id: 'Dm', label: 'D Minor', notes: [50, 57, 62, 65] },
  { id: 'Em', label: 'E Minor', notes: [40, 47, 52, 55, 59, 64] },
  { id: 'D', label: 'D Major', notes: [50, 57, 62, 66] },
  { id: 'E7', label: 'E7 Opera', notes: [40, 47, 50, 56, 59, 64] },
];

// Musicca Virtual Drum Kit exact keyboard mapping
interface DrumPieceDef {
  id: string;
  label: string;
  viLabel: string;
  midi: number;
  shortcutLabel: string;
  codes: string[];
  kind: 'CYMBAL' | 'HIHAT' | 'TOM' | 'SNARE' | 'KICK';
}

const MUSICCA_DRUM_KIT: DrumPieceDef[] = [
  { id: 'crash', label: 'Crash Cymbal', viLabel: 'Chũm chọe Crash', midi: 49, shortcutLabel: 'Y', codes: ['KeyY'], kind: 'CYMBAL' },
  { id: 'ride', label: 'Ride Cymbal', viLabel: 'Chũm chọe Ride', midi: 51, shortcutLabel: 'U', codes: ['KeyU'], kind: 'CYMBAL' },
  { id: 'hh-closed', label: 'Hi-Hat (Closed)', viLabel: 'Hi-Hat Đóng', midi: 42, shortcutLabel: 'R / T', codes: ['KeyR', 'KeyT'], kind: 'HIHAT' },
  { id: 'hh-open', label: 'Hi-Hat (Open)', viLabel: 'Hi-Hat Mở', midi: 46, shortcutLabel: 'E / W', codes: ['KeyE', 'KeyW'], kind: 'HIHAT' },
  { id: 'hh-foot', label: 'Hi-Hat (Foot)', viLabel: 'Hi-Hat Chân', midi: 44, shortcutLabel: 'C', codes: ['KeyC'], kind: 'HIHAT' },
  { id: 'tom-high', label: 'High Tom', viLabel: 'Tom Cao', midi: 50, shortcutLabel: 'G', codes: ['KeyG'], kind: 'TOM' },
  { id: 'tom-low', label: 'Low Tom', viLabel: 'Tom Trung', midi: 47, shortcutLabel: 'H', codes: ['KeyH'], kind: 'TOM' },
  { id: 'tom-floor', label: 'Floor Tom', viLabel: 'Tom Sàn', midi: 41, shortcutLabel: 'J', codes: ['KeyJ'], kind: 'TOM' },
  { id: 'snare', label: 'Snare Drum', viLabel: 'Trống Lẫy (Snare)', midi: 38, shortcutLabel: 'S / A', codes: ['KeyS', 'KeyA'], kind: 'SNARE' },
  { id: 'snare-cross', label: 'Cross Stick', viLabel: 'Gõ Vành Snare', midi: 37, shortcutLabel: 'D / F', codes: ['KeyD', 'KeyF'], kind: 'SNARE' },
  { id: 'kick', label: 'Bass Drum', viLabel: 'Trống Bass (Kick)', midi: 36, shortcutLabel: 'X / Z', codes: ['KeyX', 'KeyZ'], kind: 'KICK' },
];

interface QuickSheetSong {
  id: string;
  title: string;
  composer: string;
  recommendedInstrument: MusiccaInstrumentTab;
  keysGuide: string;
  demoNotes: Array<{ offset: number; durMs: number }>;
}

// 8 Built-in Classical / Opera / Chamber Repertoire Pieces
const QUICK_SHEET_SONGS: QuickSheetSong[] = [
  {
    id: 'fur-elise',
    title: 'Für Elise (Bagatelle No. 25)',
    composer: 'L. v. Beethoven',
    recommendedInstrument: 'PIANO',
    keysGuide: 'P 0 P 0 P U O I Y   •   Q E Y U   •   E 6 U I',
    demoNotes: [
      { offset: 28, durMs: 240 },
      { offset: 27, durMs: 240 },
      { offset: 28, durMs: 240 },
      { offset: 27, durMs: 240 },
      { offset: 28, durMs: 240 },
      { offset: 23, durMs: 240 },
      { offset: 26, durMs: 240 },
      { offset: 24, durMs: 240 },
      { offset: 21, durMs: 480 },
      { offset: 12, durMs: 240 },
      { offset: 16, durMs: 240 },
      { offset: 21, durMs: 240 },
      { offset: 23, durMs: 480 },
      { offset: 16, durMs: 240 },
      { offset: 20, durMs: 240 },
      { offset: 23, durMs: 240 },
      { offset: 24, durMs: 520 },
    ],
  },
  {
    id: 'canon-in-d',
    title: 'Canon in D / C Chamber',
    composer: 'J. Pachelbel',
    recommendedInstrument: 'PIANO',
    keysGuide: 'E  W  Q  M  •  N  B  N  M  •  Q E T I  T E Q W',
    demoNotes: [
      { offset: 16, durMs: 420 },
      { offset: 14, durMs: 420 },
      { offset: 12, durMs: 420 },
      { offset: 11, durMs: 420 },
      { offset: 9, durMs: 420 },
      { offset: 7, durMs: 420 },
      { offset: 9, durMs: 420 },
      { offset: 11, durMs: 420 },
      { offset: 12, durMs: 320 },
      { offset: 16, durMs: 320 },
      { offset: 19, durMs: 320 },
      { offset: 24, durMs: 520 },
    ],
  },
  {
    id: 'swan-lake',
    title: 'Hồ Thiên Nga (Swan Lake Op. 20)',
    composer: 'P. I. Tchaikovsky',
    recommendedInstrument: 'VIOLIN',
    keysGuide: 'E  N M Q W E  •  Q E   •   N Q F   Q N',
    demoNotes: [
      { offset: 16, durMs: 500 },
      { offset: 9, durMs: 250 },
      { offset: 11, durMs: 250 },
      { offset: 12, durMs: 250 },
      { offset: 14, durMs: 250 },
      { offset: 16, durMs: 520 },
      { offset: 12, durMs: 260 },
      { offset: 16, durMs: 520 },
      { offset: 9, durMs: 260 },
      { offset: 12, durMs: 260 },
      { offset: 5, durMs: 520 },
    ],
  },
  {
    id: 'nocturne-op9',
    title: 'Nocturne Op. 9 No. 2',
    composer: 'F. Chopin',
    recommendedInstrument: 'PIANO',
    keysGuide: 'B  T  •  E R T Y T   •   R E W Q',
    demoNotes: [
      { offset: 7, durMs: 320 },
      { offset: 19, durMs: 640 },
      { offset: 16, durMs: 280 },
      { offset: 17, durMs: 280 },
      { offset: 19, durMs: 320 },
      { offset: 21, durMs: 360 },
      { offset: 19, durMs: 540 },
      { offset: 17, durMs: 280 },
      { offset: 16, durMs: 280 },
      { offset: 14, durMs: 320 },
      { offset: 12, durMs: 600 },
    ],
  },
  {
    id: 'river-flows',
    title: 'River Flows in You',
    composer: 'Yiruma',
    recommendedInstrument: 'PIANO',
    keysGuide: 'Y 6 Y 6 Y E Y W   •   Q E Y U   •   U I U T E',
    demoNotes: [
      { offset: 21, durMs: 260 },
      { offset: 20, durMs: 260 },
      { offset: 21, durMs: 260 },
      { offset: 20, durMs: 260 },
      { offset: 21, durMs: 260 },
      { offset: 16, durMs: 260 },
      { offset: 21, durMs: 260 },
      { offset: 14, durMs: 520 },
      { offset: 12, durMs: 240 },
      { offset: 16, durMs: 240 },
      { offset: 21, durMs: 280 },
      { offset: 23, durMs: 480 },
    ],
  },
  {
    id: 'vivaldi-spring',
    title: 'Mùa Xuân (Four Seasons - Spring)',
    composer: 'A. Vivaldi',
    recommendedInstrument: 'VIOLIN',
    keysGuide: 'Q  E E E  W Q T   •   T R E E E  W Q T',
    demoNotes: [
      { offset: 12, durMs: 260 },
      { offset: 16, durMs: 260 },
      { offset: 16, durMs: 260 },
      { offset: 16, durMs: 260 },
      { offset: 14, durMs: 180 },
      { offset: 12, durMs: 180 },
      { offset: 19, durMs: 520 },
      { offset: 19, durMs: 180 },
      { offset: 17, durMs: 180 },
      { offset: 16, durMs: 260 },
      { offset: 16, durMs: 260 },
      { offset: 16, durMs: 260 },
      { offset: 14, durMs: 180 },
      { offset: 12, durMs: 180 },
      { offset: 19, durMs: 520 },
    ],
  },
  {
    id: 'spanish-romance',
    title: 'Spanish Romance (Romanza)',
    composer: 'Classical Guitar Suite',
    recommendedInstrument: 'GUITAR',
    keysGuide: 'U E Q  U E Q  U E Q   •   I E Q  O E Q  P E Q',
    demoNotes: [
      { offset: 23, durMs: 250 },
      { offset: 16, durMs: 250 },
      { offset: 12, durMs: 250 },
      { offset: 23, durMs: 250 },
      { offset: 16, durMs: 250 },
      { offset: 12, durMs: 250 },
      { offset: 24, durMs: 250 },
      { offset: 16, durMs: 250 },
      { offset: 12, durMs: 250 },
      { offset: 26, durMs: 250 },
      { offset: 16, durMs: 250 },
      { offset: 12, durMs: 250 },
      { offset: 28, durMs: 520 },
    ],
  },
  {
    id: 'carmen-habanera',
    title: 'L’amour est un oiseau (Carmen Opera)',
    composer: 'Georges Bizet',
    recommendedInstrument: 'PIANO',
    keysGuide: 'O 0 I 9   •   I 7 Y 6 T 5 R E',
    demoNotes: [
      { offset: 26, durMs: 300 },
      { offset: 25, durMs: 300 },
      { offset: 24, durMs: 300 },
      { offset: 24, durMs: 180 },
      { offset: 23, durMs: 240 },
      { offset: 22, durMs: 240 },
      { offset: 21, durMs: 240 },
      { offset: 20, durMs: 240 },
      { offset: 19, durMs: 240 },
      { offset: 18, durMs: 240 },
      { offset: 17, durMs: 480 },
    ],
  },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function formatMidiNoteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

export function GrandPianoSimulator({
  open,
  onClose,
  userId,
  instrument = 'PIANO',
  onChangeInstrument,
  venueTitle,
}: GrandPianoSimulatorProps) {
  const [activeInstrument, setActiveInstrument] = useState<MusiccaInstrumentTab>(() => {
    if (instrument === 'GUITAR') return 'GUITAR';
    if (instrument === 'BASS') return 'BASS';
    if (instrument === 'VIOLIN' || instrument === 'CELLO') return 'VIOLIN';
    if (instrument === 'DRUMS') return 'DRUMS';
    return 'PIANO';
  });
  const [octaveShift, setOctaveShift] = useState(0); // -1, 0, +1 (0 => base C3 = MIDI 48)
  const [sustainPedal, setSustainPedal] = useState(() => audioEngine.getPianoSustainPedal());
  const [sustainLocked, setSustainLocked] = useState(false);
  const [timbre, setTimbre] = useState<'CONCERT_GRAND' | 'FELT_WARM' | 'OPERA_BRIGHT'>(() =>
    audioEngine.getPianoTimbre()
  );
  const [pianoVol, setPianoVol] = useState(() => audioEngine.getPianoVolume());
  const [activeMidiNotes, setActiveMidiNotes] = useState<number[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string>(QUICK_SHEET_SONGS[0].id);
  const [sheetStepIdx, setSheetStepIdx] = useState(0);
  const [markGuideEnabled, setMarkGuideEnabled] = useState(true);
  const [selectedGuitarChord, setSelectedGuitarChord] = useState<string>('C');
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);

  // Auto-Tracked Input Device State
  const [scanningInputs, setScanningInputs] = useState(true);
  const [deviceStatus, setDeviceStatus] = useState<{
    midiSupported: boolean;
    midiInputs: string[];
    externalAudioInputs: string[];
    hasHardwareInput: boolean;
  }>({
    midiSupported: false,
    midiInputs: [],
    externalAudioInputs: [],
    hasHardwareInput: false,
  });

  const codeToMidiRef = useRef<Map<string, number>>(new Map());
  const activeNotesSetRef = useRef<Set<number>>(new Set());
  const demoTimersRef = useRef<number[]>([]);

  const baseMidi = 48 + octaveShift * 12; // Default 48 = C3
  const activeSheet = QUICK_SHEET_SONGS.find((s) => s.id === selectedSheetId) ?? QUICK_SHEET_SONGS[0];
  const targetStep = activeSheet.demoNotes[sheetStepIdx % activeSheet.demoNotes.length];
  const targetGuideMidi = targetStep ? baseMidi + targetStep.offset : null;

  const handleSelectInstrumentTab = (nextTab: MusiccaInstrumentTab) => {
    setActiveInstrument(nextTab);
    onChangeInstrument?.(nextTab);
    activeNotesSetRef.current.clear();
    codeToMidiRef.current.clear();
    setActiveMidiNotes([]);
    audioEngine.releaseAllPianoNotes();
  };

  // Piano key code -> semitone offset map
  const pianoCodeToOffsetMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const def of PIANO_KEY_DEFS) {
      for (const code of def.codes) {
        map.set(code, def.semitoneOffset);
      }
    }
    return map;
  }, []);

  // String instrument (Guitar, Bass, Violin) code -> MIDI map
  const stringCodeToMidiMap = useMemo(() => {
    const map = new Map<string, number>();
    const strings =
      activeInstrument === 'GUITAR'
        ? GUITAR_STRINGS
        : activeInstrument === 'BASS'
          ? BASS_STRINGS
          : VIOLIN_STRINGS;
    for (const s of strings) {
      if (s.rowIdx >= 0 && STRING_ROW_KEYS[s.rowIdx]) {
        for (const k of STRING_ROW_KEYS[s.rowIdx]) {
          map.set(k.code, s.openMidi + k.fret);
        }
      }
    }
    return map;
  }, [activeInstrument]);

  // Drum kit code -> MIDI map
  const drumCodeToMidiMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const piece of MUSICCA_DRUM_KIT) {
      for (const code of piece.codes) {
        map.set(code, piece.midi);
      }
    }
    return map;
  }, []);

  const syncActiveNotesState = useCallback(() => {
    setActiveMidiNotes(Array.from(activeNotesSetRef.current).sort((a, b) => a - b));
  }, []);

  const triggerNoteOn = useCallback(
    (midi: number, velocity = 105) => {
      if (activeInstrument !== 'DRUMS' && activeNotesSetRef.current.has(midi)) return;
      activeNotesSetRef.current.add(midi);
      syncActiveNotesState();
      audioEngine.playInstrumentNoteOn(activeInstrument, midi, velocity);

      // Advance Musicca Guided Sheet Marker if the player hit the highlighted target note
      if (markGuideEnabled && targetGuideMidi !== null && midi % 12 === targetGuideMidi % 12) {
        setSheetStepIdx((prev) => (prev + 1) % activeSheet.demoNotes.length);
      }

      realtimeStore.sendMidi({
        userId,
        instrument: activeInstrument,
        note: midi,
        velocity,
        isNoteOn: true,
        clientTimestampMs: performance.now(),
      });

      if (activeInstrument === 'DRUMS') {
        window.setTimeout(() => {
          activeNotesSetRef.current.delete(midi);
          syncActiveNotesState();
        }, 160);
      }
    },
    [activeInstrument, userId, syncActiveNotesState, markGuideEnabled, targetGuideMidi, activeSheet.demoNotes.length]
  );

  const triggerNoteOff = useCallback(
    (midi: number) => {
      if (activeInstrument === 'DRUMS') return;
      if (!activeNotesSetRef.current.has(midi)) return;
      activeNotesSetRef.current.delete(midi);
      syncActiveNotesState();
      audioEngine.playInstrumentNoteOff(activeInstrument, midi);
      realtimeStore.sendMidi({
        userId,
        instrument: activeInstrument,
        note: midi,
        velocity: 0,
        isNoteOn: false,
        clientTimestampMs: performance.now(),
      });
    },
    [activeInstrument, userId, syncActiveNotesState]
  );

  const handleStrumGuitarChord = useCallback(
    (chordId: string) => {
      const chord = GUITAR_CHORDS.find((c) => c.id === chordId) ?? GUITAR_CHORDS[0];
      setSelectedGuitarChord(chord.id);
      chord.notes.forEach((midi, idx) => {
        window.setTimeout(() => {
          triggerNoteOn(midi, 102);
          window.setTimeout(() => {
            triggerNoteOff(midi);
          }, 950);
        }, idx * 32);
      });
    },
    [triggerNoteOn, triggerNoteOff]
  );

  const runAutoInputScan = useCallback(async () => {
    setScanningInputs(true);
    const res = await audioEngine.autoTrackPianoInputs(
      userId,
      activeInstrument,
      (ev) => {
        if (ev.isNoteOn) {
          activeNotesSetRef.current.add(ev.note);
        } else {
          activeNotesSetRef.current.delete(ev.note);
        }
        syncActiveNotesState();
        realtimeStore.sendMidi({ ...ev, instrument: activeInstrument });
      },
      (updated) => {
        setDeviceStatus(updated);
      }
    );
    setDeviceStatus(res);
    setScanningInputs(false);
  }, [userId, activeInstrument, syncActiveNotesState]);

  useEffect(() => {
    if (!open) {
      for (const t of demoTimersRef.current) clearTimeout(t);
      demoTimersRef.current = [];
      setIsPlayingDemo(false);
      activeNotesSetRef.current.clear();
      codeToMidiRef.current.clear();
      setActiveMidiNotes([]);
      audioEngine.releaseAllPianoNotes();
      return;
    }
    void runAutoInputScan();
  }, [open, runAutoInputScan]);

  // Computer Keyboard (QWERTY) polyphonic NoteOn / NoteOff listener across all 5 Musicca instruments
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          if (activeInstrument === 'GUITAR') {
            handleStrumGuitarChord(selectedGuitarChord);
          } else {
            setSustainPedal(true);
            audioEngine.setPianoSustainPedal(true);
          }
        }
        return;
      }

      if (e.code === 'ArrowLeft' && !e.repeat) {
        e.preventDefault();
        setOctaveShift((prev) => Math.max(-2, prev - 1));
        return;
      }
      if (e.code === 'ArrowRight' && !e.repeat) {
        e.preventDefault();
        setOctaveShift((prev) => Math.min(2, prev + 1));
        return;
      }

      let targetMidi: number | undefined;
      if (activeInstrument === 'PIANO') {
        const offset = pianoCodeToOffsetMap.get(e.code);
        if (offset !== undefined) targetMidi = baseMidi + offset;
      } else if (activeInstrument === 'DRUMS') {
        targetMidi = drumCodeToMidiMap.get(e.code);
      } else {
        targetMidi = stringCodeToMidiMap.get(e.code);
      }

      if (targetMidi !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat || (activeInstrument !== 'DRUMS' && codeToMidiRef.current.has(e.code))) return;
        codeToMidiRef.current.set(e.code, targetMidi);
        triggerNoteOn(targetMidi, 108);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (!sustainLocked && activeInstrument === 'PIANO') {
          setSustainPedal(false);
          audioEngine.setPianoSustainPedal(false);
        }
        return;
      }

      const activeMidi = codeToMidiRef.current.get(e.code);
      if (activeMidi !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        codeToMidiRef.current.delete(e.code);
        triggerNoteOff(activeMidi);
      }
    };

    const onWindowBlur = () => {
      codeToMidiRef.current.clear();
      activeNotesSetRef.current.clear();
      setActiveMidiNotes([]);
      audioEngine.releaseAllPianoNotes();
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [
    open,
    activeInstrument,
    baseMidi,
    pianoCodeToOffsetMap,
    stringCodeToMidiMap,
    drumCodeToMidiMap,
    sustainLocked,
    selectedGuitarChord,
    handleStrumGuitarChord,
    triggerNoteOn,
    triggerNoteOff,
  ]);

  const handleToggleDemoSong = () => {
    if (isPlayingDemo) {
      for (const t of demoTimersRef.current) clearTimeout(t);
      demoTimersRef.current = [];
      setIsPlayingDemo(false);
      activeNotesSetRef.current.clear();
      setActiveMidiNotes([]);
      audioEngine.releaseAllPianoNotes();
      return;
    }

    const sheet = QUICK_SHEET_SONGS.find((s) => s.id === selectedSheetId) ?? QUICK_SHEET_SONGS[0];
    setIsPlayingDemo(true);
    let cursorMs = 0;
    const timers: number[] = [];

    sheet.demoNotes.forEach((step, idx) => {
      const midi = baseMidi + step.offset;
      const startAt = cursorMs;
      const endAt = cursorMs + Math.max(120, step.durMs - 35);
      timers.push(
        window.setTimeout(() => {
          setSheetStepIdx(idx);
          triggerNoteOn(midi, 102);
        }, startAt)
      );
      timers.push(
        window.setTimeout(() => {
          triggerNoteOff(midi);
        }, endAt)
      );
      cursorMs += step.durMs;
    });

    timers.push(
      window.setTimeout(() => {
        setIsPlayingDemo(false);
        setSheetStepIdx(0);
      }, cursorMs + 100)
    );
    demoTimersRef.current = timers;
  };

  if (!open) return null;

  const whiteKeys = PIANO_KEY_DEFS.filter((k) => !k.isBlack);
  const whiteKeyIndexBySemitone = new Map<number, number>();
  whiteKeys.forEach((wk, idx) => {
    whiteKeyIndexBySemitone.set(wk.semitoneOffset, idx);
  });

  const activeGuitarChordObj = GUITAR_CHORDS.find((c) => c.id === selectedGuitarChord) ?? GUITAR_CHORDS[0];

  return (
    <div className="pointer-events-auto absolute bottom-16 left-1/2 z-30 w-[880px] max-w-[96vw] -translate-x-1/2 rounded-2xl border border-amber-500/45 bg-gradient-to-b from-stone-950/98 via-stone-950/98 to-stone-900/98 p-3.5 text-xs text-stone-100 shadow-[0_20px_70px_rgba(0,0,0,0.85)] backdrop-blur-xl">
      {/* Header + Musicca 5-Instrument Switcher + Auto-Tracked Input Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-md shadow-amber-500/20">
            <Piano className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold tracking-tight text-amber-100">
                Thính Phòng • Opera Virtual Instruments (Musicca Suite)
              </span>
              <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                🎻 {venueTitle ?? 'Thính Phòng • Opera'}
              </span>
            </div>

            {/* Auto-Track Hardware Input vs Direct Computer Keyboard Simulator Status */}
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
              {scanningInputs ? (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Đang tự động dò thiết bị MIDI / Audio Input...
                </span>
              ) : deviceStatus.hasHardwareInput ? (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
                  <Cpu className="h-3 w-3" />
                  Đã kết nối thiết bị Input:{' '}
                  <strong>
                    {[...deviceStatus.midiInputs, ...deviceStatus.externalAudioInputs].slice(0, 2).join(', ')}
                  </strong>{' '}
                  • Hỗ trợ đánh song song trên bàn phím
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                  <Keyboard className="h-3 w-3" />
                  Chưa gắn MIDI/Audio Input rời • Đã tự động bật{' '}
                  <strong className="text-white">Bộ Nhạc Cụ Ảo Musicca trực tiếp trên bàn phím máy tính</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Musicca Instrument Tabs: Piano | Guitar | Bass | Violin | Drums */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-800 bg-stone-950 p-1">
          {(
            [
              { id: 'PIANO', label: '🎹 Piano' },
              { id: 'GUITAR', label: '🎸 Guitar' },
              { id: 'BASS', label: '🎸 Bass' },
              { id: 'VIOLIN', label: '🎻 Violin' },
              { id: 'DRUMS', label: '🥁 Drums' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectInstrumentTab(tab.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                activeInstrument === tab.id
                  ? 'bg-amber-500 text-stone-950 shadow'
                  : 'text-stone-300 hover:bg-stone-800 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void runAutoInputScan()}
            title="Quét lại thiết bị MIDI / Audio Input"
            className="inline-flex items-center gap-1 rounded-xl border border-stone-700 bg-stone-900 px-2 py-1.5 text-[11px] font-semibold text-stone-300 transition hover:border-amber-400/50 hover:text-amber-200"
          >
            <RefreshCw className={`h-3 w-3 ${scanningInputs ? 'animate-spin' : ''}`} />
            Dò Input
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Đóng bộ nhạc cụ"
            className="rounded-xl border border-stone-700 bg-stone-900 p-1.5 text-stone-400 transition hover:bg-stone-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Repertoire Selector (Kho Bản Nhạc Có Sẵn) + Musicca Mark/Highlight Guide + Volume */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-800/90 bg-stone-900/85 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Music className="h-3 w-3" /> Chọn bản nhạc có sẵn:
          </span>
          <select
            value={selectedSheetId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedSheetId(nextId);
              setSheetStepIdx(0);
              const found = QUICK_SHEET_SONGS.find((s) => s.id === nextId);
              if (found && found.recommendedInstrument !== activeInstrument) {
                handleSelectInstrumentTab(found.recommendedInstrument);
              }
            }}
            className="rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-1 text-[11px] font-semibold text-amber-200 focus:border-amber-400 focus:outline-none"
          >
            {QUICK_SHEET_SONGS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {s.composer} ({s.recommendedInstrument})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleToggleDemoSong}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              isPlayingDemo
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-amber-500 text-stone-950 hover:bg-amber-400'
            }`}
          >
            {isPlayingDemo ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isPlayingDemo ? 'Dừng phát' : 'Tự trình diễn mẫu'}
          </button>

          <button
            type="button"
            onClick={() => setMarkGuideEnabled((v) => !v)}
            title="Musicca Mark: Đánh dấu nốt tiếp theo của bản nhạc trực tiếp trên phím đàn / cần đàn"
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
              markGuideEnabled
                ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                : 'border-stone-700 bg-stone-950 text-stone-400'
            }`}
          >
            🎯 Đánh dấu nốt (Mark): {markGuideEnabled ? 'BẬT' : 'TẮT'}
          </button>

          {markGuideEnabled && (
            <button
              type="button"
              onClick={() => setSheetStepIdx(0)}
              title="Đặt lại từ nốt đầu tiên"
              className="inline-flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-950 px-2 py-1 text-[10px] text-stone-300 hover:bg-stone-800"
            >
              <RotateCcw className="h-3 w-3" /> Đầu bài ({sheetStepIdx + 1}/{activeSheet.demoNotes.length})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200">
            Phím gợi ý: {activeSheet.keysGuide}
          </span>
          <div className="flex items-center gap-1">
            <Volume2 className="h-3.5 w-3.5 text-amber-400" />
            <input
              type="range"
              min={0.1}
              max={1.4}
              step={0.05}
              value={pianoVol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPianoVol(v);
                audioEngine.setPianoVolume(v);
              }}
              className="w-16 accent-amber-400"
              title="Âm lượng Nhạc cụ"
            />
          </div>
        </div>
      </div>

      {/* ==================== 1. MUSICCA VIRTUAL PIANO ==================== */}
      {activeInstrument === 'PIANO' && (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-800 bg-stone-950/80 px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Âm sắc Piano:</span>
              {(
                [
                  { id: 'CONCERT_GRAND', label: '🎹 Steinway Grand' },
                  { id: 'FELT_WARM', label: '🎼 Warm Nocturne' },
                  { id: 'OPERA_BRIGHT', label: '✨ Opera Bright' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTimbre(t.id);
                    audioEngine.setPianoTimbre(t.id);
                  }}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition ${
                    timbre === t.id
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'bg-stone-900 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-stone-800 bg-stone-900 px-2 py-0.5">
                <span className="text-[10px] text-stone-400">Quãng tám (←/→):</span>
                <button
                  type="button"
                  onClick={() => setOctaveShift((prev) => Math.max(-2, prev - 1))}
                  className="rounded bg-stone-800 p-0.5 text-stone-300 hover:bg-stone-700"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="min-w-[48px] text-center font-mono text-[10px] font-bold text-amber-300">
                  C{3 + octaveShift}–E{5 + octaveShift}
                </span>
                <button
                  type="button"
                  onClick={() => setOctaveShift((prev) => Math.min(2, prev + 1))}
                  className="rounded bg-stone-800 p-0.5 text-stone-300 hover:bg-stone-700"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextLock = !sustainLocked;
                  setSustainLocked(nextLock);
                  setSustainPedal(nextLock);
                  audioEngine.setPianoSustainPedal(nextLock);
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold transition ${
                  sustainPedal
                    ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                    : 'border-stone-700 bg-stone-900 text-stone-400'
                }`}
              >
                <Sparkles className="h-3 w-3 text-amber-400" />
                Pedal Vang [Space]: {sustainPedal ? 'ON' : 'OFF'}
              </button>

              <span className="min-w-[80px] rounded bg-stone-900 px-2 py-0.5 text-center font-mono text-[10px] font-bold text-emerald-300">
                {activeMidiNotes.length > 0 ? activeMidiNotes.map(formatMidiNoteName).join(' • ') : 'Sẵn sàng'}
              </span>
            </div>
          </div>

          <div className="mt-2 rounded-xl border-t-4 border-amber-700/80 bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 p-2.5 shadow-inner">
            <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-stone-400">
              <span>
                Tay trái (<strong className="text-amber-300">C{3 + octaveShift}–B{3 + octaveShift}</strong>): Trắng{' '}
                <kbd className="rounded bg-stone-800 px-1 text-amber-200">Z X C V B N M</kbd> • Đen{' '}
                <kbd className="rounded bg-stone-800 px-1 text-stone-300">S D G H J</kbd>
              </span>
              <span>
                Tay phải (<strong className="text-amber-300">C{4 + octaveShift}–E{5 + octaveShift}</strong>): Trắng{' '}
                <kbd className="rounded bg-stone-800 px-1 text-amber-200">Q W E R T Y U I O P</kbd> • Đen{' '}
                <kbd className="rounded bg-stone-800 px-1 text-stone-300">2 3 5 6 7 9 0</kbd>
              </span>
            </div>

            <div className="h-1.5 w-full rounded-t bg-gradient-to-r from-red-950 via-red-700 to-red-950 shadow" />

            <div className="relative flex h-36 w-full select-none overflow-hidden rounded-b-xl border border-stone-800 bg-stone-950">
              {whiteKeys.map((wk) => {
                const midi = baseMidi + wk.semitoneOffset;
                const isPressed = activeMidiNotes.includes(midi);
                const isGuidedTarget = markGuideEnabled && targetGuideMidi === midi;
                const noteLabel = `${wk.noteBase}${3 + octaveShift + wk.octaveOffset}`;
                return (
                  <button
                    key={wk.semitoneOffset}
                    type="button"
                    onMouseDown={() => triggerNoteOn(midi, 108)}
                    onMouseUp={() => triggerNoteOff(midi)}
                    onMouseLeave={() => {
                      if (activeMidiNotes.includes(midi)) triggerNoteOff(midi);
                    }}
                    className={`group relative flex flex-1 flex-col items-center justify-end border-r border-stone-300 pb-2 transition-all duration-75 last:border-r-0 ${
                      isPressed
                        ? 'translate-y-[2px] bg-gradient-to-b from-amber-200 via-amber-300 to-amber-400 shadow-[inset_0_3px_10px_rgba(217,119,6,0.45)]'
                        : isGuidedTarget
                          ? 'bg-gradient-to-b from-emerald-100 via-emerald-200 to-emerald-300 ring-2 ring-inset ring-emerald-500'
                          : 'bg-gradient-to-b from-stone-100 via-white to-stone-200 hover:from-amber-50 hover:to-amber-100'
                    }`}
                  >
                    {isGuidedTarget && (
                      <span className="mb-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8px] font-black text-white shadow">
                        BẤM
                      </span>
                    )}
                    <span
                      className={`mb-1 flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-black shadow-sm ${
                        isPressed
                          ? 'border-stone-950 bg-stone-950 text-amber-300'
                          : isGuidedTarget
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-stone-300 bg-stone-800 text-amber-300 group-hover:border-amber-500'
                      }`}
                    >
                      {wk.primaryKeyLabel}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-stone-700">{noteLabel}</span>
                  </button>
                );
              })}

              {PIANO_KEY_DEFS.filter((k) => k.isBlack).map((bk) => {
                const midi = baseMidi + bk.semitoneOffset;
                const isPressed = activeMidiNotes.includes(midi);
                const isGuidedTarget = markGuideEnabled && targetGuideMidi === midi;
                const prevWhiteIdx = whiteKeyIndexBySemitone.get(bk.semitoneOffset - 1) ?? 0;
                const leftPct = ((prevWhiteIdx + 1) / whiteKeys.length) * 100;
                const widthPct = (0.64 / whiteKeys.length) * 100;
                const noteLabel = `${bk.noteBase}${3 + octaveShift + bk.octaveOffset}`;

                return (
                  <button
                    key={bk.semitoneOffset}
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      triggerNoteOn(midi, 110);
                    }}
                    onMouseUp={(e) => {
                      e.stopPropagation();
                      triggerNoteOff(midi);
                    }}
                    onMouseLeave={() => {
                      if (activeMidiNotes.includes(midi)) triggerNoteOff(midi);
                    }}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      transform: 'translateX(-50%)',
                    }}
                    className={`group absolute top-0 z-10 flex h-[62%] flex-col items-center justify-end rounded-b-lg border border-stone-700 pb-1.5 shadow-lg transition-all duration-75 ${
                      isPressed
                        ? 'h-[60%] bg-gradient-to-b from-amber-500 via-amber-600 to-amber-700 text-stone-950'
                        : isGuidedTarget
                          ? 'bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 text-white ring-2 ring-emerald-300'
                          : 'bg-gradient-to-b from-stone-800 via-stone-900 to-black text-stone-200 hover:from-stone-700 hover:to-stone-900'
                    }`}
                  >
                    <span
                      className={`mb-0.5 flex h-5 w-5 items-center justify-center rounded text-[10px] font-black ${
                        isPressed
                          ? 'bg-stone-950 text-amber-300'
                          : isGuidedTarget
                            ? 'bg-emerald-950 text-emerald-200'
                            : 'border border-stone-600 bg-stone-950/90 text-amber-300'
                      }`}
                    >
                      {bk.primaryKeyLabel}
                    </span>
                    <span className="font-mono text-[8px] text-stone-300">{noteLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ==================== 2. MUSICCA VIRTUAL FRETBOARD (GUITAR / BASS / VIOLIN) ==================== */}
      {(activeInstrument === 'GUITAR' || activeInstrument === 'BASS' || activeInstrument === 'VIOLIN') && (
        <div className="mt-2 rounded-xl border border-amber-700/50 bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-stone-300">
              {activeInstrument === 'GUITAR' && (
                <span>
                  🎸 <strong className="text-amber-300">Musicca Virtual Guitar (6 Dây):</strong> 4 hàng phím máy tính{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">1..0</kbd>{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">Q..P</kbd>{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">A..;</kbd>{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">Z../</kbd> ứng với các dây • Nhấn{' '}
                  <kbd className="rounded bg-amber-500/20 px-1.5 font-bold text-amber-300">Space</kbd> để quạt hợp âm!
                </span>
              )}
              {activeInstrument === 'BASS' && (
                <span>
                  🎸 <strong className="text-amber-300">Musicca Virtual Bass (4 Dây G2–D2–A1–E1):</strong> 4 hàng phím{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">1..0</kbd>,{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">Q..P</kbd>,{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">A..;</kbd>,{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">Z../</kbd> tương ứng trực tiếp 4 dây Bass.
                </span>
              )}
              {activeInstrument === 'VIOLIN' && (
                <span>
                  🎻 <strong className="text-amber-300">Musicca Virtual Violin (4 Dây E5–A4–D4–G3):</strong> 4 hàng phím{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">1..0</kbd> (Dây E5),{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">Q..P</kbd> (Dây A4),{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">A..;</kbd> (Dây D4),{' '}
                  <kbd className="rounded bg-stone-800 px-1 text-amber-200">Z../</kbd> (Dây G3).
                </span>
              )}
            </div>

            {activeInstrument === 'GUITAR' && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold text-stone-400">Hợp âm [Space]:</span>
                {GUITAR_CHORDS.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleStrumGuitarChord(ch.id)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                      selectedGuitarChord === ch.id
                        ? 'bg-amber-500 text-stone-950 shadow'
                        : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                    }`}
                  >
                    {ch.id}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fret Numbers Header (Fret 0 = Open String .. Fret 9) */}
          <div className="grid grid-cols-11 gap-1 px-1 pb-1 text-center font-mono text-[10px] font-bold text-amber-400/80">
            <div>Dây buông (0)</div>
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i}>Ngăn {i + 1}</div>
            ))}
            <div>Ngăn 10</div>
          </div>

          {/* Rosewood / Ebony Fingerboard */}
          <div className="space-y-1.5 rounded-xl border-2 border-amber-900/70 bg-gradient-to-r from-[#2c1609] via-[#3a1d0d] to-[#261207] p-2.5 shadow-inner">
            {(activeInstrument === 'GUITAR'
              ? GUITAR_STRINGS
              : activeInstrument === 'BASS'
                ? BASS_STRINGS
                : VIOLIN_STRINGS
            ).map((str) => {
              const rowShortcuts = str.rowIdx >= 0 ? STRING_ROW_KEYS[str.rowIdx] : null;
              return (
                <div key={str.name} className="relative flex items-center">
                  {/* Metallic Horizontal String Wire */}
                  <div
                    className={`pointer-events-none absolute inset-x-0 ${str.thickness} bg-gradient-to-r from-amber-200/80 via-stone-300/90 to-amber-200/80 shadow`}
                  />

                  <div className="relative z-10 grid w-full grid-cols-11 gap-1">
                    {/* Column 0: String Name Badge */}
                    <div className="flex items-center justify-center rounded bg-stone-950/90 px-1.5 py-1 font-mono text-[10px] font-extrabold text-amber-300">
                      Dây {str.name}
                    </div>

                    {/* Frets 0..9 interactive note nodes */}
                    {Array.from({ length: 10 }, (_, fret) => {
                      const midi = str.openMidi + fret;
                      const isPressed = activeMidiNotes.includes(midi);
                      const isChordMarked =
                        activeInstrument === 'GUITAR' && activeGuitarChordObj.notes.includes(midi);
                      const isGuided =
                        markGuideEnabled && targetGuideMidi !== null && midi % 12 === targetGuideMidi % 12;
                      const keyCap = rowShortcuts?.[fret]?.label;

                      return (
                        <button
                          key={fret}
                          type="button"
                          onMouseDown={() => triggerNoteOn(midi, 108)}
                          onMouseUp={() => triggerNoteOff(midi)}
                          onMouseLeave={() => {
                            if (activeMidiNotes.includes(midi)) triggerNoteOff(midi);
                          }}
                          className={`flex items-center justify-between rounded-lg border px-1.5 py-1 text-[10px] font-bold transition ${
                            isPressed
                              ? 'scale-105 border-amber-300 bg-amber-400 text-stone-950 shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                              : isGuided
                                ? 'border-emerald-400 bg-emerald-600/85 text-white ring-1 ring-emerald-300'
                                : isChordMarked
                                  ? 'border-amber-500/60 bg-amber-500/25 text-amber-200'
                                  : 'border-stone-700/75 bg-stone-950/80 text-stone-200 hover:border-amber-400/60 hover:bg-stone-900'
                          }`}
                        >
                          <span className="font-mono">{formatMidiNoteName(midi)}</span>
                          {keyCap && (
                            <kbd
                              className={`rounded px-1 text-[9px] font-black ${
                                isPressed ? 'bg-stone-950 text-amber-300' : 'bg-stone-800 text-amber-300'
                              }`}
                            >
                              {keyCap}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== 3. MUSICCA VIRTUAL DRUM KIT ==================== */}
      {activeInstrument === 'DRUMS' && (
        <div className="mt-2 rounded-xl border border-amber-700/40 bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-stone-300">
            <span>
              🥁 <strong className="text-amber-300">Musicca Virtual Drum Kit:</strong> Bấm trực tiếp lên mặt trống hoặc gõ phím tắt chuẩn Musicca (<kbd className="rounded bg-stone-800 px-1 text-amber-200">X/Z</kbd> Kick,{' '}
              <kbd className="rounded bg-stone-800 px-1 text-amber-200">S/A</kbd> Snare,{' '}
              <kbd className="rounded bg-stone-800 px-1 text-amber-200">R/T</kbd> Hi-Hat,{' '}
              <kbd className="rounded bg-stone-800 px-1 text-amber-200">Y/U</kbd> Cymbal).
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {MUSICCA_DRUM_KIT.map((piece) => {
              const isHit = activeMidiNotes.includes(piece.midi);
              const isCymbal = piece.kind === 'CYMBAL' || piece.kind === 'HIHAT';
              return (
                <button
                  key={piece.id}
                  type="button"
                  onMouseDown={() => triggerNoteOn(piece.midi, 115)}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition-all duration-75 ${
                    isHit
                      ? 'scale-95 border-amber-300 bg-amber-500/35 text-white shadow-[0_0_18px_rgba(245,158,11,0.65)]'
                      : isCymbal
                        ? 'border-amber-500/40 bg-gradient-to-b from-amber-950/60 to-stone-950 text-amber-100 hover:border-amber-400'
                        : 'border-stone-700 bg-gradient-to-b from-stone-800/80 to-stone-950 text-stone-100 hover:border-amber-400/60'
                  }`}
                >
                  <span className="mb-1 rounded-md border border-amber-400/40 bg-stone-950 px-2 py-0.5 font-mono text-xs font-black text-amber-300">
                    [{piece.shortcutLabel}]
                  </span>
                  <span className="text-[11px] font-bold">{piece.viLabel}</span>
                  <span className="text-[9px] text-stone-400">{piece.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
