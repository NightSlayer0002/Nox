"""Generate NOX's 64px tabby strips from deterministic pixel-art motion curves.

Requires Python 3.10+ and numpy. No Blender or browser dependency.
Run: python scripts/art/render-calm-cat.py
Optional: --output artifacts/tabby/regenerated (keeps production files untouched).
Each frame is 64x64 with binary alpha and a floor baseline at y=60, played at 24fps.
"""

import math
import struct
import zlib
from pathlib import Path
import numpy as np

# -----------------------------------------------------------------------------
# PALETTE DEFINITION (NOX Tabby Official 16-Color Palette)
# -----------------------------------------------------------------------------
PALETTE = {
    'trans':      (0,   0,   0,   0),    # Transparent background
    'ink':        (56,  37,  54,  255),  # #382536 Dark plum/espresso outline
    'dark':       (135, 73,  69,  255),  # #874945 Deep umber fur shadow & far legs
    'shade':      (186, 105, 76,  255),  # #ba694c Warm ginger shadow & tabby stripes
    'orange':     (229, 147, 84,  255),  # #e59354 Radiant warm tabby ginger
    'gold':       (247, 185, 113, 255),  # #f7b971 Sunlit honey highlight
    'light':      (255, 208, 150, 255),  # #ffd096 Peachy facial highlight
    'cream':      (255, 240, 212, 255),  # #fff0d4 Ivory buttermilk muzzle, bib, socks
    'creamshade': (222, 192, 157, 255),  # #dec09d Warm tan shading on cream
    'pink':       (235, 146, 146, 255),  # #eb9292 Blossom pink nose, tongue, inner ear, blush
    'ear':        (170, 84,  93,  255),  # #aa545d Deep rose inner ear depth
    'eye':        (38,  52,  61,  255),  # #26343d Slate navy rim & pupil
    'iris':       (102, 185, 175, 255),  # #66b9af Jewel sea-green / emerald iris
    'irisshade':  (58,  130, 125, 255),  # #3a827d Deep teal upper iris shadow
    'glint':      (245, 255, 240, 255),  # #f5fff0 Bright crystalline specular catchlight
    'sleep':      (162, 202, 223, 255),  # #a2cadf Soft dreamy zzz particle
}


# -----------------------------------------------------------------------------
# CANVAS RASTERIZER
# -----------------------------------------------------------------------------
class Canvas:
    def __init__(self, w=64, h=64):
        self.w = w
        self.h = h
        self.grid = np.zeros((h, w, 4), dtype=np.uint8)

    def set(self, x, y, color_name):
        ix, iy = int(round(x)), int(round(y))
        if 0 <= ix < self.w and 0 <= iy < min(self.h, 60):
            self.grid[iy, ix] = PALETTE[color_name]

    def get(self, x, y):
        ix, iy = int(round(x)), int(round(y))
        if 0 <= ix < self.w and 0 <= iy < self.h:
            return self.grid[iy, ix]
        return PALETTE['trans']

    def fill_rect(self, x, y, w, h, color_name):
        x0, y0 = max(0, int(round(x))), max(0, int(round(y)))
        x1, y1 = min(self.w, int(round(x + w))), min(60, int(round(y + h)))
        if x0 < x1 and y0 < y1:
            self.grid[y0:y1, x0:x1] = PALETTE[color_name]

    def fill_ellipse(self, cx, cy, rx, ry, color_name):
        rx, ry = max(0.5, rx), max(0.5, ry)
        x0 = max(0, int(math.floor(cx - rx)))
        x1 = min(self.w, int(math.ceil(cx + rx)) + 1)
        y0 = max(0, int(math.floor(cy - ry)))
        y1 = min(60, int(math.ceil(cy + ry)) + 1)
        col = PALETTE[color_name]
        for y in range(y0, y1):
            dy = (y - cy) / ry
            dy2 = dy * dy
            if dy2 <= 1.0:
                dx_max = rx * math.sqrt(1.0 - dy2)
                ix0 = max(0, int(round(cx - dx_max)))
                ix1 = min(self.w, int(round(cx + dx_max)) + 1)
                self.grid[y, ix0:ix1] = col

    def fill_polygon(self, pts, color_name):
        pts = [(float(p[0]), float(p[1])) for p in pts]
        n = len(pts)
        if n < 3:
            return
        min_y = max(0, int(math.floor(min(p[1] for p in pts))))
        max_y = min(59, int(math.ceil(max(p[1] for p in pts))))
        col = PALETTE[color_name]

        for y in range(min_y, max_y + 1):
            nodes = []
            j = n - 1
            cy = y + 0.5
            for i in range(n):
                yi, yj = pts[i][1], pts[j][1]
                xi, xj = pts[i][0], pts[j][0]
                if (yi < cy <= yj) or (yj < cy <= yi):
                    x = xi + (cy - yi) / (yj - yi) * (xj - xi)
                    nodes.append(x)
                j = i
            nodes.sort()
            for k in range(0, len(nodes) - 1, 2):
                x_start = max(0, int(round(nodes[k])))
                x_end = min(self.w, int(round(nodes[k+1])) + 1)
                if x_start < x_end:
                    self.grid[y, x_start:x_end] = col

    def draw_line(self, x0, y0, x1, y1, color_name, width=1):
        dx = abs(x1 - x0)
        dy = abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        cx, cy = int(round(x0)), int(round(y0))
        gx, gy = int(round(x1)), int(round(y1))
        pts = []
        while True:
            pts.append((cx, cy))
            if cx == gx and cy == gy:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                cx += sx
            if e2 < dx:
                err += dx
                cy += sy
        r = (width - 1) / 2.0
        for px, py in pts:
            if 0 <= py < 60 and 0 <= px < self.w:
                if width <= 1:
                    self.set(px, py, color_name)
                else:
                    self.fill_ellipse(px, py, r + 0.5, r + 0.5, color_name)

    def draw_tail(self, points, widths, colors):
        """Draw articulated multi-segment tail with tapered width and color zones."""
        n = len(points)
        for i in range(n - 1):
            p0, p1 = points[i], points[i+1]
            w0 = widths[min(i, len(widths) - 1)]
            w1 = widths[min(i + 1, len(widths) - 1)]
            col = colors[min(i, len(colors) - 1)]
            dx = p1[0] - p0[0]
            dy = p1[1] - p0[1]
            dist = math.hypot(dx, dy)
            if dist < 0.001:
                continue
            nx = -dy / dist
            ny = dx / dist
            q0 = (p0[0] + nx * w0 * 0.5, p0[1] + ny * w0 * 0.5)
            q1 = (p1[0] + nx * w1 * 0.5, p1[1] + ny * w1 * 0.5)
            q2 = (p1[0] - nx * w1 * 0.5, p1[1] - ny * w1 * 0.5)
            q3 = (p0[0] - nx * w0 * 0.5, p0[1] - ny * w0 * 0.5)
            self.fill_polygon([q0, q1, q2, q3], col)
            self.fill_ellipse(p0[0], p0[1], w0 * 0.5, w0 * 0.5, col)
        end_w = widths[-1] if len(widths) > 0 else 2.0
        end_col = colors[-1] if len(colors) > 0 else 'cream'
        self.fill_ellipse(points[-1][0], points[-1][1], end_w * 0.5, end_w * 0.5, end_col)

    def draw_zzz(self, x, y, scale=1.0, color_name='sleep'):
        """Draw cute pixel Z for sleep state."""
        s = max(1, int(round(scale)))
        self.fill_rect(x, y, 4 * s, s, color_name)
        if s == 1:
            self.set(x + 2, y + 1, color_name)
            self.set(x + 1, y + 2, color_name)
        else:
            self.fill_rect(x + 2*s, y + s, s, s, color_name)
            self.fill_rect(x + s, y + 2*s, s, s, color_name)
        self.fill_rect(x, y + 3 * s, 4 * s, s, color_name)

    def outline(self, outline_color='ink'):
        """1px pixel-art outline wrapping the outer silhouette, strictly respecting floor baseline y < 60."""
        self.grid[60:, :, :] = 0
        alpha = self.grid[:, :, 3] > 0
        h, w = self.h, self.w
        out = self.grid.copy()
        ink_col = PALETTE[outline_color]

        for y in range(min(h, 60)):
            for x in range(w):
                if not alpha[y, x]:
                    has_solid = False
                    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < min(h, 60) and 0 <= nx < w:
                            if alpha[ny, nx]:
                                has_solid = True
                                break
                    if has_solid:
                        out[y, x] = ink_col
        out[60:, :, :] = 0
        self.grid = out

    def flip_horizontal(self):
        self.grid = np.fliplr(self.grid)

