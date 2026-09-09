import { Compass, GitCompareArrows, TerminalSquare, BookOpen } from "lucide-react";

// Each case names the feature in the app that serves it.
const CASES = [
  {
    icon: Compass,
    title: "Learning an unfamiliar API",
    body: "Open the spec, read the shape of it from the map, and drill into a single endpoint instead of scrolling a reference page.",
    tools: "API map · Endpoint search · Inspector",
  },
  {
    icon: GitCompareArrows,
    title: "Reviewing an API change",
    body: "Diff two versions of a specification and see which changes would break the clients already calling it.",
    tools: "API diff · Breaking changes",
  },
  {
    icon: TerminalSquare,
    title: "Debugging an integration",
    body: "Send the request from the endpoint you are looking at, switch environments, and check which endpoints are responding.",
    tools: "Playground · Environments · Health monitor",
  },
  {
    icon: BookOpen,
    title: "Explaining a service to others",
    body: "Export the map as an image, generate documentation from the spec, or send a colleague a link that opens the same view.",
    tools: "Export · Doc generator · Share link",
  },
];

const UseCases = () => (
  <section
    id="use-cases"
    aria-labelledby="use-cases-heading"
    className="mx-auto max-w-[1500px] scroll-mt-24 px-5 py-16 sm:px-8 lg:py-20"
  >
    <h2
      id="use-cases-heading"
      className="max-w-[560px] text-[clamp(1.9rem,2.6vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-0.028em] text-vz-text"
    >
      Built for the moments you meet an API.
    </h2>

    <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
      {CASES.map((useCase) => (
        <article
          key={useCase.title}
          className="vz-t rounded-[14px] border border-vz-line bg-vz-panel/60 p-6 hover:border-[#2c3548]"
        >
          <div className="flex items-start gap-4">
            <span className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] border border-vz-line bg-vz-panel-2 text-vz-accent-2">
              <useCase.icon size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-vz-text">
                {useCase.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.68] text-vz-soft">
                {useCase.body}
              </p>
              <p className="vz-mono mt-3.5 text-[11px] text-vz-dim">
                {useCase.tools}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  </section>
);

export default UseCases;
