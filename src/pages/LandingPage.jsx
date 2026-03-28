import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, ChevronRight, Layers, Zap, Search, Share2, Download,
  Shield, Globe, GitCompareArrows, Activity, BarChart3, Server,
  Users, BookOpen, Network, ArrowRight, CheckCircle, Star,
  Code, Terminal, Eye, Lock, FileJson,
} from "lucide-react";
import PhysicsPlayground from "../components/PhysicsPlayground";
import { LoginModal, SignupModal } from "../components/AuthModals";

// ─── Scroll reveal hook ──────────────────────
const useInView = (options = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.15, ...options });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
};

// ─── Scroll reveal wrapper ───────────────────
const Reveal = ({ children, delay = 0, direction = "up", className = "" }) => {
  const [ref, inView] = useInView();
  const transforms = { up: "translateY(40px)", down: "translateY(-40px)", left: "translateX(40px)", right: "translateX(-40px)", none: "none" };
  return (
    <div ref={ref} className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : transforms[direction],
        transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}>
      {children}
    </div>
  );
};

// ─── Animated counter ────────────────────────
const Counter = ({ target, suffix = "", duration = 1200 }) => {
  const [ref, inView] = useInView();
  const [value, setValue] = useState(0);
  const num = parseInt(target) || 0;
  useEffect(() => {
    if (!inView || num === 0) return;
    let start = 0;
    const step = Math.ceil(num / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= num) { setValue(num); clearInterval(timer); }
      else setValue(start);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, num, duration]);
  return <span ref={ref}>{inView ? value : 0}{suffix}</span>;
};

// ─── Feature card ────────────────────────────
const FeatureCard = ({ icon: Icon, title, desc, color }) => (
  <div
    className="p-6 rounded-2xl border border-[#46484c]/15 bg-[#171a1e]/30 hover:bg-[#171a1e]/60 hover:border-[#46484c]/30 transition-all duration-300 hover:-translate-y-1 group"
  >
    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
      <Icon size={20} style={{ color }} />
    </div>
    <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#e08efe] transition-colors">{title}</h3>
    <p className="text-sm text-[#73757a] leading-relaxed">{desc}</p>
  </div>
);

// ─── Stat card ───────────────────────────────
const StatCard = ({ value, label }) => (
  <div className="text-center">
    <p className="text-3xl sm:text-4xl font-extrabold text-[#e08efe]">{value}</p>
    <p className="text-xs text-[#73757a] uppercase tracking-widest mt-1 font-bold">{label}</p>
  </div>
);

