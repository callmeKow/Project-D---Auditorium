import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mic, Volume2, Piano, Radio } from 'lucide-react';
import type { AudioInputMode, InstrumentType } from '@vmw/contracts';
import { audioEngine, type AudioMeterSnapshot } from '../audio/audioEngine';
import { useAuth } from '../state/authStore';

const DEMO_NOTES = [
  { label: 'C4', midi: 60 },
  { label: 'D4', midi: 62 },
  { label: 'E4', midi: 64 },
  { label: 'F4', midi: 65 },
  { label: 'G4', midi: 67 },
  { label: 'A4', midi: 69 },
  { label: 'B4', midi: 71 },
  { label: 'C5', midi: 72 },
];

export function PerformerSetupPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [inputMode, setInputMode] = useState<AudioInputMode>('MICROPHONE');
  const [instrument, setInstrument] = useState<InstrumentType>('PIANO');
  const [monitoring, setMonitoring] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [meter, setMeter] = useState<AudioMeterSnapshot>({ rms: 0, peak: 0, clipping: false });
  const [midiStatus, setMidiStatus] = useState('Not initialized');
  const [lastMidiNote, setLastMidiNote] = useState<number | null>(null);
  const [prerecordedPlaying, setPrerecordedPlaying] = useState(false);

  useEffect(() => {
    audioEngine.listAudioInputs().then((list) => {
      setDevices(list);
      if (list[0]) setSelectedDeviceId(list[0].deviceId);
    });
    return () => {
      audioEngine.stopCapture();
      audioEngine.stopPrerecordedDemoLoop();
    };
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const id = window.setInterval(() => setMeter(audioEngine.readMeter()), 60);
    return () => clearInterval(id);
  }, [capturing]);

  const handleToggleCapture = async () => {
    if (capturing) {
      audioEngine.stopCapture();
      setCapturing(false);
    } else {
      await audioEngine.startCapture(selectedDeviceId || undefined, monitoring);
      setCapturing(true);
    }
  };

  const handleInitMidi = async () => {
    const res = await audioEngine.initMidi(user?.id ?? 'performer', instrument, (ev) => {
      if (ev.isNoteOn) {
        setLastMidiNote(ev.note);
        audioEngine.playSynthNote(ev.note);
      }
    });
    setMidiStatus(
      res.supported
        ? res.inputs.length > 0
          ? `Connected: ${res.inputs.join(', ')}`
          : 'WebMIDI ready (no physical device detected; use virtual keys below)'
        : 'WebMIDI unsupported in this browser (use virtual keys below)'
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Performer Setup & Sound Check (LMR-08)</h1>
          <p className="text-sm text-stone-400">
            Configure audio input, MIDI-to-animation sync, and live/prerecorded fallback before entering the stage.
          </p>
        </div>
        <button
          onClick={() => navigate(`/room/${roomId}`)}
          className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-stone-950 hover:bg-amber-400"
        >
          Enter Stage (3D Auditorium)
        </button>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Experiment A: Browser Audio Capture & Sound Check */}
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Mic className="h-4 w-4 text-amber-400" /> Audio Input & Level Meter (Exp A)
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <label className="block text-xs text-stone-400">Input Source Mode</label>
              <select
                value={inputMode}
                onChange={(e) => setInputMode(e.target.value as AudioInputMode)}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
              >
                <option value="MICROPHONE">Microphone</option>
                <option value="AUDIO_INTERFACE">USB Audio Interface</option>
                <option value="MIDI">MIDI Controller</option>
                <option value="VIRTUAL_DAW">Virtual DAW Audio</option>
                <option value="PRERECORDED">Prerecorded Backing Track</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-stone-400">Audio Device</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
              >
                {devices.length === 0 && <option value="">Default Browser Microphone</option>}
                {devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Audio Input ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleToggleCapture}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  capturing ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                }`}
              >
                {capturing ? 'Stop Sound Check' : 'Start Sound Check'}
              </button>
              <label className="flex items-center gap-2 text-xs text-stone-300">
                <input
                  type="checkbox"
                  checked={monitoring}
                  onChange={(e) => {
                    setMonitoring(e.target.checked);
                    audioEngine.setMonitoring(e.target.checked);
                  }}
                />
                <Volume2 className="h-3.5 w-3.5" /> Local Monitor
              </label>
            </div>

            <div className="rounded-lg bg-stone-950 p-3">
              <div className="flex justify-between text-[11px] text-stone-400">
                <span>Input Level (RMS)</span>
                <span className={meter.clipping ? 'font-bold text-red-400' : 'text-emerald-400'}>
                  {meter.clipping ? 'CLIPPING!' : `${Math.round(meter.rms * 100)}%`}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-stone-800">
                <div
                  className={`h-full transition-all duration-75 ${meter.clipping ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, Math.round(meter.rms * 250))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Experiment C: MIDI-to-Animation & Live/Prerecorded Switching */}
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Piano className="h-4 w-4 text-amber-400" /> MIDI & Prerecorded Switch (Exp C)
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <label className="block text-xs text-stone-400">Instrument Rig</label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as InstrumentType)}
                className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
              >
                <option value="PIANO">Piano / Keyboard</option>
                <option value="GUITAR">Guitar / Acoustic</option>
                <option value="BASS">Bass Guitar</option>
                <option value="VIOLIN">Violin</option>
                <option value="CELLO">Cello</option>
                <option value="DRUMS">Drums / Pads</option>
              </select>
            </div>

            <button
              onClick={handleInitMidi}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3.5 py-2 text-xs hover:bg-stone-800"
            >
              Connect WebMIDI Device
            </button>
            <p className="text-xs text-stone-400">{midiStatus}</p>

            <div>
              <p className="mb-1.5 text-xs text-stone-400">Virtual MIDI Test Keys (Note-On + Synth):</p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_NOTES.map((n) => (
                  <button
                    key={n.midi}
                    onClick={() => {
                      setLastMidiNote(n.midi);
                      audioEngine.playSynthNote(n.midi);
                    }}
                    className={`rounded border px-2.5 py-2 text-xs font-semibold ${
                      lastMidiNote === n.midi
                        ? 'border-amber-400 bg-amber-500 text-stone-950'
                        : 'border-stone-700 bg-stone-950 hover:bg-stone-800'
                    }`}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-stone-800 pt-3">
              <button
                onClick={() => {
                  if (prerecordedPlaying) {
                    audioEngine.stopPrerecordedDemoLoop();
                    setPrerecordedPlaying(false);
                  } else {
                    audioEngine.startPrerecordedDemoLoop((n) => setLastMidiNote(n));
                    setPrerecordedPlaying(true);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white"
              >
                <Radio className="h-3.5 w-3.5" />
                {prerecordedPlaying ? 'Stop Prerecorded Backing Loop' : 'Test Prerecorded Backing Loop (LMR-06)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
