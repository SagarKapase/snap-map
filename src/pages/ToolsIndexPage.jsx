import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Braces,
  Boxes,
  GitCompare,
  KeyRound,
  ListTree,
  Lock,
  Rows3,
  Scale,
  Search,
  SearchCode,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import LandingNav from "../components/landing/LandingNav";
import LandingFooter from "../components/landing/LandingFooter";
import EditorPreview from "../components/tools/EditorPreview";
import { populatedCategories, toolsInCategory, searchTools, searchPlanned, PLANNED, TOOLS } from "../tools/registry";
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

/** The queries people actually arrive with. */
const POPULAR = ["json", "jwt", "cors", "http", "diff", "ndjson", "validator", "openapi"];

const TRUST = [
  { icon: ShieldCheck, tone: "green", text: "Everything runs in your browser" },
  { icon: Lock, tone: "accent", text: "Your data never leaves your device" },
  { icon: Zap, tone: "orange", text: "Fast, and free, and no account" },
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
      <span className={`tl-card-icon is-${tool.tone || "accent"}`} aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="tl-card-body">
        <span className="tl-card-title">{tool.title}</span>
        <span className="tl-card-text">{tool.card || tool.description}</span>
      </span>
      <span className="tl-card-go" aria-hidden="true">
        <ArrowRight size={13} />
      </span>
    </Link>
  );
};

const ToolsIndexPage = () => {
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  useDocumentHead({
    title: "Free developer tools for APIs",
    description:
      "Free tools for JSON, JWTs, HTTP headers, OpenAPI and XML — formatters, validators, converters and decoders. Every one runs in your browser; nothing is uploaded.",
    path: "/tools",
    jsonLd: PAGE_JSON_LD,
  });

  // One search for the page. `searchTools` is the registry's own, matching
  // every word typed in any order against names, summaries and keywords.
  const matches = useMemo(() => searchTools(query), [query]);
  const planned = useMemo(() => searchPlanned(query), [query]);
  const groups = populatedCategories();

  const pick = (tag) => {
    setQuery(tag);
    searchRef.current?.focus();
  };

  return (
    <div className="tl relative min-h-screen bg-vz-bg text-vz-text">
      <LandingNav />

      <main>
        {/* ── Hero ── */}
        <section className="tl-hero" aria-labelledby="tools-heading">
          <div className="tl-hero-copy">
            <p className="tl-eyebrow">
              <Sparkles size={12} aria-hidden="true" />
              100% free <span aria-hidden="true">·</span> No account <span aria-hidden="true">·</span> Runs in your
              browser
            </p>

            <h1 id="tools-heading" className="tl-hero-title">
              Free tools for
              <br />
              <span className="tl-hero-gradient">working with APIs.</span>
            </h1>

            <p className="tl-hero-lede">
              Small, sharp pages for the things you need once an hour: read a broken JSON file, decode a token, work
              out why a request was blocked. No account, no upload, no install.
            </p>

            <ul className="tl-trust">
              {TRUST.map((item) => (
                <li key={item.text}>
                  <span className={`tl-trust-icon is-${item.tone}`} aria-hidden="true">
                    <item.icon size={13} />
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>

            <form className="tl-search" role="search" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="tool-search" className="sr-only">
                Search the tools
              </label>
              <Search size={16} aria-hidden="true" className="tl-search-icon" />
              <input
                id="tool-search"
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools — json, jwt, cors, formatter…"
                autoComplete="off"
                aria-describedby="tool-search-count"
              />
              <button type="submit" className="tl-search-go" aria-label="Search">
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </form>

            <div className="tl-popular">
              <span className="tl-dim">Popular:</span>
              {POPULAR.map((tag) => (
                <button key={tag} type="button" className="tl-chip" onClick={() => pick(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="tl-hero-visual">
            <EditorPreview />
          </div>
        </section>

        {/* ── The directory ── */}
        <section className="tl-directory" aria-label="All tools">
          <div className="tl-directory-inner">
            <p id="tool-search-count" className="sr-only" aria-live="polite">
              {query
                ? `${matches.length} ${matches.length === 1 ? "tool" : "tools"} match ${query}`
                : `${TOOLS.length} tools available`}
            </p>

            {query ? (
              <section className="tl-group">
                <div className="tl-group-head">
                  <h2>
                    {matches.length} {matches.length === 1 ? "tool" : "tools"}
                  </h2>
                  <p>matching “{query}”</p>
                  <button type="button" className="tl-view-all" onClick={() => setQuery("")}>
                    Show all tools
                    <ArrowRight size={13} aria-hidden="true" />
                  </button>
                </div>
                {matches.length > 0 ? (
                  <div className="tl-grid">
                    {matches.map((tool) => (
                      <ToolCard key={tool.slug} tool={tool} />
                    ))}
                  </div>
                ) : (
                  <p className="tl-empty">
                    Nothing built yet matches that
                    {planned.length > 0 ? " — though it may be one of the ones below." : "."}
                  </p>
                )}
              </section>
            ) : (
              groups.map((group) => (
                <section key={group.id} className="tl-group" aria-labelledby={`group-${group.id}`}>
                  <div className="tl-group-head">
                    <h2 id={`group-${group.id}`}>{group.label} tools</h2>
                    <p>{group.blurb}</p>
                    <span className="tl-group-count">
                      {toolsInCategory(group.id).length} {toolsInCategory(group.id).length === 1 ? "tool" : "tools"}
                    </span>
                  </div>
                  <div className="tl-grid">
                    {toolsInCategory(group.id).map((tool) => (
                      <ToolCard key={tool.slug} tool={tool} />
                    ))}
                  </div>
                </section>
              ))
            )}

            {/* ── What is coming, named but not linked ── */}
            {planned.length > 0 && (
              <section className="tl-planned" aria-labelledby="planned-heading">
                <div className="tl-planned-copy">
                  <span className="tl-planned-icon" aria-hidden="true">
                    <Boxes size={17} />
                  </span>
                  <div>
                    <h2 id="planned-heading">More API &amp; dev tools</h2>
                    <p>
                      {query
                        ? "Not built yet, but planned — these match what you searched for."
                        : "These are next, in roughly this order. Each gets a page of its own, working the same way: paste something, get an answer, keep your data."}
                    </p>
                  </div>
                </div>
                <ul className="tl-planned-list">
                  {planned.map((entry) => (
                    <li key={entry.name}>{entry.name}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export default ToolsIndexPage;
