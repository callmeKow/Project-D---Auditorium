import { Link } from 'react-router-dom';
import { Sparkles, Headphones, Users, Radio, ArrowRight, Music2, ShieldCheck } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      {/* Hero Section with Warm Stage Spotlight */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-stone-900 via-stone-950 to-amber-950/35 p-8 text-center shadow-2xl sm:p-14">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl" />

        <span className="relative inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Small Room MVP • Low-Latency Live Music
        </span>

        <h1 className="relative mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Experience Live Music{' '}
          <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
            Together in 3D
          </span>
        </h1>

        <p className="relative mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-stone-300 sm:text-base">
          Perform with real instruments, MIDI controllers, or DAWs in an intimate Small Room Auditorium (10–20 seats).
          Join as an Anime Chibi avatar, pick your seat on the 2D map, and enjoy synchronized live audio and stage
          lighting.
        </p>

        <div className="relative mt-8 flex flex-wrap justify-center gap-3.5">
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-3 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
          >
            Explore Live Concerts <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/lobby"
            className="inline-flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-900/90 px-6 py-3 text-sm font-semibold text-stone-100 transition hover:border-stone-600 hover:bg-stone-800"
          >
            Enter Lobby / Room Code
          </Link>
        </div>

        {/* Core Journey Strip */}
        <div className="relative mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-2.5 border-t border-stone-800/80 pt-6 text-left text-xs sm:grid-cols-4">
          {[
            { step: '01', label: 'Discover Show', desc: 'List & calendar' },
            { step: '02', label: '2D Seat Map', desc: 'Hold & reserve seat' },
            { step: '03', label: 'Sound Check', desc: 'Mic, MIDI & audio' },
            { step: '04', label: '3D Auditorium', desc: 'Live sync & chat' },
          ].map((item) => (
            <div key={item.step} className="rounded-xl bg-stone-900/60 px-3 py-2.5">
              <span className="font-mono text-[10px] font-bold text-amber-400">{item.step}</span>
              <div className="font-semibold text-stone-100">{item.label}</div>
              <div className="text-[11px] text-stone-400">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Pillars */}
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <div className="group rounded-2xl border border-stone-800/80 bg-stone-900/60 p-6 transition hover:border-amber-500/30 hover:bg-stone-900">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Headphones className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-white">Real Instruments & MIDI</h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-400">
            Dedicated Sound Check workflow supporting microphone, USB audio interface, WebMIDI controllers, and seamless
            live/prerecorded switching.
          </p>
        </div>

        <div className="group rounded-2xl border border-stone-800/80 bg-stone-900/60 p-6 transition hover:border-amber-500/30 hover:bg-stone-900">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-white">Intimate 3D Auditorium</h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-400">
            2D seat selection before entering the 3D hall, restricted aisle movement, hybrid cameras, and synchronized
            Anime Chibi reactions.
          </p>
        </div>

        <div className="group rounded-2xl border border-stone-800/80 bg-stone-900/60 p-6 transition hover:border-amber-500/30 hover:bg-stone-900">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Radio className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-white">Concert-First Moderation</h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-400">
            Collapsible livestream text chat, zero audience voice clutter, 16+ age policy, and AI-triaged Host/Admin
            safety & copyright controls.
          </p>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-800/70 bg-stone-900/40 px-6 py-4 text-xs text-stone-400">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-amber-400" />
          <span>Supports Solo, Duo, Band & Orchestra formats in Small Rooms (10–20 capacity)</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>100% Free MVP • 16+ Safety Policy • Server-Authoritative Rooms</span>
        </div>
      </div>
    </div>
  );
}
