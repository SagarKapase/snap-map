import { useState, useEffect } from "react";
import {
  X, Plus, Trash2, Check, Globe, Server, Code, Edit3,
  ChevronDown, Copy, AlertCircle,
} from "lucide-react";
import { loadEnvironments, saveEnvironments } from "../utils/environments";

const ICONS = { code: Code, server: Server, globe: Globe };

const EnvironmentManager = ({ activeEnvId, onSelectEnv, onClose }) => {
  const [envs, setEnvs] = useState(loadEnvironments());
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", variables: {} });
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarVal, setNewVarVal] = useState("");

  useEffect(() => { saveEnvironments(envs); }, [envs]);

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
      // No invented host: the point of an environment is the real value.
      variables: { baseUrl: "" },
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


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#222a39]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#222a39]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-[#a855f7]" />
              <h2 className="font-bold text-white text-lg">Environments</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#121824] rounded-lg transition-colors">
              <X size={16} className="text-[#a4acbc]" />
            </button>
          </div>
          <p className="text-xs text-[#6f7788] mt-2">
            Switch environments to replace <code className="text-[#a855f7] bg-[#a855f7]/8 px-1 rounded">{"{{baseUrl}}"}</code> and other variables in your requests.
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
                        ? "border-[#a855f7]/40 bg-[#a855f7]/5 shadow-lg shadow-[#a855f7]/5"
                        : "border-[#222a39]/20 bg-[#0f141d]/40 hover:bg-[#0f141d]/60"
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${env.color}15`, border: `1px solid ${env.color}30` }}>
                        <Icon size={14} style={{ color: env.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{env.name}</p>
                        <p className="text-[10px] text-[#222a39]">{Object.keys(env.variables).length} variables</p>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-bold text-[#a855f7] bg-[#a855f7]/10 px-2 py-0.5 rounded-full uppercase">Active</span>
                      )}
                      <button onClick={() => onSelectEnv(isActive ? null : env.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isActive ? "bg-[#121824] text-[#a4acbc] hover:bg-[#222a39]/30" : "bg-[#a855f7] text-[#080b12] hover:bg-[#c45cff]"
                        }`}>
                        {isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => isEditing ? saveEdit() : startEdit(env)}
                        className="p-1.5 text-[#222a39] hover:text-[#a4acbc] transition-colors">
                        {isEditing ? <Check size={14} className="text-[#60a5fa]" /> : <Edit3 size={14} />}
                      </button>
                      <button onClick={() => deleteEnv(env.id)}
                        className="p-1.5 text-[#222a39] hover:text-[#f43f5e] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Edit form */}
                    {isEditing && (
                      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[#222a39]/10 mt-1" style={{ animation: "crossfadeIn 0.2s ease-out both" }}>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#6f7788] block mb-1">Name</label>
                          <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full bg-[#121824]/50 border border-[#222a39]/20 rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#a855f7]/40 transition-all" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#6f7788] block mb-2">Variables</label>
                          <div className="space-y-1.5">
                            {Object.entries(editForm.variables).map(([key, val]) => (
                              <div key={key} className="flex gap-2 items-center">
                                <span className="text-[10px] font-mono font-bold text-[#a855f7] bg-[#a855f7]/8 px-2 py-1 rounded flex-shrink-0 min-w-[80px]">{key}</span>
                                <input value={val}
                                  onChange={(e) => setEditForm((f) => ({ ...f, variables: { ...f.variables, [key]: e.target.value } }))}
                                  className="flex-1 bg-[#121824]/50 border border-[#222a39]/20 rounded px-2 py-1 text-[10px] text-white font-mono focus:border-[#a855f7]/40 transition-all" />
                                <button onClick={() => removeVariable(key)} className="text-[#222a39] hover:text-[#f43f5e] p-0.5"><X size={10} /></button>
                              </div>
                            ))}
                          </div>
                          {/* Add new variable */}
                          <div className="flex gap-2 items-center mt-2">
                            <input value={newVarKey} onChange={(e) => setNewVarKey(e.target.value)} placeholder="key"
                              className="flex-1 bg-[#121824]/50 border border-[#222a39]/20 rounded px-2 py-1 text-[10px] text-white font-mono placeholder:text-[#222a39] focus:border-[#a855f7]/40 transition-all" />
                            <input value={newVarVal} onChange={(e) => setNewVarVal(e.target.value)} placeholder="value"
                              onKeyDown={(e) => e.key === "Enter" && addVariable()}
                              className="flex-1 bg-[#121824]/50 border border-[#222a39]/20 rounded px-2 py-1 text-[10px] text-white font-mono placeholder:text-[#222a39] focus:border-[#a855f7]/40 transition-all" />
                            <button onClick={addVariable} className="text-[#a855f7] hover:text-[#c45cff] p-0.5"><Plus size={12} /></button>
                          </div>
                        </div>
                        <button onClick={saveEdit}
                          className="w-full py-2 rounded-lg text-xs font-bold text-[#080b12] bg-[#a855f7] hover:bg-[#c45cff] transition-all active:scale-[0.97] flex items-center justify-center gap-2">
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
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#222a39]/30 text-xs font-bold text-[#6f7788] hover:text-[#a855f7] hover:border-[#a855f7]/30 transition-all">
              <Plus size={14} /> Add Environment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentManager;
