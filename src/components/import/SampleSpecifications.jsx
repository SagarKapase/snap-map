import { Link } from "react-router-dom";
import { Clock, ArrowRight } from "lucide-react";
import { SAMPLES_META } from "../../utils/constants";
import { OpenApiIcon, PostmanIcon, JsonIcon } from "../icons/BrandIcons";
import { timeAgo } from "../../utils/analysis";

const SAMPLE_ICONS = { postman: PostmanIcon, openapi: OpenApiIcon, custom: JsonIcon };
const SAMPLE_ACCENTS = { postman: "#fb923c", openapi: "#34d399", custom: "#60a5fa" };

const matches = (needle, ...fields) => !needle || fields.join(" ").toLowerCase().includes(needle);

/**
 * The bundled samples (from SAMPLES_META, loaded by the parent's sample
 * handler) and, when there are any, the APIs this browser opened before.
 * `query` from the top bar narrows both.
 */
const SampleSpecifications = ({ onLoadSample, recents = [], onOpenRecent, query = "" }) => {
  const needle = query.trim().toLowerCase();
  const samples = SAMPLES_META.filter((s) => matches(needle, s.label, s.desc));
  const recent = recents.filter((r) => matches(needle, r.name, r.format));

  return (
    <>
      <section aria-labelledby="imp-samples">
        <div className="imp-section-head">
          <div>
            <h2 id="imp-samples">Start from a sample</h2>
            <p>Explore ready-to-use specifications and see how Vizroute visualizes your APIs.</p>
          </div>
        </div>
        {samples.length === 0 ? (
          <p className="imp-foot-note">No sample matches “{query.trim()}”.</p>
        ) : (
          <div className="imp-samples">
            {samples.map(({ key, label, desc }) => {
              const Icon = SAMPLE_ICONS[key] || JsonIcon;
              return (
                <article key={key} className="imp-sample" style={{ "--qa": SAMPLE_ACCENTS[key] || "#a855f7" }}>
                  <span className="imp-sample-icon"><Icon size={16} aria-hidden="true" /></span>
                  <span style={{ minWidth: 0 }}>
                    <h3>{label}</h3>
                    <p>{desc}</p>
                  </span>
                  <button type="button" className="imp-btn" onClick={() => onLoadSample(key)} aria-label={`Use the ${label} sample (${desc})`}>
                    Use this
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {recents.length > 0 && (
        <section aria-labelledby="imp-recent">
          <div className="imp-section-head">
            <div>
              <h2 id="imp-recent">Recent APIs</h2>
              <p>Specifications this browser opened before. They stay on this machine.</p>
            </div>
            <Link to="/home" className="hm-view-all">Home <ArrowRight size={12} /></Link>
          </div>
          {recent.length === 0 ? (
            <p className="imp-foot-note">No recent API matches “{query.trim()}”.</p>
          ) : (
            <div className="imp-samples">
              {recent.map((r) => (
                <article key={r.id} className="imp-sample" style={{ "--qa": "#a855f7" }}>
                  <span className="imp-sample-icon"><Clock size={15} aria-hidden="true" /></span>
                  <span style={{ minWidth: 0 }}>
                    <h3 title={r.name}>{r.name}</h3>
                    <p>{r.format} · {r.endpoints} endpoint{r.endpoints === 1 ? "" : "s"} · {timeAgo(r.openedAt)}</p>
                  </span>
                  <button type="button" className="imp-btn" onClick={() => onOpenRecent(r)} aria-label={`Open ${r.name}`}>
                    Open
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
};

export default SampleSpecifications;