# -----------------------------------------------------------------------------
# IMAGE & ANIMATION EXPORTERS
# -----------------------------------------------------------------------------
def write_png(path, arr):
    """Write (H, W, 4) uint8 RGBA array as a standard PNG."""
    h, w, _ = arr.shape
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    rows = b''.join(b'\0' + row.tobytes() for row in arr)
    png_data = (b'\x89PNG\r\n\x1a\n' +
                chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) +
                chunk(b'IDAT', zlib.compress(rows, 9)) +
                chunk(b'IEND', b''))
    Path(path).write_bytes(png_data)

# CHARACTER ANATOMY & POSE GENERATORS
# -----------------------------------------------------------------------------
def render_sitting_tabby(
    head_offset=(0, 0),
    head_tilt=0.0,
    breath_y=0.0,
    eye_state='open',
    mouth_state='smile',
    ear_twitch_l=0.0,
    ear_twitch_r=0.0,
    blush=False,
    front_paw_mode='planted',
    paw_lick_phase=0.0,
    tail_wave_phase=0.0,
    tail_curl_extra=0.0,
    tail_high=False,
    knead_side='none'
):
    """Render sitting cat companion pose with organic breathing, expressions, and tail."""
    c = Canvas(64, 64)
    hx, hy = 26 + head_offset[0], 27 + head_offset[1]
    by = breath_y

    # 1. TAIL (Maintains safe margin x <= 55 to prevent side boundary clipping)
    sway = math.sin(tail_wave_phase) * (2.4 if not tail_high else 1.8)
    sway_mid = math.sin(tail_wave_phase - 0.7) * (3.4 if not tail_high else 2.2)
    sway_tip = math.sin(tail_wave_phase - 1.4) * (4.2 if not tail_high else 2.8)

    if tail_high:
        tail_pts = [
            (41, 50 + by * 0.5),
            (45, 44),
            (48 + sway * 0.4, 34),
            (50 + sway_mid * 0.6, 22),
            (47 + sway_tip * 0.7, 14),
            (42 + sway_tip * 0.8, 13 + tail_curl_extra),
            (38 + sway_tip * 0.6, 16 + tail_curl_extra)
        ]
    else:
        tail_pts = [
            (41, 50 + by * 0.5),
            (45 + sway * 0.25, 47),
            (49 + sway * 0.5, 40),
            (50 + sway_mid * 0.6, 30),
            (47 + sway_tip * 0.7, 21),
            (42 + sway_tip * 0.8, 18 + tail_curl_extra),
            (38 + sway_tip * 0.6, 20 + tail_curl_extra)
        ]
    tail_widths = [5.2, 4.8, 4.2, 3.6, 3.0, 2.5, 2.0]
    tail_cols = ['orange', 'orange', 'shade', 'orange', 'shade', 'cream', 'cream']
    c.draw_tail(tail_pts, tail_widths, tail_cols)

    # 2. FAR EAR
    fe_tip_x = 18 - ear_twitch_l * 2.0
    fe_tip_y = 9 + ear_twitch_l * 3.0
    c.fill_polygon([(14 + head_offset[0], 22 + head_offset[1]),
                    (fe_tip_x + head_offset[0], fe_tip_y + head_offset[1]),
                    (23 + head_offset[0], 22 + head_offset[1])], 'shade')
    c.fill_polygon([(16 + head_offset[0], 20 + head_offset[1]),
                    (fe_tip_x + 1 + head_offset[0], fe_tip_y + 3 + head_offset[1]),
                    (21 + head_offset[0], 20 + head_offset[1])], 'ear')

    # 3. HAUNCH & BACK
    c.fill_ellipse(37, 47 + by * 0.5, 9, 10 + by * 0.3, 'orange')
    c.fill_ellipse(38, 45 + by * 0.5, 7, 7, 'gold')
    # Flank tabby stripes
    c.fill_polygon([(34, 40 + by * 0.4), (37, 40 + by * 0.4), (33, 48 + by * 0.5), (30, 48 + by * 0.5)], 'shade')
    c.fill_polygon([(39, 41 + by * 0.4), (42, 41 + by * 0.4), (38, 49 + by * 0.5), (35, 49 + by * 0.5)], 'shade')
    c.fill_polygon([(43, 45 + by * 0.5), (46, 45 + by * 0.5), (43, 52 + by * 0.5), (40, 52 + by * 0.5)], 'shade')

    # 4. CHEST & CREAM BIB
    c.fill_ellipse(27, 44 + by, 7, 9, 'orange')
    c.fill_ellipse(24, 45 + by, 5, 7, 'cream')
    c.fill_polygon([(21, 40 + by), (25, 41 + by), (23, 49 + by), (19, 48 + by)], 'cream')

    # 5. FAR FRONT LEG
    if front_paw_mode != 'loaf_tucked':
        ff_lift = -2 if knead_side == 'far' else 0
        c.fill_rect(28, 48 + ff_lift, 4, 11 - ff_lift, 'dark')
        c.fill_rect(28, 56 + ff_lift, 4, 3, 'creamshade')

    # 6. NEAR FRONT LEG / GROOMING PAW
    if front_paw_mode == 'planted':
        nf_lift = -2 if knead_side == 'near' else 0
        c.fill_rect(22, 47 + nf_lift, 5, 12 - nf_lift, 'orange')
        c.fill_rect(22, 55 + nf_lift, 5, 4, 'cream') # white sock
        c.set(24, 58 + nf_lift, 'creamshade') # toe divider
    elif front_paw_mode == 'raise_lick':
        # Paw gracefully raised to side of mouth without obscuring face
        t = paw_lick_phase
        paw_x = 19 + math.sin(t * math.pi) * 2.0
        paw_y = 48 - t * 14.0
        c.fill_polygon([(22, 47), (25, 47), (paw_x + 4, paw_y + 4), (paw_x, paw_y + 4)], 'orange')
        c.fill_ellipse(paw_x + 1.5, paw_y + 1.5, 3.0, 2.5, 'cream')
        c.set(paw_x + 1, paw_y + 2, 'pink')
    elif front_paw_mode == 'wipe_face':
        t = paw_lick_phase
        paw_x = 16 + math.cos(t * math.tau) * 4.0
        paw_y = 26 + math.sin(t * math.tau) * 4.0
        c.fill_polygon([(22, 45), (25, 45), (paw_x + 3, paw_y + 3), (paw_x, paw_y + 3)], 'orange')
        c.fill_ellipse(paw_x + 1.5, paw_y + 1.5, 3.0, 2.5, 'cream')
    elif front_paw_mode == 'loaf_tucked':
        c.fill_ellipse(24, 56.5, 5, 2.0, 'cream')

    # 7. HIND PAW
    c.fill_ellipse(36, 56.5, 4, 2.0, 'cream')
    c.set(38, 57, 'creamshade')

    # 8. HEAD
    c.fill_ellipse(hx, hy, 12, 10, 'orange')
    c.fill_ellipse(hx, hy - 2, 9, 6, 'gold')

    # 9. NEAR EAR
    ne_tip_x = 35 + ear_twitch_r * 2.0
    ne_tip_y = 9 + ear_twitch_r * 3.0
    c.fill_polygon([(29 + head_offset[0], 21 + head_offset[1]),
                    (ne_tip_x + head_offset[0], ne_tip_y + head_offset[1]),
                    (39 + head_offset[0], 22 + head_offset[1])], 'orange')
    c.fill_polygon([(31 + head_offset[0], 20 + head_offset[1]),
                    (ne_tip_x + head_offset[0], ne_tip_y + 3 + head_offset[1]),
                    (37 + head_offset[0], 21 + head_offset[1])], 'pink')
    c.fill_polygon([(32 + head_offset[0], 20 + head_offset[1]),
                    (ne_tip_x + head_offset[0], ne_tip_y + 5 + head_offset[1]),
                    (35 + head_offset[0], 21 + head_offset[1])], 'ear')

    # 10. TABBY MARKINGS (M on forehead, temple stripes)
    c.fill_polygon([(hx - 1, hy - 9), (hx + 1, hy - 9), (hx, hy - 4)], 'shade')
    c.fill_polygon([(hx - 5, hy - 8), (hx - 3, hy - 8), (hx - 3, hy - 4)], 'shade')
    c.fill_polygon([(hx + 3, hy - 8), (hx + 5, hy - 8), (hx + 3, hy - 4)], 'shade')
    c.fill_rect(hx + 9, hy - 2, 3, 1, 'shade')
    c.fill_rect(hx + 8, hy + 1, 3, 1, 'shade')

    # 11. CHEEKS & CREAM MUZZLE
    c.fill_ellipse(hx - 6, hy + 5, 5, 3.5, 'cream')
    c.fill_ellipse(hx + 2, hy + 5, 5, 3.5, 'cream')
    c.fill_rect(hx - 4, hy + 3, 4, 3, 'cream')

    # 12. NOSE
    c.fill_polygon([(hx - 3, hy + 3), (hx - 1, hy + 3), (hx - 2, hy + 5)], 'pink')

    # 13. WHISKERS
    c.set(hx - 11, hy + 5, 'creamshade'); c.set(hx - 12, hy + 4, 'creamshade'); c.set(hx - 13, hy + 4, 'creamshade')
    c.set(hx - 11, hy + 7, 'creamshade'); c.set(hx - 12, hy + 8, 'creamshade'); c.set(hx - 13, hy + 8, 'creamshade')
    c.set(hx + 7, hy + 5, 'creamshade');  c.set(hx + 8, hy + 4, 'creamshade');  c.set(hx + 9, hy + 4, 'creamshade')
    c.set(hx + 7, hy + 7, 'creamshade');  c.set(hx + 8, hy + 8, 'creamshade');  c.set(hx + 9, hy + 8, 'creamshade')

    # 14. BLUSH
    if blush:
        c.fill_ellipse(hx - 10, hy + 4, 2.5, 1.5, 'pink')
        c.fill_ellipse(hx + 6, hy + 4, 3.0, 1.5, 'pink')

    # 15. EYES
    if eye_state == 'open':
        c.fill_ellipse(hx - 8, hy - 1, 2.5, 3.0, 'eye')
        c.fill_ellipse(hx - 8, hy - 0.5, 1.8, 2.2, 'iris')
        c.fill_ellipse(hx - 8, hy - 1.5, 1.5, 1.0, 'irisshade')
        c.fill_ellipse(hx - 7.5, hy - 0.5, 0.8, 1.5, 'eye')
        c.set(hx - 9, hy - 2, 'glint')
        c.fill_ellipse(hx + 4, hy - 1, 2.5, 3.0, 'eye')
        c.fill_ellipse(hx + 4, hy - 0.5, 1.8, 2.2, 'iris')
        c.fill_ellipse(hx + 4, hy - 1.5, 1.5, 1.0, 'irisshade')
        c.fill_ellipse(hx + 4.5, hy - 0.5, 0.8, 1.5, 'eye')
        c.set(hx + 3, hy - 2, 'glint')
    elif eye_state == 'curious_wide':
        c.fill_ellipse(hx - 8, hy - 1, 3.0, 3.5, 'eye')
        c.fill_ellipse(hx - 8, hy - 0.5, 2.2, 2.6, 'iris')
        c.fill_ellipse(hx - 8, hy - 1.5, 1.8, 1.2, 'irisshade')
        c.fill_ellipse(hx - 7.5, hy - 0.5, 1.2, 2.0, 'eye')
        c.set(hx - 9, hy - 2, 'glint'); c.set(hx - 7, hy, 'glint')
        c.fill_ellipse(hx + 4, hy - 1, 3.0, 3.5, 'eye')
        c.fill_ellipse(hx + 4, hy - 0.5, 2.2, 2.6, 'iris')
        c.fill_ellipse(hx + 4, hy - 1.5, 1.8, 1.2, 'irisshade')
        c.fill_ellipse(hx + 4.5, hy - 0.5, 1.2, 2.0, 'eye')
        c.set(hx + 3, hy - 2, 'glint'); c.set(hx + 5, hy, 'glint')
    elif eye_state == 'half':
        c.fill_ellipse(hx - 8, hy - 1, 2.5, 2.0, 'eye')
        c.fill_ellipse(hx - 8, hy, 1.8, 1.2, 'iris')
        c.fill_rect(hx - 10, hy - 3, 5, 2, 'dark')
        c.fill_ellipse(hx + 4, hy - 1, 2.5, 2.0, 'eye')
        c.fill_ellipse(hx + 4, hy, 1.8, 1.2, 'iris')
        c.fill_rect(hx + 2, hy - 3, 5, 2, 'dark')
    elif eye_state == 'closed' or eye_state == 'blink':
        c.draw_line(hx - 10, hy, hx - 6, hy, 'eye', 1)
        c.set(hx - 8, hy + 1, 'eye')
        c.draw_line(hx + 2, hy, hx + 6, hy, 'eye', 1)
        c.set(hx + 4, hy + 1, 'eye')
    elif eye_state == 'happy_squint':
        c.set(hx - 10, hy + 1, 'eye'); c.set(hx - 9, hy, 'eye'); c.set(hx - 8, hy, 'eye'); c.set(hx - 7, hy + 1, 'eye')
        c.set(hx + 2, hy + 1, 'eye');  c.set(hx + 3, hy, 'eye'); c.set(hx + 4, hy, 'eye'); c.set(hx + 5, hy + 1, 'eye')

    # 16. MOUTH
    if mouth_state == 'smile':
        c.set(hx - 3, hy + 6, 'dark'); c.set(hx - 2, hy + 7, 'dark'); c.set(hx - 1, hy + 6, 'dark')
    elif mouth_state == 'meow_small':
        c.fill_ellipse(hx - 2, hy + 6.5, 2.0, 1.8, 'ink')
        c.fill_ellipse(hx - 2, hy + 7.2, 1.2, 0.8, 'pink')
    elif mouth_state == 'meow_wide':
        c.fill_ellipse(hx - 2, hy + 7.0, 2.8, 2.5, 'ink')
        c.fill_ellipse(hx - 2, hy + 8.0, 1.8, 1.2, 'pink')
        c.set(hx - 2, hy + 9, 'creamshade')
    elif mouth_state == 'yawn':
        c.fill_ellipse(hx - 2, hy + 7.5, 3.5, 3.0, 'ink')
        c.fill_ellipse(hx - 2, hy + 8.5, 2.2, 1.5, 'pink')
    elif mouth_state == 'tongue_lick':
        c.fill_ellipse(hx - 4, hy + 6.5, 1.8, 1.2, 'ink')
        c.fill_ellipse(hx - 5, hy + 7.0, 1.5, 1.0, 'pink')

    c.outline('ink')
    return c

