# quake-palettes (Aseprite extension)

Drops two palettes into Aseprite:

- **Quake** — full 256-colour Quake 1 palette.
- **Quake (no fullbrights)** — first 224 colours only. The remaining
  32 entries (indices 224..255) are *fullbrights*: they render at
  constant brightness regardless of the lightmap and end up looking
  like glow-in-the-dark patches under outdoor lighting. Drop the
  fullbright range when painting wall/ground textures meant to take
  shadow.

## Install (Windows / Steam)

Copy this folder into:

```
C:\Program Files (x86)\Steam\steamapps\common\Aseprite\data\extensions\quake-palettes
```

The folder must contain `package.json` and the `palettes/` subfolder
side by side. Then restart Aseprite. The two palettes show up under
**Palette ▸ Presets**.

PowerShell one-liner from the repo root:

```powershell
Copy-Item -Recurse -Force `
  tools\aseprite-quake-palettes\* `
  "C:\Program Files (x86)\Steam\steamapps\common\Aseprite\data\extensions\quake-palettes\"
```

Run it from an elevated terminal — Program Files needs admin rights.

## Regenerate

The GPL files come from the canonical palette shipped with the
modeditor source (`modeditor/src/shared/quakePalette.js`). If that
ever changes, rerun:

```
node tools/aseprite-quake-palettes/generate.js
```

and re-copy the folder.
