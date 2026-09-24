import { Suspense, lazy } from "react";
import { Navigate, useParams } from "react-router-dom";
import ToolShell from "../components/tools/ToolShell";
import { toolBySlug } from "../tools/registry";

/**
 * One tool, by its address.
 *
 * The loaders are listed rather than globbed: `src/tools/registry.js` has to
 * stay importable from Node for the build's prerender step, so the mapping
 * from a slug to a component lives here, on the browser side of the line.
 * Each entry is its own chunk, so a page carries one tool and not forty-five.
 */
const TOOL_COMPONENTS = {
  "json-formatter": lazy(() => import("../tools/json-formatter/Tool")),
};

const Loading = () => (
  <div className="tl-stage" role="status" aria-live="polite">
    <div className="tl-pane">
      <div className="tl-result tl-dim">Loading…</div>
    </div>
  </div>
);

const ToolPage = () => {
  const { slug } = useParams();
  const tool = toolBySlug(slug);
  // An address with no tool at it is not a page. Send it to the index rather
  // than let a crawler index an empty shell.
  const Tool = TOOL_COMPONENTS[slug];
  if (!tool || !Tool) return <Navigate to="/tools" replace />;

  return (
    <ToolShell tool={tool}>
      <Suspense fallback={<Loading />}>
        <Tool />
      </Suspense>
    </ToolShell>
  );
};

export default ToolPage;