def render_walking_tabby(stride_phase, tail_wave_phase, frame_idx=0):
    """Render quadruped lateral sequence feline walk with planted feet and safe tail margins."""
    c = Canvas(64, 64)
    phi = stride_phase * math.tau

    phase_nh = phi
    phase_nf = phi + 0.25 * math.tau
    phase_fh = phi + 0.50 * math.tau
    phase_ff = phi + 0.75 * math.tau

    def leg_motion(phase, base_x):
        s = math.sin(phase)
        c_val = math.cos(phase)
        x_travel = -base_x + c_val * 4.8
        y_lift = -abs(s) * 4.2 if s < 0 else 0.0
        return x_travel, y_lift

    body_y = 44 + abs(math.sin(phi * 2.0)) * 1.0
    head_y = 31 + math.sin(phi * 2.0) * 0.8
    head_x = 22

    # Subtle continuous ear sway across 72 frames for unique keyframes
    ear_sway = math.sin(frame_idx / 72.0 * math.tau * 2.0) * 0.4

    # 1. FAR LEGS
    fh_dx, fh_dy = leg_motion(phase_fh, 0)
    fh_paw_x = 44 + fh_dx
    fh_paw_y = 58 + fh_dy
    c.fill_polygon([(43, body_y - 2), (47, body_y - 2), (fh_paw_x + 3, fh_paw_y - 3), (fh_paw_x, fh_paw_y - 3)], 'dark')
    c.fill_rect(fh_paw_x, fh_paw_y - 2, 4, 3, 'creamshade')

    ff_dx, ff_dy = leg_motion(phase_ff, 0)
    ff_paw_x = 27 + ff_dx
    ff_paw_y = 58 + ff_dy
    c.fill_polygon([(27, body_y - 1), (31, body_y - 1), (ff_paw_x + 3, ff_paw_y - 3), (ff_paw_x, ff_paw_y - 3)], 'dark')
    c.fill_rect(ff_paw_x, ff_paw_y - 2, 4, 3, 'creamshade')

    # 2. TAIL (Strictly stays inside x <= 56, leaving > 7px margin from right edge)
    sway = math.sin(tail_wave_phase) * 2.2
    sway_tip = math.sin(tail_wave_phase - 1.2) * 3.2
    tail_pts = [
        (44, body_y - 4),
        (48, body_y - 7),
        (51 + sway * 0.4, body_y - 12),
        (52 + sway * 0.7, body_y - 18),
        (49 + sway_tip * 0.8, body_y - 23),
        (44 + sway_tip * 0.6, body_y - 25)
    ]
    tail_widths = [4.8, 4.2, 3.6, 3.0, 2.5, 2.0]
    tail_cols = ['orange', 'orange', 'shade', 'orange', 'shade', 'cream']
    c.draw_tail(tail_pts, tail_widths, tail_cols)

    # 3. TORSO
    c.fill_ellipse(35, body_y, 14, 8, 'orange')
    c.fill_ellipse(36, body_y - 2, 11, 5, 'gold')
    c.fill_ellipse(28, body_y + 1, 6, 6, 'cream')
    for sx in (33, 39, 44):
        c.fill_polygon([(sx, body_y - 6), (sx + 3, body_y - 6), (sx + 1, body_y + 3), (sx - 2, body_y + 3)], 'shade')

    # 4. NEAR LEGS
    nh_dx, nh_dy = leg_motion(phase_nh, 0)
    nh_paw_x = 42 + nh_dx
    nh_paw_y = 58 + nh_dy
    c.fill_polygon([(41, body_y - 3), (46, body_y - 3), (nh_paw_x + 4, nh_paw_y - 3), (nh_paw_x, nh_paw_y - 3)], 'orange')
    c.fill_rect(nh_paw_x, nh_paw_y - 2, 4, 3, 'cream')
    c.set(nh_paw_x + 2, nh_paw_y, 'creamshade')

    nf_dx, nf_dy = leg_motion(phase_nf, 0)
    nf_paw_x = 24 + nf_dx
    nf_paw_y = 58 + nf_dy
    c.fill_polygon([(24, body_y - 2), (28, body_y - 2), (nf_paw_x + 4, nf_paw_y - 3), (nf_paw_x, nf_paw_y - 3)], 'orange')
    c.fill_rect(nf_paw_x, nf_paw_y - 2, 4, 3, 'cream')
    c.set(nf_paw_x + 2, nf_paw_y, 'creamshade')

    # 5. HEAD & EARS
    c.fill_ellipse(head_x, head_y, 11, 9, 'orange')
    c.fill_ellipse(head_x, head_y - 2, 8, 5, 'gold')
    # Far ear
    c.fill_polygon([(head_x - 9, head_y - 5), (head_x - 6 - ear_sway, head_y - 15), (head_x - 2, head_y - 6)], 'shade')
    c.fill_polygon([(head_x - 8, head_y - 6), (head_x - 6 - ear_sway, head_y - 13), (head_x - 3, head_y - 7)], 'ear')
    # Near ear
    c.fill_polygon([(head_x + 2, head_y - 6), (head_x + 7 + ear_sway, head_y - 15), (head_x + 11, head_y - 5)], 'orange')
    c.fill_polygon([(head_x + 4, head_y - 6), (head_x + 7 + ear_sway, head_y - 13), (head_x + 9, head_y - 6)], 'pink')
    # Forehead stripes
    c.fill_polygon([(head_x - 2, head_y - 7), (head_x, head_y - 7), (head_x - 1, head_y - 3)], 'shade')
    c.fill_polygon([(head_x - 5, head_y - 6), (head_x - 4, head_y - 6), (head_x - 3, head_y - 3)], 'shade')
    c.fill_polygon([(head_x + 2, head_y - 6), (head_x + 3, head_y - 6), (head_x + 2, head_y - 3)], 'shade')
    # Muzzle & Nose
    c.fill_ellipse(head_x - 5, head_y + 4, 4, 3, 'cream')
    c.fill_ellipse(head_x + 1, head_y + 4, 4, 3, 'cream')
    c.fill_polygon([(head_x - 3, head_y + 2), (head_x - 1, head_y + 2), (head_x - 2, head_y + 4)], 'pink')
    # Whiskers
    c.set(head_x - 9, head_y + 4, 'creamshade'); c.set(head_x - 10, head_y + 3, 'creamshade')
    c.set(head_x + 5, head_y + 4, 'creamshade'); c.set(head_x + 6, head_y + 3, 'creamshade')
    # Eyes
    c.fill_ellipse(head_x - 6, head_y - 1, 2.2, 2.6, 'eye')
    c.fill_ellipse(head_x - 6, head_y - 0.5, 1.5, 1.8, 'iris')
    c.set(head_x - 7, head_y - 2, 'glint')
    c.fill_ellipse(head_x + 3, head_y - 1, 2.2, 2.6, 'eye')
    c.fill_ellipse(head_x + 3, head_y - 0.5, 1.5, 1.8, 'iris')
    c.set(head_x + 2, head_y - 2, 'glint')

    c.outline('ink')
    return c

