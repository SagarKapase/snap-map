/**
 * Adapter scaffolds: a REST front that maps each request onto the SOAP
 * client call and back. ASP.NET Core minimal API (C#) and Spring Boot
 * (Java 17 records). A starting point, not a finished product: the SOAP
 * client itself comes from `dotnet-svcutil` / `wsimport`, and every place
 * the person has to wire it is an explicit TODO that throws until done.
 *
 * Each target returns `[{ path, content }]`, ready for the ZIP writer.
 */
import { splitWords } from "./design";
import { buildBridge, nodeBridgeFiles } from "./bridge";

const CS_RESERVED = new Set("abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while record var".split(" "));
const JAVA_RESERVED = new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null record var yield sealed permits".split(" "));

const words = (name) => splitWords(String(name || "").replace(/[^A-Za-z0-9_\s-]/g, " "));
export const pascal = (name, fallback = "Item") => {
  const joined = words(name).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  if (!joined) return fallback;
  return /^[0-9]/.test(joined) ? `N${joined}` : joined;
};
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const csIdent = (name, fallback = "value") => {
  const id = lowerFirst(pascal(name, fallback));
  return CS_RESERVED.has(id) ? `@${id}` : id;
};
const csType = (name) => {
  const id = pascal(name, "Item");
  return CS_RESERVED.has(id.toLowerCase()) || ["Object", "String", "Task", "Type", "Enum", "Array"].includes(id) ? `${id}Dto` : id;
};
const javaIdent = (name, fallback = "value") => {
  const id = lowerFirst(pascal(name, fallback));
  return JAVA_RESERVED.has(id) ? `${id}_` : id;
};
const javaType = (name) => {
  const id = pascal(name, "Item");
  return JAVA_RESERVED.has(id.toLowerCase()) || ["Object", "String", "List", "Map", "Integer", "Long", "Double", "Float", "Boolean", "Enum", "Record", "Class"].includes(id) ? `${id}Dto` : id;
};
const escapeString = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r?\n/g, " ");
const kebabPackage = (name) => words(name).join("").toLowerCase().replace(/[^a-z0-9]/g, "") || "adapter";

// ─── Schema → model types ────────────────────

/**
 * Walk the components; every object schema becomes a model type and every
 * anonymous nested object is hoisted into `${Parent}${Property}`. Enums
 * become enum types. Returns `[{ name, kind: "record"|"enum", fields, values, description }]`.
 */
const collectModels = (components, typeName) => {
  const models = [];
  const named = new Map();
  const resolve = (schema) => (schema?.$ref ? components[schema.$ref.split("/").pop()] : schema);
  const merged = (schema) => {
    if (!schema?.allOf) return schema;
    const out = { type: "object", properties: {}, required: [], description: schema.description };
    schema.allOf.forEach((part) => {
      const r = merged(resolve(part));
      Object.assign(out.properties, r?.properties || {});
      out.required.push(...(r?.required || []));
    });
    return out;
  };
  const ensure = (name, schema) => {
    const type = typeName(name);
    if (named.has(type)) return type;
    named.set(type, true);
    const s = merged(schema);
    if (s?.enum && s.type !== "object") {
      models.push({ name: type, kind: "enum", values: s.enum.map(String), description: s.description || "" });
      return type;
    }
    const required = new Set(s?.required || []);
    const fields = Object.entries(s?.properties || {}).map(([prop, ps]) => ({ json: prop, schema: ps, required: required.has(prop), type: typeOf(ps, `${type}${pascal(prop)}`) }));
    models.push({ name: type, kind: "record", fields, description: s?.description || "", additional: Boolean(s?.additionalProperties) });
    return type;
  };
  const typeOf = (schema, hoistName) => {
    if (!schema) return { kind: "any" };
    if (schema.$ref) {
      const name = schema.$ref.split("/").pop();
      const target = components[name];
      if (!target) return { kind: "any" };
      const r = merged(target);
      if (r?.enum && r.type !== "object") return { kind: "ref", name: ensure(name, target), nullable: Boolean(schema.nullable) };
      if (r?.type === "object" || r?.properties || target.allOf) return { kind: "ref", name: ensure(name, target), nullable: Boolean(schema.nullable) };
      return { ...typeOf(r, hoistName), nullable: Boolean(schema.nullable) || Boolean(r?.nullable) };
    }
    if (schema.allOf) {
      const only = schema.allOf.length === 1 ? schema.allOf[0] : null;
      if (only?.$ref) return { ...typeOf(only, hoistName), nullable: Boolean(schema.nullable) };
      return { kind: "ref", name: ensure(hoistName, schema), nullable: Boolean(schema.nullable) };
    }
    if (schema.anyOf || schema.oneOf) return { kind: "any", nullable: Boolean(schema.nullable) };
    if (schema.type === "array") return { kind: "array", items: typeOf(schema.items, `${hoistName}Item`), nullable: Boolean(schema.nullable) };
    if (schema.type === "object" || schema.properties) {
      if (!schema.properties || !Object.keys(schema.properties).length) return { kind: "map", nullable: Boolean(schema.nullable) };
      return { kind: "ref", name: ensure(hoistName, schema), nullable: Boolean(schema.nullable) };
    }
    if (schema.enum && schema.type !== "object") return { kind: "enum-inline", values: schema.enum.map(String), nullable: Boolean(schema.nullable) };
    return { kind: schema.type || "any", format: schema.format || "", nullable: Boolean(schema.nullable) };
  };
  Object.entries(components).forEach(([name, schema]) => {
    const r = merged(schema);
    if ((r?.type === "object" || r?.properties || (r?.enum && r.type !== "object")) && name !== "Problem") ensure(name, schema);
  });
  return { models, typeOf, ensure };
};

const csTypeName = (t) => {
  const base = (() => {
    switch (t.kind) {
      case "ref": return csType(t.name);
      case "array": return `List<${csTypeName({ ...t.items, nullable: false })}>`;
      case "map": return "Dictionary<string, object>";
      case "string": return t.format === "date-time" ? "DateTimeOffset" : t.format === "date" ? "DateOnly" : t.format === "byte" ? "byte[]" : t.format === "uuid" ? "Guid" : "string";
      case "integer": return t.format === "int64" ? "long" : "int";
      case "number": return t.format === "float" ? "float" : t.format === "double" ? "double" : "decimal";
      case "boolean": return "bool";
      case "enum-inline": return "string";
      default: return "object";
    }
  })();
  return t.nullable && !base.endsWith("?") ? `${base}?` : base;
};

const javaTypeName = (t) => {
  switch (t.kind) {
    case "ref": return javaType(t.name);
    case "array": return `List<${javaTypeName(t.items)}>`;
    case "map": return "Map<String, Object>";
    case "string": return t.format === "date-time" ? "OffsetDateTime" : t.format === "date" ? "LocalDate" : t.format === "byte" ? "byte[]" : t.format === "uuid" ? "UUID" : "String";
    case "integer": return t.format === "int64" ? "Long" : "Integer";
    case "number": return t.format === "float" ? "Float" : t.format === "double" ? "Double" : "BigDecimal";
    case "boolean": return "Boolean";
    case "enum-inline": return "String";
    default: return "Object";
  }
};

// ─── Per-operation mapping details ───────────

const bodyFieldsOf = (row) => {
  const moved = new Set([...row.pathParams.map((p) => p.field), ...row.queryParams.map((q) => q.field)]);
  return (row.requestBody?.fields || []).filter((f) => !moved.has(f.name));
};

