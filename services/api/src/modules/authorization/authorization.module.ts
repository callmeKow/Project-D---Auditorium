import type { ConcertDTO, UserProfile, UserRole } from '@vmw/contracts';

export function hasAnyRole(userRoles: UserRole[], allowed: UserRole[]): boolean {
  return allowed.some((r) => userRoles.includes(r));
}

export function assertAdminOrHost(user: UserProfile | null): asserts user is UserProfile {
  if (!user) throw new Error('UNAUTHORIZED');
  if (!hasAnyRole(user.roles, ['ADMIN', 'HOST'])) {
    throw new Error('FORBIDDEN');
  }
}

export function canControlConcert(userId: string, userRoles: UserRole[], concert: ConcertDTO): boolean {
  if (hasAnyRole(userRoles, ['ADMIN', 'HOST', 'ARTIST'])) return true;
  if (concert.hostUserId === userId) return true;
  return concert.invitedPerformerIds.includes(userId);
}
