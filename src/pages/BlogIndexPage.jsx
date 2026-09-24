import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Tag as TagIcon } from "lucide-react";
import LandingNav from "../components/landing/LandingNav";
import LandingFooter from "../components/landing/LandingFooter";
import { POSTS, ALL_TAGS, formatDate } from "../utils/blog";
import { useDocumentHead, blogJsonLd } from "../utils/seo";
import "../blog.css";

const DESCRIPTION = "Notes on reading API specifications, mapping a service estate, and the tools in Vizroute — written by the people building it.";

const BlogIndexPage = () => {
  const [tag, setTag] = useState("");
  const posts = useMemo(() => (tag ? POSTS.filter((post) => post.tags.includes(tag)) : POSTS), [tag]);
  useDocumentHead({
    title: "Blog",
    description: DESCRIPTION,
    path: "/blog",
    jsonLd: blogJsonLd(POSTS),
  });

  const [lead, ...rest] = posts;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-vz-bg text-vz-text">
      <div aria-hidden="true" className="landing-glow" />
      <div className="relative">
        <LandingNav />
        <main className="mx-auto max-w-[1100px] px-5 pb-16 pt-14 sm:px-8">
          <header>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#c55cff]/28 bg-vz-accent/9 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#d993ff]">
              Writing
            </p>
            <h1 className="max-w-[720px] text-[clamp(2.1rem,3.2vw,3rem)] font-extrabold leading-[1.08] tracking-[-0.03em] [text-wrap:balance]">
              The blog
            </h1>
            <p className="mt-5 max-w-[640px] text-[16px] leading-[1.72] text-vz-soft">{DESCRIPTION}</p>
          </header>

          {ALL_TAGS.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tag">
              <button type="button" onClick={() => setTag("")} className={`blog-tag${tag ? "" : " is-active"}`} aria-pressed={!tag}>
                All posts
              </button>
              {ALL_TAGS.map((name) => (
                <button key={name} type="button" onClick={() => setTag(name === tag ? "" : name)} className={`blog-tag${tag === name ? " is-active" : ""}`} aria-pressed={tag === name}>
                  {name}
                </button>
              ))}
            </div>
          )}

          {posts.length === 0 ? (
            <p className="mt-14 rounded-[14px] border border-vz-line bg-vz-panel/60 px-6 py-10 text-center text-[14px] text-vz-soft">
              {POSTS.length === 0
                ? "The first post is being written. Come back shortly."
                : "Nothing under that tag yet."}
            </p>
          ) : (
            <>
              {lead && (
                <article className="blog-lead mt-12">
                  <Link to={`/blog/${lead.slug}`} className="blog-lead-link">
                    <div className="min-w-0">
                      <p className="blog-meta">
                        {lead.date && <time dateTime={lead.date}>{formatDate(lead.date)}</time>}
                        <span className="blog-meta-dot" aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5"><Clock size={12} aria-hidden="true" />{lead.readingMinutes} min read</span>
                      </p>
                      <h2 className="mt-3 text-[clamp(1.5rem,2.2vw,2rem)] font-bold leading-[1.18] tracking-[-0.02em] text-vz-text">
                        {lead.title}
                      </h2>
                      <p className="mt-3 max-w-[640px] text-[14.5px] leading-[1.7] text-vz-soft">{lead.description}</p>
                      <span className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold text-vz-accent-2">
                        Read the post <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </article>
              )}

              {rest.length > 0 && (
                <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {rest.map((post) => (
                    <li key={post.slug}>
                      <Link to={`/blog/${post.slug}`} className="blog-card">
                        <p className="blog-meta">
                          {post.date && <time dateTime={post.date}>{formatDate(post.date)}</time>}
                          <span className="blog-meta-dot" aria-hidden="true">·</span>
                          <span>{post.readingMinutes} min</span>
                        </p>
                        <h3 className="mt-2.5 text-[17px] font-semibold leading-[1.3] text-vz-text">{post.title}</h3>
                        <p className="mt-2 text-[13.5px] leading-[1.65] text-vz-dim">{post.description}</p>
                        {post.tags.length > 0 && (
                          <p className="blog-card-tags">
                            <TagIcon size={11} aria-hidden="true" />
                            {post.tags.join(" · ")}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </main>
        <LandingFooter />
      </div>
    </div>
  );
};

export default BlogIndexPage;
