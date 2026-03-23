import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play, ChevronRight, Layers, Zap, Search, Share2, Download,
  Shield, Globe, GitCompareArrows, Activity, BarChart3, Server,
  Users, BookOpen, Network, ArrowRight, CheckCircle, Star,
  Code, Terminal, Eye, Lock, Sparkles, FileJson, MousePointerClick,
} from "lucide-react";

// ─── Typewriter ──────────────────────────────
const TypewriterLoop = ({ words, speed = 80, pause = 2000 }) => {
  const [text, setText] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIdx];
    const timer = setTimeout(() => {
      if (!deleting) {
        setText(word.slice(0, charIdx + 1));
        if (charIdx + 1 === word.length) setTimeout(() => setDeleting(true), pause);
        else setCharIdx(charIdx + 1);
      } else {
        setText(word.slice(0, charIdx));
        if (charIdx === 0) { setDeleting(false); setWordIdx((wordIdx + 1) % words.length); }
        else setCharIdx(charIdx - 1);
      }
    }, deleting ? 40 : speed);
    return () => clearTimeout(timer);
  }, [charIdx, deleting, wordIdx, words, speed, pause]);

  return <>{text}<span className="typewriter-cursor" /></>;
};

// ─── Feature card ────────────────────────────
const FeatureCard = ({ icon: Icon, title, desc, color, delay }) => (
  <div
    className="p-6 rounded-2xl border border-[#46484c]/15 bg-[#171a1e]/30 hover:bg-[#171a1e]/60 hover:border-[#46484c]/30 transition-all duration-300 hover:-translate-y-1 group"
    style={{ animation: `slideInUp 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}ms both` }}
  >
    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
      <Icon size={20} style={{ color }} />
    </div>
    <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#e08efe] transition-colors">{title}</h3>
    <p className="text-sm text-[#73757a] leading-relaxed">{desc}</p>
  </div>
);

// ─── Stat card ───────────────────────────────
const StatCard = ({ value, label, delay }) => (
  <div className="text-center" style={{ animation: `slideInUp 0.5s ease-out ${delay}ms both` }}>
    <p className="text-3xl sm:text-4xl font-extrabold text-[#e08efe]">{value}</p>
    <p className="text-xs text-[#73757a] uppercase tracking-widest mt-1 font-bold">{label}</p>
  </div>
);

// ─── Testimonial ─────────────────────────────
const TestimonialCard = ({ name, role, quote, delay }) => (
  <div
    className="p-6 rounded-2xl border border-[#46484c]/15 bg-[#171a1e]/30"
    style={{ animation: `slideInUp 0.5s ease-out ${delay}ms both` }}
  >
    <div className="flex items-center gap-1 mb-3">
      {[...Array(5)].map((_, i) => <Star key={i} size={14} className="text-[#fbbf24] fill-[#fbbf24]" />)}
    </div>
    <p className="text-sm text-[#a9abb0] leading-relaxed mb-4 italic">"{quote}"</p>
    <div>
      <p className="text-sm font-bold text-white">{name}</p>
      <p className="text-xs text-[#73757a]">{role}</p>
    </div>
  </div>
);

const FEATURES = [
  { icon: Layers, title: "5 Graph Layouts", desc: "Tree, Flowchart, Radial, Mindmap, and clustered orbital Graph views. Switch instantly.", color: "#e08efe" },
  { icon: GitCompareArrows, title: "API Diff Visualizer", desc: "Compare two API versions side-by-side. See added, removed, and modified endpoints at a glance.", color: "#81ecff" },
  { icon: Shield, title: "Breaking Change Detection", desc: "7 severity rules classify changes as breaking, warning, or safe. Export PR-ready reports.", color: "#ff6e84" },
  { icon: Zap, title: "Test Flow Builder", desc: "Chain requests into sequences. Extract tokens from responses and inject into next steps.", color: "#fbbf24" },
  { icon: Activity, title: "Health Monitor", desc: "Ping every endpoint in real-time. Auto-refresh, latency tracking, status dashboard.", color: "#34d399" },
  { icon: Server, title: "Mock Server", desc: "Auto-generate realistic mock responses from your schema. Editable, exportable.", color: "#3aa2ff" },
  { icon: BarChart3, title: "Load Testing", desc: "Send concurrent requests, measure P50/P95/P99 latency, visualize distribution.", color: "#fb923c" },
  { icon: BookOpen, title: "Doc Generator", desc: "One-click beautiful API documentation. Export as Markdown or standalone HTML.", color: "#a78bfa" },
  { icon: Network, title: "Multi-Service Graph", desc: "Upload specs from multiple microservices. Map cross-service dependencies and impact.", color: "#e08efe" },
  { icon: Globe, title: "Environment Manager", desc: "Switch between Dev, Staging, and Production. Variables auto-substitute in all requests.", color: "#81ecff" },
  { icon: Share2, title: "Shareable Links", desc: "Compress your spec into a URL. Anyone with the link can view the graph instantly.", color: "#fbbf24" },
  { icon: Download, title: "Export PNG / SVG", desc: "Download your graph as a high-res PNG or scalable SVG for docs and presentations.", color: "#34d399" },
];

