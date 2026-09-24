import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Braces, GitCompare, KeyRound, ListTree, Rows3, Scale, SearchCode, Search, ShieldCheck, Wrench } from "lucide-react";
import LandingNav from "../components/landing/LandingNav";
import LandingFooter from "../components/landing/LandingFooter";
import { populatedCategories, toolsInCategory, searchTools } from "../tools/registry";
import { useDocumentHead, SITE_URL } from "../utils/seo";
import "../tools.css";

/** Icons live here, not in the registry — that file has to stay readable by Node. */
const ICONS = {
  braces: Braces,
  "key-round": KeyRound,
  "git-compare": GitCompare,
  "search-code": SearchCode,
  "list-tree": ListTree,
  scale: Scale,
  rows: Rows3,
};

/**
 * What is coming, named honestly. An index with one card on it looks broken;
 * an index that says what is being built looks like a plan. These are the
 * phases from docs/explore-tools.md, and each name moves up into a real card
 * as it is built.
 */
const COMING = [
  "JWT decoder & verifier",
  "CORS preflight simulator",
  "HMAC signature calculator",
  "HTTP status reference",
  "OpenAPI validator",
  "cURL to code",
  "JSON to TypeScript",
  "XML & XPath",
  "WSDL viewer",
  "Base64 & URL encoders",
];

const PAGE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Free developer tools for APIs",
  url: `${SITE_URL}/tools`,
  description:
    "Free tools for working with JSON, JWTs, HTTP, OpenAPI and XML. Each runs in your browser — nothing you paste is uploaded.",
};

const ToolCard = ({ tool }) => {
  const Icon = ICONS[tool.icon] || Wrench;
  return (
    <Link to={`/tools/${tool.slug}`} className="tl-card">
      <span className="tl-card-icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="tl-card-title">{tool.title}</span>
        <span className="tl-card-text">{tool.description}</span>
      </span>
    </Link>
  );
};

const ToolsIndexPage = () => {
  const [query, setQuery] = useState("");

  useDocumentHead({
    title: "Free developer tools for APIs",
    description:
      "Free tools for JSON, JWTs, HTTP headers, OpenAPI and XML — formatters, validators, converters and decoders. Every one runs in your browser; nothing is uploaded.",
    path: "/tools",
    jsonLd: PAGE_JSON_LD,
  });

  // Matched against the name, the summary and the words people search for,
  // so "beautify" finds the formatter even though the page never says it.
  const matches = useMemo(() => searchTools(query), [query]);

  const groups = populatedCategories();

  return (
    <div className="tl relative min-h-screen bg-vz-bg text-vz-text">
      <LandingNav />

      <main className="mx-auto max-w-[1180px] px-5 pb-16 pt-10 sm:px-8">
        <header className="max-w-[720px]">
          <h1 className="text-[clamp(2rem,3.4vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-vz-text">
            Free tools for working with APIs.
          </h1>
          <p className="mt-5 text-[15.5px] leading-[1.72] text-vz-soft">
            Small, sharp pages for the things you need once an hour: read a broken JSON file, decode a token,
            work out why a request was blocked. No account, no upload, no install.
          </p>
          <p className="tl-promise">
            <ShieldCheck size={13} aria-hidden="true" className="text-vz-green" />
            Everything runs in your browser. What you paste stays in the tab.
          </p>
        </header>

        <div className="relative mt-10 max-w-[440px]">
          <label htmlFor="tool-search" className="sr-only">
            Search the tools
          </label>
          <input
            id="tool-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — json, jwt, cors…"
            className="tl-index-search"
            style={{ paddingLeft: 40 }}
          />
          <Search
            size={16}
            aria-hidden="true"
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--color-vz-dim)" }}
          />
        </div>

        <div className="mt-10">
          {matches ? (
            matches.length ? (
              <section className="tl-group" aria-label={`${matches.length} tools matching ${query}`}>
                <div className="tl-group-head">
                  <h2>
                    {matches.length} {matches.length === 1 ? "tool" : "tools"}
                  </h2>
                </div>
                <div className="tl-grid">
                  {matches.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              </section>
            ) : (
              <p className="tl-empty">
                Nothing matches “{query}” yet. It may be one of the ones still being built, below.
              </p>
            )
          ) : (
            groups.map((group) => (
              <section key={group.id} className="tl-group" aria-labelledby={`group-${group.id}`}>
                <div className="tl-group-head">
                  <h2 id={`group-${group.id}`}>{group.label}</h2>
                  <p>{group.blurb}</p>
                </div>
                <div className="tl-grid">
                  {toolsInCategory(group.id).map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <section className="tl-soon" aria-labelledby="coming-heading">
          <h2 id="coming-heading">Being built</h2>
          <p>
            These are next, in roughly this order. Each one is a page of its own, working the same way: paste
            something, get an answer, keep your data.
          </p>
          <div className="tl-soon-list">
            {COMING.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default ToolsIndexPage;
