# BodyParts3D brain geometry

BodyParts3D, © The Database Center for Life Science licensed under CC
Attribution 4.0 International.

- Licensor and license: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
  (license page last updated 2025-02-27; retrieved 2026-10-12).
- Official dataset: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip
- Verified source archive SHA-256:
  `40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e`.
- Database: https://lifesciencedb.jp/bp3d/
- License text: `LICENSE-CC-BY-4.0.txt`.
- Citation: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K.
  BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids
  Research 37(Database issue):D782–5 (2009).
  https://doi.org/10.1093/nar/gkn613

`brain.bin` contains 40 selected original cortical, cerebellar and brainstem
meshes from BodyParts3D 4.0. It preserves their original triangle topology and
vertex positions, packed as float32 positions and uint32 indices for a small,
local browser download. File IDs, original file SHA-256 checksums, vertex and
triangle counts and the final binary SHA-256 are recorded in `geometry.json`.
The runtime reorients Z-up to Y-up, centers and uniformly scales the anatomical
data. It applies a teal lighting/material theme, scan bands and a vertex point
overlay. These are presentation changes; no brain shape is synthesized.

Rebuild: extract the official ZIP, then run
`node scripts/build-brain-asset.mjs <directory containing FJ*.obj>`.

Older embedded OBJ headers refer to the former CC BY-SA 2.1 Japan terms.
The primary licensor's current database license page explicitly licenses the
database under CC BY 4.0 and supplies the attribution above. This distribution
uses that current grant and preserves the original source IDs and provenance.

The brain is NOX's visual Signal theme. It is not a claim about the model's
anatomy, consciousness, diagnostic capabilities or real neural activity.
