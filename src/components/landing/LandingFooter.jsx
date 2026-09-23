import { Link } from "react-router-dom";
import BrandMark from "../BrandMark";
import { POSTS } from "../../utils/blog";

// Only destinations that exist are listed.
const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Workspace", to: "/workspace" },
      { label: "Sample map", to: "/workspace?demo=openapi" },
    ],
  },
  {
    heading: "Explore",
    links: [
      { label: "Features", href: "#features" },
      { label: "Use cases", href: "#use-cases" },
    ],
  },
  {
    heading: "Writing",
    links: [
      { label: "Blog", to: "/blog" },
      ...POSTS.slice(0, 2).map((post) => ({ label: post.title, to: `/blog/${post.slug}` })),
    ],
  },
].filter((column) => column.links.length > 0);

const LandingFooter = () => (
  <footer className="border-t border-vz-line-soft">
    <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.6fr_repeat(3,1fr)]">
      <div>
        <Link
          to="/"
          className="flex items-center gap-2.5 text-[17px] font-extrabold tracking-tight text-vz-text"
        >
          <BrandMark size={22} />
          Vizroute
        </Link>
        <p className="mt-4 max-w-[320px] text-[13px] leading-[1.65] text-vz-dim">
          Turn OpenAPI, Swagger, Postman, cURL, HAR, JSON and YAML
          specifications into interactive API maps.
        </p>
      </div>

      {COLUMNS.map((column) => (
        <nav key={column.heading} aria-label={column.heading}>
          {/* A paragraph, not a heading: the nav already carries the label,
              and the page outline belongs to the sections above. */}
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-vz-dim">
            {column.heading}
          </p>
          <ul className="space-y-2.5">
            {column.links.map((link) => (
              <li key={link.label}>
                {link.to ? (
                  <Link
                    to={link.to}
                    className="vz-t inline-flex min-h-[26px] items-center text-[13px] text-vz-soft hover:text-vz-text"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    href={link.href}
                    {...(link.external
                      ? { target: "_blank", rel: "noreferrer noopener" }
                      : {})}
                    className="vz-t inline-flex min-h-[26px] items-center gap-1.5 text-[13px] text-vz-soft hover:text-vz-text"
                  >
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>

    <div className="border-t border-vz-line-soft">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-2 px-5 py-5 text-[12px] text-vz-dim sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© {new Date().getFullYear()} Vizroute</p>
        <p>
          Specifications are parsed in your browser — there is no backend and
          nothing is collected.
        </p>
      </div>
    </div>
  </footer>
);

export default LandingFooter;
