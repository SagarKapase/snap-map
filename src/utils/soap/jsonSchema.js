/**
 * XSD → JSON Schema (the OpenAPI 3.0 dialect), with the ambiguities listed.
 *
 * XML Schema says things JSON Schema cannot: `xs:choice`, `xs:any`, mixed
 * content, `nillable` as distinct from optional, attributes as distinct
 * from children, lists as space-separated strings. Each of those is mapped
 * to the nearest JSON shape *and* recorded as an ambiguity with the
 * decision taken, so the architect reviewing the design sees every place
 * the mapping had to choose.
 *
 * Named complex types become `components.schemas` entries (so recursion is
 * a `$ref`, never a loop); simple types are inlined unless they enumerate.
 */
import { XSD, typeKey, keyOf } from "./wsdl";

const BUILTIN = {
  string: { type: "string" },
  normalizedString: { type: "string" },
  token: { type: "string" },
  language: { type: "string" },
  Name: { type: "string" },
  NCName: { type: "string" },
  NMTOKEN: { type: "string" },
  NMTOKENS: { type: "string" },
  ID: { type: "string" },
  IDREF: { type: "string" },
  IDREFS: { type: "string" },
  ENTITY: { type: "string" },
  ENTITIES: { type: "string" },
  QName: { type: "string" },
  NOTATION: { type: "string" },
  anyURI: { type: "string", format: "uri" },
  boolean: { type: "boolean" },
  decimal: { type: "number" },
  float: { type: "number", format: "float" },
  double: { type: "number", format: "double" },
  integer: { type: "integer" },
  long: { type: "integer", format: "int64" },
  int: { type: "integer", format: "int32" },
  short: { type: "integer", format: "int32" },
  byte: { type: "integer", format: "int32" },
  nonNegativeInteger: { type: "integer", minimum: 0 },
  positiveInteger: { type: "integer", minimum: 1 },
  nonPositiveInteger: { type: "integer", maximum: 0 },
  negativeInteger: { type: "integer", maximum: -1 },
  unsignedLong: { type: "integer", format: "int64", minimum: 0 },
  unsignedInt: { type: "integer", format: "int64", minimum: 0 },
  unsignedShort: { type: "integer", format: "int32", minimum: 0 },
  unsignedByte: { type: "integer", format: "int32", minimum: 0 },
  dateTime: { type: "string", format: "date-time" },
  date: { type: "string", format: "date" },
  time: { type: "string", format: "time" },
  duration: { type: "string", format: "duration" },
  gYear: { type: "string" },
  gYearMonth: { type: "string" },
  gMonth: { type: "string" },
  gMonthDay: { type: "string" },
  gDay: { type: "string" },
  base64Binary: { type: "string", format: "byte" },
  hexBinary: { type: "string", pattern: "^([0-9A-Fa-f]{2})*$" },
  anySimpleType: { type: "string" },
  anyType: {},
};

export const isMany = (particle) => particle?.maxOccurs === "unbounded" || particle?.maxOccurs > 1;

const NUMERIC_FACETS = { minInclusive: "minimum", maxInclusive: "maximum", minExclusive: "exclusiveMinimum", maxExclusive: "exclusiveMaximum" };

const splitWords = (text) =>
  String(text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);

const toCase = (name, mode) => {
  const text = String(name || "");
  if (mode === "camel") {
    const parts = splitWords(text);
    if (!parts.length) return text;
    const tidy = (p) => (p === p.toUpperCase() ? p.toLowerCase() : p);
    return parts.map((p, i) => (i === 0 ? tidy(p).charAt(0).toLowerCase() + tidy(p).slice(1) : tidy(p).charAt(0).toUpperCase() + tidy(p).slice(1))).join("");
  }
  if (mode === "snake") return splitWords(text).map((p) => p.toLowerCase()).join("_");
  return text;
};

