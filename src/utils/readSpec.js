import yaml from "js-yaml";

/**
 * Read a pasted or uploaded document.
 *
 * Everything Vizroute accepts arrives as text and is either JSON or YAML, so
 * JSON is tried first — it is the common case and much faster — and YAML
 * catches the rest. Five files each carried their own copy of this, which is
 * four places for the two behaviours to drift apart.
 *
 * Returns `null` rather than throwing: a half-typed document is an ordinary
 * state for an editor to be in, not an error.
 */
export const parseSpecText = (text) => {
  const source = String(text ?? "");
  if (!source.trim()) return null;

  try {
    return JSON.parse(source);
  } catch {
    /* not JSON — YAML is a superset, so it gets the next go */
  }

  try {
    const value = yaml.load(source);
    return value && typeof value === "object" ? value : null;
  } catch {
    /* not YAML either; the caller decides what to tell the user */
  }

  return null;
};

/**
 * Read a document that may be a WSDL as well as JSON or YAML. A WSDL comes
 * back as the OpenAPI document the SOAP workbench proposes for it, so the
 * map and the graph treat a SOAP service like any other; `wsdl` on the
 * result says that happened. Returns `null` for anything unreadable, and
 * `{ error }` when the text is XML that could not be read as a WSDL — a
 * person who drops an XSD alone deserves to be told which file it needs.
 */
export const readSpecOrWsdl = async (text, name = "") => {
  const source = String(text ?? "");
  if (!source.trim()) return null;
  if (/^\s*(<\?xml|<!DOCTYPE|<!--|<[A-Za-z_:])/i.test(source.slice(0, 2000))) {
    const { wsdlToOpenApi } = await import("./soap/index.js");
    try {
      const { spec, service } = wsdlToOpenApi(source, { name });
      return { spec, wsdl: true, service, error: "" };
    } catch (e) {
      return { spec: null, wsdl: true, service: null, error: e.message };
    }
  }
  const spec = parseSpecText(source);
  return spec ? { spec, wsdl: false, service: null, error: "" } : null;
};
