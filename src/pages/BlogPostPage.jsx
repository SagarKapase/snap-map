import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, Calendar } from "lucide-react";
import LandingNav from "../components/landing/LandingNav";
import LandingFooter from "../components/landing/LandingFooter";
import Prose from "../components/blog/Prose";
import { getPost, relatedPosts, formatDate, POSTS } from "../utils/blog";
import { useDocumentHead, articleJsonLd } from "../utils/seo";
import "../blog.css";

const BlogPostPage = () => {
  const { slug } = useParams();
  const post = getPost(slug);
  // An unknown slug is not a page — send it to the index rather than show a
  // shell a search engine would index as empty.
  if (!post) return <Navigate to="/blog" replace />;
  return <Post post={post} />;
};

const Post = ({ post }) => {
  const related = relatedPosts(post);
  const next = POSTS[POSTS.indexOf(post) + 1] || null;
  useDocumentHead({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    image: post.image || "/logo.jpg",
    type: "article",
    jsonLd: articleJsonLd(post),
  });

  return (
    <div className="relative min-h-screen overflow-x-clip bg-vz-bg text-vz-text">
      <div aria-hidden="true" className="landing-glow" />
      <div className="relative">
        <LandingNav />
        <main className="mx-auto max-w-[760px] px-5 pb-16 pt-12 sm:px-8">
          <Link to="/blog" className="inline-flex items-center gap-2 text-[13px] font-semibold text-vz-soft hover:text-vz-text">
            <ArrowLeft size={14} aria-hidden="true" /> All posts
          </Link>

          <article className="mt-8">
            <header>
              <h1 className="text-[clamp(2rem,3vw,2.8rem)] font-extrabold leading-[1.1] tracking-[-0.03em] [text-wrap:balance]">
                {post.title}
              </h1>
              <p className="blog-meta mt-5">
                {post.date && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={12} aria-hidden="true" />
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                  </span>
                )}
                <span className="blog-meta-dot" aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={12} aria-hidden="true" />
                  {post.readingMinutes} min read
                </span>
                {post.author && (
                  <>
                    <span className="blog-meta-dot" aria-hidden="true">·</span>
                    <span>{post.author}</span>
                  </>
                )}
              </p>
              {post.description && <p className="mt-5 text-[16px] leading-[1.7] text-vz-soft">{post.description}</p>}
            </header>

            {post.headings.length > 2 && (
              <nav className="blog-toc" aria-label="On this page">
                <p className="blog-toc-title">On this page</p>
                <ul>
                  {post.headings.map((heading) => (
                    <li key={heading.id} data-level={heading.level}>
                      <a href={`#${heading.id}`}>{heading.text}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <Prose blocks={post.blocks} />

            {post.tags.length > 0 && (
              <p className="mt-10 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="blog-tag is-static">{tag}</span>
                ))}
              </p>
            )}
          </article>

          <aside className="mt-14 rounded-[16px] border border-vz-accent/22 bg-gradient-to-b from-[#150e22] to-[#0a0e16] p-7">
            <h2 className="text-[19px] font-bold tracking-[-0.02em]">Try it on your own specification</h2>
            <p className="mt-2.5 text-[14px] leading-[1.7] text-vz-soft">
              Drop an OpenAPI, Swagger or Postman file into the workspace and read it as a map. No account, and the file is parsed in your browser.
            </p>
            <Link
              to="/workspace"
              className="vz-t mt-5 inline-flex h-[44px] items-center justify-center gap-2.5 rounded-[10px] bg-gradient-to-r from-[#a855f7] to-[#cb68ff] px-5 text-[13.5px] font-bold text-[#150a1b] hover:-translate-y-0.5"
            >
              Open the workspace <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </aside>

          {(related.length > 0 || next) && (
            <section className="mt-12" aria-label="More posts">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-vz-dim">Keep reading</h2>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(related.length > 0 ? related : [next]).filter(Boolean).map((other) => (
                  <li key={other.slug}>
                    <Link to={`/blog/${other.slug}`} className="blog-card">
                      <h3 className="text-[15px] font-semibold leading-[1.35] text-vz-text">{other.title}</h3>
                      <p className="mt-1.5 text-[12.5px] leading-[1.6] text-vz-dim">{other.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
        <LandingFooter />
      </div>
    </div>
  );
};

export default BlogPostPage;
