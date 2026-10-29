# Brand

The logo kit is the source of the brand. The kit files are in
`apps/web/public/brand`. The React mark is in `apps/web/src/ui/BrandMark.tsx`.
The header lockup is in `apps/web/src/ui/BrandLockup.tsx`.

## BR-01. Colors

| Name | Hex | Use |
|---|---|---|
| Ink | `#0E1116` | Dark background |
| Paper | `#F2F4F8` | Wordmark on a dark background |
| Key Amber | `#F5B83D` | Key ring, shaft and teeth on a dark background |
| Dark Amber | `#D9961A` | The same key parts on a light background |
| Link Cyan | `#3DD6C6` | Hub, links and nodes on a dark background |
| High-contrast Cyan | `#0A9396` | The same link parts on a light background |
| Slate | `#8B93A1` | Tagline text |

Amber is always the key. Cyan is always the AI link.

## BR-02. State colors

Use amber for a saved key, a selected key and a warning.
Use cyan for a live connection, a model and a stream.

## BR-03. Fonts

Use Inter for text. Use JetBrains Mono for code, labels and data.

## BR-04. Bundled assets

The app loads the brand files from `apps/web/public/brand`. The app MUST NOT
load a font, an icon or a script from a public host.

## BR-05. The header lockup

The header shows the horizontal lockup from the kit. The lockup holds the mark
and the outlined wordmark. The kit draws a tagline under the wordmark. The header
has no room for the tagline, so the viewBox crops to the mark and the wordmark.
Use `BrandMark` for every other place.

## BR-06. Files

| File | Use | Size |
|---|---|---|
| `mark.svg` | The standalone mark | 64 × 64 |
| `horizontal-dark.svg` | The mark and the wordmark on ink | 280 × 64 |
| `horizontal-light.svg` | The mark and the wordmark on paper | 280 × 64 |
| `stacked-dark.svg` | The centred mark and the wordmark on ink | 200 × 160 |
| `stacked-light.svg` | The centred mark and the wordmark on paper | 200 × 160 |
| `icon.svg` | The app icon | 1024 × 1024 |
| `favicon.svg` | The browser icon | 32 × 32 |

The app links `favicon.svg` and `manifest.webmanifest` in `apps/web/index.html`.
The manifest uses `icon.svg` for the installed app icon.

## BR-07. Geometry

The kit draws every part on a 64 × 64 grid.

- Ring: centre `(22, 32)`, radius `12`, stroke `4`.
- Hub dot: `(22, 32)`, radius `2.5`.
- Links: three lines at 0°, 120° and 240°. Link stroke `1.5`.
- Nodes: radius `1.8` at the end of each link.
- Shaft: `(34, 32)` to `(58, 32)`, stroke `3`.
- Teeth: `x=48`, length `7` and `x=54`, length `10`.
- Wordmark: outlined paths at `x=72`, cap height `20`, stroke `3`.

Change the geometry in the kit first. Then change `BrandMark.tsx`,
`BrandLockup.tsx` and the SVG files.

## BR-08. Clear space and minimum size

Keep a margin of `16px` around a horizontal or a stacked layout.
Do not draw the full mark smaller than `16px` high.
Use `favicon.svg` at `16px` and at `32px`.

## BR-09. Prohibited rules

1. Do NOT stretch, tilt or rotate the mark.
2. Do NOT add a robot, a brain or a sparkle.
3. Do NOT use a gradient, a drop shadow, an outer glow or a 3D effect.
4. Do NOT swap amber and cyan.
5. Do NOT put the mark on a busy photo.
