const STEPS = [
  {
    id: "01",
    title: "Import",
    body: "Paste a spec, drop a file, pull a Postman collection, or fetch a remote URL.",
  },
  {
    id: "02",
    title: "Parse",
    body: "Vizroute detects the format and reads its paths, tags, schemas and security.",
  },
  {
    id: "03",
    title: "Map",
    body: "Groups and endpoints are laid out as a graph you can rearrange and filter.",
  },
  {
    id: "04",
    title: "Inspect",
    body: "Search an endpoint, read what it expects, and send a request against it.",
  },
];

const WorkflowSteps = () => (
  <section
    aria-labelledby="workflow-heading"
    className="approach-scene mx-auto max-w-[1500px] px-5 py-16 sm:px-8 lg:py-20"
  >
    <h2
      id="workflow-heading"
      className="max-w-[560px] text-[clamp(1.9rem,2.6vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-0.028em] text-vz-text"
    >
      From specification to map in seconds.
    </h2>
    <p className="mt-4 max-w-[560px] text-[15px] leading-[1.72] text-vz-soft">
      No account, no upload step, no build pipeline. Everything runs in the
      browser tab you already have open.
    </p>

    <ol className="approach mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-vz-line bg-vz-line sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step) => (
        <li key={step.id} className="bg-vz-bg p-6">
          <span className="vz-mono block text-[11px] font-semibold tracking-[0.14em] text-vz-accent-2">
            {step.id}
          </span>
          <h3 className="mt-3 text-[15px] font-semibold text-vz-text">
            {step.title}
          </h3>
          <p className="mt-2 text-[13px] leading-[1.65] text-vz-dim">
            {step.body}
          </p>
        </li>
      ))}
    </ol>
  </section>
);

export default WorkflowSteps;
