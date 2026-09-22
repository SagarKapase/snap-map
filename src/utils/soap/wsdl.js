/**
 * WSDL 1.1 / 2.0 and XSD → one `SoapService` model.
 *
 * A WSDL is four documents in a trench coat: the schema (types), the
 * messages, the abstract interface (port type) and the concrete binding
 * with its endpoints. This reader folds them into one plain object the
 * rest of the workbench can work from without knowing which version, style
 * or SOAP flavour it came from:
 *
 *   { name, version, targetNamespace, documentation, endpoints, operations,
 *     schema, warnings }
 *
 * `schema` is a registry of global elements, types, groups and attribute
 * groups keyed by `namespace#localName`, read from inline `<types>` and from
 * every `import`/`include` that could be resolved from the attached
 * documents. What could not be resolved is a warning, never a crash — an
 * estate's XSDs arrive in the wrong order more often than not.
 */
import { parseXml, childrenOf, childOf, resolveQName, documentationOf, XmlError } from "./xml";

export const WSDL11 = "http://schemas.xmlsoap.org/wsdl/";
export const WSDL20 = "http://www.w3.org/ns/wsdl";
export const XSD = "http://www.w3.org/2001/XMLSchema";
export const SOAP11_BINDING = "http://schemas.xmlsoap.org/wsdl/soap/";
export const SOAP12_BINDING = "http://schemas.xmlsoap.org/wsdl/soap12/";
export const WSDL20_SOAP = "http://www.w3.org/ns/wsdl/soap";
export const HTTP_BINDING = "http://schemas.xmlsoap.org/wsdl/http/";

export const typeKey = (ns, local) => `${ns || ""}#${local}`;
export const keyOf = (qname) => (qname ? typeKey(qname.ns, qname.local) : "");

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** What kind of XML document the root element says this is. */
export const detectXmlKind = (root) => {
  if (!root) return "other";
  if (root.local === "definitions" && (root.ns === WSDL11 || !root.ns)) return "wsdl11";
  if (root.local === "description" && root.ns === WSDL20) return "wsdl20";
  if (root.local === "schema" && root.ns === XSD) return "xsd";
  if (root.local === "html" || root.local === "HTML") return "html";
  return "other";
};

/** True when the text looks like it should be handed to this reader rather than the JSON/YAML one. */
export const looksLikeXml = (text) => /^\s*(<\?xml|<!DOCTYPE|<!--|<[A-Za-z_:])/i.test(String(text || "").slice(0, 2000));

const occurs = (node) => {
  const min = node.attrs.minOccurs === undefined ? 1 : Math.max(0, parseInt(node.attrs.minOccurs, 10) || 0);
  const raw = node.attrs.maxOccurs;
  const max = raw === undefined ? 1 : raw === "unbounded" ? "unbounded" : Math.max(0, parseInt(raw, 10) || 0);
  return { minOccurs: min, maxOccurs: max };
};

const qnameAttr = (node, attr) => (node.attrs[attr] ? resolveQName(node, node.attrs[attr]) : null);

// ─── XSD ─────────────────────────────────────

const createRegistry = () => ({
  elements: {},
  types: {},
  groups: {},
  attributeGroups: {},
  namespaces: [],
  qualified: {},
});

const readAttributeDecl = (node, tns, ctx) => {
  if (node.attrs.ref) {
    const ref = resolveQName(node, node.attrs.ref);
    return { name: ref.local, ns: ref.ns, ref, type: null, use: node.attrs.use || "optional", default: node.attrs.default, fixed: node.attrs.fixed, documentation: documentationOf(node) };
  }
  const inlineSimple = childOf(node, "simpleType", XSD);
  return {
    name: node.attrs.name || "",
    ns: node.attrs.form === "qualified" ? tns : "",
    type: qnameAttr(node, "type"),
    inline: inlineSimple ? readSimpleType(inlineSimple, tns, ctx) : null,
    use: node.attrs.use || "optional",
    default: node.attrs.default,
    fixed: node.attrs.fixed,
    documentation: documentationOf(node),
  };
};

