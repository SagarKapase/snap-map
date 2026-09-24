import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ShieldCheck, Wifi } from "lucide-react";
import LandingNav from "../landing/LandingNav";
import LandingFooter from "../landing/LandingFooter";
import { relatedTools } from "../../tools/registry";
import { useDocumentHead, SITE_URL } from "../../utils/seo";
import "../../tools.css";

/**
 * The frame around every Explore Tool.
 *
 * The tool comes first and the writing comes after it. Somebody who searched
 * for "json formatter" at eleven at night wants the box, not an essay; the
 * essay is underneath for them to read if it turns out they have a question,
 * and for a crawler, which is the only reason these pages can be found at
 * all.
 *
 * The shell owns the page's title, description and structured data, so no
 * tool can ship without them.
 */
const ToolShell = ({ tool, children }) => {
  const related = relatedTools(tool);

  useDocumentHead({
    title: tool.seoTitle,
    description: tool.description,
    path: `/tools/${tool.slug}`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: tool.title,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any modern browser",
        url: `${SITE_URL}/tools/${tool.slug}`,
        description: tool.description,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: tool.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      },
    ],
  });

  return (
    <div className="tl relative min-h-screen bg-vz-bg text-vz-text">
      <LandingNav />

      <main className="mx-auto max-w-[1180px] px-5 pb-16 pt-8 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link to="/tools" className="tl-crumb">
            <ArrowLeft size={14} aria-hidden="true" />
            All tools
          </Link>
        </nav>

        <header className="max-w-[760px]">
          <h1 className="text-[clamp(1.8rem,3vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-vz-text">
            {tool.title}
          </h1>
          <p className="mt-4 text-[15.5px] leading-[1.7] text-vz-soft">{tool.description}</p>
          <p className="tl-promise">
            {tool.network ? (
              <>
                <Wifi size={13} aria-hidden="true" className="text-vz-accent-2" />
                This tool can make a request to an address you give it. Everything else stays in this tab.
              </>
            ) : (
              <>
                <ShieldCheck size={13} aria-hidden="true" className="text-vz-green" />
                Runs in this tab. Nothing you paste is uploaded, stored or logged.
              </>
            )}
          </p>
        </header>

        {/* The tool itself, before anything there is to read about it. */}
        <section aria-label={tool.title} className="tl-stage">
          {children}
        </section>

        <div className="tl-prose-grid">
          <section aria-labelledby="about-heading" className="tl-prose">
            <h2 id="about-heading">About this tool</h2>
            {tool.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </section>

          <section aria-labelledby="faq-heading" className="tl-prose">
            <h2 id="faq-heading">Questions</h2>
            <dl className="tl-faqs">
              {tool.faqs.map((faq) => (
                <div key={faq.q}>
                  <dt>{faq.q}</dt>
                  <dd>{faq.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section aria-labelledby="related-heading" className="tl-related">
          <h2 id="related-heading" className="text-[17px] font-bold tracking-[-0.02em] text-vz-text">
            {related.length ? "Next to this one" : "More tools"}
          </h2>
          <div className="tl-related-row">
            {related.map((other) => (
              <Link key={other.slug} to={`/tools/${other.slug}`} className="tl-related-card">
                <span className="tl-related-title">{other.title}</span>
                <span className="tl-related-text">{other.description}</span>
              </Link>
            ))}
            <Link to="/tools" className="tl-related-card is-all">
              <span className="tl-related-title">
                All tools
                <ArrowRight size={14} aria-hidden="true" />
              </span>
              <span className="tl-related-text">Every free tool on this site, grouped by what it works on.</span>
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default ToolShell;
