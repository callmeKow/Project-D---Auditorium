import type { ConcertDTO, UserProfile, UserRole, VenueStyle } from '@vmw/contracts';

export function hasAnyRole(userRoles: UserRole[], allowed: UserRole[]): boolean {
  return allowed.some((r) => userRoles.includes(r));
}

export function assertAdminOrHost(user: UserProfile | null): asserts user is UserProfile {
  if (!user) throw new Error('UNAUTHORIZED');
  if (!hasAnyRole(user.roles, ['ADMIN', 'HOST'])) {
    throw new Error('FORBIDDEN');
  }
}

export function canControlConcert(
  userId: string,
  userRoles: UserRole[],
  concert: ConcertDTO,
  venueStyle?: VenueStyle,
  isPrivate = false
): boolean {
  // Public Karaoke & Public Chamber/Opera rooms do not require a Host: any participant can freely sing, play & manage playlist
  if (!isPrivate && (venueStyle === 'KARAOKE' || venueStyle === 'CHAMBER')) return true;
  if (hasAnyRole(userRoles, ['ADMIN', 'HOST', 'ARTIST'])) return true;
  if (concert.hostUserId === userId) return true;
  return concert.invitedPerformerIds.includes(userId);
}