const opDescription = (row) => `${row.method} ${row.path}  ←  SOAP ${row.soapOperation}${row.soap.action ? ` (${row.soap.action})` : ""}`;

// ─── C# / ASP.NET Core ───────────────────────

const csharpFiles = (design, service, openapi) => {
  const components = openapi?.components?.schemas || design.components;
  const { models, typeOf } = collectModels(components, csType);
  const ns = `${pascal(service?.name || design.serviceName || "Migrated", "Migrated")}.Adapter`;
  const files = [];

  // Request-body records for operations whose wrapper lost fields to the path/query.
  const bodyRecords = [];
  design.operations.forEach((row) => {
    const fields = bodyFieldsOf(row);
    if (!row.requestBody || !["POST", "PUT", "PATCH"].includes(row.method)) return;
    // The wrapper record can be the body only when none of its fields moved to the path or query.
    if (fields.length === row.shapes.input.fields.length && row.requestBody.wrapper) return;
    bodyRecords.push({ name: `${csType(row.soapOperation)}Body`, fields: fields.map((f) => ({ json: f.name, schema: f.schema, required: f.required, type: typeOf(f.schema, `${csType(row.soapOperation)}${pascal(f.name)}`) })), row });
  });

  const recordLine = (m) => {
    if (m.kind === "enum") {
      const values = m.values.map((v) => {
        const id = pascal(v, "Value");
        return `    [EnumMember(Value = "${escapeString(v)}")] ${id === v ? id : `${id} /* "${escapeString(v)}" */`},`;
      });
      return `${m.description ? `/// <summary>${escapeString(m.description)}</summary>\n` : ""}[JsonConverter(typeof(JsonStringEnumConverter))]\npublic enum ${m.name}\n{\n${values.join("\n")}\n}`;
    }
    const props = m.fields.map((f) => {
      const type = csTypeName({ ...f.type, nullable: f.type.nullable || !f.required });
      const name = csType(f.json) === csType(m.name) ? `${pascal(f.json)}Value` : pascal(f.json, "Value");
      const attr = name !== f.json ? `[JsonPropertyName("${escapeString(f.json)}")] ` : "";
      return `    ${attr}public ${f.required ? "required " : ""}${type} ${name} { get; init; }`;
    });
    return `${m.description ? `/// <summary>${escapeString(m.description)}</summary>\n` : ""}public sealed record ${m.name}\n{\n${props.join("\n") || "    // no fields"}\n}`;
  };

  files.push({
    path: "Contracts/Models.cs",
    content: `// Generated by the Vizroute SOAP Migration Workbench from ${service?.name || "the WSDL"}.
// JSON shapes of the REST design. Adjust names here and in the OpenAPI file together.
using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace ${ns}.Contracts;

${[...models.map(recordLine), ...bodyRecords.map((b) => recordLine({ ...b, kind: "record", description: `Request body for ${b.row.method} ${b.row.path}.` }))].join("\n\n")}
`,
  });

  // The runtime: a generic bridge driven by bridge.json. No SOAP client to generate.
  files.push({ path: "Soap/SoapBridge.cs", content: csharpBridgeSource(ns) });
  files.push({ path: "bridge.json", content: JSON.stringify(buildBridge(design, service), null, 2) });

  // Endpoints, one file per resource: gather the fields, call the bridge, answer.
  design.resources.forEach((resource) => {
    const rows = design.operations.filter((r) => resource.operations.includes(r.id) && r.status !== "skipped");
    if (!rows.length) return;
    const className = `${csType(resource.name)}Endpoints`;
    const handlers = rows.map((row) => {
      const bodyRecord = bodyRecords.find((b) => b.row === row);
      const hasBody = Boolean(row.requestBody) && !["GET", "DELETE"].includes(row.method);
      const args = [
        ...row.pathParams.map((p) => `string ${csIdent(p.name)}`),
        ...row.queryParams.map((q) => `[FromQuery] string? ${csIdent(q.name)}`),
        ...(hasBody ? ["[FromBody] JsonObject? body"] : []),
        "SoapBridge bridge",
        "CancellationToken ct",
      ];
      const lines = ["            var fields = new JsonObject();"];
      row.pathParams.forEach((p) => lines.push(`            fields["${escapeString(p.field || p.name)}"] = ${csIdent(p.name)};`));
      row.queryParams.forEach((q) => lines.push(`            if (${csIdent(q.name)} is not null) fields["${escapeString(q.field || q.name)}"] = ${csIdent(q.name)};`));
      if (hasBody) lines.push("            if (body is not null) foreach (var (key, value) in body) fields[key] = value?.DeepClone();");
      lines.push(`            var result = await bridge.CallAsync("${escapeString(row.soapOperation)}", fields, ct);`);
      lines.push("            return result.ToHttpResult();");
      const map = { GET: "MapGet", POST: "MapPost", PUT: "MapPut", PATCH: "MapPatch", DELETE: "MapDelete" }[row.method];
      const resultType = row.response.schema && row.response.status !== 204 && row.response.status !== 202 ? csTypeName({ ...typeOf(row.response.schema, "Result"), nullable: false }) : "";
      const produces = resultType && resultType !== "object" ? `.Produces<${resultType}>(${row.response.status})` : `.Produces(${row.response.status})`;
      const accepts = hasBody ? `\n        .Accepts<${bodyRecord ? bodyRecord.name : row.requestBody.wrapper ? csType(row.requestBody.wrapper) : "JsonObject"}>("application/json")` : "";
      return `        // ${opDescription(row)}${row.review ? "\n        // REVIEW: " + row.reviewReasons.map(escapeString).join(" ") : ""}
        app.${map}("${row.path}", async (${args.join(", ")}) =>
        {
${lines.join("\n")}
        })
        .WithName("${pascal(row.soapOperation)}")
        .WithTags("${escapeString(resource.tag)}")
        .WithSummary("${escapeString(row.summary)}")${accepts}
        ${produces}${row.errors.map((e) => `\n        .ProducesProblem(${e.status})`).join("")};`;
    });
    files.push({
      path: `Endpoints/${className}.cs`,
      content: `using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using ${ns}.Contracts;
using ${ns}.Soap;

namespace ${ns}.Endpoints;

/// <summary>${escapeString(resource.tag)}: ${rows.length} endpoint${rows.length === 1 ? "" : "s"} fronting the SOAP service.</summary>
public static class ${className}
{
    public static IEndpointRouteBuilder Map${csType(resource.name)}(this IEndpointRouteBuilder app)
    {
${handlers.join("\n\n")}

        return app;
    }
}
`,
    });
  });

  const mappedResources = design.resources.filter((r) => design.operations.some((o) => r.operations.includes(o.id) && o.status !== "skipped"));
  files.push({
    path: "Program.cs",
    content: `using System.Text.Json.Serialization;
using ${ns}.Endpoints;
using ${ns}.Soap;

var builder = WebApplication.CreateBuilder(args);
// The same address the generated OpenAPI and parity plan point at.
builder.WebHost.UseUrls(builder.Configuration["Urls"] ?? "http://localhost:8080");
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddHttpClient();
// bridge.json is the WSDL's mapping; --Soap:Url overrides the endpoint it declares.
builder.Services.AddSingleton(sp => SoapBridge.FromFile(
    Path.Combine(AppContext.BaseDirectory, "bridge.json"),
    sp.GetRequiredService<IHttpClientFactory>().CreateClient("soap"),
    builder.Configuration["Soap:Url"]));

var app = builder.Build();

app.Use(async (context, next) =>
{
    context.Response.Headers["Access-Control-Allow-Origin"] = "*";
    context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
    context.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    if (context.Request.Method == "OPTIONS") { context.Response.StatusCode = 204; return; }
    await next();
});

app.MapGet("/__routes", (SoapBridge bridge) => Results.Json(new { service = bridge.Service, soap = bridge.SoapUrl, routes = bridge.Routes }));
${mappedResources.map((r) => `app.Map${csType(r.name)}();`).join("\n")}

app.Run();
`,
  });
  files.push({
    path: `${pascal(service?.name || "Migrated", "Migrated")}.Adapter.csproj`,
    content: `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RollForward>Major</RollForward>
  </PropertyGroup>
  <ItemGroup>
    <None Update="bridge.json" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
</Project>
`,
  });
  files.push({ path: "README.md", content: readme(design, service, "dotnet") });
  return files;
};

