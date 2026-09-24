/**
 * What a search engine and a link preview see.
 *
 * The app is one HTML file, so a page that does not say otherwise inherits
 * the title and description of the home page — which is how a blog ends up
 * invisible. `useDocumentHead` sets them per page, and the build writes the
 * same tags into a static file for each post (`scripts/seo.mjs`), so a
 * crawler gets the article without running any JavaScript.
 *
 * `SITE_URL` is the canonical origin. Set `VITE_SITE_URL` to the domain the
 * site is served from — canonical links and the sitemap are built from it.
 */
import { useEffect } from "react";

export const SITE_URL = String(import.meta.env?.VITE_SITE_URL || "https://vizroute.app").replace(/\/+$/, "");
export const SITE_NAME = "Vizroute";

/** A path → an absolute URL on this site. */
export const absoluteUrl = (path = "/") => {
  const clean = String(path || "/");
  if (/^https?:\/\//.test(clean)) return clean;
  return `${SITE_URL}${clean.startsWith("/") ? clean : `/${clean}`}`;
};

/** Titles read "Page — Vizroute", except the home page which is the brand. */
export const pageTitle = (title) => (title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Turn any API spec into an interactive map`);

/** schema.org for one post, so a result can show the date and author. */
export const articleJsonLd = (post) => ({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: post.title,
  description: post.description,
  url: absoluteUrl(`/blog/${post.slug}`),
  mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(`/blog/${post.slug}`) },
  ...(post.date ? { datePublished: post.date, dateModified: post.date } : {}),
  ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
  ...(post.image ? { image: absoluteUrl(post.image) } : {}),
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  ...(post.tags?.length ? { keywords: post.tags.join(", ") } : {}),
  wordCount: post.words || undefined,
});

/** schema.org for the index, listing the posts in order. */
export const blogJsonLd = (posts) => ({
  "@context": "https://schema.org",
  "@type": "Blog",
  name: `${SITE_NAME} blog`,
  url: absoluteUrl("/blog"),
  blogPost: posts.map((post) => ({
    "@type": "BlogPosting",
    headline: post.title,
    url: absoluteUrl(`/blog/${post.slug}`),
    ...(post.date ? { datePublished: post.date } : {}),
  })),
});

const upsertMeta = (selector, attrs) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    Object.entries(attrs).forEach(([key, value]) => key !== "content" && tag.setAttribute(key, value));
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", attrs.content ?? "");
  return tag;
};

const upsertLink = (rel, href) => {
  let tag = document.head.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
  return tag;
};

/**
 * Set this page's title, description, canonical link, social cards and
 * structured data. Everything is restored when the page unmounts, so one
 * route never leaves its title on another.
 */
export const useDocumentHead = ({ title, description, path = "/", image = "/logo.jpg", type = "website", jsonLd = null, noIndex = false } = {}) => {
  const json = jsonLd ? JSON.stringify(jsonLd) : "";
  useEffect(() => {
    const previous = document.title;
    const full = pageTitle(title);
    const url = absoluteUrl(path);
    document.title = full;
    upsertMeta('meta[name="description"]', { name: "description", content: description || "" });
    upsertLink("canonical", url);
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: full });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description || "" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: absoluteUrl(image) });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: full });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description || "" });
    upsertMeta('meta[name="robots"]', { name: "robots", content: noIndex ? "noindex, nofollow" : "index, follow" });

    let script = null;
    if (json) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = json;
      script.dataset.page = "1";
      document.head.appendChild(script);
    }
    return () => {
      document.title = previous;
      if (script) script.remove();
    };
  }, [title, description, path, image, type, json, noIndex]);
};
