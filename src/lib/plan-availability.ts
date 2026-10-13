/** Closed plans retain their historical prices and manually verified metadata. */
export function isClosedToNewUsers(features: unknown): boolean {
  return features != null && typeof features === 'object' && !Array.isArray(features) &&
    (features as Record<string, unknown>).availability === 'closed_to_new_users';
}