/** The generic .NET runtime: JSON ↔ SOAP driven by bridge.json. */
const csharpBridgeSource = (ns) => `// Generated by the Vizroute SOAP Migration Workbench. Generic: reads bridge.json.
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;

namespace ${ns}.Soap;

public sealed record BridgeResult(int Status, JsonNode? Body, bool IsProblem)
{
    public IResult ToHttpResult() => Body is null
        ? Results.StatusCode(Status)
        : Results.Json(Body, contentType: IsProblem ? "application/problem+json" : "application/json", statusCode: Status);
}

/// <summary>
/// Turns a REST call into the SOAP call and the SOAP answer into JSON, for
/// every route in bridge.json: envelope built from the request schema in
/// sequence order, SOAPAction and content type per SOAP version, faults
/// mapped to the statuses the design chose, the result unwrapped and typed.
/// </summary>
public sealed class SoapBridge
{
    private static readonly XNamespace Soap11 = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace Soap12 = "http://www.w3.org/2003/05/soap-envelope";
    private static readonly XNamespace Xsi = "http://www.w3.org/2001/XMLSchema-instance";

    private readonly JsonObject _bridge;
    private readonly JsonObject _schemas;
    private readonly HttpClient _http;
    private readonly string? _soapUrlOverride;

    public SoapBridge(JsonObject bridge, HttpClient http, string? soapUrl = null)
    {
        _bridge = bridge;
        _schemas = bridge["schemas"] as JsonObject ?? new JsonObject();
        _http = http;
        _soapUrlOverride = string.IsNullOrWhiteSpace(soapUrl) ? null : soapUrl;
    }

    public static SoapBridge FromFile(string path, HttpClient http, string? soapUrl = null)
    {
        var node = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? throw new InvalidOperationException($"{path} is not a bridge file.");
        return new SoapBridge(node, http, soapUrl);
    }

    public string Service => _bridge["service"]?.GetValue<string>() ?? "";
    public string SoapUrl => _soapUrlOverride ?? _bridge["soap"]?["url"]?.GetValue<string>() ?? "";
    public IEnumerable<string> Routes => (_bridge["routes"] as JsonArray ?? new JsonArray()).Select(r => $"{r?["method"]} {r?["path"]}");

    private JsonObject? FindRoute(string operation) =>
        (_bridge["routes"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(r => r["operation"]?.GetValue<string>() == operation);

    private static BridgeResult Problem(int status, string title, string detail, string type = "about:blank") =>
        new(status, new JsonObject { ["type"] = type, ["title"] = title, ["status"] = status, ["detail"] = detail }, true);

    public async Task<BridgeResult> CallAsync(string operation, JsonObject fields, CancellationToken ct)
    {
        var route = FindRoute(operation);
        if (route is null) return Problem(500, "Adapter error", $"No route for operation {operation} in bridge.json.");
        var request = route["request"] as JsonObject ?? new JsonObject();
        var response = route["response"] as JsonObject ?? new JsonObject();
        var requestSchema = Resolve(SchemaRef(request)) ?? new JsonObject();

        foreach (var required in (requestSchema["required"] as JsonArray ?? new JsonArray()).Select(r => r?.GetValue<string>() ?? ""))
            if (required.Length > 0 && !fields.ContainsKey(required)) return Problem(400, "Bad Request", $"\\"{required}\\" is required.");

        var version = route["soapVersion"]?.GetValue<string>() ?? _bridge["soap"]?["version"]?.GetValue<string>() ?? "1.1";
        var env = version == "1.2" ? Soap12 : Soap11;
        var body = new XElement(env + "Body");
        var element = request["element"]?.GetValue<string>() ?? "";
        if (element.Length > 0)
        {
            var ns = request["namespace"]?.GetValue<string>() ?? "";
            var wrapper = new XElement(XNamespace.Get(ns) + element);
            AppendObject(wrapper, fields, requestSchema, ns);
            body.Add(wrapper);
        }
        var envelope = new XDocument(new XDeclaration("1.0", "utf-8", null),
            new XElement(env + "Envelope",
                new XAttribute(XNamespace.Xmlns + "soapenv", env.NamespaceName),
                new XAttribute(XNamespace.Xmlns + "xsi", Xsi.NamespaceName),
                new XElement(env + "Header"),
                body));

        var action = route["soapAction"]?.GetValue<string>() ?? "";
        var url = _soapUrlOverride ?? route["endpoint"]?.GetValue<string>() ?? SoapUrl;
        if (string.IsNullOrWhiteSpace(url)) return Problem(502, "No SOAP endpoint", "The WSDL declares no address; start with --Soap:Url <url>.");

        using var message = new HttpRequestMessage(HttpMethod.Post, url);
        var xml = envelope.Declaration + Environment.NewLine + envelope.ToString(SaveOptions.None);
        message.Content = new StringContent(xml, Encoding.UTF8);
        message.Content.Headers.ContentType = version == "1.2"
            ? System.Net.Http.Headers.MediaTypeHeaderValue.Parse($"application/soap+xml; charset=utf-8{(action.Length > 0 ? $"; action=\\"{action}\\"" : "")}")
            : System.Net.Http.Headers.MediaTypeHeaderValue.Parse("text/xml; charset=utf-8");
        if (version != "1.2") message.Headers.TryAddWithoutValidation("SOAPAction", $"\\"{action}\\"");

        string text;
        try
        {
            using var res = await _http.SendAsync(message, ct);
            text = await res.Content.ReadAsStringAsync(ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            return Problem(502, "SOAP service unreachable", $"{url}: {e.Message}");
        }

        XDocument doc;
        try { doc = XDocument.Parse(text); }
        catch (Exception) { return Problem(502, "Not a SOAP response", $"The service answered with {text[..Math.Min(text.Length, 200)]}"); }
        var bodyNode = doc.Root?.Elements().FirstOrDefault(e => e.Name.LocalName == "Body");
        if (bodyNode is null) return Problem(502, "Not a SOAP response", "No SOAP Body in the answer.");
        var first = bodyNode.Elements().FirstOrDefault();

        if (first is not null && first.Name.LocalName == "Fault") return MapFault(first, route);
        var oneWay = response["oneWay"]?.GetValue<bool>() ?? false;
        var status = response["status"]?.GetValue<int>() ?? 200;
        if (oneWay || (first is null && status == 202)) return new BridgeResult(202, null, false);
        if (first is null || status == 204) return new BridgeResult(204, null, false);

        var responseSchema = SchemaRef(response);
        var json = FromXml(first, responseSchema);
        var unwrap = response["unwrap"]?.GetValue<string>() ?? "";
        if (unwrap.Length > 0 && json is JsonObject obj && obj.ContainsKey(unwrap)) json = obj[unwrap]?.DeepClone();
        return new BridgeResult(status, json, false);
    }

    private BridgeResult MapFault(XElement fault, JsonObject route)
    {
        string? Local(XElement parent, string name) => parent.Elements().FirstOrDefault(e => e.Name.LocalName == name)?.Value;
        var codeNode = fault.Elements().FirstOrDefault(e => e.Name.LocalName == "Code");
        var code = Local(fault, "faultcode") ?? (codeNode is null ? "" : Local(codeNode, "Value") ?? "");
        var reasonNode = fault.Elements().FirstOrDefault(e => e.Name.LocalName == "Reason");
        var reason = Local(fault, "faultstring") ?? (reasonNode is null ? "SOAP fault" : Local(reasonNode, "Text") ?? "SOAP fault");
        var detail = fault.Elements().FirstOrDefault(e => e.Name.LocalName is "detail" or "Detail");
        var detailName = detail?.Elements().FirstOrDefault()?.Name.LocalName ?? "";
        var faults = (route["faults"] as JsonArray ?? new JsonArray()).OfType<JsonObject>().ToList();
        var known = faults.FirstOrDefault(f => f["name"]?.GetValue<string>() == detailName)
                 ?? faults.FirstOrDefault(f => reason.Contains(f["name"]?.GetValue<string>() ?? "\\u0000") || code.Contains(f["name"]?.GetValue<string>() ?? "\\u0000"));
        var clientFault = code.Trim().EndsWith("Client") || code.Trim().EndsWith("Sender");
        var status = known?["status"]?.GetValue<int>() ?? (clientFault ? 400 : 500);
        var title = known?["reason"]?.GetValue<string>() ?? (clientFault ? "Bad Request" : "Internal Server Error");
        var body = new JsonObject { ["type"] = $"urn:soap-fault:{(detailName.Length > 0 ? detailName : code.Length > 0 ? code : "unknown")}", ["title"] = title, ["status"] = status, ["detail"] = reason };
        if (detail is not null) body["soapDetail"] = FromXml(detail.Elements().FirstOrDefault() ?? detail, null);
        return new BridgeResult(status, body, true);
    }

    // ─── Schemas ──────────────────────────────

    private static JsonNode? SchemaRef(JsonObject part)
    {
        if (part["inline"] is JsonObject inline) return inline;
        var name = part["schema"]?.GetValue<string>() ?? "";
        return name.Length > 0 ? new JsonObject { ["$ref"] = $"#/components/schemas/{name}" } : null;
    }

    private JsonObject? Resolve(JsonNode? schema, HashSet<string>? seen = null)
    {
        seen ??= new HashSet<string>();
        var s = schema as JsonObject;
        while (s?["$ref"] is JsonNode refNode)
        {
            var name = refNode.GetValue<string>().Split('/').Last();
            if (!seen.Add(name)) return null;
            s = _schemas[name] as JsonObject;
        }
        if (s?["allOf"] is JsonArray parts && s["properties"] is null)
        {
            var merged = new JsonObject { ["type"] = "object", ["properties"] = new JsonObject(), ["required"] = new JsonArray(), ["x-xml"] = new JsonObject() };
            foreach (var part in parts)
            {
                var r = Resolve(part, new HashSet<string>(seen));
                if (r is null) continue;
                foreach (var (k, v) in r["properties"] as JsonObject ?? new JsonObject()) ((JsonObject)merged["properties"]!)[k] = v?.DeepClone();
                foreach (var v in r["required"] as JsonArray ?? new JsonArray()) ((JsonArray)merged["required"]!).Add(v?.DeepClone());
                foreach (var (k, v) in r["x-xml"] as JsonObject ?? new JsonObject()) ((JsonObject)merged["x-xml"]!)[k] = v?.DeepClone();
            }
            return merged;
        }
        return s;
    }

    private static string TypeOf(JsonObject? schema) => schema?["type"]?.GetValue<string>() ?? "";

    private JsonNode? Coerce(string text, JsonNode? schema)
    {
        var s = Resolve(schema);
        var type = TypeOf(s);
        if (type is "integer" or "number")
        {
            if (long.TryParse(text.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var l)) return JsonValue.Create(l);
            if (decimal.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return JsonValue.Create(d);
            return JsonValue.Create(text);
        }
        if (type == "boolean") return JsonValue.Create(text.Trim() is "true" or "1");
        return JsonValue.Create(text);
    }

    private static bool IsNil(XElement node) => node.Attributes().Any(a => a.Name.LocalName == "nil" && a.Value == "true");

    private static string Scalar(JsonValue value)
    {
        if (value.TryGetValue<string>(out var s)) return s;
        if (value.TryGetValue<bool>(out var b)) return b ? "true" : "false";
        return value.ToJsonString().Trim('"');
    }

    /// <summary>Append <paramref name="value"/> as child element(s) named <paramref name="name"/>.</summary>
    private void AppendValue(XElement parent, JsonNode? value, JsonNode? schema, string name, string ns)
    {
        var xname = XNamespace.Get(ns) + name;
        var s = Resolve(schema);
        if (value is null) { parent.Add(new XElement(xname, new XAttribute(Xsi + "nil", "true"))); return; }
        if (value is JsonArray array)
        {
            foreach (var item in array) AppendValue(parent, item, s?["items"], name, ns);
            return;
        }
        var element = new XElement(xname);
        if (value is JsonObject obj) AppendObject(element, obj, s, ns);
        else if (value is JsonValue v) element.Value = Scalar(v);
        parent.Add(element);
    }

    /// <summary>Fill <paramref name="element"/> from an object: attributes, text and children in schema order.</summary>
    private void AppendObject(XElement element, JsonObject obj, JsonObject? schema, string ns)
    {
        var props = schema?["properties"] as JsonObject ?? new JsonObject();
        var xml = schema?["x-xml"] as JsonObject ?? new JsonObject();
        var order = props.Select(p => p.Key).Concat(obj.Select(p => p.Key).Where(k => !props.ContainsKey(k))).ToList();
        foreach (var prop in order)
        {
            if (!obj.ContainsKey(prop)) continue;
            var info = xml[prop] as JsonObject;
            var xmlName = info?["name"]?.GetValue<string>() is { Length: > 0 } n ? n : prop;
            var childNs = info?["ns"]?.GetValue<string>() ?? "";
            var value = obj[prop];
            if (info?["attribute"]?.GetValue<bool>() == true) { if (value is JsonValue av) element.SetAttributeValue(xmlName, Scalar(av)); }
            else if (info?["text"]?.GetValue<bool>() == true) { if (value is JsonValue tv) element.Value = Scalar(tv); }
            else AppendValue(element, value, props[prop], xmlName, childNs);
        }
        _ = ns;
    }

    /// <summary>XML element → JSON, named and typed by the schema; unknown children kept as text.</summary>
    private JsonNode? FromXml(XElement node, JsonNode? schema)
    {
        if (IsNil(node)) return null;
        var s = Resolve(schema);
        var type = TypeOf(s);
        if (type == "array")
        {
            var arr = new JsonArray();
            foreach (var c in node.Elements()) arr.Add(FromXml(c, s?["items"]));
            if (arr.Count == 0 && !string.IsNullOrEmpty(node.Value) && !node.HasElements) arr.Add(Coerce(node.Value, s?["items"]));
            return arr;
        }
        var props = s?["properties"] as JsonObject;
        if (props is null || props.Count == 0)
        {
            if (!node.HasElements) return Coerce(node.Value, s);
            var generic = new JsonObject();
            foreach (var c in node.Elements())
            {
                var v = FromXml(c, null);
                if (generic[c.Name.LocalName] is JsonArray existing) existing.Add(v);
                else if (generic.ContainsKey(c.Name.LocalName)) generic[c.Name.LocalName] = new JsonArray(generic[c.Name.LocalName]?.DeepClone(), v);
                else generic[c.Name.LocalName] = v;
            }
            return generic;
        }
        var xml = s?["x-xml"] as JsonObject ?? new JsonObject();
        var outObj = new JsonObject();
        foreach (var (prop, ps) in props)
        {
            var info = xml[prop] as JsonObject;
            var xmlName = info?["name"]?.GetValue<string>() is { Length: > 0 } n ? n : prop;
            if (info?["attribute"]?.GetValue<bool>() == true)
            {
                var attr = node.Attributes().FirstOrDefault(a => a.Name.LocalName == xmlName);
                if (attr is not null) outObj[prop] = Coerce(attr.Value, ps);
                continue;
            }
            if (info?["text"]?.GetValue<bool>() == true) { outObj[prop] = Coerce(node.Value, ps); continue; }
            var matches = node.Elements().Where(c => c.Name.LocalName == xmlName).ToList();
            var target = Resolve(ps);
            if (TypeOf(target) == "array")
            {
                if (matches.Count == 0) continue;
                var arr = new JsonArray();
                foreach (var m in matches) arr.Add(FromXml(m, target?["items"]));
                outObj[prop] = arr;
                continue;
            }
            if (matches.Count > 0) outObj[prop] = FromXml(matches[0], ps);
        }
        return outObj;
    }
}
`;

