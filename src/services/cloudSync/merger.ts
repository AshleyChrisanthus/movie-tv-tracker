import { isMediaMatch } from '../../utils/mediaMatch';
import { isEpisodeAired } from '../../utils/timezone';
import type {
  MediaItem,
  EpisodeItem,
  CompactEpisodeItem,
  CustomList,
  FranchiseCanvas,
  MediaStatus,
  SeriesAirStatus,
  WatchedStatus
} from '../../types';
import type { DecryptedSyncPayload, SyncTombstone, SyncTombstoneType } from './types';

export const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const TOMBSTONES_STORAGE_KEY = 'bingelog_sync_tombstones_v1';

let mutationHook: (() => void) | null = null;
let suppressMutations = false;

export function registerMutationHook(fn: (() => void) | null): void {
  mutationHook = fn;
}

export function notifyLocalMutation(): void {
  if (suppressMutations) return;
  if (mutationHook) {
    try {
      mutationHook();
    } catch {
      // ignore listener errors
    }
  }
}

export async function withSyncSuppressMutations<T>(fn: () => Promise<T>): Promise<T> {
  const prev = suppressMutations;
  suppressMutations = true;
  try {
    return await fn();
  } finally {
    suppressMutations = prev;
  }
}

/**
 * Prune tombstones older than 30 days.
 */
export function pruneTombstones(tombstones: SyncTombstone[]): SyncTombstone[] {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
  const deduped = new Map<string, SyncTombstone>();

  for (const t of tombstones || []) {
    if (!t || !t.id || !t.type || !t.deletedAt) continue;
    const time = new Date(t.deletedAt).getTime();
    if (isNaN(time) || time <= cutoff) continue;

    const key = `${t.type}:${t.id}`;
    const existing = deduped.get(key);
    if (!existing || new Date(existing.deletedAt).getTime() < time) {
      deduped.set(key, {
        id: t.id,
        type: t.type,
        deletedAt: t.deletedAt
      });
    }
  }

  return Array.from(deduped.values());
}

export function getStoredTombstones(): SyncTombstone[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(TOMBSTONES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return pruneTombstones(parsed);
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function saveStoredTombstones(tombstones: SyncTombstone[]): SyncTombstone[] {
  const pruned = pruneTombstones(tombstones);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOMBSTONES_STORAGE_KEY, JSON.stringify(pruned));
    }
  } catch {
    // ignore storage errors
  }
  return pruned;
}

export function recordSyncTombstone(id: string, type: SyncTombstoneType, deletedAt?: string): SyncTombstone[] {
  if (!id) return getStoredTombstones();
  const current = getStoredTombstones();
  current.push({
    id,
    type,
    deletedAt: deletedAt || new Date().toISOString()
  });
  const saved = saveStoredTombstones(current);
  notifyLocalMutation();
  return saved;
}

/**
 * Strip heavy overview/stillUrl fields from EpisodeItem for compact encrypted cloud payloads.
 */
export function toCompactEpisode(ep: EpisodeItem | CompactEpisodeItem): CompactEpisodeItem {
  const compact: CompactEpisodeItem = {
    id: ep.id,
    mediaId: ep.mediaId,
    seasonNumber: Number(ep.seasonNumber) || 1,
    episodeNumber: Number(ep.episodeNumber) || 1,
    title: ep.title || `Episode ${ep.episodeNumber}`,
    isWatched: (ep.isWatched ? 1 : 0) as WatchedStatus,
    watchedAt: ep.watchedAt ?? null
  };
  if (ep.airDate) compact.airDate = ep.airDate;
  if (ep.airstamp) compact.airstamp = ep.airstamp;
  if (ep.runtime !== undefined && ep.runtime !== null) compact.runtime = ep.runtime;
  if (ep.updatedAt) compact.updatedAt = ep.updatedAt;
  return compact;
}