const readAttributes = (node, tns, ctx) => {
  const attributes = [];
  let anyAttribute = false;
  (node.children || []).forEach((child) => {
    if (child.ns !== XSD) return;
    if (child.local === "attribute") attributes.push(readAttributeDecl(child, tns, ctx));
    else if (child.local === "attributeGroup" && child.attrs.ref) attributes.push({ groupRef: resolveQName(child, child.attrs.ref) });
    else if (child.local === "anyAttribute") anyAttribute = true;
  });
  return { attributes, anyAttribute };
};

const readSimpleType = (node, tns, ctx) => {
  const type = { kind: "simple", name: node.attrs.name || "", ns: tns, documentation: documentationOf(node), base: null, facets: {}, enumerations: null, list: null, union: null };
  const restriction = childOf(node, "restriction", XSD);
  const list = childOf(node, "list", XSD);
  const union = childOf(node, "union", XSD);
  if (restriction) {
    type.base = qnameAttr(restriction, "base");
    const inlineBase = childOf(restriction, "simpleType", XSD);
    if (!type.base && inlineBase) type.inlineBase = readSimpleType(inlineBase, tns, ctx);
    restriction.children.forEach((facet) => {
      if (facet.ns !== XSD) return;
      const value = facet.attrs.value;
      if (facet.local === "enumeration") {
        type.enumerations = type.enumerations || [];
        type.enumerations.push(value);
      } else if (["pattern", "minLength", "maxLength", "length", "minInclusive", "maxInclusive", "minExclusive", "maxExclusive", "totalDigits", "fractionDigits", "whiteSpace"].includes(facet.local)) {
        type.facets[facet.local] = value;
      }
    });
  } else if (list) {
    const inlineItem = childOf(list, "simpleType", XSD);
    type.list = { itemType: qnameAttr(list, "itemType"), inline: inlineItem ? readSimpleType(inlineItem, tns, ctx) : null };
  } else if (union) {
    const members = (union.attrs.memberTypes || "").split(/\s+/).filter(Boolean).map((m) => resolveQName(union, m));
    const inline = childrenOf(union, "simpleType", XSD).map((s) => readSimpleType(s, tns, ctx));
    type.union = { memberTypes: members, inline };
  } else {
    ctx.warn("xsd-simple", `simpleType ${type.name || "(anonymous)"} has no restriction, list or union.`);
  }
  return type;
};

const readParticle = (node, tns, ctx) => {
  if (node.ns !== XSD) return null;
  switch (node.local) {
    case "sequence":
    case "choice":
    case "all":
      return {
        kind: node.local,
        ...occurs(node),
        items: node.children.map((c) => readParticle(c, tns, ctx)).filter(Boolean),
      };
    case "element":
      return readElementDecl(node, tns, ctx, false);
    case "any":
      return { kind: "any", ...occurs(node), namespace: node.attrs.namespace || "##any", processContents: node.attrs.processContents || "strict" };
    case "group": {
      if (node.attrs.ref) return { kind: "groupRef", ref: resolveQName(node, node.attrs.ref), ...occurs(node) };
      const inner = node.children.map((c) => readParticle(c, tns, ctx)).filter(Boolean)[0] || null;
      return inner ? { ...inner, ...occurs(node) } : null;
    }
    default:
      return null;
  }
};