/** XSD defaults are text; JSON wants the typed value. */
const coerceDefault = (value, type) => {
  if (type === "integer" || type === "number") return Number.isFinite(Number(value)) ? Number(value) : value;
  if (type === "boolean") return value === "true" || value === "1";
  return value;
};

const applyFacets = (schema, facets = {}, enumerations = null) => {
  const out = { ...schema };
  if (enumerations) out.enum = enumerations;
  if (facets.pattern) out.pattern = facets.pattern;
  if (facets.minLength !== undefined) out.minLength = parseInt(facets.minLength, 10);
  if (facets.maxLength !== undefined) out.maxLength = parseInt(facets.maxLength, 10);
  if (facets.length !== undefined) {
    out.minLength = parseInt(facets.length, 10);
    out.maxLength = parseInt(facets.length, 10);
  }
  Object.entries(NUMERIC_FACETS).forEach(([facet, keyword]) => {
    if (facets[facet] !== undefined) {
      const n = Number(facets[facet]);
      if (Number.isFinite(n)) {
        if (keyword.startsWith("exclusive")) {
          out[keyword === "exclusiveMinimum" ? "minimum" : "maximum"] = n;
          out[keyword] = true;
        } else out[keyword] = n;
      }
    }
  });
  return out;
};

/**
 * Build the schema set for a service.
 *
 * Returns `{ components, ambiguities, elementSchema, typeSchema,
 * messageShape }`. `components` is filled lazily as shapes are asked for,
 * so a 300-type schema only produces the types the operations reach —
 * call `includeAllTypes()` to force the rest in.
 */
