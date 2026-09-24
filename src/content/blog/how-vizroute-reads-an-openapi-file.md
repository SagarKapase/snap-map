---
title: How Vizroute turns an OpenAPI file into a map
description: What the parser actually does with your specification — the tags it groups by, the servers it resolves, the $refs it follows, and the parts it will not guess at.
date: 2026-09-23
author: The Vizroute team
tags: OpenAPI, Under the hood
---

# How Vizroute turns an OpenAPI file into a map

A specification is a list. An API is a structure. Everything Vizroute draws comes out of the file you already wrote — no configuration, no annotations, nothing to add. This is what happens between dropping a file in and seeing the map.

## It works out what the file is first

There is no format picker. The parser looks at the document: an `openapi` or `swagger` key means OpenAPI (2.0, 3.0 and 3.1 are all read), an `info._postman_id` means a Postman collection, and a v1 Postman export is converted to v2 before anything else touches it. A pasted cURL command, a HAR recording from your browser's network tab, or a plain list of endpoints in JSON or YAML are all read too.

If the document is none of those, you are told so — rather than shown an empty map that looks like your file was boring.

## Servers become the base of every path

Paths in a specification are relative. To send a request later, the map needs the whole URL, so the servers block is resolved first — including templated ones:

```yaml
servers:
  - url: https://{env}.api.example.com/{version}
    variables:
      env:
        default: api
      version:
        default: v1
```

The defaults are filled in, giving `https://api.api.example.com/v1`. Swagger 2.0 files have no `servers`, so `host`, `basePath` and `schemes` are combined into the same shape. Every endpoint on the map carries the full URL it would call.

## Tags decide the shape of the map

The grouping you see is the grouping you wrote. Each operation's first `tags` entry becomes a folder; operations with no tag land in **Default**. A tag's description, if the file declares one, becomes the folder's description.

This is why a well-tagged specification produces a map that reads like a diagram of the service, and an untagged one produces a single large group. If your map looks flat, the specification is telling you something about itself.

## Parameters, bodies and auth are read, not inferred

For each operation the parser collects:

- **Parameters** declared on the path *and* on the operation, deduplicated, plus any `{placeholders}` found in the URL that were never declared — those show up so you can see they are missing.
- **The request body**, with its media type; `$ref` chains are followed so you get the real shape, and the example in the file is used when there is one. Form fields are read as a body rather than listed as parameters.
- **Responses**, with the schema and the example for each status, again with `$ref` resolved.
- **Security**, per operation, falling back to the document's top-level `security` — so the inspector can tell you an endpoint needs a bearer token before you send anything.

Nothing here is guessed. If the file does not say what a response looks like, the inspector says the file does not say.

## What you can do once it is drawn

The map is the starting point, not the product:

- Five layouts — tree, flowchart, radial, mindmap and force directed — because a 20-endpoint API and a 400-endpoint API do not read the same way.
- **Ctrl /** searches endpoints; **Ctrl K** opens any tool by name.
- The playground sends the request you are looking at, with variables and environments, and copies it as cURL.
- The audit lints the document, scores it, and flags security and quality problems.
- Diff two versions and see which changes would break the clients already calling them.
- Export the map as PNG or SVG, convert the spec to OpenAPI 3.1, Swagger 2.0, a Postman collection or a `.http` file, or send someone a link that opens the same view.

## The part that matters for your file

The specification is parsed in the browser tab you have open. It is not uploaded, and it does not go through a server on the way to the map — the only requests that leave are the ones you choose to send from the playground.

Drop a file in and see what your own API looks like.