const readComplexType = (node, tns, ctx) => {
  const type = {
    kind: "complex",
    name: node.attrs.name || "",
    ns: tns,
    documentation: documentationOf(node),
    mixed: node.attrs.mixed === "true",
    abstract: node.attrs.abstract === "true",
    content: null,
    attributes: [],
    anyAttribute: false,
    base: null,
    derivation: null, // "extension" | "restriction"
    simpleContent: false,
  };
  const own = readAttributes(node, tns, ctx);
  type.attributes = own.attributes;
  type.anyAttribute = own.anyAttribute;

  const simpleContent = childOf(node, "simpleContent", XSD);
  const complexContent = childOf(node, "complexContent", XSD);
  const derived = (parent) => childOf(parent, "extension", XSD) || childOf(parent, "restriction", XSD);
  if (simpleContent) {
    const d = derived(simpleContent);
    type.simpleContent = true;
    if (d) {
      type.base = qnameAttr(d, "base");
      type.derivation = d.local;
      const extra = readAttributes(d, tns, ctx);
      type.attributes.push(...extra.attributes);
      type.anyAttribute = type.anyAttribute || extra.anyAttribute;
      const inlineSimple = childOf(d, "simpleType", XSD);
      if (inlineSimple) type.inlineBase = readSimpleType(inlineSimple, tns, ctx);
      const facets = {};
      let enumerations = null;
      d.children.forEach((facet) => {
        if (facet.ns !== XSD) return;
        if (facet.local === "enumeration") (enumerations = enumerations || []).push(facet.attrs.value);
        else if (["pattern", "minLength", "maxLength", "length", "minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].includes(facet.local)) facets[facet.local] = facet.attrs.value;
      });
      if (enumerations || Object.keys(facets).length) type.simpleFacets = { facets, enumerations };
    }
  } else if (complexContent) {
    const d = derived(complexContent);
    if (complexContent.attrs.mixed === "true") type.mixed = true;
    if (d) {
      type.base = qnameAttr(d, "base");
      type.derivation = d.local;
      type.content = d.children.map((c) => readParticle(c, tns, ctx)).filter(Boolean)[0] || null;
      const extra = readAttributes(d, tns, ctx);
      type.attributes.push(...extra.attributes);
      type.anyAttribute = type.anyAttribute || extra.anyAttribute;
    }
  } else {
    type.content = node.children.map((c) => readParticle(c, tns, ctx)).filter(Boolean)[0] || null;
  }
  return type;
};

const readElementDecl = (node, tns, ctx, global) => {
  const decl = {
    kind: "element",
    name: node.attrs.name || "",
    ns: global || node.attrs.form === "qualified" || (node.attrs.form === undefined && ctx.qualified) ? tns : "",
    ref: node.attrs.ref ? resolveQName(node, node.attrs.ref) : null,
    type: qnameAttr(node, "type"),
    inline: null,
    nillable: node.attrs.nillable === "true",
    abstract: node.attrs.abstract === "true",
    default: node.attrs.default,
    fixed: node.attrs.fixed,
    substitutionGroup: qnameAttr(node, "substitutionGroup"),
    documentation: documentationOf(node),
    ...(global ? { minOccurs: 1, maxOccurs: 1 } : occurs(node)),
  };
  if (decl.ref) {
    decl.name = decl.ref.local;
    decl.ns = decl.ref.ns;
  }
  const complex = childOf(node, "complexType", XSD);
  const simple = childOf(node, "simpleType", XSD);
  if (complex) decl.inline = readComplexType(complex, tns, ctx);
  else if (simple) decl.inline = readSimpleType(simple, tns, ctx);
  if (!decl.ref && !decl.type && !decl.inline) decl.anyType = true;
  return decl;
};

/** Read one `<xs:schema>` element into the registry, following imports and includes. */
const readSchema = (schemaNode, registry, ctx, inheritedTns = "") => {
  const tns = schemaNode.attrs.targetNamespace !== undefined ? schemaNode.attrs.targetNamespace : inheritedTns;
  if (tns && !registry.namespaces.includes(tns)) registry.namespaces.push(tns);
  const qualified = schemaNode.attrs.elementFormDefault === "qualified";
  registry.qualified[tns] = registry.qualified[tns] || qualified;
  const local = { ...ctx, qualified };

  schemaNode.children.forEach((child) => {
    if (child.ns !== XSD) return;
    switch (child.local) {
      case "element": {
        const decl = readElementDecl(child, tns, local, true);
        if (decl.name) registry.elements[typeKey(tns, decl.name)] = decl;
        break;
      }
      case "complexType": {
        const type = readComplexType(child, tns, local);
        if (type.name) registry.types[typeKey(tns, type.name)] = type;
        break;
      }
      case "simpleType": {
        const type = readSimpleType(child, tns, local);
        if (type.name) registry.types[typeKey(tns, type.name)] = type;
        break;
      }
      case "group": {
        const particle = child.children.map((c) => readParticle(c, tns, local)).filter(Boolean)[0] || null;
        if (child.attrs.name) registry.groups[typeKey(tns, child.attrs.name)] = particle;
        break;
      }
      case "attributeGroup": {
        if (child.attrs.name) registry.attributeGroups[typeKey(tns, child.attrs.name)] = readAttributes(child, tns, local);
        break;
      }
      case "import":
      case "include":
      case "redefine": {
        const wantedNs = child.local === "import" ? child.attrs.namespace || "" : tns;
        const location = child.attrs.schemaLocation || "";
        if (child.local === "import" && wantedNs === XSD) break;
        const doc = ctx.resolve(location, wantedNs);
        if (!doc) {
          // The namespace may already be defined inline elsewhere in this WSDL.
          if (!(wantedNs && ctx.inlineNamespaces.has(wantedNs))) {
            ctx.warn("unresolved-import", `${child.local} of ${location || wantedNs || "(no location)"} could not be resolved; attach the schema file.`);
          }
          break;
        }
        if (ctx.seen.has(doc.id)) break;
        ctx.seen.add(doc.id);
        if (doc.kind === "xsd") readSchema(doc.root, registry, ctx, child.local === "include" ? tns : "");
        else if (doc.kind === "wsdl11" || doc.kind === "wsdl20") readTypesOf(doc.root, registry, ctx);
        else ctx.warn("unresolved-import", `${location || wantedNs} is not an XML Schema.`);
        if (child.local === "redefine") ctx.warn("xsd-redefine", `xs:redefine of ${location} is read as an include; redefinitions are ignored.`);
        break;
      }
      default:
        break;
    }
  });
};

const readTypesOf = (root, registry, ctx) => {
  childrenOf(root, "types").forEach((types) => {
    childrenOf(types, "schema", XSD).forEach((schema) => readSchema(schema, registry, ctx));
  });
};

// ─── Attached documents ──────────────────────

const basename = (path) => String(path || "").split(/[\\/]/).pop().split("?")[0];

/**
 * Parse every attached document once and index it by its name, its
 * basename and its target namespace, so an import can find it however the
 * WSDL spelled the location.
 */
const indexDocuments = (documents, warn) => {
  const docs = [];
  Object.entries(documents || {}).forEach(([name, text]) => {
    if (typeof text !== "string" || !text.trim()) return;
    if (text.length > MAX_DOCUMENT_BYTES) {
      warn("document-too-large", `${name} is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB and was skipped.`);
      return;
    }
    try {
      const root = parseXml(text);
      docs.push({ id: name, name, base: basename(name), root, kind: detectXmlKind(root), targetNamespace: root.attrs.targetNamespace || "" });
    } catch (e) {
      warn("attached-document", `${name}: ${e.message}`);
    }
  });
  return (location, namespace) => {
    const base = basename(location);
    return (
      (location && docs.find((d) => d.name === location)) ||
      (base && docs.find((d) => d.base === base)) ||
      (base && docs.find((d) => d.base.toLowerCase() === base.toLowerCase())) ||
      (namespace && docs.find((d) => d.targetNamespace === namespace && d.kind === "xsd")) ||
      (namespace && docs.find((d) => d.targetNamespace === namespace)) ||
      null
    );
  };
};

// ─── WSDL 1.1 ────────────────────────────────

const readMessages11 = (root, into) => {
  childrenOf(root, "message", WSDL11).forEach((message) => {
    const name = message.attrs.name;
    if (!name) return;
    into[typeKey(root.attrs.targetNamespace || "", name)] = {
      name,
      documentation: documentationOf(message),
      parts: childrenOf(message, "part", WSDL11).map((part) => ({
        name: part.attrs.name || "",
        element: qnameAttr(part, "element"),
        type: qnameAttr(part, "type"),
      })),
    };
  });
};

const readPortTypes11 = (root, into) => {
  childrenOf(root, "portType", WSDL11).forEach((portType) => {
    const name = portType.attrs.name;
    if (!name) return;
    into[typeKey(root.attrs.targetNamespace || "", name)] = {
      name,
      documentation: documentationOf(portType),
      operations: childrenOf(portType, "operation", WSDL11).map((op) => {
        const io = (local) => {
          const node = childOf(op, local, WSDL11);
          return node ? { name: node.attrs.name || "", message: qnameAttr(node, "message"), documentation: documentationOf(node) } : null;
        };
        return {
          name: op.attrs.name || "",
          documentation: documentationOf(op),
          parameterOrder: op.attrs.parameterOrder || "",
          input: io("input"),
          output: io("output"),
          faults: childrenOf(op, "fault", WSDL11).map((f) => ({ name: f.attrs.name || "", message: qnameAttr(f, "message"), documentation: documentationOf(f) })),
        };
      }),
    };
  });
};

const soapVersionOf = (node) => (node.ns === SOAP12_BINDING ? "1.2" : node.ns === SOAP11_BINDING ? "1.1" : "");

const readBindings11 = (root, into) => {
  childrenOf(root, "binding", WSDL11).forEach((binding) => {
    const name = binding.attrs.name;
    if (!name) return;
    const soapBinding = binding.children.find((c) => c.local === "binding" && (c.ns === SOAP11_BINDING || c.ns === SOAP12_BINDING));
    const httpBinding = binding.children.find((c) => c.local === "binding" && c.ns === HTTP_BINDING);
    const operations = {};
    childrenOf(binding, "operation", WSDL11).forEach((op) => {
      const soapOp = op.children.find((c) => c.local === "operation" && (c.ns === SOAP11_BINDING || c.ns === SOAP12_BINDING));
      const input = childOf(op, "input", WSDL11);
      const body = input?.children.find((c) => c.local === "body" && (c.ns === SOAP11_BINDING || c.ns === SOAP12_BINDING));
      operations[op.attrs.name || ""] = {
        soapAction: soapOp?.attrs.soapAction || "",
        style: soapOp?.attrs.style || "",
        use: body?.attrs.use || "",
        namespace: body?.attrs.namespace || "",
      };
    });
    into[typeKey(root.attrs.targetNamespace || "", name)] = {
      name,
      portType: qnameAttr(binding, "type"),
      protocol: soapBinding ? "soap" : httpBinding ? "http" : "other",
      soapVersion: soapBinding ? soapVersionOf(soapBinding) : "",
      style: soapBinding?.attrs.style || "document",
      transport: soapBinding?.attrs.transport || "",
      httpVerb: httpBinding?.attrs.verb || "",
      operations,
    };
  });
};

const readServices11 = (root, into) => {
  childrenOf(root, "service", WSDL11).forEach((service) => {
    childrenOf(service, "port", WSDL11).forEach((port) => {
      const address = port.children.find((c) => c.local === "address");
      into.push({
        service: service.attrs.name || "",
        name: port.attrs.name || "",
        binding: qnameAttr(port, "binding"),
        address: address?.attrs.location || address?.attrs.href || "",
        documentation: documentationOf(service),
      });
    });
  });
};

const buildService11 = (root, registry, ctx, resolve, name) => {
  const tns = root.attrs.targetNamespace || "";
  const messages = {};
  const portTypes = {};
  const bindings = {};
  const ports = [];

  // A WSDL may import another WSDL that holds the abstract half.
  const readAll = (doc, depth) => {
    readMessages11(doc, messages);
    readPortTypes11(doc, portTypes);
    readBindings11(doc, bindings);
    readServices11(doc, ports);
    childrenOf(doc, "import", WSDL11).forEach((imp) => {
      const found = resolve(imp.attrs.location || "", imp.attrs.namespace || "");
      if (!found) {
        ctx.warn("unresolved-import", `wsdl:import of ${imp.attrs.location || imp.attrs.namespace || "(no location)"} could not be resolved; attach the file.`);
        return;
      }
      if (ctx.seen.has(found.id) || depth > 8) return;
      ctx.seen.add(found.id);
      if (found.kind === "wsdl11") {
        readTypesOf(found.root, registry, ctx);
        readAll(found.root, depth + 1);
      } else if (found.kind === "xsd") readSchema(found.root, registry, ctx);
    });
  };
  readTypesOf(root, registry, ctx);
  readAll(root, 0);

  const endpoints = ports.map((port) => {
    const binding = bindings[keyOf(port.binding)] || Object.values(bindings).find((b) => b.name === port.binding?.local) || null;
    return {
      name: port.name,
      service: port.service,
      address: port.address,
      binding: binding?.name || port.binding?.local || "",
      protocol: binding?.protocol || "other",
      soapVersion: binding?.soapVersion || "",
      style: binding?.style || "",
      transport: binding?.transport || "",
    };
  });

  // Operations come from every port type; binding details are joined on by name.
  const operations = [];
  const portTypeList = Object.values(portTypes);
  if (!portTypeList.length) ctx.warn("no-port-type", "The WSDL declares no portType, so it has no operations.");
  portTypeList.forEach((portType) => {
    const bindingList = Object.values(bindings).filter((b) => b.portType && b.portType.local === portType.name);
    const soapBinding = bindingList.find((b) => b.protocol === "soap") || bindingList[0] || null;
    const endpoint = endpoints.find((e) => e.binding === soapBinding?.name) || null;
    portType.operations.forEach((op) => {
      const bound = soapBinding?.operations[op.name] || {};
      const style = bound.style || soapBinding?.style || "document";
      const message = (io) => {
        if (!io) return null;
        const found = messages[keyOf(io.message)] || Object.values(messages).find((m) => m.name === io.message?.local) || null;
        if (!found) {
          ctx.warn("missing-message", `Operation ${op.name}: message ${io.message?.local || "(unnamed)"} is not declared.`);
          return { message: io.message?.local || "", parts: [], missing: true };
        }
        return { message: found.name, parts: found.parts, documentation: io.documentation };
      };
      operations.push({
        name: op.name,
        documentation: op.documentation,
        portType: portType.name,
        binding: soapBinding?.name || "",
        endpoint: endpoint?.address || "",
        soapVersion: soapBinding?.soapVersion || "",
        soapAction: bound.soapAction || "",
        style,
        use: bound.use || "literal",
        rpcNamespace: bound.namespace || tns,
        input: message(op.input),
        output: message(op.output),
        faults: op.faults.map((f) => ({ name: f.name, documentation: f.documentation, ...(message(f) || { message: "", parts: [] }) })),
        pattern: op.output ? "in-out" : "in-only",
      });
    });
  });

  const serviceName = ports[0]?.service || root.attrs.name || name || "";
  return {
    name: serviceName,
    version: "1.1",
    targetNamespace: tns,
    documentation: documentationOf(root) || ports[0]?.documentation || "",
    endpoints,
    operations,
    schema: registry,
    warnings: ctx.warnings,
  };
};

// ─── WSDL 2.0 ────────────────────────────────

const buildService20 = (root, registry, ctx, resolve, name) => {
  const tns = root.attrs.targetNamespace || "";
  readTypesOf(root, registry, ctx);
  childrenOf(root, "import", WSDL20).forEach((imp) => {
    const found = resolve(imp.attrs.location || "", imp.attrs.namespace || "");
    if (!found) ctx.warn("unresolved-import", `wsdl:import of ${imp.attrs.location || imp.attrs.namespace} could not be resolved; attach the file.`);
    else if (!ctx.seen.has(found.id)) {
      ctx.seen.add(found.id);
      if (found.kind === "xsd") readSchema(found.root, registry, ctx);
      else readTypesOf(found.root, registry, ctx);
    }
  });

  const interfaces = childrenOf(root, "interface", WSDL20).map((iface) => {
    const faults = {};
    childrenOf(iface, "fault", WSDL20).forEach((f) => {
      faults[f.attrs.name] = { name: f.attrs.name, element: qnameAttr(f, "element"), documentation: documentationOf(f) };
    });
    return {
      name: iface.attrs.name || "",
      faults,
      operations: childrenOf(iface, "operation", WSDL20).map((op) => {
        const input = childOf(op, "input", WSDL20);
        const output = childOf(op, "output", WSDL20);
        const pattern = String(op.attrs.pattern || "").split("/").pop() || (output ? "in-out" : "in-only");
        const faultRefs = [...childrenOf(op, "outfault", WSDL20), ...childrenOf(op, "infault", WSDL20)].map((f) => {
          const ref = resolveQName(op, f.attrs.ref || "");
          const declared = faults[ref.local] || { name: ref.local, element: null };
          return { name: declared.name, documentation: declared.documentation || "", message: declared.name, parts: declared.element ? [{ name: declared.name, element: declared.element, type: null }] : [] };
        });
        const part = (node) => {
          if (!node) return null;
          const element = qnameAttr(node, "element");
          if (node.attrs.element === "#none" || node.attrs.element === "#any" || node.attrs.element === "#other") {
            return { message: node.attrs.element, parts: [], any: node.attrs.element !== "#none" };
          }
          return { message: element?.local || "", parts: element ? [{ name: node.attrs.messageLabel || "body", element, type: null }] : [] };
        };
        return { name: op.attrs.name || "", documentation: documentationOf(op), input: part(input), output: part(output), faults: faultRefs, pattern };
      }),
    };
  });
  if (!interfaces.length) ctx.warn("no-port-type", "The WSDL declares no interface, so it has no operations.");

  const bindings = childrenOf(root, "binding", WSDL20).map((b) => {
    const isSoap = b.attrs.type === WSDL20_SOAP;
    const soapAttr = (local) => b.attributes.find((a) => a.local === local && a.ns === WSDL20_SOAP)?.value || "";
    const operations = {};
    childrenOf(b, "operation", WSDL20).forEach((op) => {
      const ref = resolveQName(b, op.attrs.ref || "");
      operations[ref.local] = { soapAction: op.attributes.find((a) => a.local === "action" && a.ns === WSDL20_SOAP)?.value || "" };
    });
    const version = soapAttr("version");
    return { name: b.attrs.name || "", interface: qnameAttr(b, "interface"), protocol: isSoap ? "soap" : "other", soapVersion: version || (isSoap ? "1.2" : ""), transport: soapAttr("protocol"), operations };
  });

  const endpoints = [];
  childrenOf(root, "service", WSDL20).forEach((service) => {
    childrenOf(service, "endpoint", WSDL20).forEach((endpoint) => {
      const binding = bindings.find((b) => b.name === resolveQName(endpoint, endpoint.attrs.binding || "").local) || null;
      endpoints.push({ name: endpoint.attrs.name || "", service: service.attrs.name || "", address: endpoint.attrs.address || "", binding: binding?.name || "", protocol: binding?.protocol || "other", soapVersion: binding?.soapVersion || "", style: "document", transport: binding?.transport || "" });
    });
  });

  const operations = [];
  interfaces.forEach((iface) => {
    const binding = bindings.find((b) => b.interface?.local === iface.name && b.protocol === "soap") || bindings.find((b) => b.interface?.local === iface.name) || null;
    const endpoint = endpoints.find((e) => e.binding === binding?.name) || null;
    iface.operations.forEach((op) => {
      operations.push({
        name: op.name,
        documentation: op.documentation,
        portType: iface.name,
        binding: binding?.name || "",
        endpoint: endpoint?.address || "",
        soapVersion: binding?.soapVersion || "",
        soapAction: binding?.operations[op.name]?.soapAction || "",
        style: "document",
        use: "literal",
        rpcNamespace: tns,
        input: op.input,
        output: op.pattern === "in-only" || op.pattern === "robust-in-only" ? null : op.output,
        faults: op.faults,
        pattern: op.pattern,
      });
    });
  });

  return {
    name: childOf(root, "service", WSDL20)?.attrs.name || name || "",
    version: "2.0",
    targetNamespace: tns,
    documentation: documentationOf(root),
    endpoints,
    operations,
    schema: registry,
    warnings: ctx.warnings,
  };
};

// ─── Entry point ─────────────────────────────

/**
 * Parse WSDL text. `documents` is a map of file name → text for the XSDs
 * and WSDLs it imports; `name` is the fallback service name (usually the
 * file name). Throws with a plain-English message when the text is not a
 * WSDL at all; anything less than that becomes a warning on the result.
 */
export const parseWsdl = (text, { name = "", documents = {} } = {}) => {
  const source = String(text ?? "");
  if (!source.trim()) throw new Error("The document is empty.");
  if (source.length > MAX_DOCUMENT_BYTES) throw new Error("The WSDL is larger than 25 MB.");
  if (!looksLikeXml(source)) {
    const head = source.trimStart().slice(0, 1);
    throw new Error(head === "{" || head === "[" ? "That is JSON, not a WSDL. The workbench reads WSDL and XSD; JSON and YAML specifications belong in the API Map." : "That text is not XML.");
  }
  let root;
  try {
    root = parseXml(source);
  } catch (e) {
    if (e instanceof XmlError) throw new Error(`Not well-formed XML: ${e.message}`);
    throw e;
  }
  const kind = detectXmlKind(root);
  if (kind === "xsd") throw new Error("That is an XML Schema (XSD) on its own. Attach it to the WSDL that imports it.");
  if (kind === "html") throw new Error("That is an HTML page, not a WSDL. If it came from a URL, the server answered with a page instead of the contract.");
  if (kind === "other") throw new Error(`The root element is <${root.name}>; a WSDL starts with <definitions> (1.1) or <description> (2.0).`);

  const warnings = [];
  const warn = (code, message) => {
    if (!warnings.some((w) => w.message === message)) warnings.push({ code, message });
  };
  const resolve = indexDocuments(documents, warn);
  const registry = createRegistry();
  const inlineNamespaces = new Set();
  childrenOf(root, "types").forEach((types) => childrenOf(types, "schema", XSD).forEach((s) => s.attrs.targetNamespace && inlineNamespaces.add(s.attrs.targetNamespace)));
  const ctx = { warnings, warn, resolve, seen: new Set(), inlineNamespaces, qualified: false };

  const service = kind === "wsdl11" ? buildService11(root, registry, ctx, resolve, name) : buildService20(root, registry, ctx, resolve, name);
  if (!service.name) service.name = name || "SOAP service";
  if (!service.operations.length && !warnings.some((w) => w.code === "no-port-type")) warn("no-operations", "The WSDL declares no operations.");
  if (service.operations.some((op) => op.use === "encoded")) warn("encoded", "Some operations use SOAP encoding (use=\"encoded\"); their message shapes are read from the declared types, which is usually right.");
  if (!service.endpoints.length) warn("no-endpoint", "No service endpoint address is declared; the parity script will need one.");
  return service;
};

/** Every operation's input and output element names, for a quick summary. */
export const summarizeService = (service) => ({
  name: service.name,
  version: service.version,
  operations: service.operations.length,
  endpoints: service.endpoints.length,
  elements: Object.keys(service.schema.elements).length,
  types: Object.keys(service.schema.types).length,
  warnings: service.warnings.length,
});
