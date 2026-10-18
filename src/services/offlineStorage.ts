import { OfflineMapPackage, RoadNode, RoadSegment, ReliefCentre, RoadSensor } from '../types/floodguard';

const DB_NAME = 'FloodGuardOfflineDB';
const DB_VERSION = 1;
const STORE_PACKAGES = 'map_packages';
const STORE_TILES = 'map_tiles';
const CACHE_NAME = 'floodguard-osm-tiles-v1';

/**
 * Converts latitude and longitude to Slippy Map tile numbers at zoom level z
 */
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
  return { x, y };
}

/**
 * Opens or initializes the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
        db.createObjectStore(STORE_PACKAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_TILES)) {
        db.createObjectStore(STORE_TILES, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generates an offline package around the user GPS location or basin center
 */
export async function downloadAreaMapPackage(
  center: [number, number],
  radiusKm: number,
  packageName: string,
  nodes: RoadNode[],
  segments: RoadSegment[],
  reliefCentres: ReliefCentre[],
  sensors: RoadSensor[],
  onProgress: (percent: number, currentTile: number, totalTiles: number) => void
): Promise<OfflineMapPackage> {
  const zoomLevels = [13, 14, 15];
  const deltaLat = radiusKm / 111.0;
  const deltaLng = radiusKm / (111.0 * Math.cos((center[0] * Math.PI) / 180));

  const minLat = center[0] - deltaLat;
  const maxLat = center[0] + deltaLat;
  const minLng = center[1] - deltaLng;
  const maxLng = center[1] + deltaLng;

  // Calculate required tiles across zoom levels
  const tileList: Array<{ z: number; x: number; y: number; url: string }> = [];

  for (const z of zoomLevels) {
    const topLeft = latLngToTile(maxLat, minLng, z);
    const bottomRight = latLngToTile(minLat, maxLng, z);

    for (let x = Math.min(topLeft.x, bottomRight.x); x <= Math.max(topLeft.x, bottomRight.x); x++) {
      for (let y = Math.min(topLeft.y, bottomRight.y); y <= Math.max(topLeft.y, bottomRight.y); y++) {
        tileList.push({
          z,
          x,
          y,
          url: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        });
      }
    }
  }

  const totalTiles = tileList.length;
  let downloadedTiles = 0;
  let totalBytes = 0;

  let cache: Cache | null = null;
  if ('caches' in window) {
    try {
      cache = await caches.open(CACHE_NAME);
    } catch {
      cache = null;
    }
  }

  const db = await openDB();

  // Download tile batches with concurrency control to be polite to tile servers
  const batchSize = 4;
  for (let i = 0; i < tileList.length; i += batchSize) {
    const batch = tileList.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (tile) => {
        try {
          const resp = await fetch(tile.url, { mode: 'cors', cache: 'force-cache' });
          if (resp.ok) {
            const blob = await resp.blob();
            totalBytes += blob.size;

            if (cache) {
              await cache.put(tile.url, new Response(blob));
            }

            // Also store binary data in IndexedDB for 100% offline persistence
            const reader = new FileReader();
            await new Promise<void>((res) => {
              reader.onloadend = () => {
                const dataUrl = reader.result as string;
                const tx = db.transaction(STORE_TILES, 'readwrite');
                tx.objectStore(STORE_TILES).put({
                  key: `${tile.z}/${tile.x}/${tile.y}`,
                  dataUrl,
                  size: blob.size,
                });
                tx.oncomplete = () => res();
                tx.onerror = () => res();
              };
              reader.readAsDataURL(blob);
            });
          }
        } catch {
          // If offline or blocked by CORS during download, continue gracefully
        }
        downloadedTiles++;
        onProgress(Math.round((downloadedTiles / totalTiles) * 100), downloadedTiles, totalTiles);
      })
    );
  }

  // Filter road nodes, segments, relief centres within selected bounds + 25% buffer
  const bufferLat = deltaLat * 1.25;
  const bufferLng = deltaLng * 1.25;

  const pkgNodes = nodes.filter(
    (n) =>
      n.lat >= center[0] - bufferLat &&
      n.lat <= center[0] + bufferLat &&
      n.lng >= center[1] - bufferLng &&
      n.lng <= center[1] + bufferLng
  );

  const nodeIds = new Set(pkgNodes.map((n) => n.id));
  const pkgSegments = segments.filter(
    (s) => nodeIds.has(s.sourceNodeId) || nodeIds.has(s.targetNodeId)
  );

  const pkgRelief = reliefCentres.filter(
    (r) =>
      r.lat >= center[0] - bufferLat &&
      r.lat <= center[0] + bufferLat &&
      r.lng >= center[1] - bufferLng &&
      r.lng <= center[1] + bufferLng
  );

  const pkgSensors = sensors.filter(
    (s) =>
      s.lat >= center[0] - bufferLat &&
      s.lat <= center[0] + bufferLat &&
      s.lng >= center[1] - bufferLng &&
      s.lng <= center[1] + bufferLng
  );

  const pkg: OfflineMapPackage = {
    id: `pkg-${Date.now()}`,
    name: packageName || `Offline Basin Pack (${radiusKm}km)`,
    center,
    radiusKm,
    downloadedAt: new Date().toISOString(),
    tileCount: downloadedTiles,
    sizeBytes: totalBytes || downloadedTiles * 18500, // Approx 18.5KB per tile
    zoomLevels,
    nodes: pkgNodes.length > 0 ? pkgNodes : nodes,
    segments: pkgSegments.length > 0 ? pkgSegments : segments,
    reliefCentres: pkgRelief.length > 0 ? pkgRelief : reliefCentres,
    sensors: pkgSensors.length > 0 ? pkgSensors : sensors,
  };

  // Save package metadata to IndexedDB
  const tx = db.transaction(STORE_PACKAGES, 'readwrite');
  tx.objectStore(STORE_PACKAGES).put(pkg);

  // Also save to localStorage for quick bootstrap
  try {
    const existingPacks = JSON.parse(localStorage.getItem('floodguard_offline_packages') || '[]');
    existingPacks.unshift(pkg);
    localStorage.setItem('floodguard_offline_packages', JSON.stringify(existingPacks.slice(0, 5)));
  } catch {
    // LocalStorage quota may be reached
  }

  return pkg;
}

