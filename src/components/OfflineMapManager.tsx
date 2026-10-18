import React, { useState, useEffect } from 'react';
import { OfflineMapPackage, RoadNode, RoadSegment, ReliefCentre, RoadSensor } from '../types/floodguard';
import {
  downloadAreaMapPackage,
  getSavedPackages,
  deletePackage,
} from '../services/offlineStorage';
import {
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  Info,
  MapPin,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
  FileDown,
  Upload,
} from 'lucide-react';

interface OfflineMapManagerProps {
  userLocation: [number, number];
  nodes: RoadNode[];
  segments: RoadSegment[];
  reliefCentres: ReliefCentre[];
  sensors: RoadSensor[];
  isOfflineMode: boolean;
  onToggleOfflineMode: (enabled: boolean) => void;
  onClose: () => void;
}

export const OfflineMapManager: React.FC<OfflineMapManagerProps> = ({
  userLocation,
  nodes,
  segments,
  reliefCentres,
  sensors,
  isOfflineMode,
  onToggleOfflineMode,
  onClose,
}) => {
  const [savedPackages, setSavedPackages] = useState<OfflineMapPackage[]>([]);
  const [selectedRadiusKm, setSelectedRadiusKm] = useState<number>(5);
  const [packageName, setPackageName] = useState<string>('Avadi-Ambattur GPS Basin Pack');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    currentTile: number;
    totalTiles: number;
  }>({ percent: 0, currentTile: 0, totalTiles: 0 });
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    const packs = await getSavedPackages();
    setSavedPackages(packs);
  };

  const handleStartDownload = async () => {
    setIsDownloading(true);
    setStatusMessage('Preparing tiles & topological road network...');
    setDownloadProgress({ percent: 0, currentTile: 0, totalTiles: 0 });

    try {
      const pkg = await downloadAreaMapPackage(
        userLocation,
        selectedRadiusKm,
        packageName || `Basin Offline Pack (${selectedRadiusKm}km)`,
        nodes,
        segments,
        reliefCentres,
        sensors,
        (percent, currentTile, totalTiles) => {
          setDownloadProgress({ percent, currentTile, totalTiles });
          setStatusMessage(`Downloading map tile ${currentTile} / ${totalTiles} (${percent}%)...`);
        }
      );

      setStatusMessage(`✅ Successfully packaged and saved ${pkg.tileCount} tiles to local offline storage!`);
      await loadPackages();
    } catch (err) {
      console.error(err);
      setStatusMessage('Download interrupted. Some tiles were saved to cache.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async (pkgId: string) => {
    await deletePackage(pkgId);
    await loadPackages();
  };

  const handleExportPackage = (pkg: OfflineMapPackage) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pkg, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${pkg.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Total offline storage calculation
  const totalCachedBytes = savedPackages.reduce((acc, p) => acc + (p.sizeBytes || 0), 0);
  const totalCachedTiles = savedPackages.reduce((acc, p) => acc + (p.tileCount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Offline Map Package Manager</h2>
              <p className="text-xs text-slate-400">Download, store & route without cell tower or internet connection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Offline Mode Simulator Switcher */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isOfflineMode ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {isOfflineMode ? <WifiOff className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
              </div>
              <div>
                <div className="font-bold text-sm text-white">
                  {isOfflineMode ? 'Offline Simulation Active' : 'Online Network Active'}
                </div>
                <div className="text-xs text-slate-400">
                  {isOfflineMode
                    ? 'Network requests blocked — app is functioning completely offline using local packages.'
                    : 'Real-time telemetry and online OSM tile fetching are active.'}
                </div>
              </div>
            </div>

            <button
              onClick={() => onToggleOfflineMode(!isOfflineMode)}
              className={`px-3.5 py-2 rounded-lg font-bold text-xs transition uppercase tracking-wider ${
                isOfflineMode
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {isOfflineMode ? 'Go Online' : 'Simulate Offline'}
            </button>
          </div>

          {/* Download New Package Section */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-[#ff7700]" />
                Package Current GPS Location
              </h3>
              <span className="text-xs font-mono text-sky-400">
                GPS: {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-mono">Package Label</label>
                <input
                  type="text"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                  placeholder="e.g. Avadi Evacuation Sector 1"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono">Coverage Radius</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[2, 5, 10].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRadiusKm(r)}
                      className={`py-2 rounded-lg border font-semibold text-xs transition ${
                        selectedRadiusKm === r
                          ? 'bg-[#ff7700] text-white border-white'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {r} km {r === 5 ? '(Basin)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Download Progress Bar */}
            {isDownloading && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-sky-400">{statusMessage}</span>
                  <span className="font-bold text-white">{downloadProgress.percent}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-[#ff7700] transition-all duration-200"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {!isDownloading && statusMessage && (
              <div className="text-xs text-emerald-400 font-mono bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-900/60 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            <button
              onClick={handleStartDownload}
              disabled={isDownloading}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg ${
                isDownloading
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-[#ff7700] hover:bg-[#e66c00] text-white'
              }`}
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  Generating Offline Package...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Offline Package for My Area
                </>
              )}
            </button>
          </div>

          {/* Storage Summary Cards */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-mono text-[10px] uppercase">Cached Map Tiles</span>
              <div className="text-lg font-mono font-bold text-sky-400 mt-0.5">
                {totalCachedTiles} <span className="text-xs font-normal text-slate-400">tiles</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-mono text-[10px] uppercase">Storage Consumed</span>
              <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
                {(totalCachedBytes / (1024 * 1024)).toFixed(2)} <span className="text-xs font-normal text-slate-400">MB</span>
              </div>
            </div>
          </div>

          {/* Saved Offline Packages List */}
          <div className="space-y-2">
            <h3 className="font-bold text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Saved Offline Packages ({savedPackages.length})</span>
              <span className="text-sky-400">IndexedDB Storage</span>
            </h3>

            {savedPackages.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No offline map packages saved yet. Download one above to enable offline routing.
              </div>
            ) : (
              savedPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{pkg.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800">
                        {pkg.radiusKm} km radius
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {pkg.tileCount} tiles • {(pkg.sizeBytes / (1024 * 1024)).toFixed(1)} MB • {new Date(pkg.downloadedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleExportPackage(pkg)}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                      title="Export Package JSON"
                    >
                      <FileDown className="w-4 h-4 text-sky-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(pkg.id)}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-800 transition"
                      title="Delete Package"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
          >
            Close Manager
          </button>
        </div>
      </div>
    </div>
  );
};