def render_stretching_tabby(t, frame_idx=0):
    """Render classic feline play-bow downward stretch."""
    c = Canvas(64, 64)
    stretch = math.sin(t * math.pi)
    tail_flick = math.sin(frame_idx / 48.0 * math.tau * 2.0) * 1.2

    chest_y = 45 + stretch * 8.0
    head_y = 27 + stretch * 13.0
    head_x = 26 - stretch * 4.0
    hip_y = 47 - stretch * 5.0
    hip_x = 42 + stretch * 2.5

    # 1. TAIL
    tail_pts = [
        (hip_x, hip_y),
        (hip_x + 5, hip_y - 6),
        (hip_x + 7, hip_y - 16),
        (hip_x + 3 + tail_flick * 0.5, hip_y - 25),
        (hip_x - 3 + tail_flick, hip_y - 29),
        (hip_x - 7 + tail_flick * 0.8, hip_y - 25)
    ]
    tail_widths = [5.2, 4.6, 4.0, 3.4, 2.8, 2.0]
    tail_cols = ['orange', 'orange', 'shade', 'orange', 'shade', 'cream']
    c.draw_tail(tail_pts, tail_widths, tail_cols)

    # 2. HAUNCH & SPINE
    c.fill_ellipse(hip_x - 3, hip_y + 4, 8, 9, 'orange')
    c.fill_polygon([(hip_x - 5, hip_y), (head_x + 6, chest_y - 3),
                    (head_x + 4, chest_y + 4), (hip_x - 7, hip_y + 8)], 'orange')
    c.fill_ellipse(head_x + 5, chest_y, 6, 5, 'cream')

    # 3. EXTENDED FRONT PAWS
    paw_front_x = 18 - stretch * 4.0
    c.fill_polygon([(head_x + 2, chest_y + 2), (paw_front_x + 6, 57),
                    (paw_front_x, 57), (head_x - 2, chest_y + 2)], 'orange')
    c.fill_rect(paw_front_x - 2, 56, 8, 3, 'cream')

    # 4. HIND PAW
    c.fill_ellipse(hip_x - 4, 56.5, 4, 2.0, 'cream')

    # 5. HEAD
    c.fill_ellipse(head_x, head_y, 11, 9, 'orange')
    c.fill_polygon([(head_x - 8, head_y - 3), (head_x - 12, head_y - 10), (head_x - 4, head_y - 5)], 'shade')
    c.fill_polygon([(head_x + 3, head_y - 3), (head_x + 8, head_y - 11), (head_x + 9, head_y - 4)], 'orange')
    c.fill_polygon([(head_x + 4, head_y - 4), (head_x + 7, head_y - 9), (head_x + 8, head_y - 5)], 'pink')
    c.fill_ellipse(head_x - 4, head_y + 3, 4, 3, 'cream')
    c.fill_ellipse(head_x + 1, head_y + 3, 4, 3, 'cream')
    c.fill_polygon([(head_x - 2, head_y + 2), (head_x, head_y + 2), (head_x - 1, head_y + 4)], 'pink')
    c.draw_line(head_x - 7, head_y - 1, head_x - 4, head_y - 1, 'eye', 1)
    c.draw_line(head_x + 2, head_y - 1, head_x + 5, head_y - 1, 'eye', 1)

    c.outline('ink')
    return c

