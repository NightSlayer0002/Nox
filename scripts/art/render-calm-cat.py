"""Render NOX's original pixel tabby from a layered Blender rig.

blender --background --factory-startup --python scripts/art/render-calm-cat.py
Add `-- --preview` to render one frame of the main poses into artifacts/tabby.
"""

import math
import re
import struct
import sys
import tempfile
import zlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


ROOT = Path(__file__).resolve().parents[2]
SIZE = 64
FLOOR = 60
PALETTE = {
    "ink": "382536", "dark": "874945", "shade": "ba694c", "orange": "e59354",
    "gold": "f7b971", "light": "ffd096", "cream": "fff0d4", "creamshade": "dec09d",
    "pink": "eb9292", "ear": "aa545d", "eye": "26343d", "iris": "66b9af",
    "irisshade": "3a827d", "glint": "f5fff0",
}
CLIPS = {"idle": 144, "stretching": 48, "walk": 72, "laying": 36, "sleeping1": 144,
         "waking": 48, "meow": 58, "nuzzle": 72, "grooming": 96, "curious": 60}


def color(hex_code):
    rgb = [int(hex_code[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)


def bezier(a, b, c, d, t):
    u = 1 - t
    return u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d


def points(path):
    """Sample the authored outline. Coordinates are in output pixels, y down."""
    outline = []
    for command, values in re.findall(r"([MLQCZ])([^MLQCZ]*)", path):
        numbers = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", values)]
        control = [Vector(numbers[i:i + 2]) for i in range(0, len(numbers), 2)]
        if command in "ML":
            outline.append(control[0])
        elif command == "Q":
            start = outline[-1]
            bend, end = control
            for step in range(1, 11):
                t = step / 10
                outline.append((1-t)**2 * start + 2*(1-t)*t * bend + t*t * end)
        elif command == "C":
            start = outline[-1]
            outline.extend(bezier(start, *control, step / 14) for step in range(1, 15))
    return outline


class Rig:
    def __init__(self):
        self.depth = 0
        self.materials = {}
        for name, hex_code in PALETTE.items():
            material = bpy.data.materials.new(name)
            material.diffuse_color = color(hex_code)
            material.use_nodes = True
            nodes = material.node_tree.nodes
            nodes.clear()
            emission = nodes.new('ShaderNodeEmission')
            emission.inputs['Color'].default_value = material.diffuse_color
            output = nodes.new('ShaderNodeOutputMaterial')
            material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
            self.materials[name] = material

    def pivot(self, name, x, y, parent=None):
        obj = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        origin = parent['origin'] if parent else (0, 0)
        obj.location = (x - origin[0], origin[1] - y, 0)
        obj['origin'] = (x, y)
        obj['rest'] = tuple(obj.location)
        return obj

    def mesh(self, name, swatch, parent=None):
        self.depth += .02
        mesh = bpy.data.meshes.new(name)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.location.z = self.depth
        obj.data.materials.append(self.materials[swatch])
        return obj

    def fill(self, name, swatch, outline, parent=None, mesh=None):
        obj = mesh if mesh is not None else self.mesh(name, swatch, parent)
        origin = parent['origin'] if parent else (0, 0)
        vertices = [Vector((p.x - origin[0], origin[1] - p.y, 0)) for p in outline]
        faces = tessellate_polygon([vertices])
        obj.data.clear_geometry()
        obj.data.from_pydata(vertices, [], faces)
        return obj

    def shape(self, name, swatch, path, parent=None):
        return self.fill(name, swatch, points(path), parent)

    def ellipse(self, name, swatch, x, y, rx, ry, parent=None):
        outline = [Vector((x + rx*math.cos(t), y + ry*math.sin(t))) for t in np.linspace(0, math.tau, 32, endpoint=False)]
        return self.fill(name, swatch, outline, parent)


def draw_tabby(rig):
    shape = rig.shape
    oval = rig.ellipse
    tail = [rig.mesh('Tail ' + swatch, swatch) for swatch in ('ink', 'orange', 'gold', 'shade', 'shade', 'cream')]
    feet = [rig.pivot('Far paw', 30, FLOOR), rig.pivot('Near paw', 21, FLOOR)]
    shape('Far front leg', 'ink', 'M28 42 Q35 41 35 47 L34 56 Q36 60 30 60 L26 60 Q23 59 25 55 L25 47 Q25 43 28 42 Z', feet[0])
    shape('Far front sock', 'creamshade', 'M27 53 L33 53 L32 57 Q34 59 29 59 L26 58 Z', feet[0])

    body = rig.pivot('Chest and haunch', 32, FLOOR)
    shape('Body silhouette', 'ink', 'M17 34 Q24 29 32 34 C39 37 43 40 46 48 Q50 52 48 57 Q47 60 41 60 L23 60 Q15 59 14 51 Q12 44 17 34 Z', body)
    shape('Body shade', 'shade', 'M18 35 Q24 32 31 35 C39 38 42 42 45 48 Q49 54 46 57 Q44 59 40 59 L24 59 Q17 58 16 51 Q14 44 18 35 Z', body)
    shape('Warm fur', 'orange', 'M18 36 Q25 34 33 37 Q41 41 44 48 Q47 52 44 56 Q42 58 38 57 L24 57 Q16 54 17 47 Z', body)
    shape('Haunch light', 'gold', 'M32 43 C40 42 46 50 42 55 Q40 58 34 56 Q29 52 30 47 Q30 44 32 43 Z', body)
    shape('Shoulder stripe', 'shade', 'M32 37 Q36 38 39 41 Q34 40 32 43 L29 44 Q32 40 32 37 Z', body)
    shape('Rib stripe', 'shade', 'M42 44 Q45 47 45 49 Q42 46 38 47 L35 48 Q37 45 42 44 Z', body)
    shape('Hip stripe', 'shade', 'M45 51 L46 54 Q44 52 41 54 L38 54 Q40 51 45 51 Z', body)
    shape('Bib shade', 'creamshade', 'M16 35 Q21 33 29 36 L32 43 L29 49 L26 48 L23 53 L20 50 L16 50 Q13 44 16 35 Z', body)
    shape('Cream bib', 'cream', 'M17 36 Q21 34 28 37 L29 42 L26 47 L23 46 L21 50 L18 47 L16 48 Q14 41 17 36 Z', body)
    shape('Hind paw', 'ink', 'M39 53 Q46 53 47 57 Q47 60 42 60 L35 60 Q31 59 33 57 Q35 55 39 53 Z', body)
    shape('Hind sock', 'creamshade', 'M39 55 Q44 54 45 57 Q46 59 42 59 L35 59 Q34 58 37 56 Z', body)
    shape('Hind toes', 'cream', 'M36 57 Q39 56 41 57 L41 59 L35 59 Z', body)
    shape('Near front leg', 'ink', 'M19 45 Q23 43 26 47 Q26 52 25 55 Q28 60 22 60 L16 60 Q13 59 15 55 L16 48 Q16 46 19 45 Z', feet[1])
    shape('Near front fur', 'orange', 'M19 46 Q23 44 25 48 L23 56 Q26 59 21 59 L16 59 Q15 58 17 54 L17 49 Q17 47 19 46 Z', feet[1])
    shape('Near sock', 'cream', 'M17 53 L23 54 L23 56 Q26 59 21 59 L16 59 Q15 58 17 53 Z', feet[1])
    shape('Paw separation', 'creamshade', 'M19 57 L20 57 L20 59 L19 59 Z', feet[1])

    head = rig.pivot('Head tilt', 23, 30)
    shape('Ear and cheek silhouette', 'ink', 'M8 23 Q7 18 10 15 L11 7 Q11 4 14 5 Q20 7 23 12 Q28 11 31 12 L37 6 Q40 4 41 8 L42 18 C48 23 46 31 41 35 L43 37 L38 37 Q34 40 26 41 Q17 42 11 37 L7 37 L9 34 Q4 30 8 23 Z', head)
    shape('Face shadow', 'shade', 'M9 24 Q8 19 11 16 L12 7 Q12 5 15 7 Q20 9 22 14 Q28 12 32 14 L38 7 Q40 6 40 10 L41 19 C46 23 45 30 40 34 L41 36 L37 36 Q32 39 26 40 Q16 40 11 36 L9 36 L10 33 Q6 29 9 24 Z', head)
    shape('Face fur', 'orange', 'M10 23 Q9 19 12 16 L13 8 Q16 7 21 15 Q27 13 32 15 L38 8 Q40 7 39 11 L40 20 Q45 25 42 30 Q39 35 34 37 Q22 41 14 36 L11 34 Q7 30 10 23 Z', head)
    shape('Sunlit forehead', 'gold', 'M11 19 Q14 15 21 16 Q26 14 31 16 Q35 15 39 18 L40 22 Q33 20 29 23 L25 26 Q20 23 13 25 L9 27 Q9 22 11 19 Z', head)
    shape('Far inner ear', 'ear', 'M13 8 Q16 9 19 14 L12 16 Z', head)
    shape('Far ear light', 'pink', 'M13 9 L16 11 L14 14 L12 15 Z', head)
    shape('Near inner ear', 'ear', 'M33 15 Q35 11 39 8 L39 17 Z', head)
    shape('Near ear light', 'pink', 'M34 15 L38 10 L38 16 Z', head)
    shape('Forehead stripe left', 'shade', 'M16 15 L19 15 Q20 18 22 21 Q18 20 16 15 Z', head)
    shape('Forehead stripe center', 'shade', 'M23 14 L26 14 L25 20 Q23 20 23 14 Z', head)
    shape('Forehead stripe right', 'shade', 'M29 15 L32 15 Q31 19 27 21 Q29 18 29 15 Z', head)
    shape('Temple stripe', 'shade', 'M40 22 Q43 24 44 26 L39 25 L35 26 Q36 24 40 22 Z', head)
    shape('Temple stripe lower', 'shade', 'M43 29 L42 32 L36 30 L34 29 Q38 28 43 29 Z', head)
    shape('Cheek shadow', 'creamshade', 'M8 28 Q12 25 18 29 L21 26 L25 29 Q32 26 36 28 L40 30 L38 35 Q30 40 20 39 Q12 39 9 34 Z', head)
    shape('Cream muzzle', 'cream', 'M9 28 Q13 26 18 29 L20 27 L23 27 L25 29 Q31 27 36 28 L39 30 L36 33 L38 34 L33 36 Q30 38 24 37 Q19 39 14 36 L11 36 L12 34 L8 32 Z', head)
    shape('Nose bridge', 'light', 'M20 22 L23 21 L24 25 L25 29 L21 30 L18 28 Z', head)
    oval('Far cheek blush', 'pink', 12, 31, 2.3, 1.15, head)
    oval('Near cheek blush', 'pink', 31.6, 32, 3.2, 1.25, head)

    eyes, eyelids = [], []
    for name, x, y, width in [('Far', 14, 25.5, 2.65), ('Near', 29, 26, 3.3)]:
        eye = rig.pivot(name + ' blink', x, y, head)
        oval(name + ' eye rim', 'eye', x, y, width, 4.15, eye)
        oval(name + ' iris shade', 'irisshade', x-.15, y+.55, width-.65, 3.2, eye)
        oval(name + ' iris', 'iris', x-.15, y+1.1, width-.85, 2.5, eye)
        oval(name + ' pupil', 'eye', x-.35, y-.15, width*.43, 2.65, eye)
        oval(name + ' eye glint', 'glint', x-.9, y-1.45, .95, 1.02, eye)
        eyes.append(eye)
        eyelids.append(shape(name + ' closed eyelid', 'dark',
            f'M{x-width} {y-.7} Q{x} {y+2} {x+width} {y-.7} '
            f'L{x+width} {y+.5} Q{x} {y+3.1} {x-width} {y+.5} Z', head))
    shape('Nose', 'dark', 'M19 29 Q21 28 24 29 L23 31 Q21 32 20 31 Z', head)
    shape('Nose highlight', 'pink', 'M20 29 L23 29 L22 30 L20 30 Z', head)
    smile = shape('Small smile', 'dark', 'M21 31 L22 31 L22 32 Q24 34 26 32 L26 33 Q24 35 21.5 33 Q19 35 17 33 L17 32 Q19 34 21 32 Z', head)
    mouth = rig.pivot('Meow jaw', 21.5, 33.5, head)
    oval('Open mouth', 'ink', 21.5, 33.5, 2.7, 2.6, mouth)
    oval('Tongue', 'pink', 21.5, 34.7, 1.65, .95, mouth)
    shape('Far whiskers', 'creamshade', 'M10 31 L5 30 L5 31 L10 32 Z', head)
    shape('Near whiskers', 'creamshade', 'M33 32 L40 31 L40 32 L34 33 Z', head)
    wash_paw = rig.pivot('Washing forepaw', 20, 54)
    shape('Washing paw outline', 'ink', 'M17 44 Q20 42 23 45 L24 51 Q25 57 21 59 L17 59 Q14 56 15 51 L15 47 Q15 45 17 44 Z', wash_paw)
    shape('Washing paw fur', 'orange', 'M18 45 Q20 44 22 46 L23 51 L22 56 L17 56 L16 51 L16 47 Z', wash_paw)
    shape('Washing paw sock', 'cream', 'M16 52 L23 52 L23 56 Q22 58 20 58 L17 58 Q15 57 16 52 Z', wash_paw)
    dreams = rig.pivot('Sleep marks', 48, 28)
    shape('Small Z', 'creamshade', 'M43 30 L47 30 L47 31 L44.5 33 L47 33 L47 34 L43 34 L43 33 L45.5 31 L43 31 Z', dreams)
    shape('Large Z', 'cream', 'M49 22 L54 22 L54 23 L51 26 L54 26 L54 27 L49 27 L49 26 L52 23 L49 23 Z', dreams)
    # The face is drawn in layers. Move the same ear vertices in every layer
    # so the inner ear and outline remain registered during a small twitch.
    ears = [(obj, [vertex.co.copy() for vertex in obj.data.vertices])
            for obj in head.children if obj.type == 'MESH']
    return body, head, feet, eyes, eyelids, smile, mouth, tail, dreams, ears, wash_paw


def ease(t):
    t = min(1, max(0, t))
    return t*t*(3-2*t)


def place(obj, x=0, y=0, sx=1, sy=1, tilt=0):
    rest = obj['rest']
    obj.location = (rest[0] + x, rest[1] - y, rest[2])
    obj.scale = (sx, sy, 1)
    obj.rotation_euler.z = tilt


def stroke(start, end, center, width):
    """Round tapered strip following the centerline of the animated tail."""
    offsets = []
    for step in range(24):
        t = start + (end - start) * step / 23
        point = center(t)
        tangent = (center(t + .0001) - center(t - .0001)).normalized()
        offsets.append((point, tangent, Vector((-tangent.y, tangent.x)), width(t)))
    outline = [p + n*w for p, _, n, w in offsets]
    p, tangent, n, w = offsets[-1]
    outline.extend(p + w*(n*math.cos(a) + tangent*math.sin(a)) for a in np.linspace(0, math.pi, 8)[1:])
    outline.extend(p - n*w for p, _, n, w in reversed(offsets[:-1]))
    p, tangent, n, w = offsets[0]
    outline.extend(p + w*(-n*math.cos(a) - tangent*math.sin(a)) for a in np.linspace(0, math.pi, 8)[1:-1])
    return outline


def pose_tabby(rig, model, clip, frame):
    body, head, feet, eyes, eyelids, smile, mouth, tail, dreams, ears, wash_paw = model
    progress = frame / (CLIPS[clip] if clip in ('idle', 'sleeping1') else CLIPS[clip]-1)
    phase = progress * math.tau
    breath = math.sin(phase)
    rest = {'laying': ease(progress), 'sleeping1': 1, 'waking': 1-ease(progress*1.55)}.get(clip, 0)
    stretch = math.sin(math.pi*progress)**2 if clip in ('stretching', 'waking') else 0
    stride = math.sin(math.pi*progress)**2 if clip == 'walk' else 0
    gait = math.sin(phase*3)
    envelope = math.sin(math.pi*progress)**2
    affection = envelope if clip == 'nuzzle' else 0
    wash = envelope if clip == 'grooming' else 0
    curiosity = envelope if clip == 'curious' else 0
    place(body, x=2.3*rest, sx=1+.18*rest+.13*stride, sy=1-.48*rest-.16*stretch-.16*stride+.018*breath)
    place(head, x=-1.2*rest-3*stretch-2*stride-2*affection, y=20*rest+11*stretch+6*stride+.4*breath+2*wash,
          sx=1+.06*rest, sy=1-.17*rest-.04*stretch,
          tilt=.025*breath+.095*rest-.08*stretch-.12*affection+.14*curiosity-.07*wash*math.sin(phase*3))
    for index, paw in enumerate(feet):
        step = gait*(-1 if index else 1)*stride
        knead = max(0, math.sin(phase*3+index*math.pi))*affection
        place(paw, x=step*3-4*stretch-1.8*rest+(2*wash if index else 0),
              y=-max(0,step)*2-1.7*knead-(18*wash if index else 0),
              sy=1-.60*rest-.24*stretch-.15*stride, tilt=-.12*wash if index else 0)
        for feature in paw.children:
            feature.hide_render = index == 1 and wash > .18
    place(wash_paw, x=wash, y=-23*wash-1.2*wash*math.sin(phase*3), tilt=-.06*wash)
    for feature in wash_paw.children:
        feature.hide_render = wash <= .18
    for index, (eye, eyelid) in enumerate(zip(eyes, eyelids)):
        blink = ease(max(0, 1-abs(progress-(.56+.012*index))/.075)) if clip == 'idle' else 0
        closed = max(rest, blink, min(1, affection*2.8), wash*.9)
        place(eye, x=-.5*curiosity, sy=1-.88*closed)
        eyelid.hide_render = closed < .83
        for detail in eye.children:
            detail.hide_render = not eyelid.hide_render
    twitch = .12*math.sin(phase*9)*math.exp(-((progress-.78)/.07)**2) if clip in ('idle', 'curious') else 0
    for obj, original in ears:
        for vertex, co in zip(obj.data.vertices, original):
            x, y = co.x+23, 30-co.y
            weight = ease((18-y)/11) if x < 22 else 0
            vertex.co = co+Vector((twitch*weight*(18-y), twitch*weight*(x-15), 0))
    place(dreams, y=-.75*breath)
    for mark in dreams.children:
        mark.hide_render = clip != 'sleeping1'
    meow = math.sin(math.pi*min(1, progress*1.9))**1.5 if clip == 'meow' else 0
    meow = max(meow, max(0, math.sin(phase*3))*.52*wash)
    smile.hide_render = meow > .24
    mouth.hide_render = meow <= .24
    for feature in mouth.children:
        feature.hide_render = mouth.hide_render
    place(mouth, sy=max(.01, meow), sx=.76+.24*meow)

    sway = math.sin(phase)
    curl = math.sin(phase-.72)
    raised = [Vector((41, 52)), Vector((59+1.8*sway, 55)), Vector((61+2*curl, 28+2*sway)), Vector((53+4.5*curl, 22+2*sway))]
    curled = [Vector((42, 54)), Vector((57, 59)), Vector((61, 47)), Vector((52+.95*curl, 45+.9*sway))]
    bends = [a.lerp(b, rest) for a, b in zip(raised, curled)]
    center = lambda t: bezier(*bends, t)
    radius = lambda t: 4.1-1.25*t
    rig.fill('Tail outline', 'ink', stroke(0, 1, center, radius), mesh=tail[0])
    rig.fill('Tail fur', 'orange', stroke(.01, .99, center, lambda t: radius(t)-1), mesh=tail[1])
    rig.fill('Tail light', 'gold', stroke(.18, .92, lambda t: center(t)+Vector((-.7, -.45)), lambda _: .66), mesh=tail[2])
    for index, position in enumerate((.44, .65)):
        rig.fill('Tail band', 'shade', stroke(position, position+.032, center, lambda t: radius(t)-1.05), mesh=tail[3+index])
    rig.fill('Cream tail tip', 'cream', stroke(.89, .985, center, lambda t: radius(t)-1.02), mesh=tail[5])


def configure_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    camera = bpy.data.objects.new('Pixel orthographic camera', bpy.data.cameras.new('Pixel orthographic camera'))
    scene.collection.objects.link(camera)
    camera.location = (SIZE/2, -SIZE/2, 100)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = SIZE
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.cycles.pixel_filter_type = 'BOX'
    scene.cycles.filter_width = .01
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.dither_intensity = 0
    scene.view_settings.view_transform = 'Standard'
    return scene


def write_png(path, pixels):
    height, width, _ = pixels.shape

    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))

    rows = b''.join(b'\0' + row.tobytes() for row in pixels)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