// ─── Testimonial ─────────────────────────────
const TestimonialCard = ({ name, role, quote }) => (
  <div className="p-6 rounded-2xl border border-[#46484c]/15 bg-[#171a1e]/30">
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
  const [authModal, setAuthModal] = useState(null); // null | "login" | "signup"

  return (
    <div className="min-h-screen bg-[#0c0e12] text-[#f8f9fe] overflow-x-hidden">

      {/* ── Persistent animated background — rising particles ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Static ambient glow — not animated */}
        <div className="absolute" style={{ top: "-10%", left: "-5%", width: "40%", height: "40%", background: "radial-gradient(circle, rgba(224,142,254,0.05) 0%, transparent 70%)", borderRadius: "50%" }} />
        <div className="absolute" style={{ bottom: "-5%", right: "-5%", width: "35%", height: "35%", background: "radial-gradient(circle, rgba(58,162,255,0.04) 0%, transparent 70%)", borderRadius: "50%" }} />

        {/* Rising particles — like embers floating upward */}
        {[...Array(30)].map((_, i) => {
          const size = 1.5 + (i % 4);
          const left = (i * 3.37 + 2) % 98;
          const dur = 12 + (i % 7) * 4;
          const delay = (i * 1.3) % dur;
          const colors = ["rgba(224,142,254,", "rgba(58,162,255,", "rgba(129,236,255,", "rgba(251,191,36,"];
          const c = colors[i % 4];
          return (
            <div key={i} style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: "50%",
              left: `${left}%`,
              bottom: "-2%",
              background: `${c}0.5)`,
              boxShadow: `0 0 ${size * 2}px ${c}0.3)`,
              animation: `riseParticle ${dur}s linear ${delay}s infinite`,
            }} />
          );
        })}
      </div>

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
            <button onClick={() => setAuthModal("login")} className="hidden sm:block text-sm font-semibold text-[#a9abb0] hover:text-white transition-colors px-4 py-2">
              Log In
            </button>
            <button onClick={() => setAuthModal("signup")}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] flex items-center gap-2"
              style={{ boxShadow: "0 8px 24px -6px rgba(224,142,254,0.35)" }}>
              Sign Up Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        {/* Static subtle background blurs */}
        <div className="absolute pointer-events-none" style={{ top: "-15%", left: "-10%", width: "50%", height: "50%", background: "rgba(224,142,254,0.05)", filter: "blur(120px)", borderRadius: "50%" }} />
        <div className="absolute pointer-events-none" style={{ top: "50%", right: "-5%", width: "40%", height: "40%", background: "rgba(58,162,255,0.04)", filter: "blur(100px)", borderRadius: "50%" }} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <Reveal delay={0}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8" style={{ background: "rgba(224,142,254,0.08)", border: "1px solid rgba(224,142,254,0.15)" }}>
              <span className="w-2 h-2 rounded-full bg-[#e08efe]" />
              <span className="text-xs font-bold text-[#e08efe] uppercase tracking-widest">Now with 14 Pro Features</span>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
              Visualize your APIs.<br />
              <span className="text-[#e08efe]">Test, Diff & Document them.</span>
            </h1>
          </Reveal>

          <Reveal delay={200}>
            <p className="text-lg sm:text-xl text-[#73757a] max-w-2xl mx-auto mb-10 leading-relaxed">
              Vizroute transforms API specs into interactive visual graphs. Test endpoints, detect breaking changes, generate docs, and monitor health — all from one tool.
            </p>
          </Reveal>

          <Reveal delay={300}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button onClick={() => navigate("/app")}
              className="px-8 py-4 rounded-2xl text-base font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] flex items-center gap-3"
              style={{ boxShadow: "0 16px 40px -8px rgba(224,142,254,0.4)" }}>
              <Play size={18} className="fill-[#0c0e12]" /> Start Building — Free
              <ChevronRight size={16} className="opacity-60" />
            </button>
            <button onClick={() => navigate("/pricing")}
              className="px-8 py-4 rounded-2xl text-base font-bold text-[#a9abb0] border border-[#46484c]/30 hover:bg-[#22262b] hover:text-white transition-all flex items-center gap-2">
              View Pricing <ArrowRight size={16} />
            </button>
          </div>
          </Reveal>

          <Reveal delay={400}>
          {/* Demo preview */}
          <div className="relative rounded-2xl border border-[#46484c]/20 overflow-hidden mx-auto max-w-4xl"
            style={{ background: "rgba(17,20,23,0.6)", boxShadow: "0 40px 80px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(70,72,76,0.1)" }}>
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
            {/* Animated graph preview — mirrors the real app */}
            <div className="relative" style={{ height: 340, backgroundColor: "#111417", backgroundImage: "radial-gradient(circle, rgba(70,72,76,0.4) 1px, transparent 1px)", backgroundSize: "40px 40px" }}>

              {/* Centered wrapper — all nodes positioned relative to center */}
              <div className="absolute inset-0 flex items-start justify-center">
                <div className="relative" style={{ width: 760, height: 320, marginTop: 10 }}>

                  {/* ── SVG Connection lines with draw + particle animation ── */}
                  <svg className="absolute inset-0 pointer-events-none" width="760" height="320" viewBox="0 0 760 320" style={{ overflow: "visible" }}>
                    {[
                      /* Root (380,40) → Folders */
                      { path: "M 380 50 C 380 100, 130 100, 130 140", stroke: "rgba(224,142,254,0.45)", w: 2.2, p: "#e08efe", d: 0 },
                      { path: "M 380 50 C 380 100, 380 100, 380 140", stroke: "rgba(224,142,254,0.45)", w: 2.2, p: "#e08efe", d: 100 },
                      { path: "M 380 50 C 380 100, 630 100, 630 140", stroke: "rgba(224,142,254,0.45)", w: 2.2, p: "#e08efe", d: 200 },
                      /* User Mgmt (130,170) → requests */
                      { path: "M 130 180 C 130 220, 60 220,  60 250",  stroke: "rgba(251,191,36,0.4)",  w: 1.5, p: "#fbbf24", d: 400 },
                      { path: "M 130 180 C 130 220, 200 220, 200 250", stroke: "rgba(52,211,153,0.4)",  w: 1.5, p: "#34d399", d: 500 },
                      /* Payments (380,170) → requests */
                      { path: "M 380 180 C 380 220, 320 220, 320 250", stroke: "rgba(96,165,250,0.4)",  w: 1.5, p: "#60a5fa", d: 600 },
                      { path: "M 380 180 C 380 220, 440 220, 440 250", stroke: "rgba(248,113,113,0.4)", w: 1.5, p: "#f87171", d: 700 },
                      /* Products (630,170) → requests */
                      { path: "M 630 180 C 630 220, 560 220, 560 250", stroke: "rgba(167,139,250,0.4)", w: 1.5, p: "#a78bfa", d: 800 },
                      { path: "M 630 180 C 630 220, 700 220, 700 250", stroke: "rgba(251,146,60,0.4)",  w: 1.5, p: "#fb923c", d: 900 },
                    ].map(({ path, stroke, w, p, d }, i) => (
                      <g key={i}>
                        <path d={path} stroke={stroke} strokeWidth={w} fill="none" strokeLinecap="round" strokeDasharray="2000"
                          style={{ animation: `drawPath 0.8s cubic-bezier(0.4,0,0.2,1) ${d}ms both, pathPulse 4s ease-in-out ${d + 800}ms infinite`, filter: `drop-shadow(0 0 4px ${stroke})` }} />
                        <circle r="2.5" fill={p} opacity="0" style={{ filter: `drop-shadow(0 0 3px ${p})` }}>
                          <animateMotion dur="2.8s" repeatCount="indefinite" begin={`${d + 900}ms`} path={path} rotate="auto" />
                          <animate attributeName="opacity" values="0;0.8;1;0.8;0" dur="2.8s" repeatCount="indefinite" begin={`${d + 900}ms`} />
                          <animate attributeName="r" values="2;3.5;2" dur="2.8s" repeatCount="indefinite" begin={`${d + 900}ms`} />
                        </circle>
                      </g>
                    ))}
                  </svg>

                  {/* ── Root node — centered at top ── */}
                  <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 8 }}>
                    <div className="px-6 py-3 rounded-2xl border-2 border-[#e08efe]/30 bg-[#171a1e]"
                      style={{ animation: "nodeEntrance 0.5s ease-out both", boxShadow: "0 0 20px rgba(224,142,254,0.12)" }}>
                      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[#e08efe]/40 to-transparent" />
                      <div className="flex items-center gap-2">
                        <Lock size={14} className="text-[#e08efe]" />
                        <span className="text-sm font-bold text-white">Auth API v2.4</span>
                        <span className="text-[10px] text-[#73757a] font-mono">12 nodes</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Folder nodes — evenly spaced across center ── */}
                  {[
                    { cx: 130, label: "User Mgmt", count: 4, delay: 200 },
                    { cx: 380, label: "Payments",   count: 3, delay: 300 },
                    { cx: 630, label: "Products",   count: 4, delay: 400 },
                  ].map((f, i) => (
                    <div key={i} className="absolute -translate-x-1/2" style={{ left: f.cx, top: 140, animation: `nodeEntrance 0.45s ease-out ${f.delay}ms both` }}>
                      <div className="px-4 py-2 rounded-xl border border-[#46484c]/40 bg-[#171a1e]/90">
                        <div className="flex items-center gap-2">
                          <Layers size={11} className="text-[#3aa2ff]" />
                          <span className="text-[11px] font-semibold text-white">{f.label}</span>
                          <span className="text-[9px] bg-[#22262b] text-[#a9abb0] px-1.5 py-0.5 rounded-full font-bold">{f.count}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* ── Request nodes — centered under their parent folders ── */}
                  {[
                    { cx: 60,  method: "POST",   name: "Login",   color: "#fbbf24", delay: 600 },
                    { cx: 200, method: "GET",     name: "Profile", color: "#34d399", delay: 700 },
                    { cx: 320, method: "PUT",     name: "Pay",     color: "#60a5fa", delay: 800 },
                    { cx: 440, method: "DELETE",  name: "Refund",  color: "#f87171", delay: 900 },
                    { cx: 560, method: "PATCH",   name: "Update",  color: "#a78bfa", delay: 1000 },
                    { cx: 700, method: "GET",     name: "List",    color: "#fb923c", delay: 1100 },
                  ].map((n, i) => (
                    <div key={i} className="absolute -translate-x-1/2" style={{ left: n.cx, top: 250, animation: `nodeEntrance 0.4s ease-out ${n.delay}ms both` }}>
                      <div className="px-3 py-2 rounded-xl border border-[#46484c]/30 bg-[#171a1e]/80"
                        style={{ borderTop: `2px solid ${n.color}` }}>
                        <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                        style={{ background: `${n.color}20`, color: n.color }}>{n.method}</span>
                      <span className="text-[11px] font-medium text-white">{n.name}</span>
                    </div>
                  </div>
                </div>
              ))}

                </div>
              </div>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-[#46484c]/10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {[
            { value: 14, suffix: "", label: "Pro Features" },
            { value: 5, suffix: "", label: "Graph Layouts" },
            { value: 0, suffix: "ms", label: "Render Time" },
            { value: 100, suffix: "%", label: "Client-Side" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 100} className="text-center">
              <p className="text-3xl sm:text-4xl font-extrabold text-[#e08efe]">
                <Counter target={s.value} suffix={s.suffix} />
              </p>
              <p className="text-xs text-[#73757a] uppercase tracking-widest mt-1 font-bold">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Physics playground */}
      <PhysicsPlayground />

      {/* Features */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-16">
              <span className="text-xs font-bold text-[#e08efe] uppercase tracking-widest">Everything you need</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3 mb-4">Powerful features for modern API teams</h2>
              <p className="text-[#73757a] max-w-xl mx-auto">From visualization to testing to documentation — Vizroute covers the entire API lifecycle.</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <FeatureCard {...f} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 border-y border-[#46484c]/10">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-16">
              <span className="text-xs font-bold text-[#81ecff] uppercase tracking-widest">Simple workflow</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">Three steps to API clarity</h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: FileJson, title: "Paste or Upload", desc: "Drop in any OpenAPI, Swagger, Postman, or custom JSON/YAML spec.", color: "#e08efe" },
              { step: "02", icon: Eye, title: "Visualize", desc: "Instantly see your API as an interactive graph. Drag nodes, zoom, switch layouts.", color: "#3aa2ff" },
              { step: "03", icon: Zap, title: "Test & Analyze", desc: "Run health checks, build test flows, detect breaking changes, generate docs.", color: "#81ecff" },
            ].map(({ step, icon: Icon, title, desc, color }, i) => (
              <Reveal key={step} delay={i * 150}>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                    <Icon size={28} style={{ color }} />
                  </div>
                  <span className="text-[10px] font-bold text-[#46484c] uppercase tracking-widest">{step}</span>
                  <h3 className="text-lg font-bold text-white mt-2 mb-2">{title}</h3>
                  <p className="text-sm text-[#73757a] leading-relaxed">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-16">
              <span className="text-xs font-bold text-[#fbbf24] uppercase tracking-widest">Trusted by teams</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">Loved by API developers</h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 120}>
                <TestimonialCard {...t} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-28">
        <Reveal>
          <div className="max-w-3xl mx-auto px-6 text-center">
            <div className="p-12 sm:p-16 rounded-3xl border border-[#e08efe]/20 relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(224,142,254,0.06), rgba(58,162,255,0.04))" }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(224,142,254,0.08), transparent 70%)" }} />
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 relative z-10">Ready to visualize your APIs?</h2>
              <p className="text-[#a9abb0] mb-8 relative z-10">Start for free. No account required. Your data never leaves your browser.</p>
              <button onClick={() => navigate("/app")}
                className="relative z-10 px-10 py-4 rounded-2xl text-base font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] inline-flex items-center gap-3"
                style={{ boxShadow: "0 16px 40px -8px rgba(224,142,254,0.4)" }}>
                <Play size={18} className="fill-[#0c0e12]" /> Launch Vizroute
              </button>
            </div>
          </div>
        </Reveal>
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

      {/* Auth modals */}
      {authModal === "login" && (
        <LoginModal onClose={() => setAuthModal(null)} onSwitchToSignup={() => setAuthModal("signup")} />
      )}
      {authModal === "signup" && (
        <SignupModal onClose={() => setAuthModal(null)} onSwitchToLogin={() => setAuthModal("login")} />
      )}
    </div>
  );
};

export default LandingPage;
