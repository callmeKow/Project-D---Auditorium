import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Camera,
  Flag,
  Sparkles,
  LogOut,
  Play,
  Pause,
  SkipForward,
  Music2,
} from 'lucide-react';
import type { RoomDTO } from '@vmw/contracts';
import { AuditoriumScene, type CameraMode } from '../components/auditorium/AuditoriumScene';
import { realtimeStore } from '../realtime/realtimeStore';
import { useAuth } from '../state/authStore';
import { apiClient } from '../api/client';

export function AuditoriumPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const effectiveUserId = user?.id ?? 'guest-listener';
  const effectiveName = user?.displayName ?? 'Guest Listener';
  const effectiveRole = user?.roles[0] ?? 'AUDIENCE';
  const effectiveAvatar = user?.avatarPresetId ?? 'chibi-classic';

  const [room, setRoom] = useState<RoomDTO | null>(realtimeStore.room);
  const [chatOpen, setChatOpen] = useState(true); // Collapsible chat (UX-04)
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState(realtimeStore.chat);
  const [lighting, setLighting] = useState(realtimeStore.lightingPreset);
  const [cameraMode, setCameraMode] = useState<CameraMode>('AUDIENCE_ORBIT');
  const [fps, setFps] = useState(60);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');

  useEffect(() => {
    if (!roomId) return;
    const unsub = realtimeStore.subscribe(() => {
      setRoom(realtimeStore.room ? { ...realtimeStore.room } : null);
      setChatMessages([...realtimeStore.chat]);
      setLighting(realtimeStore.lightingPreset);
    });

    realtimeStore.connect({
      roomId,
      userId: effectiveUserId,
      displayName: effectiveName,
      role: effectiveRole,
      avatarPresetId: effectiveAvatar,
    });

    const initialSeatId = (location.state as { seatId?: string } | null)?.seatId;
    if (initialSeatId) {
      setTimeout(() => {
        realtimeStore.send({ type: 'OCCUPY_SEAT', seatId: initialSeatId });
      }, 400);
    }

    return () => {
      unsub();
      realtimeStore.disconnect();
    };
  }, [roomId, effectiveUserId, effectiveName, effectiveRole, effectiveAvatar, location.state]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    realtimeStore.send({ type: 'CHAT_SEND', text: chatInput });
    setChatInput('');
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !reportText.trim()) return;
    await apiClient.submitReport({
      roomId,
      reporterUserId: effectiveUserId,
      category: 'HARASSMENT',
      description: reportText,
    });
    setReportText('');
    setReportOpen(false);
  };

  const isPerformerOrHost = effectiveRole === 'ARTIST' || effectiveRole === 'HOST' || effectiveRole === 'ADMIN';
  const currentSong = room?.concert.setlist[room.concert.currentSetlistIndex];

  return (
    <div className="relative flex h-[calc(100vh-57px)] w-full overflow-hidden bg-stone-950">
      {/* Main 3D Stage Viewport */}
      <div className="relative flex-1">
        {room ? (
          <AuditoriumScene
            room={room}
            localUserId={effectiveUserId}
            localRole={effectiveRole}
            lightingPreset={lighting}
            cameraMode={cameraMode}
            onSelectSeat={(seatId) => realtimeStore.send({ type: 'OCCUPY_SEAT', seatId })}
            onFpsSample={setFps}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-400">Entering 3D Auditorium...</div>
        )}

        {/* Minimal Top-Left Concert Status + FPS Telemetry */}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-stone-800/80 bg-stone-950/75 px-3.5 py-2 backdrop-blur">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
            <div>
              <div className="text-xs font-bold text-white">{room?.concert.title ?? 'Loading...'}</div>
              <div className="text-[11px] text-amber-300">
                {room?.concert.state} • {currentSong ? `${currentSong.title} (${currentSong.mode})` : 'No song'}
              </div>
            </div>
            <span className="ml-2 rounded bg-stone-800 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
              {fps} FPS
            </span>
          </div>
          <div className="w-fit rounded bg-stone-950/60 px-2 py-0.5 text-[10px] text-stone-400">
            Move: WASD / Arrows (aisles only) • Click a seat to sit
          </div>
        </div>

        {/* Top-Right Minimal Controls */}
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button
            onClick={() =>
              setCameraMode((m) =>
                m === 'AUDIENCE_ORBIT' ? 'STAGE_VIEW' : m === 'STAGE_VIEW' ? 'SEAT_POV' : 'AUDIENCE_ORBIT'
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-950/80 px-3 py-1.5 text-xs hover:bg-stone-800"
          >
            <Camera className="h-3.5 w-3.5 text-amber-400" />
            {cameraMode.replace('_', ' ')}
          </button>

          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-950/80 px-2.5 py-1.5 text-xs text-stone-300 hover:bg-stone-800"
          >
            <Flag className="h-3.5 w-3.5 text-red-400" /> Report
          </button>

          <button
            onClick={() => navigate('/explore')}
            className="flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-950/80 px-2.5 py-1.5 text-xs text-stone-300 hover:bg-stone-800"
          >
            <LogOut className="h-3.5 w-3.5" /> Exit
          </button>

          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-stone-950"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Chat
            </button>
          )}
        </div>

        {/* Bottom-Center Audience Reactions & Performer Stage Controls */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-stone-800 bg-stone-950/80 px-4 py-2 backdrop-blur">
          {(['CLAP', 'CHEER', 'WAVE', 'DANCE'] as const).map((r) => (
            <button
              key={r}
              onClick={() => realtimeStore.send({ type: 'REACTION_SEND', reaction: r })}
              className="flex items-center gap-1 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium hover:bg-amber-500 hover:text-stone-950"
            >
              <Sparkles className="h-3 w-3" /> {r}
            </button>
          ))}

          {isPerformerOrHost && (
            <div className="ml-2 flex items-center gap-1.5 border-l border-stone-700 pl-3">
              <button
                onClick={() => realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'GO_LIVE' })}
                className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
              >
                <Play className="inline h-3 w-3" /> Live
              </button>
              <button
                onClick={() => realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'PAUSE' })}
                className="rounded bg-stone-700 px-2.5 py-1 text-xs"
              >
                <Pause className="inline h-3 w-3" />
              </button>
              <button
                onClick={() => realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'END_SONG' })}
                className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white"
              >
                End Song (Applause)
              </button>
              <button
                onClick={() => realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'NEXT_SONG' })}
                className="rounded bg-stone-700 px-2.5 py-1 text-xs"
              >
                <SkipForward className="inline h-3 w-3" /> Next
              </button>
              <button
                onClick={() => realtimeStore.send({ type: 'PERFORMER_CONCERT_CONTROL', action: 'TOGGLE_MODE' })}
                className="rounded bg-indigo-600 px-2.5 py-1 text-xs"
              >
                <Music2 className="inline h-3 w-3" /> Live/Rec
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Livestream-Style Text Chat Panel (MR-02, UX-04) */}
      {chatOpen && (
        <aside className="flex w-80 flex-col border-l border-stone-800 bg-stone-900/95">
          <div className="flex items-center justify-between border-b border-stone-800 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-200">
              <MessageSquare className="h-3.5 w-3.5 text-amber-400" /> Auditorium Chat
            </span>
            <button onClick={() => setChatOpen(false)} className="rounded p-1 text-stone-400 hover:bg-stone-800">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
            {chatMessages.length === 0 && (
              <p className="text-center text-stone-500">No messages yet. Say hello between songs!</p>
            )}
            {chatMessages.map((m) => (
              <div key={m.id} className="rounded-lg bg-stone-950/60 px-2.5 py-1.5">
                <span className="font-semibold text-amber-300">{m.displayName}: </span>
                <span className="text-stone-200">{m.text}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendChat} className="border-t border-stone-800 p-2.5">
            <div className="flex gap-1.5">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Chat with audience..."
                className="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-2.5 py-1.5 text-xs"
              />
              <button className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-stone-950">Send</button>
            </div>
          </form>
        </aside>
      )}

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={handleReport} className="w-full max-w-sm rounded-xl border border-stone-700 bg-stone-900 p-5">
            <h3 className="font-bold">Submit Safety / Copyright Report</h3>
            <textarea
              required
              rows={3}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Describe the issue..."
              className="mt-3 w-full rounded-lg border border-stone-700 bg-stone-950 p-2.5 text-xs"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="rounded px-3 py-1.5 text-xs">
                Cancel
              </button>
              <button className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Submit</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