def main():
    scene = configure_scene()
    rig = Rig()
    model = draw_tabby(rig)
    preview = '--preview' in sys.argv
    output = ROOT / ('artifacts/tabby' if preview else 'public/assets/calm')
    output.mkdir(parents=True, exist_ok=True)
    if preview:
        for clip in ('idle', 'sleeping1', 'meow'):
            pose_tabby(rig, model, clip, CLIPS[clip]//5)
            scene.render.filepath = str(output / (clip + '.png'))
            bpy.ops.render.render(write_still=True)
        return
    scratch_root = ROOT / 'artifacts'
    scratch_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tabby-', dir=scratch_root) as scratch:
        frame_path = Path(scratch) / 'frame.png'
        scene.render.filepath = str(frame_path)
        for clip, count in CLIPS.items():
            strip = np.zeros((SIZE, SIZE*count, 4), dtype=np.uint8)
            for index in range(count):
                pose_tabby(rig, model, clip, index)
                bpy.ops.render.render(write_still=True)
                image = bpy.data.images.load(str(frame_path), check_existing=False)
                pixels = np.empty(SIZE*SIZE*4, dtype=np.float32)
                image.pixels.foreach_get(pixels)
                bpy.data.images.remove(image)
                strip[:, SIZE*index:SIZE*(index+1)] = np.round(pixels.reshape(SIZE, SIZE, 4)[::-1]*255).astype(np.uint8)
            write_png(output / f'tabby-{clip}.png', strip)


if __name__ == '__main__':
    main()