def render_loaf_transition(progression, yawn_amount=0.0):
    """Unified continuous transition between sitting pose (p=0) and sleeping loaf (p=1).
    Guarantees continuous physical interpolation with ZERO silhouette pops."""
    p = max(0.0, min(1.0, float(progression)))
    if p <= 0.0 and yawn_amount == 0.0:
        return render_sitting_tabby(breath_y=0.0, eye_state='open', mouth_state='smile', tail_wave_phase=0.0)
    if p >= 1.0 and yawn_amount == 0.0:
        return render_sleeping_tabby(breath_phase=0.0, zzz_list=[])

    s_val = p * p * (3.0 - 2.0 * p) # Hermite smoothstep
    c = Canvas(64, 64)

    # 1. TAIL INTERPOLATION (7 control points)
    # Sitting tail at phase 0:
    sway_mid = math.sin(-0.7) * 3.4
    sway_tip = math.sin(-1.4) * 4.2
    sit_pts = [
        (41.0, 50.0),
        (45.0, 47.0),
        (49.0, 40.0),
        (50.0 + sway_mid * 0.6, 30.0),
        (47.0 + sway_tip * 0.7, 21.0),
        (42.0 + sway_tip * 0.8, 18.0),
        (38.0 + sway_tip * 0.6, 20.0)
    ]
    sit_widths = [5.2, 4.8, 4.2, 3.6, 3.0, 2.5, 2.0]
    sit_cols = ['orange', 'orange', 'shade', 'orange', 'shade', 'cream', 'cream']

    # Sleeping tail at rest:
    sleep_pts = [
        (47.0, 51.0),
        (50.0, 52.0),
        (51.0, 54.0),
        (47.0, 56.0),
        (37.0, 57.5),
        (27.0, 57.0),
        (21.0, 54.0)
    ]
    sleep_widths = [4.5, 4.2, 3.8, 3.5, 3.0, 2.5, 2.0]
    sleep_cols = ['orange', 'orange', 'orange', 'shade', 'shade', 'cream', 'cream']

    tail_pts = []
    tail_widths = []
    tail_cols = []
    for k in range(7):
        tx = sit_pts[k][0] * (1.0 - s_val) + sleep_pts[k][0] * s_val
        ty = sit_pts[k][1] * (1.0 - s_val) + sleep_pts[k][1] * s_val
        tail_pts.append((tx, ty))
        tw = sit_widths[k] * (1.0 - s_val) + sleep_widths[k] * s_val
        tail_widths.append(tw)
        tail_cols.append(sleep_cols[k] if s_val > 0.5 else sit_cols[k])

    c.draw_tail(tail_pts, tail_widths, tail_cols)

    # 2. BODY & HAUNCH INTERPOLATION
    bx = 37.0 * (1.0 - s_val) + 36.0 * s_val
    by = 47.0 * (1.0 - s_val) + 49.0 * s_val
    brx = 9.0 * (1.0 - s_val) + 14.0 * s_val
    bry = 10.0 * (1.0 - s_val) + 9.0 * s_val
    c.fill_ellipse(bx, by, brx, bry, 'orange')
    c.fill_ellipse(bx + 1.0, by - 2.0, brx * 0.78, bry * 0.7, 'gold')

    # Tabby stripes on flank
    for sit_s, sleep_s in [
        ([(34, 40), (37, 40), (33, 48), (30, 48)], [(33, 42), (36, 42), (32, 50), (29, 50)]),
        ([(39, 41), (42, 41), (38, 49), (35, 49)], [(39, 43), (42, 43), (38, 51), (35, 51)]),
        ([(43, 45), (46, 45), (43, 52), (40, 52)], [(44, 46), (47, 46), (44, 53), (41, 53)]),
    ]:
        poly = []
        for p_idx in range(4):
            px = sit_s[p_idx][0] * (1.0 - s_val) + sleep_s[p_idx][0] * s_val
            py = sit_s[p_idx][1] * (1.0 - s_val) + sleep_s[p_idx][1] * s_val
            poly.append((px, py))
        c.fill_polygon(poly, 'shade')

    # CHEST & CREAM BIB
    if s_val < 0.75:
        alpha_b = (0.75 - s_val) / 0.75
        cx = 27.0 - 1.0 * s_val
        cy = 44.0 + 4.0 * s_val
        crx = 7.0 - 2.0 * s_val
        cry = 9.0 - 3.0 * s_val
        c.fill_ellipse(cx, cy, crx, cry, 'orange')
        c.fill_ellipse(cx - 3.0, cy + 1.0, 5.0 * alpha_b + 1.0, 7.0 * alpha_b + 1.0, 'cream')

    # 3. FORELEGS & HIND PAWS
    if s_val < 0.65:
        leg_t = s_val / 0.65
        ff_y = 48.0 + leg_t * 6.0
        ff_h = max(2.0, 11.0 * (1.0 - leg_t))
        c.fill_rect(28 - 2 * leg_t, ff_y, 4, ff_h, 'dark')
        c.fill_rect(28 - 2 * leg_t, ff_y + ff_h - 3, 4, 3, 'creamshade')

        nf_y = 47.0 + leg_t * 6.0
        nf_h = max(3.0, 12.0 * (1.0 - leg_t))
        c.fill_rect(22, nf_y, 5, nf_h, 'orange')
        c.fill_rect(22, nf_y + nf_h - 4, 5, 4, 'cream')
        c.set(24, int(nf_y + nf_h - 1), 'creamshade')
    else:
        c.fill_ellipse(24, 56.5, 5.0, 2.0, 'cream')

    if s_val < 0.8:
        c.fill_ellipse(36, 56.5, 4.0 * (1.0 - 0.3 * s_val), 2.0, 'cream')
        if s_val < 0.4:
            c.set(38, 57, 'creamshade')

    # 4. HEAD & EARS INTERPOLATION
    hx = 26.0 * (1.0 - s_val) + 23.0 * s_val
    hy = 27.0 * (1.0 - s_val) + 47.0 * s_val
    hrx = 12.0 * (1.0 - s_val) + 10.0 * s_val
    hry = 10.0 * (1.0 - s_val) + 8.0 * s_val
    c.fill_ellipse(hx, hy, hrx, hry, 'orange')
    c.fill_ellipse(hx, hy - 2.0 + 1.0 * s_val, hrx * 0.75, hry * 0.62, 'gold')

    # Far ear
    fe_base = [(14.0 * (1.0 - s_val) + (hx - 8) * s_val, 22.0 * (1.0 - s_val) + (hy - 2) * s_val),
               (18.0 * (1.0 - s_val) + (hx - 9) * s_val, 9.0 * (1.0 - s_val) + (hy - 10) * s_val),
               (23.0 * (1.0 - s_val) + (hx - 3) * s_val, 22.0 * (1.0 - s_val) + (hy - 4) * s_val)]
    c.fill_polygon(fe_base, 'shade')
    c.fill_polygon([(fe_base[0][0] + 1, fe_base[0][1] - 1),
                    (fe_base[1][0] + 0.5, fe_base[1][1] + 2),
                    (fe_base[2][0] - 1, fe_base[2][1] - 1)], 'ear')

    # Near ear
    ne_base = [(29.0 * (1.0 - s_val) + (hx + 2) * s_val, 21.0 * (1.0 - s_val) + (hy - 3) * s_val),
               (35.0 * (1.0 - s_val) + (hx + 6) * s_val, 9.0 * (1.0 - s_val) + (hy - 10) * s_val),
               (39.0 * (1.0 - s_val) + (hx + 8) * s_val, 22.0 * (1.0 - s_val) + (hy - 3) * s_val)]
    c.fill_polygon(ne_base, 'orange')
    c.fill_polygon([(ne_base[0][0] + 1, ne_base[0][1] - 1),
                    (ne_base[1][0], ne_base[1][1] + 3),
                    (ne_base[2][0] - 1, ne_base[2][1] - 1)], 'pink')

    # Forehead M stripes
    for off in (-4.0, 0.0, 4.0):
        mx = hx + off * (1.0 - 0.2 * s_val)
        c.fill_polygon([(mx - 1, hy - 8 + 3 * s_val), (mx + 1, hy - 8 + 3 * s_val), (mx, hy - 4 + 1 * s_val)], 'shade')

    # Cheeks & Cream Muzzle
    mrx = 5.0 * (1.0 - s_val) + 4.0 * s_val
    mry = 3.5 * (1.0 - s_val) + 3.0 * s_val
    c.fill_ellipse(hx - 6.0 + 2.0 * s_val, hy + 5.0 - 2.0 * s_val, mrx, mry, 'cream')
    c.fill_ellipse(hx + 2.0 - 1.0 * s_val, hy + 5.0 - 2.0 * s_val, mrx, mry, 'cream')
    c.fill_rect(hx - 4.0 + 2.0 * s_val, hy + 3.0 - 1.0 * s_val, 4, 3, 'cream')

    # Nose
    c.fill_polygon([(hx - 3.0 + 1.0 * s_val, hy + 3.0 - 1.0 * s_val),
                    (hx - 1.0 + 1.0 * s_val, hy + 3.0 - 1.0 * s_val),
                    (hx - 2.0 + 1.0 * s_val, hy + 5.0 - 1.0 * s_val)], 'pink')

    # Whiskers
    if s_val < 0.4:
        c.set(hx - 11, hy + 5, 'creamshade'); c.set(hx - 12, hy + 4, 'creamshade')
        c.set(hx + 7, hy + 5, 'creamshade');  c.set(hx + 8, hy + 4, 'creamshade')

    # 5. EYES
    if s_val < 0.28:
        c.fill_ellipse(hx - 8, hy - 1, 2.5, 3.0, 'eye')
        c.fill_ellipse(hx - 8, hy - 0.5, 1.8, 2.2, 'iris')
        c.fill_ellipse(hx - 8, hy - 1.5, 1.5, 1.0, 'irisshade')
        c.fill_ellipse(hx - 7.5, hy - 0.5, 0.8, 1.5, 'eye')
        c.set(hx - 9, hy - 2, 'glint')
        c.fill_ellipse(hx + 4, hy - 1, 2.5, 3.0, 'eye')
        c.fill_ellipse(hx + 4, hy - 0.5, 1.8, 2.2, 'iris')
        c.fill_ellipse(hx + 4, hy - 1.5, 1.5, 1.0, 'irisshade')
        c.fill_ellipse(hx + 4.5, hy - 0.5, 0.8, 1.5, 'eye')
        c.set(hx + 3, hy - 2, 'glint')
    elif s_val < 0.58:
        c.fill_ellipse(hx - 8 + 1 * s_val, hy - 1, 2.4, 1.8, 'eye')
        c.fill_ellipse(hx - 8 + 1 * s_val, hy, 1.7, 1.2, 'iris')
        c.fill_ellipse(hx + 4 - 1 * s_val, hy - 1, 2.4, 1.8, 'eye')
        c.fill_ellipse(hx + 4 - 1 * s_val, hy, 1.7, 1.2, 'iris')
    else:
        c.draw_line(hx - 7, hy, hx - 4, hy, 'eye', 1)
        c.set(hx - 5, hy + 1, 'eye')
        c.draw_line(hx + 2, hy, hx + 5, hy, 'eye', 1)
        c.set(hx + 3, hy + 1, 'eye')

    # 6. MOUTH / YAWN
    if yawn_amount > 0.08:
        c.fill_ellipse(hx - 1, hy + 6.5, 2.6 * yawn_amount + 0.8, 2.0 * yawn_amount + 0.8, 'ink')
        c.fill_ellipse(hx - 1, hy + 7.5, 1.8 * yawn_amount + 0.4, 1.2 * yawn_amount + 0.4, 'pink')
    else:
        c.set(hx - 2, hy + 6, 'dark'); c.set(hx - 1, hy + 7, 'dark'); c.set(hx, hy + 6, 'dark')

    c.outline('ink')
    return c

