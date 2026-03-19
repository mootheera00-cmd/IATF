// frontend/src/hooks/useNewBadge.ts
// Tracks which items have been "seen" by the user, using localStorage.
// Storage keys are per-user (suffixed with userId) so each user has their own
// independent seen list — User A seeing an item does NOT mark it seen for User B.
// An item is considered "NEW" if it was created within NEW_DAYS days AND
// the user hasn't opened/clicked it yet.

const NEW_DAYS = 7;    // show NEW badge for items created within 7 days
const PRUNE_DAYS = 30; // remove seen entries older than 30 days

// Current user ID — call setCurrentUser() once after login
let _userId: string = 'guest';

/** Call this once when the user logs in (or on app load when user is known). */
export function setCurrentUser(userId: number | string | null | undefined) {
  _userId = userId != null ? String(userId) : 'guest';
  // Prune old entries for the newly active user
  pruneOldEntries();
}

function storageKey()   { return `seen_items_v1_${_userId}`; }
function storageTsKey() { return `seen_items_ts_v1_${_userId}`; }

function getSeenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function getTsMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageTsKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Remove seen entries that were marked seen more than PRUNE_DAYS ago */
function pruneOldEntries() {
  try {
    const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000;
    const tsMap = getTsMap();
    const set = getSeenSet();
    let changed = false;
    for (const key of [...set]) {
      const ts = tsMap[key];
      if (ts && ts < cutoff) {
        set.delete(key);
        delete tsMap[key];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(storageKey(), JSON.stringify([...set]));
      localStorage.setItem(storageTsKey(), JSON.stringify(tsMap));
    }
  } catch {
    // ignore storage errors
  }
}

function saveSeenSet(set: Set<string>, key: string) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify([...set]));
    const tsMap = getTsMap();
    if (!tsMap[key]) {
      tsMap[key] = Date.now();
      localStorage.setItem(storageTsKey(), JSON.stringify(tsMap));
    }
  } catch {
    // ignore storage errors
  }
}

/** Mark an item as seen (call when user opens/clicks it) */
export function markSeen(type: 'dcr' | 'doc', id: number | string) {
  const key = `${type}:${id}`;
  const set = getSeenSet();
  set.add(key);
  saveSeenSet(set, key);
}

/** Returns true if this item should show the NEW badge */
export function isNew(
  type: 'dcr' | 'doc',
  id: number | string,
  createdAt?: string | null
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return false;
  const ageMs = Date.now() - created.getTime();
  if (ageMs > NEW_DAYS * 24 * 60 * 60 * 1000) return false; // older than 7 days
  const seen = getSeenSet();
  return !seen.has(`${type}:${id}`);
}

/**
 * Count how many items in an array are "new" (≤7 days old AND not yet seen).
 * Each item must have `id` and a date field (pass dateField name, default 'created_at').
 */
export function countNew(
  type: 'dcr' | 'doc',
  items: Array<{ id: number | string; [key: string]: any }>,
  dateField = 'created_at'
): number {
  return items.filter((item) => isNew(type, item.id, item[dateField])).length;
}

/**
 * Return items that are "new" — useful for building a What's New feed.
 */
export function getNewItems<T extends { id: number | string; [key: string]: any }>(
  type: 'dcr' | 'doc',
  items: T[],
  dateField = 'created_at'
): T[] {
  return items.filter((item) => isNew(type, item.id, item[dateField]));
}
