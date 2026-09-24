/**
 * A small namespace-aware XML parser.
 *
 * The workbench reads WSDL and XSD, which are XML, and its engine has to
 * run under Node in the tests as well as in the browser — so it cannot
 * lean on DOMParser. This parser is enough for those documents: elements,
 * attributes, text, CDATA, comments, processing instructions, the XML
 * declaration, the five built-in entities and numeric character references,
 * and namespace prefixes resolved to URIs on every element and attribute.
 *
 * It refuses a DOCTYPE with an internal subset outright. Entity expansion
 * is the classic way to make a parser eat a machine ("billion laughs"), and
 * no WSDL needs it.
 *
 * Every error names the line and column so a person can find the problem
 * in a ten-thousand-line document.
 */

const NAME_START = /[A-Za-z_:À-퟿]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-·À-퟿]/;
const XML_NS = "http://www.w3.org/XML/1998/namespace";

export class XmlError extends Error {
  constructor(message, line, column) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "XmlError";
    this.line = line;
    this.column = column;
  }
}

const decodeEntities = (text, fail) =>
  text.replace(/&(#[^;&\s]{0,12}|[A-Za-z][A-Za-z0-9]*);/g, (whole, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const digits = hex ? body.slice(2) : body.slice(1);
      if (!digits || !(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits)) return fail(`Bad character reference ${whole}`);
      const code = parseInt(digits, hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fail(`Bad character reference ${whole}`);
      return String.fromCodePoint(code);
    }
    switch (body) {
      case "lt": return "<";
      case "gt": return ">";
      case "amp": return "&";
      case "quot": return "\"";
      case "apos": return "'";
      default:
        return fail(`Unknown entity ${whole}`);
    }
  });

/** Split "wsdl:definitions" into its prefix and local name. */
export const splitQName = (qname) => {
  const text = String(qname || "");
  const at = text.indexOf(":");
  return at === -1 ? { prefix: "", local: text } : { prefix: text.slice(0, at), local: text.slice(at + 1) };
};

/**
 * Parse an XML string into a tree of
 * `{ name, prefix, local, ns, attrs, attributes, children, text, line }`.
 *
 * `attrs` is a plain object of attribute name → value as written;
 * `attributes` is the same list with each attribute's namespace resolved.
 * `children` holds child elements only; `text` is the element's direct
 * character data (whitespace-trimmed). `nsMap` on each element is the
 * prefix → URI map in scope, which the WSDL reader needs to resolve
 * QName-valued attributes such as `type="tns:Account"`.
 */