def render_sleeping_tabby(breath_phase, zzz_list):
    """Render curled sleeping loaf with slow deep breathing (1.5s per breath cycle)."""
    c = Canvas(64, 64)
    by = math.sin(breath_phase * math.tau) * 0.8

    # 1. CURLED SLEEPING BODY
    c.fill_ellipse(36, 49 + by * 0.5, 14, 9 + by * 0.5, 'orange')
    c.fill_ellipse(37, 47 + by * 0.5, 11, 6, 'gold')
    c.fill_polygon([(33, 42 + by * 0.4), (36, 42 + by * 0.4), (32, 50 + by * 0.5), (29, 50 + by * 0.5)], 'shade')
    c.fill_polygon([(39, 43 + by * 0.4), (42, 43 + by * 0.4), (38, 51 + by * 0.5), (35, 51 + by * 0.5)], 'shade')
    c.fill_polygon([(44, 46 + by * 0.5), (47, 46 + by * 0.5), (44, 53 + by * 0.5), (41, 53 + by * 0.5)], 'shade')

    # 2. CURLED TAIL (Safely within frame, max x <= 53)
    twitch = math.sin(breath_phase * math.tau * 2.0) * 1.5
    tail_pts = [
        (47, 51),
        (50, 52),
        (51, 54),
        (47, 56),
        (37, 57.5),
        (27, 57),
        (21 + twitch, 54)
    ]
    tail_widths = [4.5, 4.2, 3.8, 3.5, 3.0, 2.5, 2.0]
    tail_cols = ['orange', 'orange', 'orange', 'shade', 'shade', 'cream', 'cream']
    c.draw_tail(tail_pts, tail_widths, tail_cols)

    # 3. TUCKED FRONT PAWS
    c.fill_ellipse(24, 56.5, 5, 2.0, 'cream')

    # 4. HEAD
    hx, hy = 23, 47 + by * 0.4
    c.fill_ellipse(hx, hy, 10, 8, 'orange')
    c.fill_ellipse(hx, hy - 1, 7, 5, 'gold')
    c.fill_polygon([(hx - 8, hy - 2), (hx - 9, hy - 10), (hx - 3, hy - 4)], 'shade')
    c.fill_polygon([(hx - 7, hy - 3), (hx - 8, hy - 8), (hx - 4, hy - 4)], 'ear')
    c.fill_polygon([(hx + 2, hy - 3), (hx + 6, hy - 10), (hx + 8, hy - 3)], 'orange')
    c.fill_polygon([(hx + 3, hy - 3), (hx + 5, hy - 8), (hx + 7, hy - 3)], 'pink')
    c.fill_ellipse(hx - 4, hy + 3, 4, 3, 'cream')
    c.fill_ellipse(hx + 1, hy + 3, 4, 3, 'cream')
    c.fill_polygon([(hx - 2, hy + 2), (hx, hy + 2), (hx - 1, hy + 4)], 'pink')
    c.draw_line(hx - 7, hy, hx - 4, hy, 'eye', 1)
    c.set(hx - 5, hy + 1, 'eye')
    c.draw_line(hx + 2, hy, hx + 5, hy, 'eye', 1)
    c.set(hx + 3, hy + 1, 'eye')

    c.outline('ink')

    for zx, zy, scale in zzz_list:
        c.draw_zzz(zx, zy, scale, 'sleep')

    return c

