import { Link } from "react-router-dom";

/**
 * Markdown tokens → React. The same tokens the build renders to HTML
 * (`renderHtml` in utils/markdown.js), so what a crawler reads and what a
 * reader sees come from one parser.
 *
 * Text is never passed as HTML: every node is a React child, so a post
 * cannot inject markup.
 */

const Inline = ({ nodes }) =>
  nodes.map((node, i) => {
    switch (node.type) {
      case "code":
        return <code key={i}>{node.value}</code>;
      case "strong":
        return <strong key={i}>{node.value}</strong>;
      case "em":
        return <em key={i}>{node.value}</em>;
      case "image":
        return <img key={i} src={node.src} alt={node.alt} title={node.title || undefined} loading="lazy" />;
      case "link": {
        // An in-app link stays in the app; anything else opens away from it.
        if (node.href.startsWith("/")) return <Link key={i} to={node.href}>{node.value}</Link>;
        return (
          <a key={i} href={node.href} target="_blank" rel="noreferrer noopener">
            {node.value}
          </a>
        );
      }
      default:
        return <span key={i}>{node.value}</span>;
    }
  });

const Prose = ({ blocks = [] }) => (
  <div className="blog-prose">
    {blocks.map((block, i) => {
      switch (block.type) {
        case "heading": {
          const Tag = `h${Math.min(block.level, 4)}`;
          return (
            <Tag key={i} id={block.id}>
              <Inline nodes={block.inline} />
            </Tag>
          );
        }
        case "code":
          return (
            <pre key={i}>
              <code className={block.language ? `language-${block.language}` : undefined}>{block.value}</code>
            </pre>
          );
        case "list": {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline nodes={item} />
                </li>
              ))}
            </Tag>
          );
        }
        case "quote":
          return (
            <blockquote key={i}>
              <Inline nodes={block.inline} />
            </blockquote>
          );
        case "rule":
          return <hr key={i} />;
        case "table":
          return (
            <div key={i} className="blog-table-wrap">
              <table>
                <thead>
                  <tr>
                    {block.header.map((cell, j) => (
                      <th key={j}>
                        <Inline nodes={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>
                          <Inline nodes={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        default:
          return (
            <p key={i}>
              <Inline nodes={block.inline} />
            </p>
          );
      }
    })}
  </div>
);

export default Prose;
