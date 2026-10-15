"""Author/re-export NOX with Blender 5.2. Run via scripts/export-nox.mjs."""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seed', required=True)
    parser.add_argument('--blend', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--rebuild-source', action='store_true')
    parser.add_argument('--preview')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def to_blender(x, y, z):
    # Blender Z-up -> glTF Y-up exports back to the original +Z-front frame.
    return (x, -z, y)


def build_body(seed_path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    with open(seed_path, encoding='utf-8') as handle:
        seed = json.load(handle)
    runtime = []
    for index in range(0, len(seed['positions']), 3):
        x, y, z = seed['positions'][index:index + 3]
        # Sub-unit depth variation adds a quiet asymmetry while retaining the
        # approved outline, centered poles and soft front dome.
        depth = .65 * math.sin(x / 72) * math.sin(y / 94) * (z / 104) ** 2
        runtime.append((x, y, z + depth))
    vertices = [to_blender(*point) for point in runtime]
    triangles = [seed['indices'][i:i + 3] for i in range(0, len(seed['indices']), 3)]
    mesh = bpy.data.meshes.new('NOX_ContourBody')
    mesh.from_pydata(vertices, [], triangles)
    mesh.update()
    body = bpy.data.objects.new('NOX_Body', mesh)
    bpy.context.collection.objects.link(body)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    uv_layer = mesh.uv_layers.new(name='FaceProjection')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = seed['uv'][vertex_index * 2:vertex_index * 2 + 2]
    body.shape_key_add(name='Basis')
    for name in ('Hold', 'WobbleLeft', 'WobbleRight', 'Impact'):
        key = body.shape_key_add(name=name)
        key.slider_min, key.slider_max = 0.0, 1.0
        for index, (x, y, z) in enumerate(runtime):
            if name == 'Hold':
                influence = math.exp(-((y - 85) / 105) ** 2)
                point = (x * (1 - .012 * influence), y + 4.5 * influence, z * .992)
            elif name in ('WobbleLeft', 'WobbleRight'):
                direction = -1 if name == 'WobbleLeft' else 1
                point = (x + direction * 4 * (y / 145 + .25), y, z)
            else:
                influence = math.exp(-(x / 105) ** 2 - ((y + 60) / 90) ** 2)
                front = max(z / 104, 0)
                # Local volume movement only: the outer canvas owns squash.
                point = (x + 1.8 * (x / 145) * influence,
                         y + 1.2 * (y / 145) * influence,
                         z + 1.4 * influence * front)
            key.data[index].co = to_blender(*point)
    body['lineage'] = 'client/liquid-geometry.js createLiquidGeometry; public/js/face-art.js blobPath'
    body['runtime_front'] = '+Z; source Blender front is -Y'
    body['morph_range'] = 'Hold, WobbleLeft, WobbleRight, Impact: 0..1'
    # Editable source display material; runtime owns the actual liquid shader.
    material = bpy.data.materials.new('NOX_SourcePreview')
    material.diffuse_color = (.045, .085, .075, 1)
    material.metallic = .8
    material.roughness = .28
    mesh.materials.append(material)
    return body


def export_body(body, output):
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    for key in body.data.shape_keys.key_blocks:
        key.value = 0
    bpy.ops.export_scene.gltf(
        filepath=output, export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_materials='NONE',
        export_animations=False, export_cameras=False, export_lights=False,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_morph=True, export_morph_normal=True, export_morph_tangent=False,
        export_extras=False, export_keep_originals=False,
        export_copyright='NOX original contour; see assets-source/nox/README.md',
    )


def configure_editing_view():
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != 'VIEW_3D':
                continue
            space = area.spaces.active
            space.clip_end = 5000
            space.region_3d.view_location = (0, 0, 0)
            space.region_3d.view_rotation = Euler((math.pi / 2, 0, 0)).to_quaternion()
            space.region_3d.view_distance = 450
            space.region_3d.view_perspective = 'ORTHO'
            space.overlay.show_floor = False


def render_preview(body, output):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = output
    scene.world.color = (.025, .035, .032)
    shading = scene.display.shading
    shading.light = 'MATCAP'
    shading.studiolight_rotate_z = .25
    available = {light.name for light in bpy.context.preferences.studio_lights}
    if 'metal_shiny.exr' in available:
        shading.studio_light = 'metal_shiny.exr'
    shading.color_type = 'MATERIAL'
    shading.show_shadows = True
    shading.show_cavity = False
    shading.background_type = 'WORLD'
    camera_data = bpy.data.cameras.new('Preview_Camera')
    camera = bpy.data.objects.new('Preview_Camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = (18, -650, 12)
    camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 380
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


args = arguments()
bpy.context.preferences.filepaths.save_version = 0
bpy.context.preferences.filepaths.file_preview_type = 'NONE'
if args.rebuild_source or not os.path.exists(args.blend):
    body = build_body(args.seed)
    configure_editing_view()
    bpy.ops.wm.save_as_mainfile(filepath=args.blend)
else:
    bpy.ops.wm.open_mainfile(filepath=args.blend)
    body = bpy.data.objects['NOX_Body']
export_body(body, args.output)
print(f'NOX: {len(body.data.vertices)} editable vertices, {len(body.data.polygons)} triangles')
if args.preview:
    render_preview(body, args.preview)
