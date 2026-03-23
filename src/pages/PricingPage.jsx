import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, X, Play, ChevronDown, Zap, Shield,
  Star, HelpCircle, ArrowRight, Sparkles,
} from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    desc: "For individual developers exploring APIs",
    cta: "Start Free",
    color: "#73757a",
    popular: false,
    features: [
      { text: "5 Graph Layouts", included: true },
      { text: "Paste / Upload / URL import", included: true },
      { text: "API Playground (test requests)", included: true },
      { text: "Search & filter nodes", included: true },
      { text: "3 saved collections", included: true },
      { text: "Export PNG", included: true },
      { text: "API Diff (basic)", included: true },
      { text: "Export SVG", included: false },
      { text: "Shareable links", included: false },
      { text: "Health Monitor", included: false },
      { text: "Flow Builder", included: false },
      { text: "Environment Manager", included: false },
      { text: "Doc Generator", included: false },
      { text: "Breaking Change Detector", included: false },
      { text: "Mock Server", included: false },
      { text: "Load Tester", included: false },
      { text: "Multi-Service Graph", included: false },
      { text: "Workspace & Team", included: false },
    ],
  },
  {
    name: "Pro",
    price: { monthly: 12, yearly: 9 },
    desc: "For developers and small teams shipping APIs",
    cta: "Get Pro",
    color: "#e08efe",
    popular: true,
    features: [
      { text: "Everything in Free", included: true },
      { text: "Unlimited collections", included: true },
      { text: "Export SVG + PNG (2x)", included: true },
      { text: "Shareable links", included: true },
      { text: "API Diff (full)", included: true },
      { text: "Auto-Import + Sync", included: true },
      { text: "Health Monitor", included: true },
      { text: "Flow Builder (chain requests)", included: true },
      { text: "Environment Manager", included: true },
      { text: "Doc Generator (Markdown + HTML)", included: true },
      { text: "Particle flow animations", included: true },
      { text: "Breaking Change Detector", included: false },
      { text: "Mock Server", included: false },
      { text: "Load Tester", included: false },
      { text: "Multi-Service Graph", included: false },
      { text: "Workspace & Team", included: false },
    ],
  },
  {
    name: "Enterprise",
    price: { monthly: 49, yearly: 39 },
    desc: "For teams managing complex API ecosystems",
    cta: "Start Trial",
    color: "#81ecff",
    popular: false,
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Breaking Change Detector", included: true },
      { text: "PR Comment Export (GitHub-ready)", included: true },
      { text: "Mock Server Generator", included: true },
      { text: "Load Tester", included: true },
      { text: "Multi-Service Dependency Graph", included: true },
      { text: "Workspace (unlimited members)", included: true },
      { text: "Role-based access control", included: true },
      { text: "Audit log", included: true },
    ],
  },
];

const COMPARISON = [
  { category: "Visualization", features: [
    { name: "Graph Layouts", free: "5", pro: "5", enterprise: "5" },
    { name: "Particle Animations", free: false, pro: true, enterprise: true },
    { name: "Minimap Navigator", free: true, pro: true, enterprise: true },
    { name: "Node Drag & Drop", free: true, pro: true, enterprise: true },
  ]},
  { category: "Import & Export", features: [
    { name: "Paste / Upload / URL", free: true, pro: true, enterprise: true },
    { name: "Auto-Import + Sync", free: false, pro: true, enterprise: true },
    { name: "Export PNG", free: true, pro: "2x HD", enterprise: "2x HD" },
    { name: "Export SVG", free: false, pro: true, enterprise: true },
    { name: "Shareable Links", free: false, pro: true, enterprise: true },
    { name: "Saved Collections", free: "3", pro: "Unlimited", enterprise: "Unlimited" },
  ]},
  { category: "Testing & Analysis", features: [
    { name: "API Playground", free: true, pro: true, enterprise: true },
    { name: "API Diff", free: "Basic", pro: "Full", enterprise: "Full" },
    { name: "Health Monitor", free: false, pro: true, enterprise: true },
    { name: "Flow Builder", free: false, pro: true, enterprise: true },
    { name: "Environment Manager", free: false, pro: true, enterprise: true },
    { name: "Breaking Change Detector", free: false, pro: false, enterprise: true },
    { name: "Load Tester", free: false, pro: false, enterprise: true },
    { name: "Mock Server", free: false, pro: false, enterprise: true },
  ]},
  { category: "Documentation", features: [
    { name: "Doc Generator", free: false, pro: "Markdown + HTML", enterprise: "Markdown + HTML" },
    { name: "PR Comment Export", free: false, pro: false, enterprise: true },
  ]},
  { category: "Team & Enterprise", features: [
    { name: "Multi-Service Graph", free: false, pro: false, enterprise: true },
    { name: "Workspace & Members", free: false, pro: false, enterprise: "Unlimited" },
    { name: "RBAC Roles", free: false, pro: false, enterprise: true },
    { name: "Audit Log", free: false, pro: false, enterprise: true },
  ]},
];

