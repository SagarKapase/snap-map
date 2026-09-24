#!/usr/bin/env node
/**
 * After the bundle: give the crawlers something to read.
 *
 * The app renders in the browser, so a search engine that does not run
 * JavaScript sees one empty `<div id="root">` for every address. This step
 * fixes that for the pages whose whole point is to be found:
 *
 *   – every post gets its own `dist/blog/<slug>/index.html` with the
 *     article already in the HTML, its own title, description, canonical
 *     link, social cards and BlogPosting data;
 *   – the blog index and the landing page get their own tags too;
 *   – `sitemap.xml` and `robots.txt` are written from the same post list.
 *
 * The page still boots the app, which replaces the static article with the
 * rendered one — a reader gets the app, a crawler gets the words. The
 * markdown parser is imported from `src`, so the static HTML and the page
 * can never say different things.
 *
 *   node scripts/seo.mjs [--dist dist] [--site https://example.com]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parsePost, sortPosts } from "../src/utils/blogPost.js";
import { renderHtml } from "../src/utils/markdown.js";
import {
  HOME_TITLE,
  HOME_DESCRIPTION,
  HOME_HEADLINE,
  HOME_LEDE,
  HOME_SECTIONS,
  HOME_FORMATS,
  appJsonLd,
  faqJsonLd,
} from "../src/content/home.js";
import { FAQS } from "../src/content/faqs.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const dist = join(root, flag("--dist", "dist"));
const site = String(flag("--site", process.env.VITE_SITE_URL || "https://vizroute.app")).replace(/\/+$/, "");
const contentDir = join(root, "src", "content", "blog");

if (!existsSync(join(dist, "index.html"))) {
  console.error(`No build at ${dist}. Run \`vite build\` first.`);
  process.exit(1);
}

const escape = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ─── The posts, from the same files the app reads ──
const posts = sortPosts(
  readdirSync(contentDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => parsePost(readFileSync(join(contentDir, name), "utf8"), name.replace(/\.md$/, "")))
    .filter((post) => !post.draft),
);

const shell = readFileSync(join(dist, "index.html"), "utf8");

/** Replace the tags a page owns, and drop the article into #root. */
const page = ({ title, description, path, type = "website", image = "/logo.jpg", jsonLd, body = "" }) => {
  const url = `${site}${path}`;
  let html = shell;
  const head = [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}" />`,
    `<link rel="canonical" href="${escape(url)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="Vizroute" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:image" content="${escape(`${site}${image}`)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(title)}" />`,
    `<meta name="twitter:description" content="${escape(description)}" />`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  // Out with the shell's own copies, in with this page's.
  html = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/i, "")
    .replace(/<meta\s+property="og:(type|title|description|image|site_name)"[\s\S]*?\/>\s*/gi, "")
    .replace(/<meta\s+name="twitter:(card|title|description)"[\s\S]*?\/>\s*/gi, "")
    .replace("</head>", `  ${head}\n  </head>`);

  if (body) html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return html;
};

const write = (path, html) => {
  const file = join(dist, path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};

// ─── A page per post ──
posts.forEach((post) => {
  const article = [
    `<article>`,
    `<h1>${escape(post.title)}</h1>`,
    post.date ? `<p><time datetime="${escape(post.date)}">${escape(post.date)}</time>${post.author ? ` · ${escape(post.author)}` : ""}</p>` : "",
    post.description ? `<p>${escape(post.description)}</p>` : "",
    renderHtml(post.blocks),
    `</article>`,
  ]
    .filter(Boolean)
    .join("\n");

  write(
    `blog/${post.slug}`,
    page({
      title: `${post.title} — Vizroute`,
      description: post.description,
      path: `/blog/${post.slug}`,
      type: "article",
      image: post.image || "/logo.jpg",
      body: article,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        url: `${site}/blog/${post.slug}`,
        mainEntityOfPage: { "@type": "WebPage", "@id": `${site}/blog/${post.slug}` },
        ...(post.date ? { datePublished: post.date, dateModified: post.date } : {}),
        ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
        publisher: { "@type": "Organization", name: "Vizroute", url: site },
        ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
        wordCount: post.words,
      },
    }),
  );
});

// ─── The index ──
write(
  "blog",
  page({
    title: "Blog — Vizroute",
    description: "Notes on reading API specifications, mapping a service estate, and the tools in Vizroute — written by the people building it.",
    path: "/blog",
    body: [
      "<h1>The Vizroute blog</h1>",
      "<ul>",
      ...posts.map((post) => `<li><a href="/blog/${post.slug}">${escape(post.title)}</a> — ${escape(post.description)}</li>`),
      "</ul>",
    ].join("\n"),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Vizroute blog",
      url: `${site}/blog`,
      blogPost: posts.map((post) => ({
        "@type": "BlogPosting",
        headline: post.title,
        url: `${site}/blog/${post.slug}`,
        ...(post.date ? { datePublished: post.date } : {}),
      })),
    },
  }),
);

// ─── The landing page ──
// The shell already carries the right tags; what it has no way to carry is
// the copy. This writes the same words the components render, so a crawler
// that never runs the bundle still reads the pitch, the formats and the
// questions — and gets the product and FAQ data with them.
write(
  "",
  page({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: "/",
    body: [
      `<h1>${escape(HOME_HEADLINE)}</h1>`,
      `<p>${escape(HOME_LEDE)}</p>`,
      `<p>Reads ${HOME_FORMATS.map(escape).join(", ")}.</p>`,
      ...HOME_SECTIONS.flatMap((section) => [`<h2>${escape(section.heading)}</h2>`, `<p>${escape(section.body)}</p>`]),
      "<h2>Questions worth asking first.</h2>",
      ...FAQS.flatMap((faq) => [`<h3>${escape(faq.q)}</h3>`, `<p>${escape(faq.a)}</p>`]),
    ].join("\n"),
    jsonLd: [appJsonLd(site), faqJsonLd(FAQS)],
  }),
);

// ─── sitemap.xml and robots.txt ──
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: "/", priority: "1.0", changefreq: "weekly", lastmod: today },
  { loc: "/blog", priority: "0.8", changefreq: "weekly", lastmod: posts[0]?.date || today },
  ...posts.map((post) => ({ loc: `/blog/${post.slug}`, priority: "0.7", changefreq: "monthly", lastmod: post.date || today })),
];

writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
    .map(
      (url) => `  <url>
    <loc>${site}${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
    )
    .join("\n")}
</urlset>
`,
);

writeFileSync(
  join(dist, "robots.txt"),
  `# Vizroute
User-agent: *
Allow: /

# The workspace and the graph are a person's own documents, not pages to index.
Disallow: /workspace
Disallow: /graph
Disallow: /embed
Disallow: /embed-graph
Disallow: /login
Disallow: /signup

Sitemap: ${site}/sitemap.xml
`,
);

console.log(`SEO: ${posts.length} post page${posts.length === 1 ? "" : "s"}, the blog index, the landing page, sitemap.xml and robots.txt written to ${dist} for ${site}`);
if (!process.env.VITE_SITE_URL && !args.includes("--site")) {
  console.log("     (VITE_SITE_URL is unset, so canonical links use the default. Set it to the real domain before deploying.)");
}