function computeMergedTvStatus(
  currentStatus: MediaStatus,
  episodes: EpisodeItem[],
  airStatus?: SeriesAirStatus,
  networkTz?: string
): MediaStatus {
  if (currentStatus === 'dropped' || currentStatus === 'on_hold') {
    return currentStatus;
  }

  const totalCount = episodes.length;
  if (totalCount === 0) return currentStatus;

  const watchedCount = episodes.filter((e) => e.isWatched === 1).length;
  if (watchedCount === 0) {
    return currentStatus === 'watching' || currentStatus === 'caught_up' ? 'plan_to_watch' : currentStatus;
  }

  const isOngoing =
    airStatus === 'Returning Series' || airStatus === 'Running' || airStatus === 'In Production';

  const airedEpisodes = episodes.filter((e) => isEpisodeAired(e, networkTz));
  const futureEpisodes = episodes.filter((e) => !isEpisodeAired(e, networkTz));
  const unwatchedAiredEpisodes = airedEpisodes.filter((e) => e.isWatched !== 1);

  if (watchedCount === totalCount) {
    return isOngoing ? 'caught_up' : 'completed';
  }

  if (futureEpisodes.length > 0 && unwatchedAiredEpisodes.length === 0) {
    return 'caught_up';
  }

  return 'watching';
}

export interface LocalSyncStateInput {
  media: MediaItem[];
  episodes: Array<EpisodeItem | CompactEpisodeItem>;
  customLists: CustomList[];
  canvases: FranchiseCanvas[];
  tombstones: SyncTombstone[];
  settings?: Record<string, unknown>;
}

export interface MergeSyncResult {
  mergedMedia: MediaItem[];
  mergedEpisodes: EpisodeItem[];
  mergedCompactEpisodes: CompactEpisodeItem[];
  mergedCustomLists: CustomList[];
  mergedCanvases: FranchiseCanvas[];
  mergedTombstones: SyncTombstone[];
  mergedSettings: Record<string, unknown>;
  deletedMediaIds: string[];
  deletedCanvasIds: string[];
  deletedListIds: string[];
  hasChanges: boolean;
}

/**
 * Bi-Directional E2EE Merge Engine for BingeLog (Issue #49).
 */