const FAQS = [
  { q: "Is my API data sent to any server?", a: "No. Vizroute runs 100% client-side. Your specs never leave your browser. There's no backend, no telemetry, no data collection." },
  { q: "What spec formats are supported?", a: "OpenAPI 3.x, Swagger 2.0, Postman Collections, and any custom JSON/YAML with endpoints. Vizroute auto-detects the format." },
  { q: "Can I use it with private/internal APIs?", a: "Absolutely. Since everything runs locally in your browser, you can paste any internal spec without security concerns." },
  { q: "What happens when I share a link?", a: "The spec is compressed into the URL itself using lz-string. No data is stored on our servers — the entire spec lives in the URL." },
  { q: "Do I need an account?", a: "Free tier requires no account. Pro and Enterprise require sign-up for billing, but you can try all features in the free tier first." },
  { q: "Can I cancel anytime?", a: "Yes. All paid plans are month-to-month or annual with no lock-in. Cancel anytime from your dashboard." },
];

const CellValue = ({ val }) => {
  if (val === true) return <Check size={16} className="text-[#34d399] mx-auto" />;
  if (val === false) return <X size={14} className="text-[#46484c] mx-auto" />;
  return <span className="text-sm text-[#a9abb0] font-medium">{val}</span>;
};

const PricingPage = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState("monthly");
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="min-h-screen bg-[#0c0e12] text-[#f8f9fe]">
      {/* Nav */}
      <nav className="border-b border-[#46484c]/10 bg-[#0c0e12]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 group">
            <ArrowLeft size={16} className="text-[#73757a] group-hover:text-white group-hover:-translate-x-0.5 transition-all" />
            <span className="text-xl font-black text-[#e08efe] tracking-tight">Vizroute</span>
          </button>
          <button onClick={() => navigate("/app")}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] flex items-center gap-2 btn-shimmer">
            <Play size={14} className="fill-[#0c0e12]" /> Open App
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-16 pb-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none mesh-gradient-bg" />
        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <span className="text-xs font-bold text-[#e08efe] uppercase tracking-widest">Pricing</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mt-3 mb-4">Simple, transparent pricing</h1>
          <p className="text-lg text-[#73757a] mb-8">Start free. Upgrade when your team needs more power.</p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 p-1.5 rounded-2xl border border-[#46484c]/20 bg-[#171a1e]/40">
            <button onClick={() => setBilling("monthly")}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${billing === "monthly" ? "bg-[#e08efe] text-[#0c0e12]" : "text-[#73757a] hover:text-[#a9abb0]"}`}>
              Monthly
            </button>
            <button onClick={() => setBilling("yearly")}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-[#e08efe] text-[#0c0e12]" : "text-[#73757a] hover:text-[#a9abb0]"}`}>
              Yearly <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${billing === "yearly" ? "bg-[#0c0e12]/20 text-[#0c0e12]" : "bg-[#34d399]/10 text-[#34d399]"}`}>Save 25%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan, i) => (
            <div key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                plan.popular
                  ? "border-[#e08efe]/40 bg-gradient-to-b from-[#e08efe]/5 to-transparent shadow-2xl shadow-[#e08efe]/10"
                  : "border-[#46484c]/20 bg-[#171a1e]/30"
              }`}
              style={{ animation: `slideInUp 0.5s ease-out ${150 + i * 100}ms both` }}>
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#e08efe] to-[#3aa2ff]" />
              )}
              {plan.popular && (
                <span className="absolute top-4 right-4 text-[10px] font-bold text-[#e08efe] bg-[#e08efe]/10 px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                  <Sparkles size={10} /> Popular
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-extrabold mb-1" style={{ color: plan.color }}>{plan.name}</h3>
                <p className="text-xs text-[#73757a]">{plan.desc}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    ${billing === "yearly" ? plan.price.yearly : plan.price.monthly}
                  </span>
                  {plan.price.monthly > 0 && <span className="text-sm text-[#73757a]">/mo</span>}
                </div>
                {billing === "yearly" && plan.price.yearly > 0 && (
                  <p className="text-xs text-[#73757a] mt-1">Billed ${plan.price.yearly * 12}/year</p>
                )}
                {plan.price.monthly === 0 && <p className="text-xs text-[#73757a] mt-1">Free forever</p>}
              </div>

              <button onClick={() => navigate("/app")}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] mb-8 flex items-center justify-center gap-2 ${
                  plan.popular
                    ? "bg-[#e08efe] text-[#0c0e12] hover:bg-[#ce7eec] btn-shimmer shadow-lg shadow-[#e08efe]/20"
                    : "border border-[#46484c]/30 text-[#a9abb0] hover:bg-[#22262b] hover:text-white"
                }`}>
                {plan.cta} <ArrowRight size={14} />
              </button>

              <div className="space-y-3 flex-1">
                {plan.features.filter((f) => f.text).map((f) => (
                  <div key={f.text} className="flex items-start gap-3">
                    {f.included ? (
                      <Check size={15} className="text-[#34d399] flex-shrink-0 mt-0.5" />
                    ) : (
                      <X size={13} className="text-[#46484c] flex-shrink-0 mt-0.5" />
                    )}
                    <span className={`text-sm ${f.included ? "text-[#a9abb0]" : "text-[#46484c]"}`}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-20 border-t border-[#46484c]/10">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-extrabold text-white text-center mb-12">Feature Comparison</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#46484c]/15">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#46484c]/15">
                  <th className="text-left p-4 text-[#73757a] font-bold uppercase tracking-wider text-[10px] w-1/3">Feature</th>
                  <th className="text-center p-4 text-[#73757a] font-bold uppercase tracking-wider text-[10px]">Free</th>
                  <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] text-[#e08efe]">Pro</th>
                  <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] text-[#81ecff]">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((cat) => (
                  <>{/* eslint-disable-next-line react/jsx-key */}
                    <tr key={`cat-${cat.category}`} className="border-t border-[#46484c]/10">
                      <td colSpan={4} className="px-4 pt-5 pb-2 text-xs font-bold text-[#e08efe] uppercase tracking-widest">{cat.category}</td>
                    </tr>
                    {cat.features.map((f) => (
                      <tr key={f.name} className="border-t border-[#46484c]/5 hover:bg-white/[0.02]">
                        <td className="p-4 text-[#a9abb0]">{f.name}</td>
                        <td className="p-4 text-center"><CellValue val={f.free} /></td>
                        <td className="p-4 text-center"><CellValue val={f.pro} /></td>
                        <td className="p-4 text-center"><CellValue val={f.enterprise} /></td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 border-t border-[#46484c]/10">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-extrabold text-white text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="rounded-xl border border-[#46484c]/15 overflow-hidden" style={{ background: openFaq === i ? "rgba(224,142,254,0.03)" : "rgba(23,26,30,0.3)" }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left group">
                  <span className="text-sm font-semibold text-white group-hover:text-[#e08efe] transition-colors">{faq.q}</span>
                  <ChevronDown size={16} className={`text-[#73757a] transition-transform duration-200 flex-shrink-0 ml-4 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4" style={{ animation: "crossfadeIn 0.2s ease-out both" }}>
                    <p className="text-sm text-[#a9abb0] leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 border-t border-[#46484c]/10">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-extrabold text-white mb-4">Start visualizing your APIs today</h2>
          <p className="text-[#73757a] mb-8">No account required. Free forever for individual use.</p>
          <button onClick={() => navigate("/app")}
            className="px-10 py-4 rounded-2xl text-base font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] inline-flex items-center gap-3 btn-shimmer"
            style={{ boxShadow: "0 16px 40px -8px rgba(224,142,254,0.4)" }}>
            <Play size={18} className="fill-[#0c0e12]" /> Launch Vizroute — Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#46484c]/10 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-black text-[#e08efe]">Vizroute</span>
          <p className="text-xs text-[#46484c]">&copy; {new Date().getFullYear()} Snap-Test.in</p>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/")} className="text-xs text-[#73757a] hover:text-white transition-colors">Home</button>
            <button onClick={() => navigate("/app")} className="text-xs text-[#73757a] hover:text-white transition-colors">Open App</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;
