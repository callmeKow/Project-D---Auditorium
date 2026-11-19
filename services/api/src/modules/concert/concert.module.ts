import crypto from 'node:crypto';
import {
  extractStandardYouTubeVideoId,
  type ConcertDTO,
  type ConcertState,
  type LightingPreset,
  type SetlistItemDTO,
} from '@vmw/contracts';

const ALLOWED_TRANSITIONS: Record<ConcertState, ConcertState[]> = {
  DRAFT: ['SCHEDULED', 'PREPARING', 'CANCELLED'],
  SCHEDULED: ['PREPARING', 'SOUND_CHECK', 'CANCELLED'],
  PREPARING: ['SOUND_CHECK', 'LIVE', 'CANCELLED'],
  SOUND_CHECK: ['LIVE', 'PAUSED', 'PREPARING', 'CANCELLED'],
  LIVE: ['PAUSED', 'INTERMISSION', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['LIVE', 'INTERMISSION', 'COMPLETED', 'CANCELLED'],
  INTERMISSION: ['LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['PREPARING', 'SOUND_CHECK'],
  CANCELLED: [],
};

export function transitionConcertState(concert: ConcertDTO, nextState: ConcertState): ConcertDTO {
  if (concert.state === nextState) return concert;
  const allowed = ALLOWED_TRANSITIONS[concert.state] ?? [];
  if (!allowed.includes(nextState)) {
    throw new Error(`INVALID_CONCERT_TRANSITION: ${concert.state} -> ${nextState}`);
  }
  concert.state = nextState;
  return concert;
}

export function extractYouTubeVideoId(rawUrl?: string): string | undefined {
  return extractStandardYouTubeVideoId(rawUrl);
}

export function addSetlistItem(
  concert: ConcertDTO,
  input: {
    title?: string;
    artistName?: string;
    durationSec?: number;
    mode?: 'LIVE' | 'PRERECORDED';
    lightingPreset?: LightingPreset;
    youtubeUrl?: string;
  }
): SetlistItemDTO {
  const youtubeVideoId = extractYouTubeVideoId(input.youtubeUrl);
  if (input.youtubeUrl?.trim() && !youtubeVideoId) {
    throw new Error('INVALID_YOUTUBE_URL');
  }

  const title = input.title?.trim() || (youtubeVideoId ? `YouTube Track (${youtubeVideoId})` : '');
  if (!title) throw new Error('SETLIST_TITLE_REQUIRED');

  const item: SetlistItemDTO = {
    id: `song-${crypto.randomUUID().slice(0, 6)}`,
    title,
    artistName: input.artistName?.trim() || concert.performerName,
    durationSec: Math.max(30, Math.min(3600, input.durationSec ?? 210)),
    mode: youtubeVideoId ? 'PRERECORDED' : (input.mode ?? 'LIVE'),
    lightingPreset: input.lightingPreset ?? 'WARM_CHAMBER',
    youtubeUrl: youtubeVideoId ? input.youtubeUrl?.trim() : undefined,
    youtubeVideoId,
  };
  concert.setlist.push(item);
  return item;
}

export function removeSetlistItem(concert: ConcertDTO, itemId: string): ConcertDTO {
  if (concert.setlist.length <= 1) {
    throw new Error('SETLIST_CANNOT_BE_EMPTY');
  }
  const idx = concert.setlist.findIndex((s) => s.id === itemId);
  if (idx === -1) throw new Error('SETLIST_ITEM_NOT_FOUND');
  concert.setlist.splice(idx, 1);
  if (concert.currentSetlistIndex >= concert.setlist.length) {
    concert.currentSetlistIndex = Math.max(0, concert.setlist.length - 1);
  }
  return concert;
}

export function reorderSetlist(concert: ConcertDTO, orderedIds: string[]): ConcertDTO {
  const activeItemId = concert.setlist[concert.currentSetlistIndex]?.id;
  const byId = new Map(concert.setlist.map((s) => [s.id, s]));
  const reordered: SetlistItemDTO[] = [];
  for (const id of orderedIds) {
    const found = byId.get(id);
    if (found) {
      reordered.push(found);
      byId.delete(id);
    }
  }
  for (const leftover of byId.values()) {
    reordered.push(leftover);
  }
  concert.setlist = reordered;
  if (activeItemId) {
    const nextIdx = reordered.findIndex((s) => s.id === activeItemId);
    if (nextIdx >= 0) concert.currentSetlistIndex = nextIdx;
  }
  return concert;
}

export function invitePerformerToStage(concert: ConcertDTO, performerUserId: string): ConcertDTO {
  const cleanId = performerUserId.trim();
  if (!cleanId) throw new Error('INVALID_PERFORMER_ID');
  if (!concert.invitedPerformerIds.includes(cleanId)) {
    concert.invitedPerformerIds.push(cleanId);
  }
  return concert;
}
