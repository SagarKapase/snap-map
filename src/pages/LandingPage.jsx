import { useEffect } from "react";
import LandingNav from "../components/landing/LandingNav";
import Hero from "../components/landing/Hero";
import FormatStrip from "../components/landing/FormatStrip";
import FeatureShowcase from "../components/landing/FeatureShowcase";
import Products from "../components/landing/Products";
import WorkflowSteps from "../components/landing/WorkflowSteps";
import UseCases from "../components/landing/UseCases";
import Faq from "../components/landing/Faq";
import FinalCta from "../components/landing/FinalCta";
import LandingFooter from "../components/landing/LandingFooter";
import { useDocumentHead, SITE_URL } from "../utils/seo";
import { HOME_DESCRIPTION, appJsonLd, faqJsonLd } from "../content/home";
import { FAQS } from "../content/faqs";
import "../landing.css";

// Both objects are built from the same copy the page renders, so what a
// search result quotes is what a visitor reads.
const JSON_LD = [appJsonLd(SITE_URL), faqJsonLd(FAQS)];

const LandingPage = () => {
  // No title: the home page is the brand, and pageTitle() knows that line.
  useDocumentHead({ description: HOME_DESCRIPTION, path: "/", jsonLd: JSON_LD });

  // A direct load of /#features would otherwise do nothing: the browser
  // resolves the fragment before React has rendered the section.
  useEffect(() => {
    const { hash } = window.location;
    // A sign-in redirect also comes back with a fragment, and "#access_token=…"
    // is not a selector — reading it as one would throw.
    if (!hash || hash.includes("=")) return;
    try {
      const target = document.querySelector(hash);
      // Instant for a deep link; in-page clicks still glide via CSS.
      if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
    } catch {
      /* a fragment that is not a selector is not ours to scroll to */
    }
  }, []);

  return (
    <div className="lp relative min-h-screen overflow-x-clip bg-vz-bg text-vz-text">
      {/* Three layers of atmosphere, none of which the pointer can reach: a
          still pair of radials, the slow aurora, and a dot grid that gives the
          dark a surface. All decoration — the page reads without them. */}
      <div aria-hidden="true" className="landing-glow" />
      <div aria-hidden="true" className="lp-aurora" />
      <div aria-hidden="true" className="lp-grid" />

      <div className="relative">
        <LandingNav />
        <main>
          <Hero />
          <FormatStrip />
          <FeatureShowcase />
          <Products />
          <WorkflowSteps />
          <UseCases />
          <Faq />
          <FinalCta />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
};

export default LandingPage;