export function mergeSyncPayload(
  localOrMedia: LocalSyncStateInput | MediaItem[],
  episodesOrRemote: Array<EpisodeItem | CompactEpisodeItem> | DecryptedSyncPayload,
  localCustomListsArg?: CustomList[],
  localCanvasesArg?: FranchiseCanvas[],
  localTombstonesArg?: SyncTombstone[],
  remotePayloadArg?: DecryptedSyncPayload,
  localSettingsArg?: Record<string, unknown>
): MergeSyncResult {
  let localMedia: MediaItem[];
  let localEpisodes: Array<EpisodeItem | CompactEpisodeItem>;
  let localCustomLists: CustomList[];
  let localCanvases: FranchiseCanvas[];
  let localTombstones: SyncTombstone[];
  let localSettings: Record<string, unknown>;
  let remotePayload: DecryptedSyncPayload;

  if (Array.isArray(localOrMedia)) {
    localMedia = localOrMedia;
    localEpisodes = (episodesOrRemote as Array<EpisodeItem | CompactEpisodeItem>) || [];
    localCustomLists = localCustomListsArg || [];
    localCanvases = localCanvasesArg || [];
    localTombstones = localTombstonesArg || [];
    remotePayload = remotePayloadArg!;
    localSettings = localSettingsArg || {};
  } else {
    localMedia = localOrMedia.media || [];
    localEpisodes = localOrMedia.episodes || [];
    localCustomLists = localOrMedia.customLists || [];
    localCanvases = localOrMedia.canvases || [];
    localTombstones = localOrMedia.tombstones || [];
    localSettings = localOrMedia.settings || {};
    remotePayload = episodesOrRemote as DecryptedSyncPayload;
  }

  // 1. Merge and prune tombstones (30-day retention)
  const mergedTombstones = pruneTombstones([
    ...(localTombstones || []),
    ...(remotePayload?.tombstones || [])
  ]);

  const mediaTombstones = new Map<string, number>();
  const listTombstones = new Map<string, number>();
  const canvasTombstones = new Map<string, number>();

  for (const t of mergedTombstones) {
    const deletedMs = new Date(t.deletedAt).getTime();
    if (isNaN(deletedMs)) continue;
    if (t.type === 'media') {
      mediaTombstones.set(t.id, Math.max(mediaTombstones.get(t.id) || 0, deletedMs));
    } else if (t.type === 'list') {
      listTombstones.set(t.id, Math.max(listTombstones.get(t.id) || 0, deletedMs));
    } else if (t.type === 'canvas') {
      canvasTombstones.set(t.id, Math.max(canvasTombstones.get(t.id) || 0, deletedMs));
    }
  }

  // 2. Merge Custom Lists (by id & fallback name, respecting tombstones)
  const listMap = new Map<string, CustomList>();
  const deletedListNames = new Set<string>();
  const deletedListIds: string[] = [];

  const allInputLists = [...(localCustomLists || []), ...(remotePayload?.customLists || [])];
  for (const l of allInputLists) {
    if (!l || !l.id) continue;
    const listTime = new Date(l.updatedAt || l.createdAt || 0).getTime();
    const tombTime = listTombstones.get(l.id);
    if (tombTime !== undefined && tombTime >= listTime) {
      deletedListNames.add(l.name);
      if (!deletedListIds.includes(l.id)) deletedListIds.push(l.id);
      continue;
    }

    // Check if another list with same id or case-insensitive name already exists
    let existingKey = listMap.has(l.id) ? l.id : undefined;
    if (!existingKey && l.name) {
      const lower = l.name.trim().toLowerCase();
      for (const [k, v] of listMap.entries()) {
        if (v.name.trim().toLowerCase() === lower) {
          existingKey = k;
          break;
        }
      }
    }

    if (!existingKey) {
      listMap.set(l.id, { ...l });
    } else {
      const current = listMap.get(existingKey)!;
      const currentTime = new Date(current.updatedAt || current.createdAt || 0).getTime();
      if (listTime >= currentTime) {
        listMap.set(existingKey, {
          ...current,
          ...l,
          id: existingKey
        });
      }
    }
  }

  const mergedCustomLists = Array.from(listMap.values());

  // 3. Merge Media Items (by id & cross-provider deduplication fallback via isMediaMatch)
  const mediaMap = new Map<string, MediaItem>();
  const mediaIdRemap = new Map<string, string>();
  const deletedMediaIds: string[] = [];

  const getMediaTimestamp = (item: MediaItem): number => {
    const t = new Date(item.updatedAt || item.createdAt || 0).getTime();
    return isNaN(t) ? 0 : t;
  };

  const findMatchingMediaInMap = (candidate: MediaItem): MediaItem | undefined => {
    if (mediaMap.has(candidate.id)) {
      return mediaMap.get(candidate.id);
    }
    for (const existing of mediaMap.values()) {
      if (existing.type !== candidate.type) continue;
      if (
        existing.source === candidate.source &&
        existing.externalId !== undefined &&
        candidate.externalId !== undefined &&
        String(existing.externalId) === String(candidate.externalId)
      ) {
        return existing;
      }
      if (isMediaMatch(existing, candidate)) {
        return existing;
      }
    }
    return undefined;
  };

  const mergeTwoMediaItems = (older: MediaItem, newer: MediaItem, canonicalId: string): MediaItem => {
    const mergedLists = Array.from(
      new Set([...(newer.lists || older.lists || [])].filter((name) => !deletedListNames.has(name)))
    );

    return {
      ...older,
      ...newer,
      id: canonicalId,
      imdbId: newer.imdbId || older.imdbId || null,
      tmdbId: newer.tmdbId || older.tmdbId || null,
      tvmazeId: newer.tvmazeId || older.tvmazeId || null,
      thetvdbId: newer.thetvdbId || older.thetvdbId || null,
      collectionId: newer.collectionId ?? older.collectionId ?? null,
      collectionName: newer.collectionName ?? older.collectionName ?? null,
      posterUrl: newer.posterUrl || older.posterUrl || null,
      backdropUrl: newer.backdropUrl || older.backdropUrl || null,
      lists: mergedLists,
      createdAt:
        older.createdAt && newer.createdAt
          ? new Date(older.createdAt).getTime() <= new Date(newer.createdAt).getTime()
            ? older.createdAt
            : newer.createdAt
          : older.createdAt || newer.createdAt || new Date().toISOString(),
      updatedAt: newer.updatedAt || older.updatedAt || new Date().toISOString()
    };
  };

  const processMediaItem = (item: MediaItem) => {
    if (!item || !item.id) return;
    const itemTime = getMediaTimestamp(item);
    const directTombTime = mediaTombstones.get(item.id);
    if (directTombTime !== undefined && directTombTime >= itemTime) {
      if (!deletedMediaIds.includes(item.id)) deletedMediaIds.push(item.id);
      return;
    }

    const existing = findMatchingMediaInMap(item);
    if (!existing) {
      const cleanedLists = (item.lists || []).filter((name) => !deletedListNames.has(name));
      mediaMap.set(item.id, { ...item, lists: cleanedLists });
      return;
    }

    // Check if the existing item's ID or incoming item's ID has a newer tombstone than both items
    const existingTime = getMediaTimestamp(existing);
    const maxItemTime = Math.max(existingTime, itemTime);
    const existingTombTime = mediaTombstones.get(existing.id);
    if (
      (directTombTime !== undefined && directTombTime >= maxItemTime) ||
      (existingTombTime !== undefined && existingTombTime >= maxItemTime)
    ) {
      mediaMap.delete(existing.id);
      if (!deletedMediaIds.includes(existing.id)) deletedMediaIds.push(existing.id);
      if (!deletedMediaIds.includes(item.id)) deletedMediaIds.push(item.id);
      return;
    }

    const canonicalId = existing.id;
    if (item.id !== canonicalId) {
      mediaIdRemap.set(item.id, canonicalId);
      if (!deletedMediaIds.includes(item.id)) {
        deletedMediaIds.push(item.id);
      }
    }

    if (itemTime >= existingTime) {
      mediaMap.set(canonicalId, mergeTwoMediaItems(existing, item, canonicalId));
    } else {
      mediaMap.set(canonicalId, mergeTwoMediaItems(item, existing, canonicalId));
    }
  };

  for (const m of localMedia || []) processMediaItem(m);
  for (const m of remotePayload?.media || []) processMediaItem(m);

  // 4. Merge Episodes per [mediaId + seasonNumber + episodeNumber]
  const validMediaIds = new Set(mediaMap.keys());
  const localMediaTimeMap = new Map<string, number>();
  for (const m of localMedia || []) {
    const cid = mediaIdRemap.get(m.id) || m.id;
    localMediaTimeMap.set(cid, Math.max(localMediaTimeMap.get(cid) || 0, getMediaTimestamp(m)));
  }
  const remoteMediaTimeMap = new Map<string, number>();
  for (const m of remotePayload?.media || []) {
    const cid = mediaIdRemap.get(m.id) || m.id;
    remoteMediaTimeMap.set(cid, Math.max(remoteMediaTimeMap.get(cid) || 0, getMediaTimestamp(m)));
  }

  const episodeMap = new Map<string, EpisodeItem>();

  const toFullEpisode = (ep: EpisodeItem | CompactEpisodeItem, canonicalMediaId: string): EpisodeItem => {
    const s = Number(ep.seasonNumber) || 1;
    const e = Number(ep.episodeNumber) || 1;
    const fullEp = ep as EpisodeItem;
    return {
      id: `${canonicalMediaId}_S${s}E${e}`,
      mediaId: canonicalMediaId,
      seasonNumber: s,
      episodeNumber: e,
      title: ep.title || `Episode ${e}`,
      overview: fullEp.overview || '',
      airDate: ep.airDate || '',
      airstamp: ep.airstamp ?? null,
      runtime: ep.runtime ?? null,
      stillUrl: fullEp.stillUrl || '',
      isWatched: (ep.isWatched ? 1 : 0) as WatchedStatus,
      watchedAt: ep.watchedAt ?? null,
      updatedAt: ep.updatedAt ?? ep.watchedAt ?? null
    };
  };

  const getEpisodeActionTime = (ep: EpisodeItem | CompactEpisodeItem): number => {
    const raw = ep.updatedAt || ep.watchedAt;
    if (!raw) return 0;
    const ms = new Date(raw).getTime();
    return isNaN(ms) ? 0 : ms;
  };

  // Track known episode keys per mediaId on both sides to support clean episode deletions / phantom pruning
  const localEpKeysByMedia = new Map<string, Set<string>>();
  for (const rawEp of localEpisodes || []) {
    if (!rawEp || !rawEp.mediaId) continue;
    const mediaId = mediaIdRemap.get(rawEp.mediaId) || rawEp.mediaId;
    if (!validMediaIds.has(mediaId)) continue;
    let s = localEpKeysByMedia.get(mediaId);
    if (!s) {
      s = new Set();
      localEpKeysByMedia.set(mediaId, s);
    }
    s.add(`${Number(rawEp.seasonNumber) || 1}_${Number(rawEp.episodeNumber) || 1}`);
  }

  const remoteEpKeysByMedia = new Map<string, Set<string>>();
  for (const rawRemoteEp of remotePayload?.episodes || []) {
    if (!rawRemoteEp || !rawRemoteEp.mediaId) continue;
    const mediaId = mediaIdRemap.get(rawRemoteEp.mediaId) || rawRemoteEp.mediaId;
    if (!validMediaIds.has(mediaId)) continue;
    let s = remoteEpKeysByMedia.get(mediaId);
    if (!s) {
      s = new Set();
      remoteEpKeysByMedia.set(mediaId, s);
    }
    s.add(`${Number(rawRemoteEp.seasonNumber) || 1}_${Number(rawRemoteEp.episodeNumber) || 1}`);
  }

  for (const rawEp of localEpisodes || []) {
    if (!rawEp || !rawEp.mediaId) continue;
    const mediaId = mediaIdRemap.get(rawEp.mediaId) || rawEp.mediaId;
    if (!validMediaIds.has(mediaId)) continue;

    const s = Number(rawEp.seasonNumber) || 1;
    const e = Number(rawEp.episodeNumber) || 1;
    const epKey = `${s}_${e}`;

    // If remote state is strictly newer for this media and has episodes, and this episode was deleted in remote, do not retain it
    const localMediaTime = localMediaTimeMap.get(mediaId) || 0;
    const remoteMediaTime = remoteMediaTimeMap.get(mediaId) || 0;
    const remoteKeys = remoteEpKeysByMedia.get(mediaId);
    if (remoteKeys && remoteKeys.size > 0 && remoteMediaTime > localMediaTime && !remoteKeys.has(epKey)) {
      continue;
    }

    const full = toFullEpisode(rawEp, mediaId);
    const key = `${mediaId}_S${full.seasonNumber}E${full.episodeNumber}`;
    episodeMap.set(key, full);
  }

  for (const rawRemoteEp of remotePayload?.episodes || []) {
    if (!rawRemoteEp || !rawRemoteEp.mediaId) continue;
    const mediaId = mediaIdRemap.get(rawRemoteEp.mediaId) || rawRemoteEp.mediaId;
    if (!validMediaIds.has(mediaId)) continue;

    const s = Number(rawRemoteEp.seasonNumber) || 1;
    const e = Number(rawRemoteEp.episodeNumber) || 1;
    const epKey = `${s}_${e}`;

    const localMediaTime = localMediaTimeMap.get(mediaId) || 0;
    const remoteMediaTime = remoteMediaTimeMap.get(mediaId) || 0;
    const localKeys = localEpKeysByMedia.get(mediaId);

    // If local state is strictly newer for this media and has episodes, and this remote episode was deleted locally, do not resurrect it
    if (localKeys && localKeys.size > 0 && localMediaTime > remoteMediaTime && !localKeys.has(epKey)) {
      continue;
    }

    const remoteEp = toFullEpisode(rawRemoteEp, mediaId);
    const key = `${mediaId}_S${remoteEp.seasonNumber}E${remoteEp.episodeNumber}`;
    const localEp = episodeMap.get(key);

    if (!localEp) {
      episodeMap.set(key, remoteEp);
      continue;
    }

    const localEpTime = getEpisodeActionTime(localEp);
    const remoteEpTime = getEpisodeActionTime(remoteEp);

    let mergedIsWatched: WatchedStatus = localEp.isWatched;
    let mergedWatchedAt: string | null = localEp.watchedAt ?? null;
    let mergedUpdatedAt: string | null = localEp.updatedAt ?? localEp.watchedAt ?? null;

    if (localEp.isWatched === remoteEp.isWatched) {
      mergedIsWatched = localEp.isWatched;
      if (remoteEpTime > localEpTime) {
        mergedWatchedAt = remoteEp.watchedAt ?? localEp.watchedAt ?? null;
        mergedUpdatedAt = remoteEp.updatedAt ?? remoteEp.watchedAt ?? mergedUpdatedAt;
      } else {
        mergedWatchedAt = localEp.watchedAt ?? remoteEp.watchedAt ?? null;
      }
    } else {
      // Conflict: one side is watched (1) and the other is unwatched (0)
      if (localEpTime > 0 && remoteEpTime > 0) {
        // Both sides have explicit episode action timestamps (e.g. one watched at T1, one unwatched at T2)
        if (remoteEpTime >= localEpTime) {
          mergedIsWatched = remoteEp.isWatched;
          mergedWatchedAt = remoteEp.isWatched ? (remoteEp.watchedAt || new Date(remoteEpTime).toISOString()) : null;
          mergedUpdatedAt = remoteEp.updatedAt || remoteEp.watchedAt || new Date(remoteEpTime).toISOString();
        } else {
          mergedIsWatched = localEp.isWatched;
          mergedWatchedAt = localEp.isWatched ? (localEp.watchedAt || new Date(localEpTime).toISOString()) : null;
          mergedUpdatedAt = localEp.updatedAt || localEp.watchedAt || new Date(localEpTime).toISOString();
        }
      } else {
        // Only the watched side has a watch timestamp (or neither has updatedAt on the unwatched side)
        const watchedEp = localEp.isWatched === 1 ? localEp : remoteEp;
        const watchTime = getEpisodeActionTime(watchedEp);
        mergedIsWatched = 1;
        mergedWatchedAt =
          watchedEp.watchedAt ||
          new Date(Math.max(watchTime, localMediaTime, remoteMediaTime) || Date.now()).toISOString();
        mergedUpdatedAt = watchedEp.updatedAt || mergedWatchedAt;
      }
    }

    const preferRemoteTitle =
      remoteEp.title &&
      !remoteEp.title.startsWith('Episode ') &&
      (!localEp.title || localEp.title.startsWith('Episode ') || remoteMediaTime >= localMediaTime);

    episodeMap.set(key, {
      id: localEp.id,
      mediaId,
      seasonNumber: localEp.seasonNumber,
      episodeNumber: localEp.episodeNumber,
      title: preferRemoteTitle ? remoteEp.title : localEp.title || remoteEp.title,
      overview: localEp.overview || remoteEp.overview || '',
      airDate: remoteEp.airDate || localEp.airDate || '',
      airstamp: remoteEp.airstamp || localEp.airstamp || null,
      runtime: remoteEp.runtime ?? localEp.runtime ?? null,
      stillUrl: localEp.stillUrl || remoteEp.stillUrl || '',
      isWatched: mergedIsWatched,
      watchedAt: mergedWatchedAt,
      updatedAt: mergedUpdatedAt
    });
  }

  const mergedEpisodes = Array.from(episodeMap.values()).sort((a, b) => {
    if (a.mediaId !== b.mediaId) return a.mediaId.localeCompare(b.mediaId);
    return a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber;
  });

  // Group episodes by mediaId and recalculate parent TV show progress & status
  const episodesByMedia = new Map<string, EpisodeItem[]>();
  for (const ep of mergedEpisodes) {
    let list = episodesByMedia.get(ep.mediaId);
    if (!list) {
      list = [];
      episodesByMedia.set(ep.mediaId, list);
    }
    list.push(ep);
  }

  for (const [mediaId, media] of mediaMap.entries()) {
    if (media.type === 'tv') {
      const showEps = episodesByMedia.get(mediaId) || [];
      if (showEps.length > 0) {
        const watchedEps = showEps.filter((e) => e.isWatched === 1);
        const sortedWatched = watchedEps
          .slice()
          .sort((a, b) => b.seasonNumber - a.seasonNumber || b.episodeNumber - a.episodeNumber);
        const latestWatched = sortedWatched[0];
        const currentSeason = latestWatched ? latestWatched.seasonNumber : media.currentSeason || 1;
        const currentEpisode = latestWatched ? latestWatched.episodeNumber : 0;
        const status = computeMergedTvStatus(
          media.status,
          showEps,
          media.airStatus,
          media.networkTimezone
        );

        mediaMap.set(mediaId, {
          ...media,
          totalEpisodes: showEps.length,
          watchedEpisodesCount: watchedEps.length,
          currentSeason,
          currentEpisode,
          status
        });
      }
    }
  }

  const mergedMedia = Array.from(mediaMap.values()).sort(
    (a, b) => getMediaTimestamp(b) - getMediaTimestamp(a)
  );

  // 5. Merge Franchise Canvases (by id using updatedAt LWW, respecting tombstones)
  const canvasMap = new Map<string, FranchiseCanvas>();
  const deletedCanvasIds: string[] = [];

  const processCanvas = (canvas: FranchiseCanvas) => {
    if (!canvas || !canvas.id) return;
    const canvasTime = new Date(canvas.updatedAt || canvas.createdAt || 0).getTime();
    const tombTime = canvasTombstones.get(canvas.id);
    if (tombTime !== undefined && tombTime >= canvasTime) {
      if (!deletedCanvasIds.includes(canvas.id)) deletedCanvasIds.push(canvas.id);
      return;
    }

    const existing = canvasMap.get(canvas.id);
    if (!existing) {
      canvasMap.set(canvas.id, { ...canvas });
    } else {
      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      if (canvasTime >= existingTime) {
        canvasMap.set(canvas.id, { ...existing, ...canvas });
      }
    }
  };

  for (const c of localCanvases || []) processCanvas(c);
  for (const c of remotePayload?.canvases || []) processCanvas(c);

  const mergedCanvases = Array.from(canvasMap.values());

  // 6. Merge Settings
  const mergedSettings: Record<string, unknown> = {
    ...(remotePayload?.settings || {}),
    ...(localSettings || {})
  };
  if (remotePayload?.settings && localSettings) {
    const remoteUpdated = new Date(remotePayload.updatedAt || 0).getTime();
    const latestLocalMedia = localMedia.reduce((max, m) => Math.max(max, getMediaTimestamp(m)), 0);
    if (remoteUpdated >= latestLocalMedia) {
      Object.assign(mergedSettings, localSettings, remotePayload.settings);
    }
  }

  // 7. Determine if local state changed
  const localMediaById = new Map((localMedia || []).map((m) => [m.id, m]));
  const hasMediaChanged =
    mergedMedia.length !== (localMedia || []).length ||
    mergedMedia.some((m) => {
      const loc = localMediaById.get(m.id);
      if (!loc) return true;
      return (
        loc.updatedAt !== m.updatedAt ||
        loc.status !== m.status ||
        loc.watchedEpisodesCount !== m.watchedEpisodesCount ||
        loc.totalEpisodes !== m.totalEpisodes ||
        loc.currentSeason !== m.currentSeason ||
        loc.currentEpisode !== m.currentEpisode ||
        loc.currentPage !== m.currentPage ||
        loc.currentChapter !== m.currentChapter ||
        loc.currentDurationSeconds !== m.currentDurationSeconds ||
        loc.rating !== m.rating ||
        loc.notes !== m.notes ||
        Boolean(loc.isPinned) !== Boolean(m.isPinned) ||
        JSON.stringify(loc.lists || []) !== JSON.stringify(m.lists || [])
      );
    });

  const localEpById = new Map((localEpisodes || []).map((e) => [e.id, e]));
  const hasEpisodesChanged =
    mergedEpisodes.length !== (localEpisodes || []).length ||
    mergedEpisodes.some((e) => {
      const loc = localEpById.get(e.id);
      if (!loc) return true;
      return loc.isWatched !== e.isWatched || (loc.watchedAt || null) !== (e.watchedAt || null);
    });

  const hasListsChanged =
    mergedCustomLists.length !== (localCustomLists || []).length ||
    JSON.stringify(mergedCustomLists) !== JSON.stringify(localCustomLists || []);

  const hasCanvasesChanged =
    mergedCanvases.length !== (localCanvases || []).length ||
    mergedCanvases.some((c) => {
      const loc = (localCanvases || []).find((lc) => lc.id === c.id);
      if (!loc) return true;
      return loc.updatedAt !== c.updatedAt || JSON.stringify(loc.nodes) !== JSON.stringify(c.nodes);
    });

  const hasTombstonesChanged = mergedTombstones.length !== (localTombstones || []).length;

  return {
    mergedMedia,
    mergedEpisodes,
    mergedCompactEpisodes: mergedEpisodes.map(toCompactEpisode),
    mergedCustomLists,
    mergedCanvases,
    mergedTombstones,
    mergedSettings,
    deletedMediaIds,
    deletedCanvasIds,
    deletedListIds,
    hasChanges:
      hasMediaChanged ||
      hasEpisodesChanged ||
      hasListsChanged ||
      hasCanvasesChanged ||
      hasTombstonesChanged
  };
}