export const createSchemaBuilder = (service, { propertyCase = "keep" } = {}) => {
  const registry = service?.schema || { elements: {}, types: {}, groups: {}, attributeGroups: {} };
  const components = {};
  const componentNames = new Map(); // typeKey → component name
  const inProgress = new Set();
  const ambiguities = [];
  const noted = new Set();

  const note = (kind, path, message, decision) => {
    const id = `${kind}|${path}|${message}`;
    if (noted.has(id)) return;
    noted.add(id);
    ambiguities.push({ kind, path, message, decision });
  };

  const prop = (name) => toCase(name, propertyCase);

  const nsToken = (ns) => {
    const tail = String(ns || "").replace(/[/#]+$/, "").split(/[/:#.]/).filter(Boolean).pop() || "Ns";
    return tail.replace(/[^A-Za-z0-9]/g, "").replace(/^./, (c) => c.toUpperCase());
  };

  const componentName = (key, local) => {
    if (componentNames.has(key)) return componentNames.get(key);
    const base = String(local || "Type").replace(/[^A-Za-z0-9_.-]/g, "_");
    let name = base;
    if (Object.prototype.hasOwnProperty.call(components, name) || [...componentNames.values()].includes(name)) {
      const ns = key.split("#")[0];
      name = `${nsToken(ns)}${base}`;
      let n = 2;
      while ([...componentNames.values()].includes(name)) name = `${nsToken(ns)}${base}${n++}`;
    }
    componentNames.set(key, name);
    return name;
  };

  const refTo = (name) => ({ $ref: `#/components/schemas/${name}` });

  const simpleTypeSchema = (type, path, depth) => {
    let base = {};
    if (type.list) {
      const item = type.list.inline ? simpleTypeSchema(type.list.inline, path, depth + 1) : typeSchema(type.list.itemType, path, depth + 1);
      note("list", path, "xs:list is a space-separated string in XML.", "Mapped to a JSON array of the item type.");
      return { type: "array", items: item, "x-xsd-list": true };
    }
    if (type.union) {
      const members = [...type.union.memberTypes.map((m) => typeSchema(m, path, depth + 1)), ...type.union.inline.map((s) => simpleTypeSchema(s, path, depth + 1))];
      note("union", path, `xs:union of ${members.length} member types.`, "Mapped to anyOf; a REST client sends whichever member applies.");
      return members.length ? { anyOf: members } : { type: "string" };
    }
    if (type.base) base = typeSchema(type.base, path, depth + 1);
    else if (type.inlineBase) base = simpleTypeSchema(type.inlineBase, path, depth + 1);
    else base = { type: "string" };
    if (base.$ref) {
      // A restriction of a named simple type: the facets need the base's shape.
      const target = components[base.$ref.split("/").pop()];
      base = target ? { ...target } : { type: "string" };
      delete base.enum;
    }
    const out = applyFacets(base, type.facets, type.enumerations);
    if (type.documentation) out.description = type.documentation;
    return out;
  };

  /** Schema for a type reference (built-in, named simple, or named complex → $ref). */
  const typeSchema = (qname, path = "", depth = 0) => {
    if (!qname || !qname.local) return {};
    if (qname.ns === XSD || (!qname.ns && BUILTIN[qname.local])) {
      const builtin = BUILTIN[qname.local];
      if (!builtin) {
        note("unknown-builtin", path, `xs:${qname.local} is not a known built-in type.`, "Mapped to string.");
        return { type: "string" };
      }
      if (qname.local === "anyType") note("any", path, "xs:anyType allows any content.", "Mapped to an unconstrained schema ({}).");
      return { ...builtin };
    }
    const key = keyOf(qname);
    const type = registry.types[key];
    if (!type) {
      note("unresolved-type", path, `Type ${qname.local} (${qname.ns || "no namespace"}) is not declared in any attached schema.`, "Mapped to an unconstrained object.");
      return { type: "object", "x-xsd-unresolved": qname.local };
    }
    if (type.kind === "simple") {
      if (type.enumerations) {
        const name = componentName(key, type.name);
        if (!components[name] && !inProgress.has(key)) {
          inProgress.add(key);
          components[name] = simpleTypeSchema(type, type.name, depth + 1);
          inProgress.delete(key);
        }
        return refTo(name);
      }
      return simpleTypeSchema(type, path || type.name, depth + 1);
    }
    const name = componentName(key, type.name);
    if (!components[name] && !inProgress.has(key)) {
      inProgress.add(key);
      components[name] = { type: "object" }; // placeholder so recursion sees a ref target
      components[name] = complexTypeSchema(type, type.name, depth + 1);
      inProgress.delete(key);
    }
    return refTo(name);
  };

  const attributeSchemas = (attributes, path, depth, into) => {
    attributes.forEach((attr) => {
      if (attr.groupRef) {
        const group = registry.attributeGroups[keyOf(attr.groupRef)];
        if (!group) {
          note("unresolved-type", path, `Attribute group ${attr.groupRef.local} is not declared.`, "Ignored.");
          return;
        }
        attributeSchemas(group.attributes, path, depth, into);
        if (group.anyAttribute) into.anyAttribute = true;
        return;
      }
      let schema = attr.inline ? simpleTypeSchema(attr.inline, `${path}/@${attr.name}`, depth + 1) : attr.type ? typeSchema(attr.type, `${path}/@${attr.name}`, depth + 1) : { type: "string" };
      if (attr.default !== undefined && !schema.$ref) schema = { ...schema, default: coerceDefault(attr.default, schema.type) };
      if (attr.fixed !== undefined) schema = { ...schema, enum: [attr.fixed] };
      if (attr.documentation) schema = { ...schema, description: attr.documentation };
      let name = prop(attr.name);
      if (into.properties[name]) name = `${name}Attribute`;
      into.properties[name] = schema;
      into.xml[name] = { name: attr.name, ns: attr.ns || "", attribute: true };
      if (attr.use === "required") into.required.push(name);
      note("attribute", `${path}/@${attr.name}`, `${attr.name} is an XML attribute.`, `Mapped to the property "${name}" next to the child elements.`);
    });
  };

  const elementSchemaOf = (decl, path, depth) => {
    if (decl.ref) {
      const target = registry.elements[keyOf(decl.ref)];
      if (!target) {
        note("unresolved-type", path, `Element ${decl.ref.local} is not declared in any attached schema.`, "Mapped to an unconstrained object.");
        return { type: "object", "x-xsd-unresolved": decl.ref.local };
      }
      return globalElementSchema(target, depth + 1);
    }
    let schema;
    if (decl.inline) schema = decl.inline.kind === "complex" ? complexTypeSchema(decl.inline, path, depth + 1) : simpleTypeSchema(decl.inline, path, depth + 1);
    else if (decl.type) schema = typeSchema(decl.type, path, depth + 1);
    else {
      note("any", path, `Element ${decl.name} declares no type (xs:anyType).`, "Mapped to an unconstrained schema ({}).");
      schema = {};
    }
    if (decl.documentation && !schema.$ref) schema = { ...schema, description: decl.documentation };
    if (decl.default !== undefined && !schema.$ref) schema = { ...schema, default: coerceDefault(decl.default, schema.type) };
    if (decl.nillable) {
      note("nillable", path, `${decl.name} is nillable${decl.minOccurs === 0 ? " and optional" : ""}: XML distinguishes xsi:nil from absent.`, `Mapped to nullable: true${decl.minOccurs === 0 ? "; absent stays absent" : ""}.`);
      schema = schema.$ref ? { allOf: [schema], nullable: true } : { ...schema, nullable: true };
    }
    return schema;
  };

  const globalElementSchema = (decl, depth) => {
    const key = typeKey(decl.ns, decl.name);
    if (decl.inline && decl.inline.kind === "complex") {
      const name = componentName(`element:${key}`, decl.name);
      if (!components[name] && !inProgress.has(`element:${key}`)) {
        inProgress.add(`element:${key}`);
        components[name] = { type: "object" };
        components[name] = complexTypeSchema(decl.inline, decl.name, depth + 1);
        if (decl.documentation && !components[name].description) components[name].description = decl.documentation;
        inProgress.delete(`element:${key}`);
      }
      return refTo(name);
    }
    return elementSchemaOf({ ...decl, ref: null }, decl.name, depth);
  };

  const addParticle = (particle, path, depth, into, optional) => {
    if (!particle) return;
    if (depth > 40) {
      note("depth", path, "The schema nests deeper than 40 levels.", "Deeper content is left unconstrained.");
      return;
    }
    switch (particle.kind) {
      case "sequence":
      case "all":
        if (isMany(particle)) note("repeated-group", path, `A repeating xs:${particle.kind} (maxOccurs ${particle.maxOccurs}) has no JSON equivalent.`, "Its children are mapped as if it occurred once; use an array of objects if repetition matters.");
        particle.items.forEach((item) => addParticle(item, path, depth + 1, into, optional || particle.minOccurs === 0));
        break;
      case "choice": {
        const names = particle.items.map((i) => (i.kind === "element" ? i.name : i.kind)).filter(Boolean);
        note("choice", path, `xs:choice between ${names.join(", ")}: exactly one is present in XML.`, "All branches are optional properties; a consumer sends one. Consider oneOf in the reviewed design.");
        into.choices = into.choices || [];
        into.choices.push(names.map(prop));
        particle.items.forEach((item) => addParticle(item, path, depth + 1, into, true));
        break;
      }
      case "element": {
        const name = prop(particle.name);
        const elementPath = `${path}/${particle.name}`;
        let schema = elementSchemaOf(particle, elementPath, depth);
        if (isMany(particle)) {
          schema = { type: "array", items: schema };
          if (particle.minOccurs > 0) schema.minItems = particle.minOccurs;
          if (particle.maxOccurs !== "unbounded") schema.maxItems = particle.maxOccurs;
        }
        if (into.properties[name]) note("duplicate-name", elementPath, `${particle.name} appears more than once in the same content model.`, "The later declaration wins.");
        into.properties[name] = schema;
        into.xml[name] = { name: particle.name, ns: particle.ns || "" };
        if (!optional && particle.minOccurs > 0 && !into.required.includes(name)) into.required.push(name);
        break;
      }
      case "any":
        note("any", path, `xs:any${particle.namespace && particle.namespace !== "##any" ? ` (${particle.namespace})` : ""} allows elements the schema does not name.`, "Mapped to additionalProperties: true.");
        into.additional = true;
        break;
      case "groupRef": {
        const group = registry.groups[keyOf(particle.ref)];
        if (!group) note("unresolved-type", path, `Group ${particle.ref.local} is not declared.`, "Ignored.");
        else addParticle(group, path, depth + 1, into, optional || particle.minOccurs === 0);
        break;
      }
      default:
        break;
    }
  };

  const complexTypeSchema = (type, path, depth) => {
    const into = { properties: {}, required: [], additional: false, anyAttribute: false, xml: {} };
    if (type.simpleContent) {
      const base = type.base ? typeSchema(type.base, path, depth + 1) : type.inlineBase ? simpleTypeSchema(type.inlineBase, path, depth + 1) : { type: "string" };
      let value = base;
      if (base.$ref) {
        const target = components[base.$ref.split("/").pop()];
        // A complex base with simple content: reuse its value shape.
        value = target?.properties?.value || { type: "string" };
      }
      if (type.simpleFacets) value = applyFacets(value, type.simpleFacets.facets, type.simpleFacets.enumerations);
      into.properties.value = value;
      into.xml.value = { name: "", ns: "", text: true };
      into.required.push("value");
      note("simple-content", path, `${type.name || path} carries text content plus attributes.`, "Mapped to an object with a \"value\" property for the text.");
    }
    addParticle(type.content, path, depth, into, false);
    attributeSchemas(type.attributes, path, depth, into);
    if (type.anyAttribute || into.anyAttribute) {
      note("any", path, "xs:anyAttribute allows attributes the schema does not name.", "Mapped to additionalProperties: true.");
      into.additional = true;
    }
    if (type.mixed) {
      note("mixed", path, `${type.name || path} is mixed content (text between child elements).`, "Text is not represented; child elements are mapped as properties.");
    }

    const own = { type: "object", properties: into.properties };
    if (into.required.length) own.required = into.required;
    if (into.additional) own.additionalProperties = true;
    if (into.choices) own["x-xsd-choice"] = into.choices;
    // How each property is spelled and namespaced in XML, for the envelope builder.
    if (Object.keys(into.xml).length) own["x-xml"] = into.xml;
    if (type.documentation) own.description = type.documentation;
    if (type.mixed) own["x-xsd-mixed"] = true;
    if (type.abstract) own["x-xsd-abstract"] = true;

    if (type.base && !type.simpleContent) {
      const base = typeSchema(type.base, path, depth + 1);
      if (type.derivation === "extension") {
        const extension = { ...own };
        if (!Object.keys(into.properties).length && !into.required.length) return base.$ref ? { allOf: [base], ...(own.description ? { description: own.description } : {}) } : base;
        return { allOf: [base, extension], ...(own.description ? { description: own.description } : {}) };
      }
      // A restriction restates the allowed content; when it states nothing, the base stands.
      if (!Object.keys(into.properties).length) return base;
    }
    return own;
  };

  /** The schema of a global element by QName — a $ref for object shapes. */
  const elementSchema = (qname) => {
    const decl = registry.elements[keyOf(qname)];
    if (!decl) {
      note("unresolved-type", qname?.local || "", `Element ${qname?.local || "(unnamed)"} is not declared in any attached schema.`, "Mapped to an unconstrained object.");
      return { type: "object", "x-xsd-unresolved": qname?.local || "" };
    }
    return globalElementSchema(decl, 0);
  };

  const resolveRef = (schema) => {
    let current = schema;
    const seen = new Set();
    while (current?.$ref && !seen.has(current.$ref)) {
      seen.add(current.$ref);
      current = components[current.$ref.split("/").pop()];
    }
    if (current?.allOf && !current.properties) {
      const merged = { type: "object", properties: {}, required: [] };
      merged["x-xml"] = {};
      current.allOf.forEach((part) => {
        const r = resolveRef(part);
        Object.assign(merged.properties, r?.properties || {});
        merged.required.push(...(r?.required || []));
        Object.assign(merged["x-xml"], r?.["x-xml"] || {});
      });
      return merged;
    }
    return current || {};
  };

  const isScalar = (schema) => {
    const r = resolveRef(schema);
    return r && r.type !== "object" && r.type !== "array" && !r.properties && !r.allOf && !r.anyOf && !r.oneOf;
  };

  const fieldsOf = (schema) => {
    const r = resolveRef(schema);
    const required = new Set(r?.required || []);
    const xml = r?.["x-xml"] || {};
    return Object.entries(r?.properties || {}).map(([name, s]) => ({
      name,
      xmlName: xml[name]?.name || name,
      schema: s,
      required: required.has(name),
      array: s?.type === "array",
      scalar: isScalar(s?.type === "array" ? s.items : s),
      attribute: Boolean(xml[name]?.attribute),
      description: s?.description || resolveRef(s)?.description || "",
    }));
  };

  /**
   * The shape of a message: the element it is carried in and its top-level
   * fields. Document/literal wrapped messages are unwrapped one level so the
   * design sees the parameters, not the wrapper. RPC messages are the parts.
   */
  const messageShape = (message, style, rpcName, rpcNamespace) => {
    if (!message) return { element: null, schema: null, fields: [], wrapper: "" };
    const parts = message.parts || [];
    if (style === "rpc") {
      const into = { type: "object", properties: {}, required: [], "x-xml": {} };
      parts.forEach((part) => {
        const s = part.element ? elementSchema(part.element) : part.type ? typeSchema(part.type, `${rpcName}/${part.name}`) : {};
        into.properties[prop(part.name)] = s;
        into.required.push(prop(part.name));
        into["x-xml"][prop(part.name)] = { name: part.name, ns: part.element ? part.element.ns : "" };
      });
      const name = componentName(`rpc:${rpcName}`, rpcName);
      components[name] = into;
      return { element: { ns: rpcNamespace, local: rpcName }, schema: refTo(name), fields: fieldsOf(into), wrapper: name, rpc: true };
    }
    if (parts.length === 1 && parts[0].element) {
      const schema = elementSchema(parts[0].element);
      return { element: parts[0].element, schema, fields: fieldsOf(schema), wrapper: schema.$ref ? schema.$ref.split("/").pop() : "" };
    }
    if (parts.length === 1 && parts[0].type) {
      const schema = typeSchema(parts[0].type, parts[0].name);
      return { element: { ns: rpcNamespace, local: parts[0].name }, schema, fields: fieldsOf(schema), wrapper: "" };
    }
    // Several parts (document/literal bare): each part is a field.
    const into = { type: "object", properties: {}, required: [], "x-xml": {} };
    parts.forEach((part) => {
      const s = part.element ? elementSchema(part.element) : part.type ? typeSchema(part.type, part.name) : {};
      into.properties[prop(part.name)] = s;
      into.required.push(prop(part.name));
      into["x-xml"][prop(part.name)] = { name: part.element ? part.element.local : part.name, ns: part.element ? part.element.ns : "" };
    });
    return { element: parts[0]?.element || null, schema: into, fields: fieldsOf(into), wrapper: "", multipart: parts.length > 1 };
  };

  const includeAllTypes = () => {
    Object.values(registry.types).forEach((type) => {
      if (type.kind === "complex" && type.name) typeSchema({ ns: type.ns, local: type.name }, type.name);
    });
    Object.values(registry.elements).forEach((decl) => decl.inline?.kind === "complex" && globalElementSchema(decl, 0));
  };

  return { components, ambiguities, elementSchema, typeSchema, messageShape, resolveRef, fieldsOf, isScalar, includeAllTypes, prop };
};
