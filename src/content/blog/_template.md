---
title: The title of the post
description: One or two sentences. This is what a search result and a link preview show, so write it for a stranger — 140 to 160 characters is the sweet spot.
date: 2026-01-31
author: Your name
tags: OpenAPI, How to
draft: true
---

# The title of the post

`draft: true` keeps a post off the site: it is not listed, has no page, and never reaches the sitemap. Delete that line to publish.

The file name is the URL. This file would be `/blog/_template`, which is why it stays a draft; name a real post something a person would type, like `mapping-a-microservice-estate.md`.

## Headings become the table of contents

A post with more than two `##` or `###` headings gets an "On this page" list, and each heading is linkable. Write them as things a reader is looking for, not as labels.

## What the writing can use

- **Bold**, *italic*, `inline code`, [links](/workspace) — an internal link stays inside the app, an external one opens in a new tab.
- Lists, ordered and not.
- Tables:

| Format | Read | Written |
|---|---|---|
| OpenAPI | 2.0, 3.0, 3.1 | 3.1 |
| Postman | v1, v2 | v2.1 |

- Fenced code with a language:

```json
{ "openapi": "3.1.0" }
```

> A blockquote, for a line worth pulling out.

## Before publishing

1. Write the `description` — it is the meta description and the card text.
2. Set `date` to `YYYY-MM-DD`; posts sort newest first.
3. Keep `tags` to two or three that you would actually filter by.
4. Remove `draft: true`.
5. Run `npm run build` — the post gets its own static page, and the sitemap picks it up.