def render_turning_tabby(step):
    """Render continuous 12-frame standing quadruped turnaround keyframes (Left 3/4 -> Front -> Right 3/4).
    All 12 frames are distinct in-betweens keeping feet planted on floor y=58..59."""
    if step > 5:
        # Symmetrical second half: mirrored horizontally from first half
        base_c = render_turning_tabby(11 - step)
        c = Canvas(64, 64)
        c.grid = np.fliplr(base_c.grid)
        return c

    # First half: step 0 to 5 (Left profile at 0 -> Front-facing at 5)
    if step == 0:
        return render_walking_tabby(0.0, 0.0, 0)

    u = step / 5.5
    rot = u * u * (3.0 - 2.0 * u) # Hermite smoothstep

    c = Canvas(64, 64)
    body_y = 44.0

    # 1. TAIL
    t0_pts = [(44.0, 40.0), (48.0, 37.0), (51.0, 32.0), (52.0, 26.0), (49.0, 21.0), (44.0, 19.0)]
    t1_pts = [(32.0, 40.0), (34.0, 37.0), (36.0, 32.0), (36.0, 26.0), (35.0, 21.0), (33.0, 18.0)]
    tail_pts = []
    for k in range(6):
        tx = t0_pts[k][0] * (1.0 - rot) + t1_pts[k][0] * rot
        ty = t0_pts[k][1] * (1.0 - rot) + t1_pts[k][1] * rot
        tail_pts.append((tx, ty))
    tail_widths = [4.8, 4.2, 3.6, 3.0, 2.5, 2.0]
    tail_cols = ['orange', 'orange', 'shade', 'orange', 'shade', 'cream']
    c.draw_tail(tail_pts, tail_widths, tail_cols)

    # 2. FAR LEGS (Far hind, far front)
    fh_paw_x = 39.2 * (1.0 - rot) + 35.0 * rot
    fh_paw_y = 58.0
    ff_paw_x = 27.0 * (1.0 - rot) + 37.0 * rot
    ff_paw_y = 53.8 * (1.0 - rot) + 58.0 * rot

    fh_hip_x1 = 43.0 * (1.0 - rot) + 33.0 * rot
    fh_hip_x2 = 47.0 * (1.0 - rot) + 37.0 * rot
    c.fill_polygon([(fh_hip_x1, body_y - 2), (fh_hip_x2, body_y - 2),
                    (fh_paw_x + 3, fh_paw_y - 3), (fh_paw_x, fh_paw_y - 3)], 'dark')
    c.fill_rect(fh_paw_x, fh_paw_y - 2, 4, 3, 'creamshade')

    ff_hip_x1 = 27.0 * (1.0 - rot) + 35.0 * rot
    ff_hip_x2 = 31.0 * (1.0 - rot) + 39.0 * rot
    c.fill_polygon([(ff_hip_x1, body_y - 1), (ff_hip_x2, body_y - 1),
                    (ff_paw_x + 3, ff_paw_y - 3), (ff_paw_x, ff_paw_y - 3)], 'dark')
    c.fill_rect(ff_paw_x, ff_paw_y - 2, 4, 3, 'creamshade')

    # 3. TORSO
    bx = 35.0 * (1.0 - rot) + 32.0 * rot
    brx = 14.0 * (1.0 - rot) + 10.5 * rot
    bry = 8.0 * (1.0 - rot) + 9.0 * rot
    c.fill_ellipse(bx, body_y, brx, bry, 'orange')
    c.fill_ellipse(bx + 1.0 * (1.0 - rot), body_y - 2.0, brx * 0.78, bry * 0.65, 'gold')

    # Tabby stripes on flank
    for sx_b in (33, 39, 44):
        sx = sx_b * (1.0 - rot) + (32 + (sx_b - 38) * 0.45) * rot
        c.fill_polygon([(sx, body_y - 6), (sx + 3, body_y - 6), (sx + 1, body_y + 3), (sx - 2, body_y + 3)], 'shade')

    # Cream bib
    bib_x = 28.0 * (1.0 - rot) + 32.0 * rot
    c.fill_ellipse(bib_x, body_y + 1.0, 6.0, 6.0 + 1.0 * rot, 'cream')

    # 4. NEAR LEGS (Near hind, near front)
    nh_paw_x = 46.8 * (1.0 - rot) + 29.0 * rot
    nh_paw_y = 58.0
    nf_paw_x = 24.0 * (1.0 - rot) + 27.0 * rot
    nf_paw_y = 58.0

    nh_hip_x1 = 41.0 * (1.0 - rot) + 27.0 * rot
    nh_hip_x2 = 46.0 * (1.0 - rot) + 31.0 * rot
    c.fill_polygon([(nh_hip_x1, body_y - 3), (nh_hip_x2, body_y - 3),
                    (nh_paw_x + 4, nh_paw_y - 3), (nh_paw_x, nh_paw_y - 3)], 'orange')
    c.fill_rect(nh_paw_x, nh_paw_y - 2, 4, 3, 'cream')
    c.set(nh_paw_x + 2, nh_paw_y, 'creamshade')

    nf_hip_x1 = 24.0 * (1.0 - rot) + 25.0 * rot
    nf_hip_x2 = 28.0 * (1.0 - rot) + 29.0 * rot
    c.fill_polygon([(nf_hip_x1, body_y - 2), (nf_hip_x2, body_y - 2),
                    (nf_paw_x + 4, nf_paw_y - 3), (nf_paw_x, nf_paw_y - 3)], 'orange')
    c.fill_rect(nf_paw_x, nf_paw_y - 2, 4, 3, 'cream')
    c.set(nf_paw_x + 2, nf_paw_y, 'creamshade')

    # 5. HEAD & EARS
    hx = 22.0 * (1.0 - rot) + 32.0 * rot
    hy = 31.0 * (1.0 - rot) + 30.0 * rot
    hrx = 11.0 * (1.0 - rot) + 11.5 * rot
    hry = 9.0 * (1.0 - rot) + 9.5 * rot
    c.fill_ellipse(hx, hy, hrx, hry, 'orange')
    c.fill_ellipse(hx, hy - 2.0, hrx * 0.73, hry * 0.58, 'gold')

    # Far ear (Left ear)
    fe_tip_x = (hx - 6.0) * (1.0 - rot) + (hx - 8.0) * rot
    fe_tip_y = (hy - 15.0)
    c.fill_polygon([(hx - 9 + 2*rot, hy - 5), (fe_tip_x, fe_tip_y), (hx - 2, hy - 6)], 'shade' if rot < 0.65 else 'orange')
    c.fill_polygon([(hx - 8 + 2*rot, hy - 6), (fe_tip_x, fe_tip_y + 2), (hx - 3, hy - 7)], 'ear' if rot < 0.65 else 'pink')

    # Near ear (Right ear)
    ne_tip_x = (hx + 7.0) * (1.0 - rot) + (hx + 8.0) * rot
    ne_tip_y = (hy - 15.0)
    c.fill_polygon([(hx + 2, hy - 6), (ne_tip_x, ne_tip_y), (hx + 11 - 2*rot, hy - 5)], 'orange')
    c.fill_polygon([(hx + 4, hy - 6), (ne_tip_x, ne_tip_y + 2), (hx + 9 - 2*rot, hy - 6)], 'pink')

    # Tabby M stripes
    c.fill_polygon([(hx - 2 + 1*rot, hy - 7), (hx + 1*rot, hy - 7), (hx - 1 + 1*rot, hy - 3)], 'shade')
    c.fill_polygon([(hx - 5 + 2*rot, hy - 6), (hx - 4 + 2*rot, hy - 6), (hx - 3 + 1*rot, hy - 3)], 'shade')
    c.fill_polygon([(hx + 2 - 2*rot, hy - 6), (hx + 3 - 2*rot, hy - 6), (hx + 2 - 1*rot, hy - 3)], 'shade')

    # Muzzle & Nose
    c.fill_ellipse(hx - 5.0 * (1.0 - rot) - 3.0 * rot, hy + 4.0, 4.0, 3.0, 'cream')
    c.fill_ellipse(hx + 1.0 * (1.0 - rot) + 3.0 * rot, hy + 4.0, 4.0, 3.0, 'cream')
    nx = (hx - 2.0) * (1.0 - rot) + hx * rot
    c.fill_polygon([(nx - 1, hy + 2), (nx + 1, hy + 2), (nx, hy + 4)], 'pink')

    # Whiskers
    c.set(hx - 9, hy + 4, 'creamshade'); c.set(hx - 10, hy + 3, 'creamshade')
    c.set(hx + 5 * (1.0 - rot) + 9 * rot, hy + 4, 'creamshade'); c.set(hx + 6 * (1.0 - rot) + 10 * rot, hy + 3, 'creamshade')

    # Eyes
    el_x = (hx - 6.0) * (1.0 - rot) + (hx - 5.0) * rot
    c.fill_ellipse(el_x, hy - 1, 2.2, 2.6, 'eye')
    c.fill_ellipse(el_x, hy - 0.5, 1.5, 1.8, 'iris')
    c.set(el_x - 1, hy - 2, 'glint')

    er_x = (hx + 3.0) * (1.0 - rot) + (hx + 5.0) * rot
    c.fill_ellipse(er_x, hy - 1, 2.2, 2.6, 'eye')
    c.fill_ellipse(er_x, hy - 0.5, 1.5, 1.8, 'iris')
    c.set(er_x - 1, hy - 2, 'glint')

    c.outline('ink')
    return c

# -----------------------------------------------------------------------------
# CLIP BUILDERS
# -----------------------------------------------------------------------------
def build_clip_idle(count=144):
    """Build idle clip (144 frames, 6s at 24fps): rhythmic breathing, blinking, ear twitch, tail swish."""
    frames = []
    for i in range(count):
        t = i / count
        breath_y = math.sin(t * 4.0 * math.pi) * 0.8
        tail_wave = t * 4.0 * math.pi # harmonic periodic wave wraps perfectly across strip

        eye = 'open'
        if 48 <= i <= 51 or 112 <= i <= 115:
            eye = 'half'
        elif 52 <= i <= 54 or 116 <= i <= 118:
            eye = 'blink'
        elif 55 <= i <= 56 or 119 <= i <= 120:
            eye = 'half'

        ear_r = math.sin((i - 32) / 8.0 * math.pi) if 32 <= i <= 40 else 0.0
        ear_l = math.sin((i - 96) / 8.0 * math.pi) if 96 <= i <= 104 else 0.0

        c = render_sitting_tabby(
            breath_y=breath_y,
            eye_state=eye,
            mouth_state='smile',
            ear_twitch_l=ear_l,
            ear_twitch_r=ear_r,
            tail_wave_phase=tail_wave
        )
        frames.append(c.grid)
    return frames

def build_clip_walk(count=72):
    """Build quadruped walk clip (72 frames, 3 full strides at 24fps with continuous secondary tail wave)."""
    frames = []
    for i in range(count):
        stride_phase = (i % 24) / 24.0
        # Continuous tail wave across all 72 frames guarantees 72 unique keyframes
        tail_wave = (i / count) * 6.0 * math.pi # exact harmonic gait wave (3 full strides)
        c = render_walking_tabby(stride_phase, tail_wave, frame_idx=i)
        frames.append(c.grid)
    return frames

def build_clip_stretching(count=48):
    """Build feline downward dog stretch clip (48 frames, 2s)."""
    frames = []
    for i in range(count):
        t = i / (count - 1)
        c = render_stretching_tabby(t, frame_idx=i)
        frames.append(c.grid)
    return frames

def build_clip_laying(count=36):
    """Build smooth transition folding forelegs into loaf (36 frames, 1.5s). Zero silhouette pops!"""
    frames = []
    for i in range(count):
        p = i / (count - 1)
        c = render_loaf_transition(p, yawn_amount=0.0)
        frames.append(c.grid)
    return frames