// ─── Java / Spring Boot ──────────────────────

const javaFiles = (design, service, openapi) => {
  const components = openapi?.components?.schemas || design.components;
  const { models, typeOf } = collectModels(components, javaType);
  const pkg = `com.example.${kebabPackage(service?.name || design.serviceName || "adapter")}`;
  const dir = `src/main/java/${pkg.replace(/\./g, "/")}`;
  const files = [];
  const imports = `import java.math.BigDecimal;\nimport java.time.LocalDate;\nimport java.time.OffsetDateTime;\nimport java.util.List;\nimport java.util.Map;\nimport java.util.UUID;\nimport com.fasterxml.jackson.annotation.JsonProperty;`;

  const bodyRecords = [];
  design.operations.forEach((row) => {
    const fields = bodyFieldsOf(row);
    if (!row.requestBody || !["POST", "PUT", "PATCH"].includes(row.method)) return;
    if (fields.length === row.shapes.input.fields.length && row.requestBody.wrapper) return;
    bodyRecords.push({ name: `${javaType(row.soapOperation)}Body`, kind: "record", fields: fields.map((f) => ({ json: f.name, schema: f.schema, required: f.required, type: typeOf(f.schema, `${javaType(row.soapOperation)}${pascal(f.name)}`) })), row, description: `Request body for ${row.method} ${row.path}.` });
  });

  const modelFile = (m) => {
    if (m.kind === "enum") {
      const values = m.values.map((v) => {
        const id = pascal(v, "VALUE").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
        return `    @JsonProperty("${escapeString(v)}") ${id}`;
      });
      return `package ${pkg}.model;\n\nimport com.fasterxml.jackson.annotation.JsonProperty;\n\n${m.description ? `/** ${escapeString(m.description)} */\n` : ""}public enum ${m.name} {\n${values.join(",\n")}\n}\n`;
    }
    const fields = m.fields.map((f) => {
      const name = javaIdent(f.json);
      const annotation = name !== f.json ? `@JsonProperty("${escapeString(f.json)}") ` : "";
      return `    ${annotation}${javaTypeName(f.type)} ${name}`;
    });
    return `package ${pkg}.model;\n\n${imports}\n\n${m.description ? `/** ${escapeString(m.description)} */\n` : ""}public record ${m.name}(\n${fields.join(",\n") || "    // no fields"}\n) {}\n`;
  };
  [...models, ...bodyRecords].forEach((m) => files.push({ path: `${dir}/model/${m.name}.java`, content: modelFile(m) }));

  // The runtime: a generic bridge driven by bridge.json (in resources).
  files.push({ path: `${dir}/soap/SoapBridge.java`, content: javaBridgeSource(pkg) });
  files.push({ path: "src/main/resources/bridge.json", content: JSON.stringify(buildBridge(design, service), null, 2) });

  design.resources.forEach((resource) => {
    const rows = design.operations.filter((r) => resource.operations.includes(r.id) && r.status !== "skipped");
    if (!rows.length) return;
    const className = `${javaType(resource.name)}Controller`;
    const handlers = rows.map((row) => {
      const hasBody = Boolean(row.requestBody) && !["GET", "DELETE"].includes(row.method);
      const args = [
        ...row.pathParams.map((p) => `@PathVariable("${p.name}") String ${javaIdent(p.name)}`),
        ...row.queryParams.map((q) => `@RequestParam(name = "${q.name}", required = false) String ${javaIdent(q.name)}`),
        ...(hasBody ? ["@RequestBody(required = false) ObjectNode body"] : []),
      ];
      const lines = ["        ObjectNode fields = bridge.fields();"];
      row.pathParams.forEach((p) => lines.push(`        fields.put("${escapeString(p.field || p.name)}", ${javaIdent(p.name)});`));
      row.queryParams.forEach((q) => lines.push(`        if (${javaIdent(q.name)} != null) fields.put("${escapeString(q.field || q.name)}", ${javaIdent(q.name)});`));
      if (hasBody) lines.push("        if (body != null) fields.setAll(body);");
      lines.push(`        return bridge.call("${escapeString(row.soapOperation)}", fields).toResponse();`);
      const mapping = { GET: "GetMapping", POST: "PostMapping", PUT: "PutMapping", PATCH: "PatchMapping", DELETE: "DeleteMapping" }[row.method];
      return `    /** ${opDescription(row)}${row.review ? " — REVIEW: " + row.reviewReasons.map(escapeString).join(" ") : ""} */
    @${mapping}("${row.path}")
    public ResponseEntity<Object> ${javaIdent(row.soapOperation, "handle")}(${args.join(", ")}) {
${lines.join("\n")}
    }`;
    });
    files.push({
      path: `${dir}/api/${className}.java`,
      content: `package ${pkg}.api;

import ${pkg}.soap.SoapBridge;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** ${escapeString(resource.tag)}: ${rows.length} endpoint${rows.length === 1 ? "" : "s"} fronting the SOAP service. */
@RestController
public class ${className} {
    private final SoapBridge bridge;

    public ${className}(SoapBridge bridge) {
        this.bridge = bridge;
    }

${handlers.join("\n\n")}
}
`,
    });
  });

  files.push({
    path: `${dir}/AdapterApplication.java`,
    content: `package ${pkg};

import ${pkg}.soap.SoapBridge;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@SpringBootApplication
public class AdapterApplication {
    public static void main(String[] args) {
        SpringApplication.run(AdapterApplication.class, args);
    }

    /** bridge.json is the WSDL's mapping; SOAP_URL (soap.url) overrides the endpoint it declares. */
    @Bean
    public SoapBridge soapBridge(ObjectMapper mapper, @Value("\${soap.url:}") String soapUrl) throws IOException {
        try (InputStream in = AdapterApplication.class.getResourceAsStream("/bridge.json")) {
            if (in == null) throw new IllegalStateException("bridge.json is missing from the classpath");
            return new SoapBridge(mapper.readTree(in), mapper, soapUrl);
        }
    }

    @Bean
    public WebMvcConfigurer cors() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**").allowedOrigins("*").allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
            }
        };
    }

    @RestController
    static class RoutesController {
        private final SoapBridge bridge;

        RoutesController(SoapBridge bridge) {
            this.bridge = bridge;
        }

        @GetMapping("/__routes")
        public Map<String, Object> routes() {
            return Map.of("service", bridge.service(), "soap", bridge.soapUrl(), "routes", List.copyOf(bridge.routes()));
        }
    }
}
`,
  });
  files.push({
    path: "pom.xml",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
    <relativePath/>
  </parent>
  <groupId>${pkg}</groupId>
  <artifactId>adapter</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <properties><java.version>17</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin>
    </plugins>
  </build>
</project>
`,
  });
  files.push({ path: "src/main/resources/application.yml", content: `server:\n  port: 8080\nsoap:\n  url: \${SOAP_URL:}\nspring:\n  application:\n    name: ${kebabPackage(service?.name || "adapter")}-adapter\n` });
  files.push({ path: "README.md", content: readme(design, service, "spring") });
  return files;
};

/** The generic Spring runtime: JSON ↔ SOAP driven by bridge.json. Same design as the .NET and Node bridges. */
const javaBridgeSource = (pkg) => `package ${pkg}.soap;

// Generated by the Vizroute SOAP Migration Workbench. Generic: reads bridge.json.
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.StringReader;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.w3c.dom.Attr;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/**
 * Turns a REST call into the SOAP call and the SOAP answer into JSON, for
 * every route in bridge.json: envelope built from the request schema in
 * sequence order, SOAPAction and content type per SOAP version, faults
 * mapped to the statuses the design chose, the result unwrapped and typed.
 */
public class SoapBridge {
    private static final String SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/";
    private static final String SOAP12 = "http://www.w3.org/2003/05/soap-envelope";
    private static final String XSI = "http://www.w3.org/2001/XMLSchema-instance";

    public record Result(int status, JsonNode body, boolean problem) {
        public ResponseEntity<Object> toResponse() {
            if (body == null) return ResponseEntity.status(status).build();
            return ResponseEntity.status(status).contentType(problem ? MediaType.APPLICATION_PROBLEM_JSON : MediaType.APPLICATION_JSON).body(body);
        }
    }

    private final JsonNode bridge;
    private final JsonNode schemas;
    private final ObjectMapper mapper;
    private final String soapUrlOverride;
    private final HttpClient http = HttpClient.newHttpClient();

    public SoapBridge(JsonNode bridge, ObjectMapper mapper, String soapUrl) {
        this.bridge = bridge;
        this.schemas = bridge.path("schemas");
        this.mapper = mapper;
        this.soapUrlOverride = soapUrl == null || soapUrl.isBlank() ? null : soapUrl;
    }

    public ObjectNode fields() { return mapper.createObjectNode(); }
    public String service() { return bridge.path("service").asText(""); }
    public String soapUrl() { return soapUrlOverride != null ? soapUrlOverride : bridge.path("soap").path("url").asText(""); }
    public List<String> routes() {
        List<String> out = new ArrayList<>();
        for (JsonNode r : bridge.path("routes")) out.add(r.path("method").asText() + " " + r.path("path").asText());
        return out;
    }

    private JsonNode findRoute(String operation) {
        for (JsonNode r : bridge.path("routes")) if (operation.equals(r.path("operation").asText())) return r;
        return null;
    }

    private Result problem(int status, String title, String detail, String type) {
        ObjectNode body = mapper.createObjectNode();
        body.put("type", type); body.put("title", title); body.put("status", status); body.put("detail", detail);
        return new Result(status, body, true);
    }

    public Result call(String operation, ObjectNode fields) {
        JsonNode route = findRoute(operation);
        if (route == null) return problem(500, "Adapter error", "No route for operation " + operation + " in bridge.json.", "about:blank");
        JsonNode request = route.path("request");
        JsonNode response = route.path("response");
        JsonNode requestSchema = resolve(schemaRef(request), new HashSet<>());
        if (requestSchema != null) for (JsonNode required : requestSchema.path("required")) {
            if (!fields.has(required.asText())) return problem(400, "Bad Request", "\\"" + required.asText() + "\\" is required.", "about:blank");
        }

        String version = route.path("soapVersion").asText(bridge.path("soap").path("version").asText("1.1"));
        String envNs = "1.2".equals(version) ? SOAP12 : SOAP11;
        StringBuilder xml = new StringBuilder();
        xml.append("<?xml version=\\"1.0\\" encoding=\\"utf-8\\"?>\\n<soapenv:Envelope xmlns:soapenv=\\"").append(envNs).append("\\" xmlns:xsi=\\"").append(XSI).append("\\">\\n  <soapenv:Header/>\\n  <soapenv:Body>\\n");
        String element = request.path("element").asText("");
        if (!element.isEmpty()) appendValue(xml, fields, requestSchema, element, request.path("namespace").asText(""), "", 2);
        xml.append("\\n  </soapenv:Body>\\n</soapenv:Envelope>");

        String action = route.path("soapAction").asText("");
        String url = soapUrlOverride != null ? soapUrlOverride : route.path("endpoint").asText(soapUrl());
        if (url.isBlank()) return problem(502, "No SOAP endpoint", "The WSDL declares no address; set SOAP_URL.", "about:blank");
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).POST(HttpRequest.BodyPublishers.ofString(xml.toString(), StandardCharsets.UTF_8));
        if ("1.2".equals(version)) builder.header("Content-Type", "application/soap+xml; charset=utf-8" + (action.isEmpty() ? "" : "; action=\\"" + action + "\\""));
        else builder.header("Content-Type", "text/xml; charset=utf-8").header("SOAPAction", "\\"" + action + "\\"");

        String text;
        try {
            HttpResponse<String> res = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            text = res.body();
        } catch (Exception e) {
            return problem(502, "SOAP service unreachable", url + ": " + e.getMessage(), "about:blank");
        }

        Document doc;
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            doc = factory.newDocumentBuilder().parse(new InputSource(new StringReader(text)));
        } catch (Exception e) {
            return problem(502, "Not a SOAP response", "The service answered with " + text.substring(0, Math.min(text.length(), 200)), "about:blank");
        }
        Element bodyNode = child(doc.getDocumentElement(), "Body");
        if (bodyNode == null) return problem(502, "Not a SOAP response", "No SOAP Body in the answer.", "about:blank");
        Element first = firstChild(bodyNode);

        if (first != null && "Fault".equals(first.getLocalName())) return mapFault(first, route);
        boolean oneWay = response.path("oneWay").asBoolean(false);
        int status = response.path("status").asInt(200);
        if (oneWay || (first == null && status == 202)) return new Result(202, null, false);
        if (first == null || status == 204) return new Result(204, null, false);

        JsonNode json = fromXml(first, schemaRef(response));
        String unwrap = response.path("unwrap").asText("");
        if (!unwrap.isEmpty() && json != null && json.has(unwrap)) json = json.get(unwrap);
        return new Result(status, json, false);
    }

    private Result mapFault(Element fault, JsonNode route) {
        Element codeNode = child(fault, "Code");
        String code = text(child(fault, "faultcode"));
        if (code == null) code = codeNode == null ? "" : orEmpty(text(child(codeNode, "Value")));
        Element reasonNode = child(fault, "Reason");
        String reason = text(child(fault, "faultstring"));
        if (reason == null) reason = reasonNode == null ? "SOAP fault" : orEmpty(text(child(reasonNode, "Text")));
        Element detail = child(fault, "detail");
        if (detail == null) detail = child(fault, "Detail");
        Element detailFirst = detail == null ? null : firstChild(detail);
        String detailName = detailFirst == null ? "" : detailFirst.getLocalName();
        JsonNode known = null;
        for (JsonNode f : route.path("faults")) if (f.path("name").asText().equals(detailName)) { known = f; break; }
        if (known == null) for (JsonNode f : route.path("faults")) {
            String n = f.path("name").asText();
            if (!n.isEmpty() && (reason.contains(n) || code.contains(n))) { known = f; break; }
        }
        boolean clientFault = code.trim().endsWith("Client") || code.trim().endsWith("Sender");
        int status = known != null ? known.path("status").asInt(500) : clientFault ? 400 : 500;
        String title = known != null ? known.path("reason").asText("Error") : clientFault ? "Bad Request" : "Internal Server Error";
        ObjectNode body = mapper.createObjectNode();
        body.put("type", "urn:soap-fault:" + (!detailName.isEmpty() ? detailName : !code.isEmpty() ? code : "unknown"));
        body.put("title", title); body.put("status", status); body.put("detail", reason);
        if (detail != null) body.set("soapDetail", fromXml(detailFirst != null ? detailFirst : detail, null));
        return new Result(status, body, true);
    }

    // ─── Schemas ──────────────────────────────

    private JsonNode schemaRef(JsonNode part) {
        if (part.path("inline").isObject()) return part.path("inline");
        String name = part.path("schema").asText("");
        return name.isEmpty() ? null : mapper.createObjectNode().put("$ref", "#/components/schemas/" + name);
    }

    private JsonNode resolve(JsonNode schema, Set<String> seen) {
        JsonNode s = schema;
        while (s != null && s.has("$ref")) {
            String ref = s.get("$ref").asText();
            String name = ref.substring(ref.lastIndexOf('/') + 1);
            if (!seen.add(name)) return null;
            s = schemas.get(name);
        }
        if (s != null && s.has("allOf") && !s.has("properties")) {
            ObjectNode merged = mapper.createObjectNode();
            merged.put("type", "object");
            ObjectNode props = merged.putObject("properties");
            ArrayNode required = merged.putArray("required");
            ObjectNode xml = merged.putObject("x-xml");
            for (JsonNode part : s.get("allOf")) {
                JsonNode r = resolve(part, new HashSet<>(seen));
                if (r == null) continue;
                props.setAll((ObjectNode) r.path("properties").deepCopy());
                required.addAll((ArrayNode) r.path("required").deepCopy());
                if (r.path("x-xml").isObject()) xml.setAll((ObjectNode) r.path("x-xml").deepCopy());
            }
            return merged;
        }
        return s;
    }

    private JsonNode coerce(String text, JsonNode schema) {
        JsonNode s = resolve(schema, new HashSet<>());
        String type = s == null ? "" : s.path("type").asText("");
        String t = text == null ? "" : text.trim();
        if ("integer".equals(type) || "number".equals(type)) {
            try { return mapper.getNodeFactory().numberNode(Long.parseLong(t)); } catch (NumberFormatException ignored) { /* not a whole number */ }
            try { return mapper.getNodeFactory().numberNode(new BigDecimal(t)); } catch (NumberFormatException ignored) { /* not a number at all */ }
            return mapper.getNodeFactory().textNode(text);
        }
        if ("boolean".equals(type)) return mapper.getNodeFactory().booleanNode("true".equals(t) || "1".equals(t));
        return mapper.getNodeFactory().textNode(text == null ? "" : text);
    }

    private static String escape(String v) {
        return v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\\"", "&quot;");
    }

    private static String scalar(JsonNode v) {
        return v.isTextual() ? v.asText() : v.isBoolean() ? (v.asBoolean() ? "true" : "false") : v.asText();
    }

    /** Append value as element(s) named name, in the given namespace, following schema order for objects. */
    private void appendValue(StringBuilder out, JsonNode value, JsonNode schema, String name, String ns, String parentNs, int indent) {
        JsonNode s = resolve(schema, new HashSet<>());
        String pad = "  ".repeat(indent);
        String nsDecl = ns.equals(parentNs) ? "" : " xmlns=\\"" + escape(ns) + "\\"";
        if (value == null || value.isNull()) { out.append(pad).append("<").append(name).append(nsDecl).append(" xsi:nil=\\"true\\"/>"); return; }
        if (value.isArray()) {
            boolean firstItem = true;
            for (JsonNode item : value) {
                if (!firstItem) out.append("\\n");
                firstItem = false;
                appendValue(out, item, s == null ? null : s.path("items"), name, ns, parentNs, indent);
            }
            return;
        }
        if (value.isObject()) {
            JsonNode props = s == null ? mapper.createObjectNode() : s.path("properties");
            JsonNode xml = s == null ? mapper.createObjectNode() : s.path("x-xml");
            StringBuilder attrs = new StringBuilder();
            String text = null;
            List<String> children = new ArrayList<>();
            List<String> order = new ArrayList<>();
            for (Iterator<String> it = props.fieldNames(); it.hasNext();) order.add(it.next());
            for (Iterator<String> it = value.fieldNames(); it.hasNext();) { String k = it.next(); if (!props.has(k)) order.add(k); }
            for (String prop : order) {
                if (!value.has(prop)) continue;
                JsonNode info = xml.path(prop);
                String xmlName = info.path("name").asText("").isEmpty() ? prop : info.path("name").asText();
                if (info.path("attribute").asBoolean(false)) attrs.append(" ").append(xmlName).append("=\\"").append(escape(scalar(value.get(prop)))).append("\\"");
                else if (info.path("text").asBoolean(false)) text = scalar(value.get(prop));
                else {
                    StringBuilder childOut = new StringBuilder();
                    appendValue(childOut, value.get(prop), props.path(prop), xmlName, info.path("ns").asText(""), ns, indent + 1);
                    children.add(childOut.toString());
                }
            }
            if (text != null && children.isEmpty()) { out.append(pad).append("<").append(name).append(nsDecl).append(attrs).append(">").append(escape(text)).append("</").append(name).append(">"); return; }
            if (children.isEmpty()) { out.append(pad).append("<").append(name).append(nsDecl).append(attrs).append("/>"); return; }
            out.append(pad).append("<").append(name).append(nsDecl).append(attrs).append(">\\n").append(String.join("\\n", children)).append("\\n").append(pad).append("</").append(name).append(">");
            return;
        }
        out.append(pad).append("<").append(name).append(nsDecl).append(">").append(escape(scalar(value))).append("</").append(name).append(">");
    }

    // ─── XML → JSON ───────────────────────────

    private static Element child(Element parent, String localName) {
        if (parent == null) return null;
        NodeList list = parent.getChildNodes();
        for (int i = 0; i < list.getLength(); i++) {
            Node n = list.item(i);
            if (n instanceof Element e && localName.equals(e.getLocalName() != null ? e.getLocalName() : e.getTagName())) return e;
        }
        return null;
    }

    private static List<Element> children(Element parent) {
        List<Element> out = new ArrayList<>();
        NodeList list = parent.getChildNodes();
        for (int i = 0; i < list.getLength(); i++) if (list.item(i) instanceof Element e) out.add(e);
        return out;
    }

    private static Element firstChild(Element parent) {
        List<Element> all = children(parent);
        return all.isEmpty() ? null : all.get(0);
    }

    private static String localName(Element e) { return e.getLocalName() != null ? e.getLocalName() : e.getTagName(); }
    private static String text(Element e) { return e == null ? null : e.getTextContent(); }
    private static String orEmpty(String s) { return s == null ? "" : s; }

    private static boolean isNil(Element node) {
        NamedNodeMap attrs = node.getAttributes();
        for (int i = 0; i < attrs.getLength(); i++) {
            Attr a = (Attr) attrs.item(i);
            String local = a.getLocalName() != null ? a.getLocalName() : a.getName();
            if ("nil".equals(local) && "true".equals(a.getValue())) return true;
        }
        return false;
    }

    private JsonNode fromXml(Element node, JsonNode schema) {
        if (isNil(node)) return mapper.nullNode();
        JsonNode s = resolve(schema, new HashSet<>());
        String type = s == null ? "" : s.path("type").asText("");
        List<Element> kids = children(node);
        if ("array".equals(type)) {
            ArrayNode arr = mapper.createArrayNode();
            for (Element c : kids) arr.add(fromXml(c, s.path("items")));
            if (kids.isEmpty() && !node.getTextContent().isEmpty()) arr.add(coerce(node.getTextContent(), s.path("items")));
            return arr;
        }
        JsonNode props = s == null ? null : s.path("properties");
        if (props == null || !props.isObject() || props.isEmpty()) {
            if (kids.isEmpty()) return coerce(node.getTextContent(), s);
            ObjectNode generic = mapper.createObjectNode();
            for (Element c : kids) {
                JsonNode v = fromXml(c, null);
                String n = localName(c);
                if (generic.has(n)) {
                    if (generic.get(n).isArray()) ((ArrayNode) generic.get(n)).add(v);
                    else { ArrayNode arr = mapper.createArrayNode(); arr.add(generic.get(n)); arr.add(v); generic.set(n, arr); }
                } else generic.set(n, v);
            }
            return generic;
        }
        JsonNode xml = s.path("x-xml");
        ObjectNode out = mapper.createObjectNode();
        for (Iterator<Map.Entry<String, JsonNode>> it = props.fields(); it.hasNext();) {
            Map.Entry<String, JsonNode> entry = it.next();
            String prop = entry.getKey();
            JsonNode ps = entry.getValue();
            JsonNode info = xml.path(prop);
            String xmlName = info.path("name").asText("").isEmpty() ? prop : info.path("name").asText();
            if (info.path("attribute").asBoolean(false)) {
                NamedNodeMap attrs = node.getAttributes();
                for (int i = 0; i < attrs.getLength(); i++) {
                    Attr a = (Attr) attrs.item(i);
                    String local = a.getLocalName() != null ? a.getLocalName() : a.getName();
                    if (xmlName.equals(local)) { out.set(prop, coerce(a.getValue(), ps)); break; }
                }
                continue;
            }
            if (info.path("text").asBoolean(false)) { out.set(prop, coerce(node.getTextContent(), ps)); continue; }
            List<Element> matches = new ArrayList<>();
            for (Element c : kids) if (xmlName.equals(localName(c))) matches.add(c);
            JsonNode target = resolve(ps, new HashSet<>());
            if (target != null && "array".equals(target.path("type").asText(""))) {
                if (matches.isEmpty()) continue;
                ArrayNode arr = mapper.createArrayNode();
                for (Element m : matches) arr.add(fromXml(m, target.path("items")));
                out.set(prop, arr);
                continue;
            }
            if (!matches.isEmpty()) out.set(prop, fromXml(matches.get(0), ps));
        }
        return out;
    }

}
`;


const readme = (design, service, target) => `# ${service?.name || design.serviceName} — REST adapter (${target === "dotnet" ? "ASP.NET Core minimal API" : target === "spring" ? "Spring Boot" : "Node"})