const TESTIMONIALS = [
  { name: "Sarah Chen", role: "Lead Backend Engineer, Stripe", quote: "Vizroute replaced three tools in our API workflow. The breaking change detector alone saved us from two production incidents." },
  { name: "Marcus Johnson", role: "CTO, DevStack.io", quote: "We use the multi-service graph daily. Seeing cross-service dependencies visually changed how we plan deployments." },
  { name: "Priya Patel", role: "API Platform Lead, Shopify", quote: "The test flow builder with variable extraction is incredible. Our QA team builds regression suites in minutes, not hours." },
];

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0c0e12] text-[#f8f9fe] overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#46484c]/10 bg-[#0c0e12]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black text-[#e08efe] tracking-tight">Vizroute</span>
            <span className="text-[10px] text-[#e08efe]/60 font-mono border border-[#e08efe]/20 px-2 py-0.5 rounded-full uppercase tracking-widest">Beta</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-[#a9abb0] hover:text-white transition-colors font-medium">Features</a>
            <a href="#testimonials" className="text-sm text-[#a9abb0] hover:text-white transition-colors font-medium">Testimonials</a>
            <button onClick={() => navigate("/pricing")} className="text-sm text-[#a9abb0] hover:text-white transition-colors font-medium">Pricing</button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/pricing")} className="hidden sm:block text-sm font-semibold text-[#a9abb0] hover:text-white transition-colors px-4 py-2">
              Pricing
            </button>
            <button onClick={() => navigate("/app")}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] flex items-center gap-2 btn-shimmer"
              style={{ boxShadow: "0 8px 24px -6px rgba(224,142,254,0.35)" }}>
              <Play size={14} className="fill-[#0c0e12]" /> Open App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none mesh-gradient-bg" />
        <div className="absolute pointer-events-none" style={{ top: "-15%", left: "-10%", width: "50%", height: "50%", background: "rgba(224,142,254,0.05)", filter: "blur(120px)", borderRadius: "50%" }} />
        <div className="absolute pointer-events-none" style={{ top: "50%", right: "-5%", width: "40%", height: "40%", background: "rgba(58,162,255,0.04)", filter: "blur(100px)", borderRadius: "50%" }} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8" style={{ background: "rgba(224,142,254,0.08)", border: "1px solid rgba(224,142,254,0.15)", animation: "slideInUp 0.5s ease-out both" }}>
            <span className="w-2 h-2 rounded-full bg-[#e08efe] animate-pulse" />
            <span className="text-xs font-bold text-[#e08efe] uppercase tracking-widest">Now with 14 Pro Features</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6" style={{ animation: "slideInUp 0.6s ease-out 100ms both" }}>
            Visualize your APIs.<br />
            <span className="text-[#e08efe]">
              <TypewriterLoop words={["Test them.", "Diff them.", "Document them.", "Monitor them."]} speed={70} pause={1800} />
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-[#73757a] max-w-2xl mx-auto mb-10 leading-relaxed" style={{ animation: "slideInUp 0.6s ease-out 200ms both" }}>
            Vizroute transforms API specs into interactive visual graphs. Test endpoints, detect breaking changes, generate docs, and monitor health — all from one tool.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16" style={{ animation: "slideInUp 0.6s ease-out 300ms both" }}>
            <button onClick={() => navigate("/app")}
              className="px-8 py-4 rounded-2xl text-base font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] flex items-center gap-3 btn-shimmer"
              style={{ boxShadow: "0 16px 40px -8px rgba(224,142,254,0.4)" }}>
              <Play size={18} className="fill-[#0c0e12]" /> Start Building — Free
              <ChevronRight size={16} className="opacity-60" />
            </button>
            <button onClick={() => navigate("/pricing")}
              className="px-8 py-4 rounded-2xl text-base font-bold text-[#a9abb0] border border-[#46484c]/30 hover:bg-[#22262b] hover:text-white transition-all flex items-center gap-2">
              View Pricing <ArrowRight size={16} />
            </button>
          </div>

          {/* Demo preview */}
          <div className="relative rounded-2xl border border-[#46484c]/20 overflow-hidden mx-auto max-w-4xl"
            style={{ background: "rgba(17,20,23,0.6)", boxShadow: "0 40px 80px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(70,72,76,0.1)", animation: "slideInUp 0.7s ease-out 400ms both" }}>
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#46484c]/15" style={{ background: "rgba(12,14,18,0.8)" }}>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff6e84]/60" />
                <div className="w-3 h-3 rounded-full bg-[#fbbf24]/60" />
                <div className="w-3 h-3 rounded-full bg-[#34d399]/60" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-[#22262b]/60 rounded-lg px-4 py-1.5 text-xs text-[#73757a] font-mono text-center">map.snap-test.in</div>
              </div>
            </div>
            {/* Fake graph preview */}
            <div className="p-8 sm:p-12 dot-grid-bg relative" style={{ minHeight: 300 }}>
              {/* Fake nodes */}
              <div className="absolute left-1/2 top-8 -translate-x-1/2 px-6 py-3 rounded-2xl border-2 border-[#e08efe]/30 bg-[#171a1e] shadow-lg shadow-[#e08efe]/10">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-[#e08efe]" />
                  <span className="text-sm font-bold text-white">Auth API v2.4</span>
                  <span className="text-[10px] text-[#73757a] font-mono">12 nodes</span>
                </div>
              </div>
              {[
                { x: "20%", y: "55%", method: "POST", name: "Login", color: "#fbbf24" },
                { x: "50%", y: "65%", method: "GET", name: "Profile", color: "#34d399" },
                { x: "80%", y: "55%", method: "DELETE", name: "Account", color: "#f87171" },
              ].map((n, i) => (
                <div key={i} className="absolute rounded-xl border border-[#46484c]/30 bg-[#171a1e]/80 px-4 py-2.5"
                  style={{ left: n.x, top: n.y, transform: "translate(-50%, -50%)", animation: `nodeEntrance 0.4s ease-out ${600 + i * 100}ms both` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: `${n.color}20`, color: n.color }}>{n.method}</span>
                    <span className="text-xs font-medium text-white">{n.name}</span>
                  </div>
                </div>
              ))}
              {/* Fake connection lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
                <path d="M 50% 70 Q 30% 120 20% 150" stroke="#e08efe" strokeWidth="1.5" fill="none" strokeDasharray="4" />
                <path d="M 50% 70 Q 50% 130 50% 170" stroke="#e08efe" strokeWidth="1.5" fill="none" strokeDasharray="4" />
                <path d="M 50% 70 Q 70% 120 80% 150" stroke="#e08efe" strokeWidth="1.5" fill="none" strokeDasharray="4" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-[#46484c]/10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          <StatCard value="14" label="Pro Features" delay={0} />
          <StatCard value="5" label="Graph Layouts" delay={100} />
          <StatCard value="0ms" label="Render Time" delay={200} />
          <StatCard value="100%" label="Client-Side" delay={300} />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-[#e08efe] uppercase tracking-widest">Everything you need</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3 mb-4">Powerful features for modern API teams</h2>
            <p className="text-[#73757a] max-w-xl mx-auto">From visualization to testing to documentation — Vizroute covers the entire API lifecycle.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => <FeatureCard key={f.title} {...f} delay={100 + i * 60} />)}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 border-y border-[#46484c]/10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-[#81ecff] uppercase tracking-widest">Simple workflow</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">Three steps to API clarity</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: FileJson, title: "Paste or Upload", desc: "Drop in any OpenAPI, Swagger, Postman, or custom JSON/YAML spec.", color: "#e08efe" },
              { step: "02", icon: Eye, title: "Visualize", desc: "Instantly see your API as an interactive graph. Drag nodes, zoom, switch layouts.", color: "#3aa2ff" },
              { step: "03", icon: Zap, title: "Test & Analyze", desc: "Run health checks, build test flows, detect breaking changes, generate docs.", color: "#81ecff" },
            ].map(({ step, icon: Icon, title, desc, color }, i) => (
              <div key={step} className="text-center" style={{ animation: `slideInUp 0.5s ease-out ${200 + i * 100}ms both` }}>
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                  <Icon size={28} style={{ color }} />
                </div>
                <span className="text-[10px] font-bold text-[#46484c] uppercase tracking-widest">{step}</span>
                <h3 className="text-lg font-bold text-white mt-2 mb-2">{title}</h3>
                <p className="text-sm text-[#73757a] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-[#fbbf24] uppercase tracking-widest">Trusted by teams</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">Loved by API developers</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => <TestimonialCard key={t.name} {...t} delay={100 + i * 100} />)}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="p-12 sm:p-16 rounded-3xl border border-[#e08efe]/20 relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(224,142,254,0.06), rgba(58,162,255,0.04))" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(224,142,254,0.08), transparent 70%)" }} />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 relative z-10">Ready to visualize your APIs?</h2>
            <p className="text-[#a9abb0] mb-8 relative z-10">Start for free. No account required. Your data never leaves your browser.</p>
            <button onClick={() => navigate("/app")}
              className="relative z-10 px-10 py-4 rounded-2xl text-base font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] inline-flex items-center gap-3 btn-shimmer"
              style={{ boxShadow: "0 16px 40px -8px rgba(224,142,254,0.4)" }}>
              <Play size={18} className="fill-[#0c0e12]" /> Launch Vizroute
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#46484c]/10 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-[#e08efe]">Vizroute</span>
            <span className="text-xs text-[#46484c]">by Snap-Test</span>
          </div>
          <p className="text-xs text-[#46484c]">&copy; {new Date().getFullYear()} Snap-Test.in — Built for developers, by developers.</p>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/pricing")} className="text-xs text-[#73757a] hover:text-white transition-colors">Pricing</button>
            <button onClick={() => navigate("/app")} className="text-xs text-[#73757a] hover:text-white transition-colors">Open App</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
