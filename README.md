# brandkit

> Palette-locked brand asset pipeline. One `brand.json`, one source SVG → every standard asset (icons, favicon, OG image, Chrome Web Store tiles), with a hard guarantee that every shipped color is in your palette.

CLI + MCP server. Works with any Claude / Anthropic / MCP-compatible agent.

[brandkit.run](https://brandkit.run) · [GitHub](https://github.com/gent8/brandkit) · AGPL-3.0

## Why

Generic image models drift off your hex palette and ignore negative prompts. Ask Ideogram for `#5B21B6` and you'll get something close. Ask Recraft for "no text" and you'll get text. Then you have to vectorize the raster yourself.

brandkit fixes all three downstream:

1. **Generate** with the palette as a strong hint (Ideogram v3 via fal.ai)
2. **Vectorize** the raster output (Recraft API)
3. **Recolor** every hex/rgb in the SVG to the nearest palette member
4. **Verify** — drop any candidate that still has off-palette colors

The same recolor + verify primitives also run as an MCP tool — any Claude Code / Anthropic-API session can call `brandkit_recolor` and `brandkit_verify` against any SVG and palette.

## Install

### CLI (npm)

```bash
npm install -g brandkit
brandkit --help
```

Or run from source:

```bash
git clone https://github.com/gent8/brandkit
cd brandkit
npm install
npm link
brandkit --help
```

### MCP server (Claude Code, Claude Desktop, etc.)

The MCP server lives in `mcp/`. Build the Docker image and add it to your MCP client config:

```bash
docker build -t brandkit-mcp:latest -f mcp/Dockerfile .
```

Claude Code config:

```json
{
  "mcpServers": {
    "brandkit": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "FAL_KEY",
        "-e", "RECRAFT_API_KEY",
        "brandkit-mcp:latest"
      ]
    }
  }
}
```

## brand.json

```json
{
  "name": "Acme Co",
  "palette": ["#FAFAF9", "#5B21B6", "#10B981", "#F43F5E", "#1C1917"],
  "paletteTokens": {
    "bg": "#FAFAF9",
    "primary": "#5B21B6",
    "accent": "#10B981",
    "warn": "#F43F5E",
    "ink": "#1C1917"
  },
  "negativePrompt": ["leaves", "plants", "sparkles"]
}
```

The `palette` array is the law. Anything outside it gets snapped to the nearest member.

## CLI commands

### `brandkit recolor <input.svg> [--brand brand.json] [-o out.svg]`

Snap every hex in the SVG to the nearest palette color. 3-digit hex auto-expanded. Errors on `hsl()` or named colors with a list of offenders — convert those upstream first. Idempotent.

### `brandkit verify <input.svg> [--brand brand.json]`

Exit `0` if every color is in the palette, `1` with a list of offenders otherwise. Use as a precommit / CI gate.

### `brandkit export <input.svg> [--brand brand.json] [--out ./assets] [--bg <hex>]`

From one source SVG, produces:

- `icon-{16,32,48,128}.png` — Chrome extension
- `favicon.svg`, `favicon.ico` (multi-res 16+32+48), `apple-touch-icon.png` (180×180)
- `android-chrome-{192,512}.png`, `maskable-512.png`
- `og-image.png` (1200×630, mark centered on `palette[0]` or `--bg`)
- `cws-icon-128.png`, `cws-tile-440x280.png`, `cws-marquee-920x680.png`

Rasterization via [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js). ICO via [`png-to-ico`](https://github.com/steambap/png-to-ico).

### `brandkit gen --prompt "..." [--brand brand.json] [--out ./assets] [--count 4] [--dry-run]`

Full pipeline:

1. Provider call (fal.ai Ideogram v3) with prompt + locked palette + negative-prompt list.
2. Download N rasters → `./assets/_raw/`.
3. Vectorize each (Recraft) → `./assets/_svg/`.
4. Recolor each to snap to palette.
5. Verify each; drop any that still fail.
6. Write `candidates.html` gallery for human selection.
7. After picking, run `brandkit export <chosen.svg>`.

`--dry-run` prints the requests it would make without sending them.

## Providers

Wired:

| Var | Used by |
|---|---|
| `FAL_KEY` | `gen --provider fal` (default) |
| `RECRAFT_API_KEY` | `gen --vectorize recraft` (default) |

Stubbed (`throw new Error("not implemented")`) — PRs welcome:

- `--provider replicate` — needs `REPLICATE_API_TOKEN`
- `--vectorize vectorizer` — needs `VECTORIZER_AI_API_ID` / `VECTORIZER_AI_API_SECRET`

If a key is missing for the chosen provider, brandkit exits 1 with a clear `set $VAR` message.

## MCP tools

When run as an MCP server, three tools are exposed:

- **`brandkit_gen(prompt, palette, count?, extraNegative?, dryRun?)`** — full pipeline in one call. Returns survivor SVGs inline as text. No filesystem handoff needed.
- **`brandkit_recolor(svg, palette)`** — pure text-in/text-out. Snaps every hex AND `rgb()`/`rgba()` color to the nearest palette member.
- **`brandkit_verify(svg, palette)`** — pure text-in/JSON-out gate; reports off-palette offenders with normalized hex + suggestion.

`recolor`/`verify` accept both `#hex` and `rgb()` color forms (Recraft's vectorize output uses `rgb()`). Named CSS colors and `hsl()` are still rejected.

`export` is intentionally CLI-only — it writes 14+ files to disk, which doesn't fit the MCP text-in/text-out model.

## Example session

```bash
cp example/brand.json ./brand.json
$EDITOR brand.json   # set name + palette

brandkit gen --prompt "minimalist wordmark for a moving-storage app, geometric, clean" --count 6
open ./assets/candidates.html
# pick candidate-3.svg

brandkit export ./assets/_svg/candidate-3.svg --out ./assets/final
ls ./assets/final
# → icon-16.png ... cws-marquee-920x680.png
```

## CI gate

```bash
brandkit verify dist/logo.svg --brand brand.json   # exit 1 on drift
```

## Status

Solo-maintained, best-effort. See [STATUS.md](STATUS.md). Issues may sit; PRs are read on a slow cadence.

## Comparison

See [brandkit.run](https://brandkit.run) for a side-by-side: same prompt, same palette, fed through Claude-direct SVG / raw Ideogram / brandkit. Spoiler: only the brandkit column passes `verify`.

## License

[AGPL-3.0-or-later](LICENSE). If you wrap brandkit in a hosted service, your modifications must be released under the same terms.