def build_clip_sleeping1(count=144):
    """Build deep slumber clip (144 frames, 6s): 4 slow breathing cycles (1.5s per breath) and floating Zs."""
    frames = []
    for i in range(count):
        t = i / count
        breath_phase = t * 4.0 # exactly 4 breaths over 144 frames = 1.5s per breath
        zzz_list = []
        z1_t = (i % 48) / 48.0
        zzz_list.append((int(26 + z1_t * 18), int(40 - z1_t * 22), 1.0))
        z2_t = ((i + 24) % 48) / 48.0
        zzz_list.append((int(28 + z2_t * 16), int(42 - z2_t * 22), 1.0))

        c = render_sleeping_tabby(breath_phase, zzz_list)
        frames.append(c.grid)
    return frames

def build_clip_waking(count=48):
    """Build waking up clip (48 frames, 2s): smooth loaf unfold with kitten yawn. Zero silhouette pops!"""
    frames = []
    for i in range(count):
        p = 1.0 - (i / (count - 1))
        # Yawn peaks around frame 18..32
        yawn_t = math.sin((i / (count - 1)) * math.pi)
        yawn_amt = max(0.0, math.sin(yawn_t * math.pi)) if 12 <= i <= 36 else 0.0
        c = render_loaf_transition(p, yawn_amount=yawn_amt)
        frames.append(c.grid)
    return frames

def build_clip_meow(count=58):
    """Build meow vocalization clip (58 frames, ~2.4s)."""
    frames = []
    for i in range(count):
        t = i / (count - 1)
        tail_wave = t * 4.0 * math.pi
        if t < 0.20:
            lift = -math.sin(t / 0.20 * math.pi * 0.5) * 2.0
            c = render_sitting_tabby(head_offset=(0, lift), eye_state='open', mouth_state='smile', tail_wave_phase=tail_wave)
        elif t < 0.65:
            meow_phase = (t - 0.20) / 0.45
            mouth = 'meow_wide' if 0.2 < meow_phase < 0.8 else 'meow_small'
            c = render_sitting_tabby(head_offset=(0, -2.0), eye_state='curious_wide', mouth_state=mouth, tail_high=True, tail_wave_phase=tail_wave)
        else:
            settle = -math.cos((t - 0.65) / 0.35 * math.pi * 0.5) * 2.0
            c = render_sitting_tabby(head_offset=(0, settle), eye_state='open', mouth_state='smile', tail_wave_phase=tail_wave)
        frames.append(c.grid)
    return frames

def build_clip_nuzzle(count=72):
    """Build affectionate petting reaction clip (72 frames, 3s): happy squint, blush, biscuit kneading."""
    frames = []
    for i in range(count):
        t = i / count
        knead = 'near' if math.sin(t * 4.0 * math.tau) > 0 else 'far'
        purr = math.sin(t * 6.0 * math.tau) * 0.4
        lean_x = -2 + math.sin(t * 2.0 * math.tau) * 1.0 + purr * 0.2
        lean_y = -1 + math.sin(t * 2.0 * math.tau) * 0.5 + purr * 0.15
        c = render_sitting_tabby(
            head_offset=(lean_x, lean_y),
            eye_state='happy_squint',
            mouth_state='smile',
            blush=True,
            tail_high=True,
            tail_wave_phase=t * 4.0 * math.tau,
            knead_side=knead
        )
        frames.append(c.grid)
    return frames

def build_clip_grooming(count=96):
    """Build paw licking and face washing clip (96 frames, 4s). Face remains 100% visible!"""
    frames = []
    for i in range(count):
        t = i / (count - 1)
        tail_wave = t * 3.0 * math.pi
        if t < 0.20:
            p = t / 0.20
            c = render_sitting_tabby(front_paw_mode='raise_lick', paw_lick_phase=p, eye_state='open', tail_wave_phase=tail_wave)
        elif t < 0.60:
            lick_t = ((t - 0.20) / 0.40 * 3.0) % 1.0
            mouth = 'tongue_lick' if lick_t < 0.6 else 'smile'
            c = render_sitting_tabby(front_paw_mode='raise_lick', paw_lick_phase=1.0,
                                     mouth_state=mouth, head_offset=(-1, 1), eye_state='half', tail_wave_phase=tail_wave)
        elif t < 0.85:
            wipe_t = (t - 0.60) / 0.25
            c = render_sitting_tabby(front_paw_mode='wipe_face', paw_lick_phase=wipe_t,
                                     head_offset=(0, 0), eye_state='blink', tail_wave_phase=tail_wave)
        else:
            p = 1.0 - (t - 0.85) / 0.15
            c = render_sitting_tabby(front_paw_mode='raise_lick', paw_lick_phase=p, eye_state='open', tail_wave_phase=tail_wave)
        frames.append(c.grid)
    return frames

def build_clip_curious(count=60):
    """Build alert inquiry clip (60 frames, 2.5s): ears perk, head tilts, eyes widen with double glint."""
    frames = []
    for i in range(count):
        t = i / (count - 1)
        tilt = math.sin(t * math.pi) * 0.12
        tail_wave = math.sin(t * math.tau * 3.0) * 3.0
        c = render_sitting_tabby(
            head_offset=(0, -1),
            head_tilt=tilt,
            eye_state='curious_wide',
            mouth_state='smile',
            ear_twitch_r=math.sin(t * math.tau * 2.0) * 0.5,
            tail_wave_phase=tail_wave,
            tail_curl_extra=-3.0
        )
        frames.append(c.grid)
    return frames

def build_clip_turn(count=12):
    """Build smooth 12-frame turnaround keyframes (Left 3/4 -> Front -> Right 3/4)."""
    frames = []
    for i in range(count):
        c = render_turning_tabby(i)
        frames.append(c.grid)
    return frames

# -----------------------------------------------------------------------------
# MAIN EXPORT PIPELINE
# -----------------------------------------------------------------------------
CLIPS_META = {
    'idle':        {'builder': build_clip_idle,        'frames': 144, 'fps': 24, 'loop': True,  'desc': 'Companion sitting poise with organic breathing, gentle tail S-waves, blinking, and ear twitch.'},
    'walk':        {'builder': build_clip_walk,        'frames': 72,  'fps': 24, 'loop': True,  'desc': 'Convincing 4-legged quadruped trot with planted feet, depth separation, shoulder dips, and counterweight tail.'},
    'stretching':  {'builder': build_clip_stretching,  'frames': 48,  'fps': 24, 'loop': False, 'desc': 'Feline downward dog stretch: low chest, extended front paws, high hips, and ecstatic curled tail.'},
    'laying':      {'builder': build_clip_laying,      'frames': 36,  'fps': 24, 'loop': False, 'desc': 'Continuous physical loaf folding transition into cozy floor loaf. Zero silhouette pops.'},
    'sleeping1':   {'builder': build_clip_sleeping1,   'frames': 144, 'fps': 24, 'loop': True,  'desc': 'Deep peaceful slumber: curled loaf, 4 slow breaths over 6.0s (1.5s per breath), tail twitch, and drifting Zzz.'},
    'waking':      {'builder': build_clip_waking,      'frames': 48,  'fps': 24, 'loop': False, 'desc': 'Waking transition: smooth loaf unfold, drowsy blink, kitten yawn with pink tongue, rising to sit. Zero pops.'},
    'meow':        {'builder': build_clip_meow,        'frames': 58,  'fps': 24, 'loop': False, 'desc': 'Warm expressive vocalization: head tilts up, friendly eyes, rounded meow showing pink tongue.'},
    'nuzzle':      {'builder': build_clip_nuzzle,      'frames': 72,  'fps': 24, 'loop': True,  'desc': 'Affectionate petting reaction: blissful happy squint, pink cheek blush, and rhythmic paw kneading (biscuits!).'},
    'grooming':    {'builder': build_clip_grooming,    'frames': 96,  'fps': 24, 'loop': False, 'desc': 'Paw licking & face wash: paw raised cleanly without hiding face, tongue licks, and cheek wipe.'},
    'curious':     {'builder': build_clip_curious,     'frames': 60,  'fps': 24, 'loop': False, 'desc': 'Alert inquiry: perked ears, charming head tilt, big wide eyes with double sparkle catchlights.'},
    'turn':        {'builder': build_clip_turn,        'frames': 12,  'fps': 24, 'loop': False, 'desc': 'Smooth 12-frame turnaround keyframes: continuous rotation from 3/4 left through front to 3/4 right.'},
}

def export_all(output):
    output.mkdir(parents=True, exist_ok=True)
    for name, meta in CLIPS_META.items():
        frames = meta['builder'](meta['frames'])
        strip = np.concatenate(frames, axis=1)
        write_png(output / f'tabby-{name}.png', strip)
        print(f"{name}: {meta['frames']} frames at {meta['fps']} fps")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path,
                        default=Path(__file__).resolve().parents[2] / 'public/assets/calm')
    export_all(parser.parse_args().output)
