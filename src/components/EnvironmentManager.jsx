import { useState, useEffect } from "react";
import {
  X, Plus, Trash2, Check, Globe, Server, Code, Edit3,
  ChevronDown, Copy, AlertCircle,
} from "lucide-react";

const STORAGE_KEY = "vizroute_environments";

const DEFAULT_ENVS = [
  {
    id: "env_dev",
    name: "Development",
    icon: "code",
    color: "#81ecff",
    variables: { baseUrl: "http://localhost:3000", apiKey: "dev-key-123" },
  },
  {
    id: "env_staging",
    name: "Staging",
    icon: "server",
    color: "#fbbf24",
    variables: { baseUrl: "https://staging.api.example.com", apiKey: "staging-key-456" },
  },
  {
    id: "env_prod",
    name: "Production",
    icon: "globe",
    color: "#ff6e84",
    variables: { baseUrl: "https://api.example.com", apiKey: "prod-key-789" },
  },
];

const ICONS = { code: Code, server: Server, globe: Globe };

const loadEnvs = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored?.length ? stored : DEFAULT_ENVS;
  } catch { return DEFAULT_ENVS; }
};

const saveEnvs = (envs) => localStorage.setItem(STORAGE_KEY, JSON.stringify(envs));

const EnvironmentManager = ({ activeEnvId, onSelectEnv, onClose }) => {
  const [envs, setEnvs] = useState(loadEnvs());
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", variables: {} });
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarVal, setNewVarVal] = useState("");

  useEffect(() => { saveEnvs(envs); }, [envs]);

  const startEdit = (env) => {
    setEditingId(env.id);
    setEditForm({ name: env.name, variables: { ...env.variables } });
    setNewVarKey("");
    setNewVarVal("");
  };

  const saveEdit = () => {
    setEnvs((prev) => prev.map((e) =>
      e.id === editingId ? { ...e, name: editForm.name, variables: { ...editForm.variables } } : e,
    ));
    setEditingId(null);
  };

  const addEnv = () => {
    const newEnv = {
      id: `env_${Date.now()}`,
      name: "New Environment",
      icon: "server",
      color: "#a78bfa",
      variables: { baseUrl: "https://api.example.com" },
    };
    setEnvs((prev) => [...prev, newEnv]);
    startEdit(newEnv);
  };

  const deleteEnv = (id) => {
    setEnvs((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) setEditingId(null);
    if (activeEnvId === id) onSelectEnv(null);
  };

  const addVariable = () => {
    if (!newVarKey.trim()) return;
    setEditForm((prev) => ({
      ...prev,
      variables: { ...prev.variables, [newVarKey.trim()]: newVarVal },
    }));
    setNewVarKey("");
    setNewVarVal("");
  };

  const removeVariable = (key) => {
    setEditForm((prev) => {
      const vars = { ...prev.variables };
      delete vars[key];
      return { ...prev, variables: vars };
    });
  };

  const activeEnv = envs.find((e) => e.id === activeEnvId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#46484c]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#46484c]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-[#e08efe]" />
              <h2 className="font-bold text-white text-lg">Environments</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-colors">
              <X size={16} className="text-[#a9abb0]" />
            </button>
          </div>
          <p className="text-xs text-[#73757a] mt-2">
            Switch environments to replace <code className="text-[#e08efe] bg-[#e08efe]/8 px-1 rounded">{"{{baseUrl}}"}</code> and other variables in your requests.
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Environment list */}
          <div className="p-4 space-y-2">
            {envs.map((env, i) => {
              const Icon = ICONS[env.icon] || Server;
              const isActive = activeEnvId === env.id;
              const isEditing = editingId === env.id;

              return (
                <div key={env.id} style={{ animation: `slideInUp 0.2s ease-out ${i * 30}ms both` }}>
                  {/* Environment card */}
                  <div
                    className={`rounded-xl border transition-all duration-200 ${
                      isActive
                        ? "border-[#e08efe]/40 bg-[#e08efe]/5 shadow-lg shadow-[#e08efe]/5"
                        : "border-[#46484c]/20 bg-[#171a1e]/40 hover:bg-[#171a1e]/60"
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${env.color}15`, border: `1px solid ${env.color}30` }}>
                        <Icon size={14} style={{ color: env.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{env.name}</p>
                        <p className="text-[10px] text-[#46484c]">{Object.keys(env.variables).length} variables</p>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-bold text-[#e08efe] bg-[#e08efe]/10 px-2 py-0.5 rounded-full uppercase">Active</span>
                      )}
                      <button onClick={() => onSelectEnv(isActive ? null : env.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isActive ? "bg-[#22262b] text-[#a9abb0] hover:bg-[#46484c]/30" : "bg-[#e08efe] text-[#0c0e12] hover:bg-[#ce7eec]"
                        }`}>
                        {isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => isEditing ? saveEdit() : startEdit(env)}
                        className="p-1.5 text-[#46484c] hover:text-[#a9abb0] transition-colors">
                        {isEditing ? <Check size={14} className="text-[#81ecff]" /> : <Edit3 size={14} />}
                      </button>
                      <button onClick={() => deleteEnv(env.id)}
                        className="p-1.5 text-[#46484c] hover:text-[#ff6e84] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Edit form */}
                    {isEditing && (
                      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[#46484c]/10 mt-1" style={{ animation: "crossfadeIn 0.2s ease-out both" }}>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#73757a] block mb-1">Name</label>
                          <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full bg-[#22262b]/50 border border-[#46484c]/20 rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e08efe]/40 transition-all" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#73757a] block mb-2">Variables</label>
                          <div className="space-y-1.5">
                            {Object.entries(editForm.variables).map(([key, val]) => (
                              <div key={key} className="flex gap-2 items-center">
                                <span className="text-[10px] font-mono font-bold text-[#e08efe] bg-[#e08efe]/8 px-2 py-1 rounded flex-shrink-0 min-w-[80px]">{key}</span>
                                <input value={val}
                                  onChange={(e) => setEditForm((f) => ({ ...f, variables: { ...f.variables, [key]: e.target.value } }))}
                                  className="flex-1 bg-[#22262b]/50 border border-[#46484c]/20 rounded px-2 py-1 text-[10px] text-white font-mono focus:border-[#e08efe]/40 transition-all" />
                                <button onClick={() => removeVariable(key)} className="text-[#46484c] hover:text-[#ff6e84] p-0.5"><X size={10} /></button>
                              </div>
                            ))}
                          </div>
                          {/* Add new variable */}
                          <div className="flex gap-2 items-center mt-2">
                            <input value={newVarKey} onChange={(e) => setNewVarKey(e.target.value)} placeholder="key"
                              className="flex-1 bg-[#22262b]/50 border border-[#46484c]/20 rounded px-2 py-1 text-[10px] text-white font-mono placeholder:text-[#46484c] focus:border-[#e08efe]/40 transition-all" />
                            <input value={newVarVal} onChange={(e) => setNewVarVal(e.target.value)} placeholder="value"
                              onKeyDown={(e) => e.key === "Enter" && addVariable()}
                              className="flex-1 bg-[#22262b]/50 border border-[#46484c]/20 rounded px-2 py-1 text-[10px] text-white font-mono placeholder:text-[#46484c] focus:border-[#e08efe]/40 transition-all" />
                            <button onClick={addVariable} className="text-[#e08efe] hover:text-[#ce7eec] p-0.5"><Plus size={12} /></button>
                          </div>
                        </div>
                        <button onClick={saveEdit}
                          className="w-full py-2 rounded-lg text-xs font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] flex items-center justify-center gap-2">
                          <Check size={13} /> Save Changes
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add environment */}
            <button onClick={addEnv}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#46484c]/30 text-xs font-bold text-[#73757a] hover:text-[#e08efe] hover:border-[#e08efe]/30 transition-all">
              <Plus size={14} /> Add Environment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentManager;