/**
 * Gets all saved offline map packages
 */
export async function getSavedPackages(): Promise<OfflineMapPackage[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PACKAGES, 'readonly');
      const store = tx.objectStore(STORE_PACKAGES);
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          resolve(req.result);
        } else {
          const fromLocal = JSON.parse(localStorage.getItem('floodguard_offline_packages') || '[]');
          resolve(fromLocal);
        }
      };
      req.onerror = () => {
        const fromLocal = JSON.parse(localStorage.getItem('floodguard_offline_packages') || '[]');
        resolve(fromLocal);
      };
    });
  } catch {
    const fromLocal = JSON.parse(localStorage.getItem('floodguard_offline_packages') || '[]');
    return fromLocal;
  }
}

/**
 * Deletes an offline package
 */
export async function deletePackage(packageId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PACKAGES, 'readwrite');
    tx.objectStore(STORE_PACKAGES).delete(packageId);

    const fromLocal = JSON.parse(localStorage.getItem('floodguard_offline_packages') || '[]');
    const filtered = fromLocal.filter((p: OfflineMapPackage) => p.id !== packageId);
    localStorage.setItem('floodguard_offline_packages', JSON.stringify(filtered));
  } catch {
    // Ignored
  }
}

/**
 * Checks if a specific tile is cached in local storage
 */
export async function getCachedTile(z: number, x: number, y: number): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TILES, 'readonly');
      const req = tx.objectStore(STORE_TILES).get(`${z}/${x}/${y}`);
      req.onsuccess = () => {
        if (req.result && req.result.dataUrl) {
          resolve(req.result.dataUrl);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
