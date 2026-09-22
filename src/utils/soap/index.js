/**
 * The workbench engine in one call, for the places outside the workbench
 * that accept a WSDL: Contract Graph's file drop and the API Map's import.
 */
import { parseWsdl, looksLikeXml, detectXmlKind } from "./wsdl";
import { proposeDesign } from "./design";
import { buildOpenApi } from "./openapi";
import { parseXml } from "./xml";

export { parseWsdl, looksLikeXml, detectXmlKind, proposeDesign, buildOpenApi };

/**
 * WSDL text → `{ service, design, spec }` with the engine's defaults.
 * Throws the reader's plain-English error when the text is not a WSDL.
 */
export const wsdlToOpenApi = (text, { name = "", documents = {}, options = {} } = {}) => {
  const service = parseWsdl(text, { name, documents });
  const design = proposeDesign(service, options);
  const spec = buildOpenApi(design, service);
  return { service, design, spec };
};

/** "wsdl" | "xsd" | "other" for a file's text, without throwing. */
export const classifyXml = (text) => {
  if (!looksLikeXml(text)) return "other";
  try {
    const kind = detectXmlKind(parseXml(text));
    return kind === "wsdl11" || kind === "wsdl20" ? "wsdl" : kind === "xsd" ? "xsd" : "other";
  } catch {
    return "other";
  }
};
