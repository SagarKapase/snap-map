import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { parseCollection, formatLabel } from "../utils/parsers";
import { computePositions, SCALE_SAFE_AT } from "../utils/layout";
import { buildGraphSvg } from "../utils/graphExport";
import { decompressSpec } from "../utils/sharing";
import { SAMPLE_DATA } from "../utils/constants";
import BrandMark from "../components/BrandMark";

/**
 * A read-only map, sized to be dropped into a README, a wiki or a pull
 * request with an <iframe>.
 *
 * This deliberately does not mount the workspace. An embed needs to paint
 * once and stay out of the way, so it renders the same vector the exporter
 * produces rather than a live canvas with drag handlers, keyboard shortcuts
 * and layout maths running behind it.
 */

/**
 * Read the spec out of the URL once, at first render.
 *
 * The link is fixed for the life of the page, so this is initial state rather
 * than an effect — there is nothing to synchronise with.
 */
const readFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get("spec");
  const demo = params.get("demo");

  if (shared) {
    const data = decompressSpec(shared);
    return data
      ? { spec: data, error: "" }
      : { spec: null, error: "That link does not carry a readable specification." };
  }
  if (demo && SAMPLE_DATA[demo]) return { spec: SAMPLE_DATA[demo], error: "" };
  return { spec: null, error: "No specification in this link." };
};

const EmbedMap = () => {
  const [{ spec, error }] = useState(readFromUrl);

  const view = useMemo(() => {
    if (!spec) return null;
    const nodes = parseCollection(spec, () => {});
    if (!nodes.length) return null;
    const positions = computePositions(nodes, "graph", {
      large: nodes.length > SCALE_SAFE_AT,
    });
    const title =
      spec?.info?.title || spec?.info?.name || spec?.name || "API map";
    const svg = buildGraphSvg({ nodes, positions, graphStyle: "graph", title });
    return {
      svg,
      title,
      format: Array.isArray(spec) ? "Custom JSON" : formatLabel(spec),
      endpoints: nodes.filter((n) => n.type === "request").length,
    };
  }, [spec]);

  const openUrl = `${window.location.origin}/workspace${window.location.search}`;

  if (error || (spec && !view)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-vz-bg px-6">
        <p className="text-center text-[13px] text-vz-dim">
          {error || "Nothing to draw for this specification."}
        </p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-vz-bg">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-vz-accent/30 border-t-vz-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-vz-bg">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-vz-line-soft px-3 py-2">
        <BrandMark size={14} />
        <span className="min-w-0 truncate text-[12px] font-semibold text-vz-text">
          {view.title}
        </span>
        <span className="flex-shrink-0 text-[11px] text-vz-dim">
          {view.format} · {view.endpoints} endpoint{view.endpoints === 1 ? "" : "s"}
        </span>
        <a
          href={openUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="vz-t ml-auto flex flex-shrink-0 items-center gap-1 rounded-md border border-vz-line px-2 py-1 text-[11px] text-vz-soft hover:text-vz-text"
        >
          Open
          <ArrowUpRight size={11} />
        </a>
      </div>

      <div
        className="vz-scroll min-h-0 flex-1 overflow-auto p-2"
        // Safe to inject: the exporter builds the document itself and passes
        // every value that came from the spec through XML escaping, while the
        // colours and geometry are computed, never copied from the input. It
        // is the same vector the SVG download produces, so the two can never
        // drift apart.
        dangerouslySetInnerHTML={{
          __html: view.svg.svg.replace(
            "<svg ",
            '<svg style="max-width:100%;height:auto" ',
          ),
        }}
      />
    </div>
  );
};

export default EmbedMap;
