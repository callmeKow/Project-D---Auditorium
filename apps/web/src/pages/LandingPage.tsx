import { Link } from 'react-router-dom';
import { Sparkles, Headphones, Users, Radio } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-stone-900 via-stone-950 to-amber-950/30 p-10 text-center shadow-xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
          <Sparkles className="h-3.5 w-3.5" /> Small Room MVP • Low-Latency Live Music
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Experience Live Music Together in 3D
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-stone-300">
          Perform with real instruments, MIDI, or DAWs in a warm, intimate Small Room Auditorium. Join as an Anime Chibi
          avatar, pick your seat on the 2D map, and enjoy synchronized audio and stage lighting.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            to="/explore"
            className="rounded-xl bg-amber-500 px-6 py-3 font-semibold text-stone-950 shadow hover:bg-amber-400"
          >
            Explore Concerts
          </Link>
          <Link
            to="/lobby"
            className="rounded-xl border border-stone-700 bg-stone-900 px-6 py-3 font-semibold text-stone-100 hover:bg-stone-800"
          >
            Enter Lobby / Room Code
          </Link>
        </div>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6">
          <Headphones className="h-7 w-7 text-amber-400" />
          <h3 className="mt-3 text-lg font-semibold">Real Instruments & MIDI</h3>
          <p className="mt-1.5 text-sm text-stone-400">
            Dedicated Sound Check workflow supporting microphone, audio interface, MIDI controllers, and live/prerecorded
            switching.
          </p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6">
          <Users className="h-7 w-7 text-amber-400" />
          <h3 className="mt-3 text-lg font-semibold">Intimate 3D Auditorium</h3>
          <p className="mt-1.5 text-sm text-stone-400">
            2D seat selection before entering the 3D hall, restricted aisle movement, hybrid cameras, and synchronized
            Chibi reactions.
          </p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6">
          <Radio className="h-7 w-7 text-amber-400" />
          <h3 className="mt-3 text-lg font-semibold">Concert-First Moderation</h3>
          <p className="mt-1.5 text-sm text-stone-400">
            Collapsible livestream chat, zero audience voice clutter, 16+ age policy, and Host/Admin safety controls.
          </p>
        </div>
      </div>
    </div>
  );
}
