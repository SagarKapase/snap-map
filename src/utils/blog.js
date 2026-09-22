/**
 * The blog: Markdown files in `src/content/blog`, read at build time.
 *
 * A post is a `.md` file with a small front matter block, and the file name
 * is the URL — `how-vizroute-reads-an-openapi-file.md` is
 * `/blog/how-vizroute-reads-an-openapi-file`. Rename the file and the link
 * changes, which is why the slug lives nowhere else.
 *
 * Reading a post is `blogPost.js`, which knows nothing about Vite, so the
 * build script can use it too.
 */
import { parsePost, sortPosts } from "./blogPost.js";

export { parseFrontMatter, parsePost, sortPosts, formatDate } from "./blogPost.js";

const files = import.meta.glob("../content/blog/*.md", { query: "?raw", import: "default", eager: true });

/** Every published post, newest first. Drafts never reach a page. */
export const POSTS = sortPosts(
  Object.entries(files)
    .map(([path, raw]) => parsePost(raw, path.split("/").pop().replace(/\.md$/, "")))
    .filter((post) => !post.draft),
);

export const getPost = (slug) => POSTS.find((post) => post.slug === slug) || null;

/** Posts sharing a tag with this one, newest first. */
export const relatedPosts = (post, limit = 2) =>
  POSTS.filter((other) => other.slug !== post.slug && other.tags.some((tag) => post.tags.includes(tag))).slice(0, limit);

export const ALL_TAGS = [...new Set(POSTS.flatMap((post) => post.tags))].sort();
