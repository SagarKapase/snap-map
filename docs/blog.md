# The blog, and what it takes to be found

`/blog` is a real section, not a placeholder: posts are Markdown files in
the repository, and the build gives each one a static page a search engine
can read without running JavaScript.

## Writing a post

1. Copy `src/content/blog/_template.md` to `src/content/blog/<slug>.md`.
   **The file name is the URL** — `mapping-an-estate.md` is
   `/blog/mapping-an-estate` — so name it as something a person would type.
2. Fill in the front matter:

   ```yaml
   ---
   title: The title, also the H1 and the browser tab
   description: One or two sentences; the meta description and the card text
   date: 2026-09-23          # YYYY-MM-DD, newest first
   author: Your name
   tags: OpenAPI, How to     # two or three, comma separated
   draft: true               # remove to publish
   ---
   ```

3. Write. The renderer supports headings (`#`…`####`), paragraphs, bold,
   italic, inline code, links, images, bullet and numbered lists,
   blockquotes, fenced code with a language, horizontal rules and tables.
4. `npm run dev` to read it, `npm run build` to publish it.

Nothing else to register: `src/utils/blog.js` picks the file up, sorts it
by date, and every page and the sitemap follow.

### Things the system does for you

- **Drafts** (`draft: true`) are not listed, have no page, and never reach
  the sitemap.
- **Reading time** from the word count, **tags** as filters on the index,
  and an **On this page** list when a post has more than two sections.
- **Related posts** by shared tag at the foot of a post.
- A post's H1 is the page heading, so it is not repeated in the body.
- A link in prose to `/workspace` stays inside the app; an external one
  opens in a new tab. A link with a scheme the browser should not follow
  (`javascript:`) keeps its words and loses the link.

## What the build does for search engines

`npm run build` runs `vite build` and then `node scripts/seo.mjs`, which:

- writes `dist/blog/<slug>/index.html` for every post — **the article is
  in the HTML**, with its own `<title>`, meta description, canonical link,
  Open Graph and Twitter cards, and `BlogPosting` structured data;
- writes `dist/blog/index.html` the same way, with `Blog` structured data;
- writes `sitemap.xml` (home, the index, every post, with `lastmod`) and
  `robots.txt` (the workspace, the graph, embeds and the account pages are
  disallowed — they are a person's own documents, not pages to index).

The static page still boots the app, which replaces the article with the
rendered one: a crawler gets the words, a reader gets the app. Both come
from `src/utils/markdown.js`, so the two can never disagree.

In the app itself, `useDocumentHead` (`src/utils/seo.js`) sets the same
tags per route, so a link shared from a page a reader navigated to is
described correctly too.

## Before it can rank

The plumbing is done; these are not, and no amount of code does them:

1. **Set `VITE_SITE_URL`** to the real domain before building. Canonical
   links and the sitemap are built from it, and they are wrong by default.
2. **Serve the deep links.** The post pages are real files, so any static
   host serves `/blog/<slug>` as it stands. The *app* routes
   (`/workspace`, `/graph`, …) still need the usual SPA fallback to
   `index.html` — one rule in `vercel.json`, `netlify.toml` or your Nginx
   config.
3. **Submit the sitemap** in Google Search Console and Bing Webmaster
   Tools, and watch which queries actually arrive.
4. **Write more than one post, on a schedule.** One post ranks for
   nothing. Posts that answer a question someone types — "how do I
   visualise an OpenAPI file", "how do I find duplicate endpoints across
   services" — are what bring people in.
5. **Earn links.** Nothing in this repository can manufacture them.

A blog does not rank a site; posts people find useful, on pages that load
fast and can be read without JavaScript, eventually do. This gives you the
second half of that sentence.