export const parseXml = (source) => {
  const input = String(source ?? "");
  let pos = 0;
  const length = input.length;

  // Line starts are indexed once so every element can carry its line
  // number without a rescan; a rescan per element made a 20 000-element
  // document take half a minute.
  let lineStarts = null;
  const position = (at = pos) => {
    if (!lineStarts) {
      lineStarts = [0];
      for (let i = 0; i < length; i++) if (input.charCodeAt(i) === 10) lineStarts.push(i + 1);
    }
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: at - lineStarts[lo] + 1 };
  };
  const fail = (message, at = pos) => {
    const { line, column } = position(at);
    throw new XmlError(message, line, column);
  };

  if (!input.trim()) fail("The document is empty", 0);

  const skipSpace = () => {
    while (pos < length && /\s/.test(input[pos])) pos++;
  };
  const readName = () => {
    const start = pos;
    if (pos >= length || !NAME_START.test(input[pos])) fail("Expected a name");
    while (pos < length && NAME_CHAR.test(input[pos])) pos++;
    return input.slice(start, pos);
  };
  const expect = (text) => {
    if (input.startsWith(text, pos)) {
      pos += text.length;
      return;
    }
    fail(`Expected "${text}"`);
  };

  const root = { name: "#document", children: [], nsMap: { xml: XML_NS } };
  const stack = [root];
  const current = () => stack[stack.length - 1];

  // Skips a comment, processing instruction, CDATA or the declaration;
  // returns false when the cursor is not on one of them.
  const readMarkupExtra = () => {
    if (input.startsWith("<!--", pos)) {
      const end = input.indexOf("-->", pos + 4);
      if (end === -1) fail("Unterminated comment");
      pos = end + 3;
      return true;
    }
    if (input.startsWith("<![CDATA[", pos)) {
      const end = input.indexOf("]]>", pos + 9);
      if (end === -1) fail("Unterminated CDATA section");
      const node = current();
      if (node === root) fail("Character data outside the root element");
      node.text += input.slice(pos + 9, end);
      pos = end + 3;
      return true;
    }
    if (input.startsWith("<?", pos)) {
      const end = input.indexOf("?>", pos + 2);
      if (end === -1) fail("Unterminated processing instruction");
      pos = end + 2;
      return true;
    }
    if (input.startsWith("<!DOCTYPE", pos)) {
      const start = pos;
      // A DOCTYPE with an internal subset can declare entities; refuse it.
      let depth = 0;
      pos += 9;
      for (; pos < length; pos++) {
        const ch = input[pos];
        if (ch === "[") fail("DOCTYPE declarations with an internal subset are not accepted", start);
        if (ch === "<") depth++;
        if (ch === ">") {
          if (depth === 0) {
            pos++;
            return true;
          }
          depth--;
        }
      }
      fail("Unterminated DOCTYPE", start);
    }
    return false;
  };

  while (pos < length) {
    const lt = input.indexOf("<", pos);
    if (lt === -1) {
      const rest = input.slice(pos);
      if (rest.trim()) {
        if (current() === root) fail(root.children.length ? "Text after the root element" : "Text before the root element");
        current().text += decodeEntities(rest, fail);
      }
      pos = length;
      break;
    }
    if (lt > pos) {
      const text = input.slice(pos, lt);
      if (text.trim()) {
        if (current() === root) fail(root.children.length ? "Text after the root element" : "Text before the root element");
        current().text += decodeEntities(text, fail);
      }
      pos = lt;
    }

    if (readMarkupExtra()) continue;

    if (input.startsWith("</", pos)) {
      const start = pos;
      pos += 2;
      const name = readName();
      skipSpace();
      expect(">");
      const node = current();
      if (node === root) fail(`Closing tag </${name}> has no opening tag`, start);
      if (node.name !== name) fail(`Closing tag </${name}> does not match <${node.name}>`, start);
      node.text = node.text.trim();
      stack.pop();
      continue;
    }

    // An element.
    const start = pos;
    pos += 1;
    const name = readName();
    const parent = current();
    if (parent === root && root.children.length) fail("More than one root element", start);
    const attrs = {};
    const order = [];
    for (;;) {
      skipSpace();
      if (pos >= length) fail("Unterminated start tag", start);
      if (input[pos] === ">" || input.startsWith("/>", pos)) break;
      const attrName = readName();
      skipSpace();
      expect("=");
      skipSpace();
      const quote = input[pos];
      if (quote !== "\"" && quote !== "'") fail("Attribute values must be quoted");
      const end = input.indexOf(quote, pos + 1);
      if (end === -1) fail("Unterminated attribute value");
      const raw = input.slice(pos + 1, end);
      if (raw.includes("<")) fail(`Attribute ${attrName} contains "<"`);
      if (Object.prototype.hasOwnProperty.call(attrs, attrName)) fail(`Attribute ${attrName} appears twice`);
      attrs[attrName] = decodeEntities(raw, fail);
      order.push(attrName);
      pos = end + 1;
    }
    const selfClosing = input[pos] === "/";
    pos += selfClosing ? 2 : 1;

    // Namespaces: the parent's map plus this element's own declarations.
    const nsMap = { ...parent.nsMap };
    order.forEach((attrName) => {
      if (attrName === "xmlns") nsMap[""] = attrs[attrName];
      else if (attrName.startsWith("xmlns:")) nsMap[attrName.slice(6)] = attrs[attrName];
    });
    const { prefix, local } = splitQName(name);
    if (prefix && nsMap[prefix] === undefined) fail(`Undeclared namespace prefix "${prefix}"`, start);
    const attributes = order
      .filter((a) => a !== "xmlns" && !a.startsWith("xmlns:"))
      .map((a) => {
        const q = splitQName(a);
        return { name: a, prefix: q.prefix, local: q.local, ns: q.prefix ? nsMap[q.prefix] || "" : "", value: attrs[a] };
      });

    const node = {
      name,
      prefix,
      local,
      ns: nsMap[prefix] || "",
      attrs,
      attributes,
      children: [],
      text: "",
      nsMap,
      line: position(start).line,
    };
    parent.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  if (stack.length > 1) fail(`Unclosed element <${current().name}>`, length);
  if (!root.children.length) fail("No root element", 0);
  return root.children[0];
};

/** Direct children with this local name (any namespace, or the given one). */
export const childrenOf = (node, local, ns) =>
  (node?.children || []).filter((c) => c.local === local && (ns === undefined || c.ns === ns));

export const childOf = (node, local, ns) => childrenOf(node, local, ns)[0] || null;

/** Every descendant (depth first) with this local name. */
export const descendants = (node, local) => {
  const out = [];
  const walk = (n) => {
    (n.children || []).forEach((c) => {
      if (!local || c.local === local) out.push(c);
      walk(c);
    });
  };
  if (node) walk(node);
  return out;
};

/**
 * Resolve a QName-valued attribute ("tns:Account") against the element's
 * namespace map. A bare name takes the default namespace.
 */
export const resolveQName = (node, value) => {
  const { prefix, local } = splitQName(value);
  if (!local) return { ns: "", local: "" };
  const ns = prefix ? node?.nsMap?.[prefix] : node?.nsMap?.[""];
  return { ns: ns || "", local, prefix };
};

/** The text of the first `documentation` (WSDL) or `annotation/documentation` (XSD) child. */
export const documentationOf = (node) => {
  const direct = childOf(node, "documentation");
  if (direct) return collapseSpace(allText(direct));
  const annotation = childOf(node, "annotation");
  const inner = annotation && childOf(annotation, "documentation");
  return inner ? collapseSpace(allText(inner)) : "";
};

const allText = (node) => [node.text, ...(node.children || []).map(allText)].filter(Boolean).join(" ");
const collapseSpace = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** Escape text for inclusion in an XML document. */
export const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
