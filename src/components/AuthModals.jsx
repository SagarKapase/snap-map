import { useState } from "react";
import { X, Mail, Lock, User, Eye, EyeOff, ArrowRight, Github, Chrome } from "lucide-react";

// ─── Login Modal ─────────────────────────────
export const LoginModal = ({ onClose, onSwitchToSignup }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError("Please fill in all fields"); return; }
    setLoading(true);
    setError("");
    // Simulate login
    setTimeout(() => {
      setLoading(false);
      localStorage.setItem("vizroute_user", JSON.stringify({ email, name: email.split("@")[0] }));
      onClose();
      window.location.href = "/app";
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#46484c]/30 overflow-hidden"
        style={{ background: "rgba(12,14,18,0.97)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}>

        {/* Header */}
        <div className="px-8 pt-8 pb-2">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 hover:bg-[#22262b] rounded-lg transition-colors">
            <X size={16} className="text-[#a9abb0]" />
          </button>
          <div className="text-center mb-6">
            <span className="text-2xl font-black text-[#e08efe] tracking-tight">Vizroute</span>
            <h2 className="text-xl font-bold text-white mt-3">Welcome back</h2>
            <p className="text-sm text-[#73757a] mt-1">Sign in to your account</p>
          </div>
        </div>

        {/* Social login */}
        <div className="px-8 space-y-2.5">
          <button className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[#46484c]/30 text-sm font-semibold text-[#a9abb0] hover:bg-[#22262b] hover:text-white transition-all active:scale-[0.98]">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <button className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[#46484c]/30 text-sm font-semibold text-[#a9abb0] hover:bg-[#22262b] hover:text-white transition-all active:scale-[0.98]">
            <Github size={18} />
            Continue with GitHub
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 px-8 my-5">
          <div className="flex-1 h-px bg-[#46484c]/20" />
          <span className="text-[10px] text-[#73757a] font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-[#46484c]/20" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 space-y-3">
          <div className="relative">
            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#46484c]" />
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="Email address"
              className="w-full bg-[#22262b]/50 border border-[#46484c]/30 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#46484c] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all"
              style={{ caretColor: "#e08efe" }} />
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#46484c]" />
            <input type={showPass ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Password"
              className="w-full bg-[#22262b]/50 border border-[#46484c]/30 rounded-xl py-3 pl-11 pr-11 text-sm text-white placeholder:text-[#46484c] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all"
              style={{ caretColor: "#e08efe" }} />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#46484c] hover:text-[#a9abb0] transition-colors">
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-[#ff6e84] flex items-center gap-1.5 px-1">{error}</p>
          )}

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-[#46484c]/50 bg-[#22262b] text-[#e08efe] focus:ring-[#e08efe]/30 focus:ring-offset-0" />
              <span className="text-xs text-[#73757a]">Remember me</span>
            </label>
            <button type="button" className="text-xs text-[#e08efe] hover:text-[#ce7eec] transition-colors font-medium">
              Forgot password?
            </button>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ boxShadow: "0 8px 24px -6px rgba(224,142,254,0.35)" }}>
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#0c0e12]/30 border-t-[#0c0e12] rounded-full animate-spin" />
            ) : (
              <>Sign In <ArrowRight size={16} /></>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="px-8 py-6 text-center">
          <p className="text-sm text-[#73757a]">
            Don't have an account?{" "}
            <button onClick={onSwitchToSignup} className="text-[#e08efe] hover:text-[#ce7eec] font-semibold transition-colors">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Signup Modal ────────────────────────────
export const SignupModal = ({ onClose, onSwitchToLogin }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = (() => {
    if (password.length === 0) return { level: 0, label: "", color: "" };
    if (password.length < 6) return { level: 1, label: "Weak", color: "#ff6e84" };
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return { level: 2, label: "Fair", color: "#fbbf24" };
    return { level: 3, label: "Strong", color: "#34d399" };
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Please fill in all fields"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    setError("");
    setTimeout(() => {
      setLoading(false);
      localStorage.setItem("vizroute_user", JSON.stringify({ email, name }));
      onClose();
      window.location.href = "/app";
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#46484c]/30 overflow-hidden"
        style={{ background: "rgba(12,14,18,0.97)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}>

        {/* Header */}
        <div className="px-8 pt-8 pb-2">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 hover:bg-[#22262b] rounded-lg transition-colors">
            <X size={16} className="text-[#a9abb0]" />
          </button>
          <div className="text-center mb-6">
            <span className="text-2xl font-black text-[#e08efe] tracking-tight">Vizroute</span>
            <h2 className="text-xl font-bold text-white mt-3">Create your account</h2>
            <p className="text-sm text-[#73757a] mt-1">Start visualizing APIs in seconds</p>
          </div>
        </div>

        {/* Social signup */}
        <div className="px-8 space-y-2.5">
          <button className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[#46484c]/30 text-sm font-semibold text-[#a9abb0] hover:bg-[#22262b] hover:text-white transition-all active:scale-[0.98]">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <button className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-[#46484c]/30 text-sm font-semibold text-[#a9abb0] hover:bg-[#22262b] hover:text-white transition-all active:scale-[0.98]">
            <Github size={18} />
            Continue with GitHub
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 px-8 my-5">
          <div className="flex-1 h-px bg-[#46484c]/20" />
          <span className="text-[10px] text-[#73757a] font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-[#46484c]/20" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 space-y-3">
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#46484c]" />
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="Full name"
              className="w-full bg-[#22262b]/50 border border-[#46484c]/30 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#46484c] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all"
              style={{ caretColor: "#e08efe" }} />
          </div>
          <div className="relative">
            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#46484c]" />
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="Email address"
              className="w-full bg-[#22262b]/50 border border-[#46484c]/30 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#46484c] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all"
              style={{ caretColor: "#e08efe" }} />
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#46484c]" />
            <input type={showPass ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Password (min 6 characters)"
              className="w-full bg-[#22262b]/50 border border-[#46484c]/30 rounded-xl py-3 pl-11 pr-11 text-sm text-white placeholder:text-[#46484c] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all"
              style={{ caretColor: "#e08efe" }} />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#46484c] hover:text-[#a9abb0] transition-colors">
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Password strength */}
          {password.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex-1 flex gap-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                    style={{ background: i <= strength.level ? strength.color : "rgba(70,72,76,0.3)" }} />
                ))}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: strength.color }}>{strength.label}</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-[#ff6e84] flex items-center gap-1.5 px-1">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ boxShadow: "0 8px 24px -6px rgba(224,142,254,0.35)" }}>
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#0c0e12]/30 border-t-[#0c0e12] rounded-full animate-spin" />
            ) : (
              <>Create Account <ArrowRight size={16} /></>
            )}
          </button>

          <p className="text-[10px] text-[#46484c] text-center leading-relaxed px-4">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>

        {/* Footer */}
        <div className="px-8 py-6 text-center">
          <p className="text-sm text-[#73757a]">
            Already have an account?{" "}
            <button onClick={onSwitchToLogin} className="text-[#e08efe] hover:text-[#ce7eec] font-semibold transition-colors">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
