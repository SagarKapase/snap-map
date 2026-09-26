import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ShieldCheck, Wifi } from "lucide-react";
import LandingNav from "../landing/LandingNav";
import LandingFooter from "../landing/LandingFooter";
import { relatedTools } from "../../tools/registry";
import { useDocumentHead, SITE_URL } from "../../utils/seo";
import "../../tools.css";

/**
 * The frame around every Explore Tool.
 *
 * Somebody who searched for "json formatter" at eleven at night came for the
 * box, so the box is the page: the header above it is one row, and everything
 * else sits below it behind a rule.
 *
 * The writing underneath is not decoration and does not get cut — it is the
 * only reason a search engine can find any of this, and a page that is a
 * heading and a textarea does not rank. What it does not get is the top of
 * the page, or a second copy of the sentence already in the <head>.
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

      <main className="mx-auto max-w-[1180px] px-5 pb-14 pt-6 sm:px-8">
        {/* One row: where you are, what this is, and what it promises. */}
        <header className="tl-head">
          <Link to="/tools" className="tl-crumb">
            <ArrowLeft size={13} aria-hidden="true" />
            All tools
          </Link>
          <h1 className="tl-head-title">{tool.title}</h1>
          <span className={`tl-badge${tool.network ? " is-net" : ""}`}>
            {tool.network ? <Wifi size={12} aria-hidden="true" /> : <ShieldCheck size={12} aria-hidden="true" />}
            {tool.network ? "Requests only where you say" : "Runs in your browser"}
          </span>
        </header>

        <section aria-label={tool.title} className="tl-stage">
          {children}
        </section>

        {/* Everything a person might read after using it. */}
        <div className="tl-below">
          <section aria-labelledby="about-heading" className="tl-prose">
            <h2 id="about-heading">About</h2>
            {tool.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </section>

          <section aria-labelledby="faq-heading" className="tl-faqs">
            <h2 id="faq-heading">Questions</h2>
            {tool.faqs.map((faq) => (
              // <details> gives an accordion that needs no JavaScript, keeps
              // the answer in the page for a crawler, and is reachable from
              // the keyboard without any of it being written here.
              <details key={faq.q}>
                <summary>
                  {faq.q}
                  <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </section>
        </div>

        {related.length > 0 && (
          <nav className="tl-next" aria-label="Related tools">
            <span className="tl-dim">Next to this one</span>
            {related.map((other) => (
              <Link key={other.slug} to={`/tools/${other.slug}`}>
                {other.title}
              </Link>
            ))}
          </nav>
        )}
      </main>

      <LandingFooter />
    </div>
  );
};

export default ToolShell;
