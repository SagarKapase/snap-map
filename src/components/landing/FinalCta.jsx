import { Link } from "react-router-dom";
import { ArrowRight, Play } from "lucide-react";

const FinalCta = () => (
  <section className="mx-auto max-w-[1500px] px-5 pb-20 pt-8 sm:px-8">
    <div className="relative overflow-hidden rounded-[18px] border border-vz-accent/22 bg-gradient-to-b from-[#10131f] to-[#0a0e16] px-6 py-16 text-center sm:px-12">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[280px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.13), transparent 68%)",
        }}
      />

      <div className="relative">
        <h2 className="mx-auto max-w-[620px] text-[clamp(1.9rem,3vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-vz-text">
          See your API differently.
        </h2>
        <p className="mx-auto mt-5 max-w-[520px] text-[15px] leading-[1.7] text-vz-soft">
          Drop in a specification and get an interactive map of it. Nothing
          leaves your browser.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/workspace"
            className="vz-t inline-flex h-[49px] items-center justify-center gap-3 rounded-[10px] bg-gradient-to-r from-[#a855f7] to-[#cb68ff] px-6 text-[14px] font-bold text-[#150a1b] shadow-[0_10px_30px_rgba(168,85,247,0.14)] hover:-translate-y-0.5 hover:shadow-[0_14px_38px_rgba(168,85,247,0.2)]"
          >
            Start Mapping
            <ArrowRight size={16} aria-hidden="true" />
          </Link>

          <Link
            to="/workspace?demo=openapi"
            className="vz-t inline-flex h-[49px] items-center justify-center gap-2.5 rounded-[10px] border border-[#30384a] bg-vz-panel/70 px-5 text-[14px] font-semibold text-[#e5e8ee] hover:border-[#454f63] hover:bg-vz-panel-2"
          >
            <Play size={14} aria-hidden="true" />
            Open a sample map
          </Link>
        </div>
      </div>
    </div>
  </section>
);

export default FinalCta;
