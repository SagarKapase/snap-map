# Rules for working on Vizroute

This file is read at the start of every session. It is not background reading
— it is the set of rules to follow before, during and after every task.

The person directing this work is not reading every line of the diff. That is
the whole reason these rules exist: **nobody downstream will catch what I get
wrong.** If I say a thing is done, it ships.

---

## 0. The one rule

> "Don't work blindly. Set the rule for every prompt: you don't have to
> hallucinate the response."

Never state as fact anything not read from the code, run in a terminal, or
seen in a browser. When something is unverified, say so in the same sentence
as the claim. "The build passes" and "the build should pass" are different
sentences and only one of them is ever true without running it.

Everything below is a way of keeping that rule.

---

## 1. Before starting

**Read before writing.** Find what already exists — `src/utils/` is 10,000
lines and a third of what gets asked for is already in it. `convert.js`,
`audit.js`, `diff.js`, `importers.js`, `snippets.js`, `playground.js`,
`parsers.js` and `utils/soap/*` all do more than their names suggest.
Reimplementing something that exists is worse than not building it.

**Build what was asked.** Not a scaffold of it, not a plan for it, not a
version the user has to finish. When a WSDL is uploaded the user expects a
working REST API, not files to download and run. If the honest version is
much larger than it looked, say so in one or two sentences and then build the
whole thing anyway under stated assumptions — scaling the work down is the
user's call, not mine.

**Say what it will cost, once.** A real concern about the request belongs in
a sentence before the work, not as a reason to do less of it.

**Ask only when an answer changes what gets built.** Otherwise pick the
obvious option, say which, and carry on.

---

## 2. While building

These are the promises the product already makes in its own copy. Breaking
one silently makes the page a lie.

| Promise | Where it is stated | What it forbids |
| --- | --- | --- |
| Specifications are parsed in the browser | landing page, every tool page, FAQ | any upload, any telemetry, any content in a URL |
| No account for the API Map | landing, FAQ, `/tools` | a gate on anything that works today |
| An account is local unless a service is connected | `LocalNotice` | letting a browser-only account look like a cloud one |
| Nothing pasted is stored | every tool page | `localStorage` for content; it is for preferences only |

And the rules that keep the thing stable:

- **Never ship a control that cannot work.** No button for a provider that is
  switched off, no tab for a feature behind a flag, no "export" that produces
  something unusable. Hide it, or make it say plainly why it cannot run.
- **Say what it does not do.** The JSONPath page says it has no jq and no
  JMESPath. That sentence is worth more than a bad implementation of either.
- **The main bundle does not grow.** Every feature is a lazy chunk. Check
  `dist/assets/index-*.js` before and after; if it moved, say by how much.
- **Anything `scripts/seo.mjs` imports must run under Node.** No JSX, no
  `import.meta.glob`, no `lucide-react`, nothing from the bundler. This has
  broken twice — once for the blog, once for the tools registry.
- **A page meant to be found is prerendered with real copy.** A heading and a
  textarea is thin content. If 200 useful words cannot be written about it,
  it does not get a page.
- **Pure logic goes in `src/utils/`, not in a component.** It is the only
  part that can be tested, and every one of these tools has needed it.

---

## 3. Before saying it is done

Run this. Not some of it — all of it.

```bash
npm run verify     # lint, tests, build, and the SEO prerender
```

Then, for anything with a user interface, **open it in a browser and use it.**
Not the dev server's first paint — click the thing, at 1440 and at 390.

This is not belt and braces. Every one of these was invisible to the test
suite and found only by looking:

- three grids that never animated, because the markup said they were already visible
- a phone header where the wordmark, sign-in, CTA and menu button fought over 390px
- footer links 16px tall
- a sign-in that hung forever on a splash with a valid session in hand, because React re-runs effects on mount in development
- a redirect that lost the page the user asked for, because the router applies location changes as a transition
- a card whose title and description ran together, because spans do not take `margin-top`
- a search for "beautify" that found the beautifier zero times

**What "verified" means when reporting back:**

- ✅ *"lint clean, 355 tests pass, build clean, driven at 1440 and 390"* — all four were run.
- ❌ *"should work"* — then say that, and say what was not checked.

Report failures with their output. A skipped step is stated, not omitted.
Numbers are read off the terminal, never remembered.

---

## 4. Testing

- **Pure logic gets tests before the UI is written.** That order is what
  caught `$..*` matching nothing on a flat document, a filter that was handed
  the wrong root, a diff that threw on two empty documents, and a number
  scanner that read the `0` in `0x1F` and then complained about the rest.
- **Every parser gets hostile input**: empty, truncated, one character,
  deeply nested, a byte-order mark, something that is not the format at all.
  A parser that can throw will be handed exactly that.
- **Test the guarantee, not the implementation.** "A number too large for a
  double survives the round trip" is a test. "`formatJson` calls `write`" is
  not.
- **A test that fails for a real reason gets the code fixed, not the test
  loosened.** If the test was wrong, say which and why.

---

## 5. Editing this repo

Mechanical traps that have each cost real time here:

- **Use the Edit and Write tools for content.** Shell heredocs and `node -e`
  mangle backticks, `$`, apostrophes and newlines.
- **`String.replace` treats `$&`, `` $` ``, `$'` and `$1` as commands.** A
  replacement containing a dollar sign will corrupt the file. Pass a function:
  `s.replace(a, () => b)`.
- **Files are CRLF.** Normalise before matching, restore after writing.
- **`\u` inside a tool-call argument is decoded before it reaches the file.**
  Writing `﻿` puts the actual character in the source and trips
  `no-irregular-whitespace`. Avoid the escape or double the backslash.
- **A component file may only export components.** A helper beside a
  component breaks fast refresh and fails lint. It goes in `src/utils/`.
- **No `setState` in an effect body.** Compute it during render, or key the
  state to what it was derived from.
- **Comments say why, not what.** Match the density already in the file.

---

## 6. Committing

- Commit when asked. Never on the way past.
- The message says what changed and **why it was worth changing** — the
  reasoning, the trade-off, the thing found while checking. Someone reading
  it in a year should not have to reconstruct the argument.
- Anything found and fixed mid-task goes in the message. It is the only
  record of it.
- Never `--no-verify`, never skip signing.

---

## 7. Where things are

```
src/utils/           pure logic, all of it testable, some of it Node-importable
src/utils/tools/     one module per Explore Tool
src/tools/           registry.js + one folder per tool (meta.js is plain data)
src/components/      UI; the grouped areas are landing/ tools/ auth/ shell/
                     workspace/ contractgraph/ soap/ home/ import/ blog/ ai/ icons/
                     — the loose .jsx files at its root predate that and are
                     the workspace's own panels
src/pages/           one per route
scripts/seo.mjs      prerenders /, /blog, /tools and each tool; sitemap; robots
docs/                the plan for each feature, written before it was built
```

Plans live in `docs/` and are ticked off as they are built:
`explore-tools.md`, `soap-migration-workbench.md`, `contract-graph.md`,
`accounts.md`, `blog.md`, `brand.md`.

Read the relevant one before extending that feature. If a plan is wrong,
change the plan in the same commit as the code.
