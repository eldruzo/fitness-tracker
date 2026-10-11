import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BodyEntry, Counters, DayLog, DayOverride } from './types';

export const DB_NAME = 'gym-log';
/**
 * IndexedDB schema version. To change the schema: bump this, then add a
 * `case` to `upgrade` below. Cases fall through so every step runs in order
 * from the user's old version.
 */
export const DB_VERSION = 1;

interface GymDB extends DBSchema {
  days: { key: string; value: DayLog };
  overrides: { key: string; value: DayOverride };
  body: { key: string; value: BodyEntry; indexes: { date: string } };
  counters: { key: string; value: Counters };
  meta: { key: string; value: unknown };
}

export type StoreName = 'days' | 'overrides' | 'body' | 'counters';

let dbp: Promise<IDBPDatabase<GymDB>> | null = null;

export function db(): Promise<IDBPDatabase<GymDB>> {
  if (!dbp) {
    dbp = openDB<GymDB>(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        switch (oldVersion) {
          case 0: {
            d.createObjectStore('days', { keyPath: 'date' });
            d.createObjectStore('overrides', { keyPath: 'date' });
            const body = d.createObjectStore('body', { keyPath: 'ts' });
            body.createIndex('date', 'date');
            d.createObjectStore('counters', { keyPath: 'date' });
            d.createObjectStore('meta');
          }
          // case 1: future migrations go here
        }
      },
      blocked() {
        // Another tab holds an older version open; it will reload on versionchange.
      },
      blocking() {
        // A newer version of the app wants to upgrade: close so it can.
        dbp?.then((x) => x.close());
        dbp = null;
      },
      terminated() {
        dbp = null;
      },
    }).catch((e) => {
      dbp = null;
      throw e;
    });
  }
  return dbp;
}

export async function getAll<S extends StoreName>(store: S): Promise<unknown[]> {
  return (await db()).getAll(store);
}

export async function put<S extends StoreName>(store: S, value: GymDB[S]['value']): Promise<void> {
  await (await db()).put(store, value);
}

export async function del(store: StoreName, key: string): Promise<void> {
  await (await db()).delete(store, key);
}

export async function getMeta(key: string): Promise<unknown> {
  return (await db()).get('meta', key);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

export async function allMeta(): Promise<Record<string, unknown>> {
  const d = await db();
  const tx = d.transaction('meta');
  const keys = await tx.store.getAllKeys();
  const values = await tx.store.getAll();
  await tx.done;
  return Object.fromEntries(keys.map((k, i) => [String(k), values[i]]));
}

/** Writes many records atomically: either all land or none. */
export async function putMany(writes: {
  days?: DayLog[];
  overrides?: DayOverride[];
  body?: BodyEntry[];
  counters?: Counters[];
  deleteOverrides?: string[];
}): Promise<void> {
  const d = await db();
  const tx = d.transaction(['days', 'overrides', 'body', 'counters'], 'readwrite');
  for (const x of writes.days ?? []) tx.objectStore('days').put(x);
  for (const x of writes.overrides ?? []) tx.objectStore('overrides').put(x);
  for (const x of writes.body ?? []) tx.objectStore('body').put(x);
  for (const x of writes.counters ?? []) tx.objectStore('counters').put(x);
  for (const k of writes.deleteOverrides ?? []) tx.objectStore('overrides').delete(k);
  await tx.done;
}

/** Replaces everything in one transaction (backup restore / reset). */
export async function replaceAll(data: {
  days: DayLog[];
  overrides: DayOverride[];
  body: BodyEntry[];
  counters: Counters[];
  meta: Record<string, unknown>;
}): Promise<void> {
  const d = await db();
  const tx = d.transaction(['days', 'overrides', 'body', 'counters', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('days').clear(),
    tx.objectStore('overrides').clear(),
    tx.objectStore('body').clear(),
    tx.objectStore('counters').clear(),
    tx.objectStore('meta').clear(),
  ]);
  for (const x of data.days) tx.objectStore('days').put(x);
  for (const x of data.overrides) tx.objectStore('overrides').put(x);
  for (const x of data.body) tx.objectStore('body').put(x);
  for (const x of data.counters) tx.objectStore('counters').put(x);
  for (const [k, v] of Object.entries(data.meta)) tx.objectStore('meta').put(v, k);
  await tx.done;
}
