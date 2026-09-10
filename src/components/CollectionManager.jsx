import { useState, useEffect, useRef } from "react";
import {
  FolderOpen, Save, Trash2, X, Clock, FileJson, Globe, Braces,
  ChevronRight, AlertCircle, Check, Loader2,
} from "lucide-react";
import { putPayload, getPayload, deletePayload, safeSetItem } from "../utils/store";

const STORAGE_KEY = "vizroute_collections";
const PAYLOAD_PREFIX = "collection:";

// Only the metadata is kept in localStorage. A single real spec is larger
// than the whole localStorage quota allows, and setItem throws rather than
// degrading — the save used to fail with an uncaught QuotaExceededError.
const payloadKey = (id) => `${PAYLOAD_PREFIX}${id}`;

const getCollections = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveCollections = (collections) =>
  safeSetItem(STORAGE_KEY, JSON.stringify(collections));

const formatIcon = (format) => {
  if (format?.includes("OpenAPI") || format?.includes("Swagger")) return Globe;
  if (format?.includes("Postman")) return FileJson;
  return Braces;
};

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

// ─── Save modal ──────────────────────────────
export const SaveCollectionModal = ({ data, format, onClose, onSaved }) => {
  const [name, setName] = useState(
    data?.info?.name || data?.info?.title || data?.name || "Untitled API",
  );
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const collections = getCollections();
    const entry = {
      id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      format: format || "Unknown",
      savedAt: new Date().toISOString(),
      nodeCount: 0,
    };
    // Count nodes roughly
    if (data?.paths) entry.nodeCount = Object.keys(data.paths).length;
    else if (data?.item) {
      let c = 0;
      const walk = (items) => items.forEach((i) => { c++; if (i.item) walk(i.item); });
      walk(data.item);
      entry.nodeCount = c;
    }
    const stored = await putPayload(payloadKey(entry.id), data);
    if (!stored) {
      setSaving(false);
      setError(
        "Browser storage refused this specification — it is too large, or storage is disabled for this site.",
      );
      return;
    }

    collections.unshift(entry);
    // Keep max 20, and drop the payloads that fall off the end with them.
    const evicted = collections.splice(20);
    evicted.forEach((c) => deletePayload(payloadKey(c.id)));

    if (!saveCollections(collections)) {
      await deletePayload(payloadKey(entry.id));
      setSaving(false);
      setError("Could not write to browser storage.");
      return;
    }

    setSaving(false);
    onSaved?.(entry);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl border border-[#46484c]/30 overflow-hidden"
        style={{ background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        <div className="px-6 py-5 border-b border-[#46484c]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Save size={18} className="text-[#e08efe]" />
              <h2 className="font-bold text-white text-lg">Save Collection</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-colors">
              <X size={16} className="text-[#a9abb0]" />
            </button>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] block mb-2">Collection Name</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="w-full bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#73757a] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all"
              placeholder="My API Collection"
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-[#73757a]">
            <span className="px-2 py-1 bg-[#22262b] rounded border border-[#46484c]/20 font-mono">{format || "Unknown"}</span>
            <span>Saved to browser storage</span>
          </div>
          {error && (
            <p className="rounded-lg border border-[#ff6e84]/25 bg-[#ff6e84]/[0.07] px-3 py-2 text-xs leading-relaxed text-[#fda4af]">
              {error}
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#46484c]/20 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#46484c]/30 text-[#a9abb0] text-sm font-semibold hover:bg-[#22262b] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-lg bg-[#e08efe] text-[#0c0e12] text-sm font-bold hover:bg-[#ce7eec] transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Collections list modal ──────────────────
export const CollectionsModal = ({ onClose, onLoad }) => {
  const [collections, setCollections] = useState(getCollections());
  const [deleting, setDeleting] = useState(null);

  const [loadError, setLoadError] = useState("");

  const handleDelete = (id) => {
    setDeleting(id);
    setTimeout(() => {
      const updated = collections.filter((c) => c.id !== id);
      saveCollections(updated);
      deletePayload(payloadKey(id));
      setCollections(updated);
      setDeleting(null);
    }, 200);
  };

  const handleLoad = async (entry) => {
    // Entries written before the payload split still carry `data` inline.
    const data = entry.data || (await getPayload(payloadKey(entry.id)));
    if (!data) {
      setLoadError(`"${entry.name}" is no longer in browser storage.`);
      return;
    }
    onLoad(data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#46484c]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "80vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        <div className="px-6 py-5 border-b border-[#46484c]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen size={18} className="text-[#e08efe]" />
              <h2 className="font-bold text-white text-lg">Collections</h2>
              <span className="text-xs text-[#73757a] bg-[#22262b] px-2 py-0.5 rounded-full">{collections.length}</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-colors">
              <X size={16} className="text-[#a9abb0]" />
            </button>
          </div>
        </div>

        {loadError && (
          <p className="flex-shrink-0 border-b border-[#46484c]/20 bg-[#ff6e84]/[0.07] px-6 py-2.5 text-xs text-[#fda4af]">
            {loadError}
          </p>
        )}

        <div className="flex-1 overflow-auto">
          {collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FolderOpen size={40} className="text-[#46484c] mb-3" />
              <p className="text-[#73757a] text-sm">No saved collections</p>
              <p className="text-[#46484c] text-xs mt-1">Save a spec from the graph view to see it here</p>
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {collections.map((entry, i) => {
                const Icon = formatIcon(entry.format);
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 cursor-pointer group transition-all duration-200 ${
                      deleting === entry.id ? "opacity-30 scale-95" : ""
                    }`}
                    style={{ animation: `slideInUp 0.2s ease-out ${i * 30}ms both` }}
                    onClick={() => handleLoad(entry)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#e08efe]/8 border border-[#e08efe]/15 flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-[#e08efe]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate group-hover:text-[#e08efe] transition-colors">
                        {entry.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[#73757a] font-mono">{entry.format}</span>
                        {entry.nodeCount > 0 && (
                          <span className="text-[10px] text-[#46484c]">{entry.nodeCount} nodes</span>
                        )}
                        <span className="text-[10px] text-[#46484c] flex items-center gap-1">
                          <Clock size={8} /> {timeAgo(entry.savedAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#46484c] group-hover:text-[#a9abb0] transition-colors flex-shrink-0" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                      className="p-1.5 rounded-lg text-[#46484c] hover:text-[#ff6e84] hover:bg-[#ff6e84]/10 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
