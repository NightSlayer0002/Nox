# NOX body source

`nox.blend` is the editable Blender 5.2 source for
`public/assets/nox/body-v1.glb`. Its mesh is derived from this repository's
`createLiquidGeometry()` in `client/liquid-geometry.js`, which samples the
original legless `blobPath` in `public/js/face-art.js`. It preserves the rounded
top, gently flattened base and domed front. The authored surface adds less than
one unit of depth variation; it uses no third-party character model or texture.

The body has 4,514 shared vertices and 9,024 triangles. All faces are smooth.
The runtime coordinate frame is approximately 290 × 290 × 208, with +Y up,
+Z facing the expression plane and a centered origin. The Blender source is
Z-up with its front toward -Y; the glTF exporter converts these coordinates.
Object transforms are identity. Planar UVs preserve the existing liquid shader
projection. Expressions remain a separate runtime texture.

The shape keys `Hold`, `WobbleLeft`, `WobbleRight`, and `Impact` have a 0–1
range. Hold gently pulls the upper surface, opposing wobble keys shear it
laterally, and Impact redistributes a small local patch. The runtime compositor
owns whole-body squash. The base and combined positive shape-key deltas remain
behind z=106, leaving room for the existing face plane at z=108.

## Export

From the repository root, with installed Node dependencies and Blender 5.2:

```powershell
node scripts/export-nox.mjs
node --test tests/nox-asset.test.mjs tests/liquid-geometry.test.mjs
```

The script re-exports the saved `.blend`, preserving manual source edits. Set
`BLENDER_PATH` to the Blender executable if it is not installed at the default
Windows path in the wrapper. The wrapper passes the current procedural contour
through a temporary JSON file to `export_nox.py`, then removes that file.

To recreate the authored source from the original contour and shape formulas:

```powershell
node scripts/export-nox.mjs --rebuild-source
```

This deliberately replaces `nox.blend`. To render a native Blender inspection
image at `assets-source/nox/preview.png`, add `--preview`. The temporary render
camera is added after saving and exporting; it is absent from the source and
GLB. The source display material is also excluded from GLB; the browser supplies
its liquid metal shader. The export contains one indexed closed body, normals,
UVs and shape-key positions/normals, with no animations, external resources,
lights or cameras. The asset contract test checks delivery and geometry budgets.

The deployed `body-v1.glb` URL is immutable and cached. For subsequent published
asset changes, increment the filename version and update the loader URL before
deployment so returning browsers receive the new model.
