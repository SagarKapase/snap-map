import { useState } from "react";
import {
  X, Users, Shield, Eye, Edit3, Trash2, Plus, Clock, Search,
  Crown, UserCheck, UserMinus, AlertCircle, Check, Copy,
} from "lucide-react";

const STORAGE_KEY = "vizroute_workspace";

const DEFAULT_WORKSPACE = {
  name: "My Workspace",
  plan: "Enterprise",
  members: [
    { id: "m1", name: "You (Owner)", email: "owner@company.com", role: "admin", avatar: "Y", joinedAt: "2026-01-15", lastActive: "2026-03-22T10:30:00" },
    { id: "m2", name: "Alice Chen", email: "alice@company.com", role: "editor", avatar: "A", joinedAt: "2026-02-01", lastActive: "2026-03-21T15:45:00" },
    { id: "m3", name: "Bob Smith", email: "bob@company.com", role: "viewer", avatar: "B", joinedAt: "2026-02-20", lastActive: "2026-03-20T09:12:00" },
  ],
  auditLog: [
    { id: "a1", user: "You", action: "Exported API graph as PNG", timestamp: "2026-03-22T10:25:00" },
    { id: "a2", user: "Alice Chen", action: "Edited Environment 'Staging'", timestamp: "2026-03-21T15:40:00" },
    { id: "a3", user: "Bob Smith", action: "Viewed Petstore API collection", timestamp: "2026-03-20T09:10:00" },
    { id: "a4", user: "You", action: "Ran breaking change analysis", timestamp: "2026-03-19T14:00:00" },
    { id: "a5", user: "Alice Chen", action: "Created new mock server config", timestamp: "2026-03-18T11:30:00" },
  ],
  inviteCode: "VIZ-TEAM-A7X9",
};

const loadWorkspace = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_WORKSPACE; } catch { return DEFAULT_WORKSPACE; }
};
const saveWorkspace = (ws) => localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));

const ROLE_CONFIG = {
  admin:  { icon: Crown, color: "#e08efe", label: "Admin", desc: "Full access — manage members, settings, billing" },
  editor: { icon: Edit3, color: "#3aa2ff", label: "Editor", desc: "Can edit collections, run tests, export" },
  viewer: { icon: Eye, color: "#73757a", label: "Viewer", desc: "Read-only access to graphs and docs" },
};

