import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useReveal } from "../../utils/motion";
import { FAQS } from "../../content/faqs";

const Item = ({ faq, open, onToggle, index }) => (
  <div
    className="lp-faq overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel/60"
    data-open={open ? "true" : "false"}
  >
    <h3>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`faq-panel-${index}`}
        id={`faq-button-${index}`}
        className="vz-t flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-vz-text hover:bg-white/[0.02]"
      >
        {faq.q}
        <ChevronDown size={17} className="lp-faq-chevron flex-shrink-0 text-vz-dim" aria-hidden="true" />
      </button>
    </h3>
    <div className="lp-faq-panel" id={`faq-panel-${index}`} role="region" aria-labelledby={`faq-button-${index}`}>
      <div>
        <p className="px-5 pb-5 text-[14px] leading-[1.7] text-vz-soft">{faq.a}</p>
      </div>
    </div>
  </div>
);

const Faq = () => {
  const [open, setOpen] = useState(0);
  const [ref] = useReveal();

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      ref={ref}
      className="reveal mx-auto max-w-[900px] scroll-mt-24 px-5 py-16 sm:px-8 lg:py-20"
    >
      <h2
        id="faq-heading"
        className="text-[clamp(1.9rem,2.6vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-0.028em] text-vz-text"
      >
        Questions worth asking first.
      </h2>

      <div className="mt-10 flex flex-col gap-3">
        {FAQS.map((faq, i) => (
          <Item key={faq.q} faq={faq} index={i} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
        ))}
      </div>
    </section>
  );
};

export default Faq;
