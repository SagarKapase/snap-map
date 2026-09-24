# The mark, and the icons made from it

The Vizroute mark is three rotated bars in the purple gradient. It is drawn
in two places, and they must agree:

| Where | File |
|---|---|
| In the app — landing nav, footer, workspace top bar, sidebar | `src/components/BrandMark.jsx` |
| In the browser — tab, bookmark, home screen, install prompt | `public/favicon.svg` |

## The icon set

Every raster beside `favicon.svg` is exported from it, so the tab and the
header never drift apart:

| File | Size | Asked for by |
|---|---|---|
| `favicon.svg` | any | modern browsers — one file, every size, stays sharp |
| `favicon-16.png`, `favicon-32.png` | 16, 32 | browsers that want a bitmap |
| `favicon.ico` | 16 + 32 + 48 in one file | `/favicon.ico` requested by default, and older clients |
| `apple-touch-icon.png` | 180 | iOS home screen |
| `icon-192.png`, `icon-512.png` | 192, 512 | `site.webmanifest`, Android and install prompts |

`site.webmanifest` names the app, sets the dark background and theme
colour, and lists those icons.

### Why the mark sits on a tile

The bars are thin. On a light tab strip a transparent mark at 16px reads as
three faint dashes, so the icon keeps the product's own dark tile
(`#0b0f18`, the app's background) behind it — the same thing you see in the
app header, and legible either side of a browser's light or dark chrome.

### Why the transform looks odd

The bars are 24 units long, rotated 38°, inside a 30 × 30 box — so they
reach *past* that box: the real bounds are 29.2 × 36.3, centred at
(16, 14.5). Scaling by the box clips the corners off. `favicon.svg` scales
by the rotated bounds instead, which is where `translate(9.96 12.02)
scale(1.378)` comes from.

## Re-exporting after a change

Edit `public/favicon.svg` (and `BrandMark.jsx`, so they match), then render
the PNGs at the sizes in the table and repack the `.ico`. Any rasteriser
does it — a headless browser screenshotting the SVG at each size, or
`rsvg-convert`, or a design tool. The `.ico` is a plain directory of PNG
entries: a 6-byte header, one 16-byte record per size, then the PNGs.

Nothing in the build depends on this; the icons are committed files, and
the site serves them as they are.

## The other logo

`public/logo.jpg` is a 1024 × 1024 illustration of a chameleon at a laptop.
It is not the mark, and it is no longer the favicon — it is still the
`og:image` behind every link preview.

Two things worth knowing about it:

- **It is a PNG with a `.jpg` name.** Social platforms sniff the bytes, so
  previews work, but the name and the type it implies are wrong.
- **It is square and 756 KB.** `twitter:card` is `summary_large_image`,
  which wants roughly 1200 × 630; a square image gets cropped.

A purpose-made 1200 × 630 card — the mark, the name, one line — would show
better on every platform that renders a link.
