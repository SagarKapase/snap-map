import { Link } from "react-router-dom";
import { Braces, Send, Code2, Network, ArrowRight } from "lucide-react";
import { SAMPLE_DATA } from "../../utils/constants";
import { SAMPLE_ESTATE } from "../../utils/contractSamples";

/**
 * The documents that ship with the product, each a real link: the three
 * single-spec samples the workspace loads with `?demo=`, and the sample
 * estate Contract Graph builds with `?sample=estate`. Names come from the
 * samples themselves, so this list cannot drift from what loads.
 */
const SAMPLES = [
  { to: "/workspace?demo=openapi", icon: Braces, accent: "#34d399", title: SAMPLE_DATA.openapi.info.title, text: "OpenAPI 3.0 · single spec" },
  { to: "/workspace?demo=postman", icon: Send, accent: "#fb923c", title: SAMPLE_DATA.postman.info.name, text: "Postman collection · single spec" },
  { to: "/workspace?demo=custom", icon: Code2, accent: "#60a5fa", title: SAMPLE_DATA.custom.name, text: "Custom JSON · single spec" },
  { to: "/graph?sample=estate", icon: Network, accent: "#a855f7", title: SAMPLE_ESTATE.name, text: `${SAMPLE_ESTATE.services.length} services · Contract Graph estate` },
];

const SampleCards = () => (
  <section aria-labelledby="hm-samples">
    <div className="hm-samples-head">
      <h2 id="hm-samples">Start from a sample</h2>
      <Link to="/workspace" className="hm-view-all">Import your own <ArrowRight size={12} /></Link>
    </div>
    <div className="hm-samples" style={{ marginTop: 16 }}>
      {SAMPLES.map(({ to, icon: Icon, accent, title, text }) => (
        <Link key={to} to={to} className="hm-sample" style={{ "--qa": accent }}>
          <span className="hm-sample-icon"><Icon size={16} /></span>
          <span style={{ minWidth: 0 }}>
            <h4>{title}</h4>
            <p>{text}</p>
          </span>
        </Link>
      ))}
    </div>
  </section>
);

export default SampleCards;
