// Local persistence: IndexedDB (idb-keyval) with a localStorage fallback. No network, no account.
import { get, set, del } from 'idb-keyval';
import { type SaveData, deserialize, serialize } from './saveSchema';

const KEY = 'borneo-sentinel-save';

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = await get<string>(KEY);
    if (raw) return deserialize(raw);
  } catch {
    // IndexedDB unavailable (private mode / blocked): fall through to localStorage.
  }
  try {
    return deserialize(localStorage.getItem(KEY));
  } catch {
    return deserialize(null);
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSave(data: SaveData): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void writeSave(data);
  }, 400);
}

export async function writeSave(data: SaveData): Promise<void> {
  const text = serialize(data);
  try {
    await set(KEY, text);
    return;
  } catch {
    // fall back below
  }
  try {
    localStorage.setItem(KEY, text);
  } catch {
    // Storage full or blocked: the game keeps running without saving.
  }
}

export async function clearSave(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