Generated by the Vizroute SOAP Migration Workbench. The routes, request/response shapes and fault mapping follow the reviewed design, and every route **works as generated**: a generic bridge turns each REST call into the SOAP call and the SOAP answer into JSON.

## Routes

| REST | SOAP operation | Status |
|---|---|---|
${design.operations.filter((r) => r.status !== "skipped").map((r) => `| \`${r.method} ${r.path}\` | ${r.soapOperation} | ${r.status}${r.review ? " · review" : ""} |`).join("\n")}

## Run

${target === "dotnet"
    ? `\`\`\`sh
dotnet run                                  # http://localhost:8080 → the SOAP endpoint in bridge.json
dotnet run -- --Soap:Url https://other-host/Service.svc --Urls http://localhost:9090
curl http://localhost:8080/__routes         # what is served
\`\`\`

Every route answers as generated: \`Soap/SoapBridge.cs\` builds the envelope from the request, posts it, and maps the reply (and faults) to JSON. \`bridge.json\` is the mapping from the WSDL; edit it if a name or a status should differ. \`Contracts/Models.cs\` holds the typed shapes for documentation and clients. .NET 8 SDK or newer.`
    : `\`\`\`sh
mvn spring-boot:run                          # http://localhost:8080 → the SOAP endpoint in bridge.json
SOAP_URL=https://other-host/Service.svc mvn spring-boot:run
curl http://localhost:8080/__routes          # what is served
\`\`\`

Every route answers as generated: \`soap/SoapBridge.java\` builds the envelope from the request, posts it, and maps the reply (and faults) to JSON. \`bridge.json\` (in \`src/main/resources\`) is the mapping from the WSDL; edit it if a name or a status should differ. Java 17, Spring Boot 3, Jackson — no SOAP client library.

> Generated to the same design as the .NET and Node adapters, which are compiled and run in the workbench's own tests; this Java build was not compiled in the environment that produced it.`}

