import { useEffect } from "react";
import LandingNav from "../components/landing/LandingNav";
import Hero from "../components/landing/Hero";
import FormatStrip from "../components/landing/FormatStrip";
import FeatureShowcase from "../components/landing/FeatureShowcase";
import WorkflowSteps from "../components/landing/WorkflowSteps";
import UseCases from "../components/landing/UseCases";
import FinalCta from "../components/landing/FinalCta";
import LandingFooter from "../components/landing/LandingFooter";

const LandingPage = () => {
  // A direct load of /#features would otherwise do nothing: the browser
  // resolves the fragment before React has rendered the section.
  useEffect(() => {
    const { hash } = window.location;
    if (!hash) return;
    const target = document.querySelector(hash);
    // Instant for a deep link; in-page clicks still glide via CSS.
    if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);

  return (
  <div className="relative min-h-screen overflow-x-clip bg-vz-bg text-vz-text">
    {/* Two very low-opacity radials, no animation */}
    <div aria-hidden="true" className="landing-glow" />

    <div className="relative">
      <LandingNav />
      <main>
        <Hero />
        <FormatStrip />
        <FeatureShowcase />
        <WorkflowSteps />
        <UseCases />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  </div>
  );
};

export default LandingPage;