const timeAgo = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const WorkspaceManager = ({ onClose }) => {
  const [workspace, setWorkspace] = useState(loadWorkspace());
  const [activeTab, setActiveTab] = useState("members"); // members | audit | settings
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  const update = (ws) => { setWorkspace(ws); saveWorkspace(ws); };

  const filteredMembers = workspace.members.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const changeRole = (memberId, newRole) => {
    update({ ...workspace, members: workspace.members.map((m) => m.id === memberId ? { ...m, role: newRole } : m) });
  };

  const removeMember = (memberId) => {
    update({
      ...workspace,
      members: workspace.members.filter((m) => m.id !== memberId),
      auditLog: [{ id: `a_${Date.now()}`, user: "You", action: `Removed a team member`, timestamp: new Date().toISOString() }, ...workspace.auditLog],
    });
  };

  const inviteMember = () => {
    if (!inviteEmail.trim()) return;
    const newMember = {
      id: `m_${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail.trim(),
      role: inviteRole,
      avatar: inviteEmail[0].toUpperCase(),
      joinedAt: new Date().toISOString().split("T")[0],
      lastActive: new Date().toISOString(),
    };
    update({
      ...workspace,
      members: [...workspace.members, newMember],
      auditLog: [{ id: `a_${Date.now()}`, user: "You", action: `Invited ${inviteEmail} as ${inviteRole}`, timestamp: new Date().toISOString() }, ...workspace.auditLog],
    });
    setInviteEmail("");
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(workspace.inviteCode);
    setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#46484c]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-[#46484c]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#e08efe]" />
              <h2 className="font-bold text-white text-lg">{workspace.name}</h2>
              <span className="text-[10px] font-bold text-[#e08efe] bg-[#e08efe]/10 px-2 py-0.5 rounded-full uppercase">{workspace.plan}</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-colors"><X size={16} className="text-[#a9abb0]" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#46484c]/20 px-6 flex-shrink-0">
          {[{ id: "members", icon: Users, label: "Members" }, { id: "audit", icon: Clock, label: "Audit Log" }, { id: "settings", icon: Shield, label: "Roles & Access" }].map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === id ? "text-[#e08efe] border-[#e08efe]" : "text-[#73757a] border-transparent hover:text-[#a9abb0]"
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {/* Members tab */}
          {activeTab === "members" && (
            <div className="p-5 space-y-4">
              {/* Invite bar */}
              <div className="flex gap-2">
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && inviteMember()}
                  placeholder="email@company.com"
                  className="flex-1 bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#46484c] focus:border-[#e08efe]/50 transition-all" />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                  className="bg-[#22262b] border border-[#46484c]/30 rounded-lg px-3 py-2 text-xs text-[#a9abb0] focus:outline-none">
                  <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
                </select>
                <button onClick={inviteMember} disabled={!inviteEmail.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all disabled:opacity-40 flex items-center gap-1.5">
                  <Plus size={13} /> Invite
                </button>
              </div>

              {/* Invite code */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-[#46484c]/15 bg-[#171a1e]/30">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#73757a]">Invite Code</p>
                  <p className="text-sm font-mono font-bold text-[#e08efe] mt-0.5">{workspace.inviteCode}</p>
                </div>
                <button onClick={copyInviteCode} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#a9abb0] hover:text-white hover:bg-[#22262b] border border-[#46484c]/20 transition-all flex items-center gap-1.5">
                  {inviteCopied ? <><Check size={12} className="text-[#81ecff]" /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#46484c]" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search members..."
                  className="w-full bg-[#22262b]/40 border border-[#46484c]/20 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder:text-[#46484c] focus:border-[#e08efe]/40 transition-all" />
              </div>

              {/* Member list */}
              <div className="space-y-1.5">
                {filteredMembers.map((member, i) => {
                  const role = ROLE_CONFIG[member.role];
                  const RoleIcon = role.icon;
                  return (
                    <div key={member.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#46484c]/15 bg-[#171a1e]/30 hover:bg-[#171a1e]/50 transition-all group"
                      style={{ animation: `slideInUp 0.15s ease-out ${i * 20}ms both` }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[#0c0e12] flex-shrink-0" style={{ background: role.color }}>
                        {member.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{member.name}</p>
                        <p className="text-[10px] text-[#46484c]">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: `${role.color}15` }}>
                        <RoleIcon size={11} style={{ color: role.color }} />
                        <select value={member.role} onChange={(e) => changeRole(member.id, e.target.value)}
                          className="bg-transparent text-[10px] font-bold uppercase tracking-wider focus:outline-none cursor-pointer" style={{ color: role.color }}>
                          <option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
                        </select>
                      </div>
                      <span className="text-[10px] text-[#46484c] flex-shrink-0 hidden sm:block">{timeAgo(member.lastActive)}</span>
                      <button onClick={() => removeMember(member.id)}
                        className="p-1.5 text-[#46484c] hover:text-[#ff6e84] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <UserMinus size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit log tab */}
          {activeTab === "audit" && (
            <div className="p-5 space-y-1.5">
              {workspace.auditLog.map((entry, i) => (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-[#46484c]/10 bg-[#171a1e]/20 hover:bg-[#171a1e]/40 transition-colors"
                  style={{ animation: `slideInUp 0.15s ease-out ${i * 15}ms both` }}>
                  <Clock size={14} className="text-[#46484c] mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-[#f8f9fe]"><strong className="text-[#e08efe]">{entry.user}</strong> {entry.action}</p>
                    <p className="text-[10px] text-[#46484c] mt-0.5">{new Date(entry.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Roles & Access tab */}
          {activeTab === "settings" && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-[#73757a]">Role permissions for your workspace.</p>
              {Object.entries(ROLE_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <div key={key} className="p-4 rounded-xl border border-[#46484c]/15 bg-[#171a1e]/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={16} style={{ color: config.color }} />
                      <span className="text-sm font-bold" style={{ color: config.color }}>{config.label}</span>
                      <span className="text-[10px] text-[#46484c] bg-[#22262b] px-2 py-0.5 rounded">
                        {workspace.members.filter((m) => m.role === key).length} member{workspace.members.filter((m) => m.role === key).length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="text-xs text-[#73757a]">{config.desc}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(key === "admin" ? ["View", "Edit", "Export", "Delete", "Manage Members", "Billing"] : key === "editor" ? ["View", "Edit", "Export", "Run Tests"] : ["View"]).map((perm) => (
                        <span key={perm} className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-[#46484c]/15 text-[#a9abb0] bg-[#22262b]/40">{perm}</span>
                      ))}
                    </div>
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

export default WorkspaceManager;