## Faults

${design.operations.flatMap((r) => r.errors.filter((e) => e.faults.length).map((e) => `- ${e.faults.join(", ")} → ${e.status} ${e.reason}`)).filter((line, i, all) => all.indexOf(line) === i).join("\n") || "- No faults are declared; unmapped errors answer 500 (or 400 when the fault code says Client/Sender)."}
`;

export const ADAPTER_TARGETS = [
  { id: "dotnet", label: "ASP.NET Core", hint: "Minimal API, .NET 8, C# records", language: "csharp" },
  { id: "spring", label: "Spring Boot", hint: "Spring Boot 3, Java 17 records", language: "java" },
];

/** The scaffold for one target: `[{ path, content }]`. */
export const scaffoldAdapter = (design, service, target = "dotnet", openapi = null) => {
  if (!design || !Array.isArray(design.operations)) throw new Error("A design is needed before an adapter can be scaffolded.");
  if (!design.operations.length) throw new Error("The design has no operations, so there is nothing to scaffold.");
  if (target === "node") return nodeBridgeFiles(buildBridge(design, service));
  if (target === "spring") return javaFiles(design, service, openapi);
  if (target === "dotnet") return csharpFiles(design, service, openapi);
  throw new Error(`Unknown adapter target "${target}".`);
};
