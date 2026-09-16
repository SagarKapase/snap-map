import { Braces, Send, Terminal, Globe, Code2 } from "lucide-react";

/**
 * What the import parser accepts — each line matches the code, not the
 * brochure: `formatLabel` in utils/parsers.js reads OpenAPI 2/3.0/3.1 and
 * Postman v2 and v1; utils/importers.js reads cURL (one command per line)
 * and HAR; anything else that parses as JSON or YAML is read as the plain
 * endpoint-list format.
 */
const FORMATS = [
  { icon: Braces, accent: "#22c55e", title: "OpenAPI / Swagger", text: "YAML or JSON · 2.0, 3.0 and 3.1" },
  { icon: Send, accent: "#fb7185", title: "Postman Collection", text: "v2.0 and v2.1 · v1 exports too" },
  { icon: Terminal, accent: "#60a5fa", title: "cURL", text: "One command, or several — one per line" },
  { icon: Globe, accent: "#c084fc", title: "HAR", text: "Browser network recordings (.har)" },
  { icon: Code2, accent: "#38bdf8", title: "Plain JSON / YAML", text: "A simple list of endpoints, flat or grouped" },
];

const SupportedFormats = () => (
  <section className="imp-panel" aria-labelledby="imp-formats">
    <h3 id="imp-formats">Supported formats</h3>
    <ul className="imp-formats">
      {FORMATS.map(({ icon: Icon, accent, title, text }) => (
        <li key={title} className="imp-fmt" style={{ "--qa": accent }}>
          <span className="imp-fmt-icon"><Icon size={15} /></span>
          <span style={{ minWidth: 0 }}>
            <h4>{title}</h4>
            <p>{text}</p>
          </span>
        </li>
      ))}
    </ul>
    <p className="imp-fmt-note">Parsed in this browser — nothing is uploaded. WSDL, GraphQL and gRPC are not read yet.</p>
  </section>
);

export default SupportedFormats;
