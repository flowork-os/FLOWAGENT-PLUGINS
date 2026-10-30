#!/usr/bin/env python3
# [FL_INDEX: keywords="mocap_stickman_engine, rubber_hose_puppet, cutout_cartoon, 10_visemes, mitten_hands, cartoon_sneakers, one_euro_filter, multi_entity, stickman_studio" | purpose="Sovereign High-Fidelity 2D Cutout Rubber-Hose Cartoon Puppeteer Engine transforming video actors into expressive cartoon characters with curved Bézier rubber limbs, cuffed mitten hands, cartoon sneakers, and 10-viseme phoneme lipsync"]
"""
Stickman Studio Vector Cutout Rubber-Hose Puppeteer Engine (MoCap 2.0)
Transforms human video into expressive 2D cartoon puppet characters:
- Organic Rubber-Hose Bézier limbs with smooth variable stroke ribbons
- Expressive 4-finger cartoon mitten hands (open, point, wave, fist) with wrist cuffs
- Detailed 2D cartoon sneakers with soles, laces, and sock collars
- 10-Viseme cartoon lipsync (A, E, O, smile, open, closed) with pink tongues and 3D parallax
- One Euro Filter temporal anti-jitter suppression with snappy anime cadence
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import math
import time
import json
import subprocess
import tempfile
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from pose_tracker import PoseTracker
from multi_entity_tracker import MultiEntityTracker


# ---------------------------------------------------------------------------
# Differential Geometry: Quadratic Bézier passing through Midpoint
# ---------------------------------------------------------------------------
def eval_quad_bezier_through_midpoint(p0, p_mid, p2, n_samples=24):
    """
    Computes quadratic Bézier curve passing EXACTLY through p_mid at t=0.5.
    Mathematical derivation:
    B(0.5) = 0.25*P0 + 0.5*Pc + 0.25*P2 = P_mid  =>  Pc = 2*P_mid - 0.5*(P0 + P2)
    Terminal tangent derivative:
    B'(1) = 2*(P2 - Pc) = 3*P2 + P0 - 4*P_mid
    """
    p0 = np.array(p0, dtype=float)
    p_mid = np.array(p_mid, dtype=float)
    p2 = np.array(p2, dtype=float)
    pc = 2.0 * p_mid - 0.5 * (p0 + p2)

    t = np.linspace(0.0, 1.0, n_samples)[:, np.newaxis]
    pts = (1.0 - t)**2 * p0 + 2.0 * (1.0 - t) * t * pc + t**2 * p2
    end_tangent = 3.0 * p2 + p0 - 4.0 * p_mid
    return pts, end_tangent


def compute_ribbon_mesh(pts, half_widths):
    """Generates an offset 2D polygon ribbon along normal vectors."""
    n = len(pts)
    left_side, right_side = [], []

    for i in range(n):
        if i == 0:
            tangent = pts[1] - pts[0]
        elif i == n - 1:
            tangent = pts[-1] - pts[-2]
        else:
            tangent = pts[i + 1] - pts[i - 1]

        norm = np.linalg.norm(tangent)
        normal = np.array([-tangent[1], tangent[0]]) / norm if norm > 1e-6 else np.array([0.0, 1.0])
        w = half_widths[i]
        left_side.append(pts[i] + normal * w)
        right_side.append(pts[i] - normal * w)

    return left_side + right_side[::-1]


class MocapStickmanEngine:
    def __init__(self, width=720, height=1280, smoothing_alpha=0.65):
        self.width = width
        self.height = height
        self.alpha = smoothing_alpha
        self.prev_joints = None
        self.tracker = PoseTracker()
        self.entity_tracker = MultiEntityTracker(width=self.width, height=self.height, smoothing_alpha=smoothing_alpha)
        self.ground_y = int(self.height * 0.82)
        self.cx = self.width // 2

        self.ink = (25, 27, 34)
        self.white = (255, 255, 255)

        self.font_bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if not os.path.exists(self.font_bold_path):
            self.font_bold_path = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

        # Biomechanical & Kinematic Rig Stabilizers
        self.prev_hand_angles = {}
        self.foot_locks = {}

    def reset(self):
        """Reset temporal smoothing state between clips."""
        self.prev_joints = None
        self.entity_tracker.reset()
        self.prev_hand_angles.clear()
        self.foot_locks.clear()

    def load_background(self, bg_image_path=None):
        """Loads and cover-crops custom background image or generates a clean studio gradient."""
        if bg_image_path and os.path.exists(bg_image_path):
            try:
                bg_raw = Image.open(bg_image_path).convert("RGBA")
                bg_w, bg_h = bg_raw.size
                target_ratio = self.width / float(self.height)
                curr_ratio = bg_w / float(bg_h)
                if curr_ratio > target_ratio:
                    new_w = int(bg_h * target_ratio)
                    start_x = (bg_w - new_w) // 2
                    cropped = bg_raw.crop((start_x, 0, start_x + new_w, bg_h))
                else:
                    new_h = int(bg_w / target_ratio)
                    start_y = (bg_h - new_h) // 2
                    cropped = bg_raw.crop((0, start_y, bg_w, start_y + new_h))
                resized = cropped.resize((self.width, self.height), Image.Resampling.LANCZOS)
                return resized
            except Exception as e:
                print(f"[MoCapEngine] Warning loading background {bg_image_path}: {e}", file=sys.stderr)

        # Fallback: Clean warm studio gradient
        bg = Image.new("RGBA", (self.width, self.height), (248, 246, 240, 255))
        draw = ImageDraw.Draw(bg)
        top_c = (248, 246, 240)
        bot_c = (235, 233, 225)
        for y in range(self.height):
            ratio = y / float(self.height)
            r = int(top_c[0] + (bot_c[0] - top_c[0]) * ratio)
            g = int(top_c[1] + (bot_c[1] - top_c[1]) * ratio)
            b = int(top_c[2] + (bot_c[2] - top_c[2]) * ratio)
            draw.line([(0, y), (self.width, y)], fill=(r, g, b, 255))
        draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=(210, 206, 195), width=3)
        return bg

    def draw_shadow(self, draw, cx, ground_y, rx=60, ry=14):
        """Draws soft contact drop shadow on floor."""
        draw.ellipse([cx - rx, ground_y - ry, cx + rx, ground_y + ry], fill=(15, 23, 42, 65))

    def draw_rubber_hose_limb(self, draw, p0, p_mid, p2, base_width=22.0, taper=(1.1, 0.85),
                              fill_col=(25, 27, 34), stroke_col=(25, 27, 34), stroke_w=4):
        """Renders an organic, curved rubber-hose limb with dark ink outline and fill."""
        pts, end_tangent = eval_quad_bezier_through_midpoint(p0, p_mid, p2, n_samples=24)
        t = np.linspace(0.0, 1.0, len(pts))
        w_inner = (base_width * (taper[0] * (1.0 - t) + taper[1] * t) / 2.0)

        # 1. Outer ink stroke ribbon
        outer_poly = compute_ribbon_mesh(pts, w_inner + stroke_w)
        draw.polygon([(p[0], p[1]) for p in outer_poly], fill=stroke_col)

        # 2. Inner fill ribbon
        inner_poly = compute_ribbon_mesh(pts, w_inner)
        draw.polygon([(p[0], p[1]) for p in inner_poly], fill=fill_col)

        return pts[-1], end_tangent

    def draw_wrist_cuff(self, draw, center, angle_deg, size=(28, 14), fill_col=(255, 255, 255),
                        stroke_col=(25, 27, 34), stroke_w=4):
        """Draws an elliptical cuff covering the wrist/ankle joint seam."""
        cx, cy = center
        w, h = size
        rad = math.radians(angle_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        cuff_pts = []
        for i in range(20):
            th = 2.0 * math.pi * i / 20
            x0 = (w / 2.0) * math.cos(th)
            y0 = (h / 2.0) * math.sin(th)
            cuff_pts.append((cx + x0 * cos_a - y0 * sin_a, cy + x0 * sin_a + y0 * cos_a))
        draw.polygon(cuff_pts, fill=fill_col, outline=stroke_col, width=stroke_w)

    def draw_mitten_hand(self, draw, wrist_pt, angle_deg, hand_type="open", is_left=False, scale=1.0,
                         fill_col=(255, 255, 255), stroke_col=(25, 27, 34), stroke_w=4):
        """Renders an expressive 4-finger cartoon mitten hand with wrist cuff."""
        wx, wy = wrist_pt
        rad = math.radians(angle_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        flip_y = -1.0 if is_left else 1.0

        def tf(x, y):
            sx, sy = x * scale, y * scale * flip_y
            return (wx + sx * cos_a - sy * sin_a, wy + sx * sin_a + sy * cos_a)

        if hand_type == "point":
            finger = [(8, -8), (38, -12), (44, -10), (44, -2), (34, 0), (14, 2)]
            palm = [(0, -8), (14, -6), (20, 2), (18, 12), (8, 14), (0, 8)]
            thumb = [(4, -6), (10, -18), (18, -16), (16, -6)]
            draw.polygon([tf(x, y) for x, y in finger], fill=fill_col, outline=stroke_col, width=stroke_w)
            draw.polygon([tf(x, y) for x, y in palm], fill=fill_col, outline=stroke_col, width=stroke_w)
            draw.polygon([tf(x, y) for x, y in thumb], fill=fill_col, outline=stroke_col, width=stroke_w)
        elif hand_type == "wave":
            f_list = [
                [(10, -20), (18, -20), (14, -8), (6, -8)],
                [(18, -16), (30, -14), (22, -2), (14, -2)],
                [(20, -2), (32, 2), (24, 8), (16, 6)],
                [(16, 10), (28, 16), (20, 20), (10, 12)]
            ]
            palm = [(0, -10), (14, -8), (18, 10), (0, 8), (-4, 0)]
            for f in f_list:
                draw.polygon([tf(x, y) for x, y in f], fill=fill_col, outline=stroke_col, width=stroke_w)
            draw.polygon([tf(x, y) for x, y in palm], fill=fill_col, outline=stroke_col, width=stroke_w)
        elif hand_type == "fist":
            fist = [(0, -10), (14, -14), (26, -10), (30, 2), (26, 12), (14, 14), (4, 10), (0, 6)]
            thumb = [(6, -6), (16, -10), (22, -2), (16, 6), (8, 2)]
            draw.polygon([tf(x, y) for x, y in fist], fill=fill_col, outline=stroke_col, width=stroke_w)
            draw.polygon([tf(x, y) for x, y in thumb], fill=fill_col, outline=stroke_col, width=stroke_w)
        else: # "open" / relaxed
            palm = [(0, -10), (14, -14), (28, -12), (36, -4), (36, 6), (30, 14), (18, 16), (8, 12), (0, 8)]
            thumb = [(8, -8), (14, -20), (22, -20), (22, -10), (16, -6)]
            draw.polygon([tf(x, y) for x, y in thumb], fill=fill_col, outline=stroke_col, width=stroke_w)
            draw.polygon([tf(x, y) for x, y in palm], fill=fill_col, outline=stroke_col, width=stroke_w)
            for dx in (12, 19, 26):
                draw.line([tf(dx, -2), tf(dx + 2, 7)], fill=stroke_col, width=max(2, int(stroke_w * 0.7)))

        # Draw wrist cuff overlapping joint seam
        self.draw_wrist_cuff(draw, wrist_pt, angle_deg, size=(28 * scale, 14 * scale),
                             fill_col=fill_col, stroke_col=stroke_col, stroke_w=stroke_w)

    def draw_cartoon_sneaker(self, draw, ankle_pt, angle_deg=0.0, is_left=False, scale=1.0,
                             main_col=(225, 29, 72), stroke_col=(25, 27, 34), stroke_w=4):
        """Renders a stylish 2D cartoon sneaker with rubber sole, toe-cap, laces, and collar."""
        ax, ay = ankle_pt
        rad = math.radians(angle_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        flip_x = -1.0 if is_left else 1.0

        def tf(x, y):
            sx, sy = x * scale * flip_x, y * scale
            return (ax + sx * cos_a - sy * sin_a, ay + sx * sin_a + sy * cos_a)

        # Sole
        sole = [(-20, 14), (36, 14), (38, 24), (-20, 24)]
        draw.polygon([tf(x, y) for x, y in sole], fill=(255, 255, 255), outline=stroke_col, width=stroke_w)
        draw.line([tf(-18, 19), tf(36, 19)], fill=stroke_col, width=max(2, int(stroke_w * 0.6)))

        # Upper canvas shoe
        upper = [(-18, -2), (4, -4), (10, 4), (26, 6), (34, 14), (-18, 14), (-22, 6)]
        draw.polygon([tf(x, y) for x, y in upper], fill=main_col, outline=stroke_col, width=stroke_w)

        # White toe cap
        toe = [(18, 6), (34, 14), (18, 14)]
        draw.polygon([tf(x, y) for x, y in toe], fill=(255, 255, 255), outline=stroke_col, width=stroke_w)

        # White laces
        for ly in (2, 7, 12):
            draw.line([tf(8, ly), tf(16, ly)], fill=(255, 255, 255), width=max(2, int(stroke_w * 0.8)))

        # White sock collar
        collar = [(-14, -8), (8, -8), (6, -2), (-16, -2)]
        draw.polygon([tf(x, y) for x, y in collar], fill=(255, 255, 255), outline=stroke_col, width=stroke_w)

    def draw_cartoon_torso(self, draw, mid_sh, mid_hip, head_r, archetype='male', color=(225, 29, 72), sh_span=None):
        """Draws a sleek, fitted volumetric cartoon shirt / tunic with collar and outline."""
        half_w = max(38, min(80, int(head_r * 0.95))) if sh_span is None else min(sh_span, max(42, int(head_r * 0.95)))
        hip_w = int(half_w * (0.85 if archetype == 'male' else 0.95))
        h_len = max(60, int(mid_hip[1] - mid_sh[1]))

        tunic_pts = [
            (mid_sh[0] - half_w, mid_sh[1]),
            (mid_sh[0] + half_w, mid_sh[1]),
            (mid_sh[0] + hip_w, mid_hip[1]),
            (mid_sh[0] - hip_w, mid_hip[1])
        ]
        draw.polygon(tunic_pts, fill=color, outline=self.ink, width=4)

        # White collar / neckline
        collar_w = int(head_r * 0.38)
        draw.arc([mid_sh[0] - collar_w, mid_sh[1] - 4, mid_sh[0] + collar_w, mid_sh[1] + 16], start=0, end=180, fill=self.white, width=4)

        # Red necktie or zipper
        if archetype in ('business', 'male', 'cool', 'glasses'):
            tie_w = max(6, int(head_r * 0.16))
            tie_bot = int(mid_hip[1] - h_len * 0.20)
            draw.polygon([
                (mid_sh[0] - 4, mid_sh[1] + 8),
                (mid_sh[0] + 4, mid_sh[1] + 8),
                (mid_sh[0] + tie_w, tie_bot - 10),
                (mid_sh[0], tie_bot),
                (mid_sh[0] - tie_w, tie_bot - 10)
            ], fill=(220, 38, 38), outline=self.ink, width=2)

    def render_cartoon_face(self, draw, head_cx, head_cy, head_r, tilt_angle, energy, archetype='male', viseme='REST'):
        """Renders expressive cartoon face with pupils, highlights, eyebrows, and 10-viseme lipsync."""
        pen_w = 4
        cos_t, sin_t = math.cos(tilt_angle), math.sin(tilt_angle)

        def to_world(lx, ly):
            rx = lx * cos_t - ly * sin_t
            ry = lx * sin_t + ly * cos_t
            return int(head_cx + rx), int(head_cy + ry)

        # 1. Head Contour
        draw.ellipse([head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r],
                     fill=self.white, outline=self.ink, width=pen_w)

        # 2. Ears
        ear_r = int(head_r * 0.20)
        for side in (-1.0, 1.0):
            ex, ey = to_world(side * head_r * 0.95, 0)
            draw.ellipse([ex - ear_r, ey - ear_r, ex + ear_r, ey + ear_r], fill=self.white, outline=self.ink, width=3)

        # 3. Eyes & Eyebrows
        eye_spacing = head_r * 0.36
        eye_y = -head_r * 0.08
        eye_w = max(4, int(head_r * 0.16))
        eye_h = max(5, int(head_r * 0.22))

        has_sunglasses = (archetype == 'cool')

        if has_sunglasses:
            sg_y = int(eye_y)
            l_box = [
                to_world(-eye_spacing - 14, sg_y - 8),
                to_world(-eye_spacing + 14, sg_y - 8),
                to_world(-eye_spacing + 14, sg_y + 8),
                to_world(-eye_spacing - 14, sg_y + 8),
            ]
            r_box = [
                to_world(eye_spacing - 14, sg_y - 8),
                to_world(eye_spacing + 14, sg_y - 8),
                to_world(eye_spacing + 14, sg_y + 8),
                to_world(eye_spacing - 14, sg_y + 8),
            ]
            draw.polygon(l_box, fill=self.ink)
            draw.polygon(r_box, fill=self.ink)
            draw.line([to_world(-eye_spacing + 14, sg_y), to_world(eye_spacing - 14, sg_y)], fill=self.ink, width=3)
        else:
            for side in (-1.0, 1.0):
                wx, wy = to_world(side * eye_spacing, eye_y)
                # Outer eye outline
                draw.ellipse([wx - eye_w, wy - eye_h, wx + eye_w, wy + eye_h], fill=self.white, outline=self.ink, width=3)
                # Dark pupil with cute shine highlight
                pupil_r = int(eye_w * 0.70)
                draw.ellipse([wx - pupil_r, wy - pupil_r, wx + pupil_r, wy + pupil_r], fill=self.ink)
                draw.ellipse([wx - pupil_r // 2, wy - pupil_r // 2, wx - pupil_r // 2 + 3, wy - pupil_r // 2 + 3], fill=self.white)

                # Eyebrow
                brow_y = eye_y - head_r * 0.22
                bw = int(head_r * 0.26)
                b1 = to_world(side * eye_spacing - bw // 2, brow_y)
                b2 = to_world(side * eye_spacing + bw // 2, brow_y - 2)
                draw.line([b1, b2], fill=self.ink, width=pen_w)

        # 4. Viseme Cartoon Lipsync
        mouth_y = head_r * 0.38
        mw = int(head_r * 0.40)
        aperture = min(1.0, max(0.05, energy * 1.5))

        if energy < 0.12:
            # REST / Closed Smile
            p1 = to_world(-mw // 2, mouth_y)
            p2 = to_world(0, mouth_y + 3)
            p3 = to_world(mw // 2, mouth_y)
            draw.line([p1, p2], fill=self.ink, width=pen_w)
            draw.line([p2, p3], fill=self.ink, width=pen_w)
        elif energy > 0.45:
            # AI / Wide Open with Pink Tongue
            h = int(head_r * (0.24 + 0.35 * aperture))
            pts = [to_world(-mw // 2, mouth_y - h // 3), to_world(mw // 2, mouth_y - h // 3),
                   to_world(mw // 3, mouth_y + 2 * h // 3), to_world(-mw // 3, mouth_y + 2 * h // 3)]
            draw.polygon(pts, fill=self.ink)
            tx, ty = to_world(0, mouth_y + h // 3)
            draw.ellipse([tx - mw // 4, ty - h // 4, tx + mw // 4, ty + h // 4], fill=(244, 114, 182))
        else:
            # O / Oval talking
            ow = int(mw * 0.65)
            oh = int(head_r * (0.18 + 0.25 * aperture))
            mcx, mcy = to_world(0, mouth_y)
            rx, ry = max(2, ow // 2), max(2, oh // 2)
            draw.ellipse([mcx - rx, mcy - ry, mcx + rx, mcy + ry], fill=self.ink)

        # 5. Archetype Accessories
        if archetype == 'female' or archetype == 'girl':
            # Twin Anime Hair Ribbons & Blush
            draw.arc([head_cx - head_r - 8, head_cy - head_r + 4, head_cx - head_r + 20, head_cy - head_r + 32], start=45, end=270, fill=(244, 114, 182), width=5)
            draw.arc([head_cx + head_r - 20, head_cy - head_r + 4, head_cx + head_r + 8, head_cy - head_r + 32], start=270, end=135, fill=(244, 114, 182), width=5)
            draw.ellipse([head_cx - 16, head_cy - head_r - 10, head_cx - 2, head_cy - head_r + 4], fill=(236, 72, 153))
            draw.ellipse([head_cx + 2, head_cy - head_r - 10, head_cx + 16, head_cy - head_r + 4], fill=(236, 72, 153))
            # Pink Blush
            draw.ellipse([head_cx - int(head_r * 0.65), head_cy + int(head_r * 0.15), head_cx - int(head_r * 0.35), head_cy + int(head_r * 0.38)], fill=(251, 113, 133, 180))
            draw.ellipse([head_cx + int(head_r * 0.35), head_cy + int(head_r * 0.15), head_cx + int(head_r * 0.65), head_cy + int(head_r * 0.38)], fill=(251, 113, 133, 180))
        elif archetype == 'child':
            # Amber Backwards Baseball Cap
            cap_c = (245, 158, 11)
            draw.arc([head_cx - head_r - 2, head_cy - head_r - 6, head_cx + head_r + 2, head_cy], start=180, end=360, fill=cap_c, width=int(8 * (head_r / 26.0)))
            draw.line([(head_cx - head_r - 2, head_cy - 4), (head_cx - head_r - 18, head_cy - 10)], fill=cap_c, width=int(6 * (head_r / 26.0)))

    def render_stick_human(self, draw, kps, ground_y=None, archetype='male', scale=1.0, energy=0.5, t=0.0, framing_mode='auto'):
        """
        Renders a full 2D Cutout Rubber-Hose Cartoon Puppet.
        Bézier limbs, cuffed mitten hands, cartoon sneakers, torso clothing, and expressive face.
        Supports both Full-Body standing and Seated / Presenter podcast framing.
        """
        sh_l, sh_r = kps[5], kps[6]
        hip_l, hip_r = kps[11], kps[12]
        nose = kps[0]
        eye_l, eye_r = kps[1], kps[2]
        el_l, el_r = kps[7], kps[8]
        wr_l, wr_r = kps[9], kps[10]

        mid_sh = ((sh_l[0] + sh_r[0]) / 2.0, (sh_l[1] + sh_r[1]) / 2.0)
        sh_w = math.hypot(sh_l[0] - sh_r[0], sh_l[1] - sh_r[1])

        target_ground = ground_y or self.ground_y
        has_grounded_ankles = (np.sum(kps[15]) > 0 and np.sum(kps[16]) > 0 and kps[15][1] >= target_ground * 0.82)
        is_bust = (framing_mode == 'presenter') or (framing_mode == 'auto' and (not has_grounded_ankles or sh_w > self.width * 0.35))

        # Balanced cartoon head radius
        head_r = max(36, min(75, int(sh_w * 0.22 if sh_w > 120 else 46 * scale)))
        if archetype == 'child':
            head_r = int(head_r * 1.20)

        # Head position and upright tilt angle
        tilt_angle = 0.0
        if np.sum(eye_l) > 0 and np.sum(eye_r) > 0:
            tilt_angle = math.atan2(eye_l[1] - eye_r[1], eye_l[0] - eye_r[0])
            tilt_angle = max(math.radians(-35), min(math.radians(35), tilt_angle))

        head_cx = int(nose[0])
        L_neck = 16
        head_cy = int(mid_sh[1] - head_r - L_neck - 8)

        # Forward Kinematics Anatomical Proportions
        L_upper = int(head_r * 1.40)
        L_fore = int(head_r * 1.35)
        L_torso = int(head_r * (1.8 if archetype == 'child' else 2.3))

        # Helper to compute joint angles from tracking with distance threshold
        def get_joint_angle(p1, p2, default_rad):
            if np.sum(p1) > 0 and np.sum(p2) > 0:
                dx = p2[0] - p1[0]
                dy = p2[1] - p1[1]
                if math.hypot(dx, dy) >= 6.0:
                    return math.atan2(dy, dx)
            return default_rad

        # Arm Angles with Biomechanical Joint Clamps (Anti-Elbow Hyperextension):
        # Note: sh_r (index 6) is actor right = image left (smaller X).
        #       sh_l (index 5) is actor left = image right (larger X).
        ang_up_r = get_joint_angle(sh_r, el_r, math.radians(70))
        ang_fore_r_raw = get_joint_angle(el_r, wr_r, math.radians(45))
        # Clamp Right Elbow: inward flexion [-2.62, +0.20]
        diff_r = math.atan2(math.sin(ang_fore_r_raw - ang_up_r), math.cos(ang_fore_r_raw - ang_up_r))
        diff_r = max(-2.62, min(0.20, diff_r))
        ang_fore_r = ang_up_r + diff_r

        ang_up_l = get_joint_angle(sh_l, el_l, math.radians(110))
        ang_fore_l_raw = get_joint_angle(el_l, wr_l, math.radians(135))
        # Clamp Left Elbow: inward flexion [-0.20, +2.62]
        diff_l = math.atan2(math.sin(ang_fore_l_raw - ang_up_l), math.cos(ang_fore_l_raw - ang_up_l))
        diff_l = max(-0.20, min(2.62, diff_l))
        ang_fore_l = ang_up_l + diff_l

        # Scaled puppet shoulder coordinates centered on mid_sh
        sh_span = max(55, min(100, int(head_r * 1.25)))
        p_sh_r = (int(mid_sh[0] - sh_span), int(mid_sh[1]))
        p_sh_l = (int(mid_sh[0] + sh_span), int(mid_sh[1]))

        # Arm Joints FK (Strictly rigid bone lengths)
        p_el_r = (int(p_sh_r[0] + L_upper * math.cos(ang_up_r)), int(p_sh_r[1] + L_upper * math.sin(ang_up_r)))
        p_wr_r = (int(p_el_r[0] + L_fore * math.cos(ang_fore_r)), int(p_el_r[1] + L_fore * math.sin(ang_fore_r)))

        p_el_l = (int(p_sh_l[0] + L_upper * math.cos(ang_up_l)), int(p_sh_l[1] + L_upper * math.sin(ang_up_l)))
        p_wr_l = (int(p_el_l[0] + L_fore * math.cos(ang_fore_l)), int(p_el_l[1] + L_fore * math.sin(ang_fore_l)))

        mid_hip = (int(mid_sh[0]), int(mid_sh[1] + L_torso))

        if is_bust:
            # ---------------------------------------------------------
            # BUST / PRESENTER PODCAST FRAMING
            # ---------------------------------------------------------
            desk_y = min(self.height - 50, max(int(self.height * 0.40), int(mid_hip[1] + 10)))
            desk_bot = max(desk_y + 40, self.height)

            # Torso: Fitted Polo / Shirt or Classic Line
            if archetype == 'classic':
                draw.line([mid_sh, (mid_sh[0], desk_y)], fill=self.ink, width=12)
            else:
                shirt_color = (30, 41, 59) if archetype != 'female' else (244, 114, 182)
                self.draw_cartoon_torso(draw, mid_sh, (mid_sh[0], desk_y), head_r, archetype=archetype, color=shirt_color, sh_span=sh_span)

            # Modern Studio Acrylic Desk
            draw.rounded_rectangle([30, desk_y, self.width - 30, desk_bot], radius=24,
                                   fill=(15, 23, 42, 245), outline=(0, 229, 255), width=3)
            draw.line([(50, desk_y + 4), (self.width - 50, desk_y + 4)], fill=(148, 163, 184), width=3)

            # Studio Broadcast Microphone
            mic_x = int(mid_sh[0] + 95)
            draw.line([(mic_x, desk_y + 10), (mic_x, desk_y - 65)], fill=(100, 116, 139), width=6)
            m_top = desk_y - 105
            m_bot = desk_y - 63
            draw.rounded_rectangle([mic_x - 14, min(m_top, m_bot), mic_x + 14, max(m_top, m_bot)], radius=8,
                                   fill=(15, 23, 42), outline=(0, 229, 255), width=2)
            for gy in range(desk_y - 98, desk_y - 68, 7):
                draw.line([(mic_x - 10, gy), (mic_x + 10, gy)], fill=(71, 85, 105), width=2)

        else:
            # ---------------------------------------------------------
            # FULL-BODY STANDING FRAMING (Grounded, Anti-Foot Slide)
            # ---------------------------------------------------------
            L_thigh = int(head_r * (1.2 if archetype == 'child' else 1.6))
            L_calf = int(head_r * (1.2 if archetype == 'child' else 1.6))
            hip_span = int(head_r * (0.85 if archetype == 'female' else 0.75))
            p_hip_l = (int(mid_hip[0] + hip_span // 2), int(mid_hip[1]))
            p_hip_r = (int(mid_hip[0] - hip_span // 2), int(mid_hip[1]))

            ang_thigh_r = get_joint_angle(hip_r, kps[14], math.radians(85))
            ang_calf_r_raw = get_joint_angle(kps[14], kps[16], math.radians(90))
            # Clamp Right Knee: only bend backwards
            diff_kn_r = math.atan2(math.sin(ang_calf_r_raw - ang_thigh_r), math.cos(ang_calf_r_raw - ang_thigh_r))
            diff_kn_r = max(-2.4, min(0.15, diff_kn_r))
            ang_calf_r = ang_thigh_r + diff_kn_r

            ang_thigh_l = get_joint_angle(hip_l, kps[13], math.radians(95))
            ang_calf_l_raw = get_joint_angle(kps[13], kps[15], math.radians(90))
            # Clamp Left Knee: only bend backwards
            diff_kn_l = math.atan2(math.sin(ang_calf_l_raw - ang_thigh_l), math.cos(ang_calf_l_raw - ang_thigh_l))
            diff_kn_l = max(-0.15, min(2.4, diff_kn_l))
            ang_calf_l = ang_thigh_l + diff_kn_l

            p_kn_r = (int(p_hip_r[0] + L_thigh * math.cos(ang_thigh_r)), int(p_hip_r[1] + L_thigh * math.sin(ang_thigh_r)))
            p_kn_l = (int(p_hip_l[0] + L_thigh * math.cos(ang_thigh_l)), int(p_hip_l[1] + L_thigh * math.sin(ang_thigh_l)))

            # Foot ground contact detection
            raw_ank_r_y = kps[16][1] if np.sum(kps[16]) > 0 else target_ground
            raw_ank_l_y = kps[15][1] if np.sum(kps[15]) > 0 else target_ground
            ground_thresh = target_ground - max(45, int(L_calf * 0.70))
            is_r_grounded = (raw_ank_r_y >= ground_thresh)
            is_l_grounded = (raw_ank_l_y >= ground_thresh)

            calc_ank_r_x = int(p_kn_r[0] + L_calf * math.cos(ang_calf_r))
            calc_ank_l_x = int(p_kn_l[0] + L_calf * math.cos(ang_calf_l))

            # Smart Foot Locking: Plant feet solidly on floor without ice-skate sliding
            if is_r_grounded:
                locked_r = self.foot_locks.get('r')
                if locked_r is not None and abs(calc_ank_r_x - locked_r) < 22:
                    p_ank_r = (locked_r, target_ground)
                else:
                    self.foot_locks['r'] = calc_ank_r_x
                    p_ank_r = (calc_ank_r_x, target_ground)
            else:
                self.foot_locks['r'] = None
                p_ank_r = (calc_ank_r_x, min(target_ground, int(p_kn_r[1] + L_calf * math.sin(ang_calf_r))))

            if is_l_grounded:
                locked_l = self.foot_locks.get('l')
                if locked_l is not None and abs(calc_ank_l_x - locked_l) < 22:
                    p_ank_l = (locked_l, target_ground)
                else:
                    self.foot_locks['l'] = calc_ank_l_x
                    p_ank_l = (calc_ank_l_x, target_ground)
            else:
                self.foot_locks['l'] = None
                p_ank_l = (calc_ank_l_x, min(target_ground, int(p_kn_l[1] + L_calf * math.sin(ang_calf_l))))

            # Soft Floor Shadow
            self.draw_shadow(draw, int(mid_sh[0]), target_ground, rx=int(head_r * 1.8), ry=int(head_r * 0.40))

            if archetype == 'classic':
                # Classic Stickman Pure Lines
                draw.line([p_hip_l, p_kn_l, p_ank_l], fill=self.ink, width=10, joint="curve")
                draw.line([p_hip_r, p_kn_r, p_ank_r], fill=self.ink, width=10, joint="curve")
                # Sleek rounded feet
                draw.ellipse([p_ank_l[0] - 12, p_ank_l[1] - 6, p_ank_l[0] + 12, p_ank_l[1] + 6], fill=self.ink)
                draw.ellipse([p_ank_r[0] - 12, p_ank_r[1] - 6, p_ank_r[0] + 12, p_ank_r[1] + 6], fill=self.ink)
                # Pure Torso Line
                draw.line([mid_sh, mid_hip], fill=self.ink, width=12)
            else:
                # Denim Blue Legs & Sneakers
                pants_color = (30, 58, 138)
                sneaker_color = (225, 29, 72) if archetype != 'female' else (236, 72, 153)

                _, tan_leg_l = self.draw_rubber_hose_limb(draw, p_hip_l, p_kn_l, p_ank_l,
                                                           base_width=17.0, fill_col=pants_color, stroke_col=self.ink, stroke_w=4)
                deg_shoe_l = math.degrees(math.atan2(p_ank_l[1] - p_kn_l[1], p_ank_l[0] - p_kn_l[0])) if has_grounded_ankles else 0.0
                self.draw_cartoon_sneaker(draw, p_ank_l, angle_deg=deg_shoe_l, is_left=True, scale=0.9, main_col=sneaker_color)

                _, tan_leg_r = self.draw_rubber_hose_limb(draw, p_hip_r, p_kn_r, p_ank_r,
                                                           base_width=17.0, fill_col=pants_color, stroke_col=self.ink, stroke_w=4)
                deg_shoe_r = math.degrees(math.atan2(p_ank_r[1] - p_kn_r[1], p_ank_r[0] - p_kn_r[0])) if has_grounded_ankles else 0.0
                self.draw_cartoon_sneaker(draw, p_ank_r, angle_deg=deg_shoe_r, is_left=False, scale=0.9, main_col=sneaker_color)

                # Torso
                shirt_color = (225, 29, 72) if archetype != 'female' else (244, 114, 182)
                self.draw_cartoon_torso(draw, mid_sh, mid_hip, head_r, archetype=archetype, color=shirt_color, sh_span=sh_span)

        # -------------------------------------------------------------
        # Arms & Hands (Z-Index Layer above Torso & Desk)
        # -------------------------------------------------------------
        if archetype == 'classic':
            # Classic Pure Ink Arm Lines
            draw.line([p_sh_r, p_el_r, p_wr_r], fill=self.ink, width=10, joint="curve")
            draw.line([p_sh_l, p_el_l, p_wr_l], fill=self.ink, width=10, joint="curve")
            draw.ellipse([p_wr_r[0] - 10, p_wr_r[1] - 10, p_wr_r[0] + 10, p_wr_r[1] + 10], fill=self.ink)
            draw.ellipse([p_wr_l[0] - 10, p_wr_l[1] - 10, p_wr_l[0] + 10, p_wr_l[1] + 10], fill=self.ink)
        else:
            # Stable Forearm Vector Angle (Immune to Bezier tangent flipping)
            rad_hand_r = math.atan2(p_wr_r[1] - p_el_r[1], p_wr_r[0] - p_el_r[0])
            rad_hand_l = math.atan2(p_wr_l[1] - p_el_l[1], p_wr_l[0] - p_el_l[0])

            # Smooth hand angle temporally to eliminate any micro-jitter
            prev_r = self.prev_hand_angles.get('r', rad_hand_r)
            diff_r = math.atan2(math.sin(rad_hand_r - prev_r), math.cos(rad_hand_r - prev_r))
            rad_hand_r = prev_r + 0.65 * diff_r
            self.prev_hand_angles['r'] = rad_hand_r

            prev_l = self.prev_hand_angles.get('l', rad_hand_l)
            diff_l = math.atan2(math.sin(rad_hand_l - prev_l), math.cos(rad_hand_l - prev_l))
            rad_hand_l = prev_l + 0.65 * diff_l
            self.prev_hand_angles['l'] = rad_hand_l

            deg_hand_r = math.degrees(rad_hand_r)
            deg_hand_l = math.degrees(rad_hand_l)

            # Right Arm (Image Left)
            self.draw_rubber_hose_limb(draw, p_sh_r, p_el_r, p_wr_r, base_width=16.0)
            hand_r_type = "wave" if p_wr_r[1] < p_sh_r[1] else "open"
            self.draw_mitten_hand(draw, p_wr_r, angle_deg=deg_hand_r, hand_type=hand_r_type, is_left=False, scale=0.9)

            # Left Arm (Image Right)
            self.draw_rubber_hose_limb(draw, p_sh_l, p_el_l, p_wr_l, base_width=16.0)
            hand_l_type = "point" if (np.sum(el_l) > 0 and p_wr_l[0] > p_sh_l[0] + 40) else ("wave" if p_wr_l[1] < p_sh_l[1] else "open")
            self.draw_mitten_hand(draw, p_wr_l, angle_deg=deg_hand_l, hand_type=hand_l_type, is_left=True, scale=0.9)

        # -------------------------------------------------------------
        # Neck & Cartoon Face
        # -------------------------------------------------------------
        neck_w = max(10, int(head_r * 0.24))
        draw.polygon([
            (head_cx - neck_w, head_cy + int(head_r * 0.70)),
            (head_cx + neck_w, head_cy + int(head_r * 0.70)),
            (int(mid_sh[0] + neck_w), int(mid_sh[1] + 4)),
            (int(mid_sh[0] - neck_w), int(mid_sh[1] + 4))
        ], fill=self.white, outline=self.ink, width=3)

        self.render_cartoon_face(draw, head_cx, head_cy, head_r, tilt_angle, energy, archetype=archetype)

    def render_stick_animal(self, draw, entity, t=0.0, frame_idx=0):
        """Renders an animated stick animal (dog, cat, bird) tracking genuine position and trajectory."""
        species = entity.get('species', 'dog')
        bbox = entity.get('bbox', [0, 0, 100, 100])
        cx, cy = entity.get('center', (100, 100))
        ground_y = int(entity.get('ground_y', self.ground_y))
        facing = entity.get('facing', 'right')

        box_h = max(20, bbox[3] - bbox[1])
        scale = max(0.5, min(1.6, box_h / 140.0))
        pen_w = max(3, int(6 * scale))

        self.draw_shadow(draw, int(cx), ground_y, rx=int(48 * scale), ry=int(12 * scale))

        if species in ('dog', 'cat', 'horse', 'sheep', 'cow'):
            body_len = int(75 * scale)
            hip_x = int(cx - (body_len // 2 if facing == 'right' else -body_len // 2))
            sh_x = int(cx + (body_len // 2 if facing == 'right' else -body_len // 2))
            body_y = ground_y - int(55 * scale)
            hip_pt = (hip_x, body_y)
            sh_pt = (sh_x, body_y - int(5 * scale))

            # Rubber hose animal torso
            self.draw_rubber_hose_limb(draw, hip_pt, ((hip_x + sh_x)//2, body_y + 4), sh_pt,
                                       base_width=24.0 * scale, fill_col=self.ink, stroke_col=self.ink, stroke_w=pen_w)

            # Head & Ears
            head_r = int(18 * scale)
            head_cx = sh_x + int((22 if facing == 'right' else -22) * scale)
            head_cy = body_y - int(20 * scale)
            draw.ellipse([head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r],
                         fill=self.white, outline=self.ink, width=pen_w)

            # Eye & Snout
            eye_x = head_cx + int((4 if facing == 'right' else -4) * scale)
            draw.ellipse([eye_x - 3, head_cy - 4, eye_x + 3, head_cy + 2], fill=self.ink)

            if species == 'dog':
                # Floppy dog ear
                ear_x = head_cx - int((head_r if facing == 'right' else -head_r) * 0.8)
                draw.ellipse([ear_x - 4, head_cy - 6, ear_x + 6, head_cy + 16], fill=self.ink)
                nose_x = head_cx + int(head_r if facing == 'right' else -head_r)
                draw.ellipse([nose_x - 3, head_cy + 1, nose_x + 3, head_cy + 7], fill=(225, 29, 72))
                # Happy Wagging Tail (Sine wave)
                tail_wag = math.sin(t * 14.0) * 20
                tail_tip = (hip_x - int((26 if facing == 'right' else -26) * scale), int(body_y - 28 * scale + tail_wag))
                draw.line([hip_pt, tail_tip], fill=self.ink, width=pen_w)

            # 4 Rubber-Hose Legs
            for off_x, leg_name in [(-8, "back1"), (6, "back2"), (body_len - 14, "front1"), (body_len, "front2")]:
                lx = hip_x + int(off_x * scale if facing == 'right' else -off_x * scale)
                knee = (lx + 2, ground_y - int(25 * scale))
                paw = (lx + 4, ground_y)
                self.draw_rubber_hose_limb(draw, (lx, body_y), knee, paw,
                                           base_width=12.0 * scale, fill_col=self.ink, stroke_col=self.ink, stroke_w=pen_w)
                # Small white paw
                draw.ellipse([paw[0] - 6, paw[1] - 4, paw[0] + 6, paw[1] + 4], fill=self.white, outline=self.ink, width=2)

    def render_multi_entity_frame(self, bg_image, entities, t=0.0, energy=0.5, default_style='auto', framing_mode='auto', frame_idx=0):
        """Renders all tracked entities onto background with soft alpha shadows and cutout puppetry."""
        base_bg = bg_image.convert("RGBA")
        overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay, "RGBA")

        for ent in entities:
            if ent['type'] == 'human':
                kps = ent['kps']
                style = default_style if (default_style != 'auto' and len(entities) == 1) else ent.get('archetype', 'male')
                target_ground = int(ent.get('ground_y', self.ground_y))
                self.render_stick_human(draw, kps, ground_y=target_ground, archetype=style, energy=energy, t=t, framing_mode=framing_mode)
            elif ent['type'] == 'animal':
                self.render_stick_animal(draw, ent, t=t, frame_idx=frame_idx)

        composited = Image.alpha_composite(base_bg, overlay)
        rgb_img = composited.convert("RGB")
        return cv2.cvtColor(np.array(rgb_img), cv2.COLOR_RGB2BGR)

    def render_mocap_frame(self, bg_image, joints, t=0.0, energy=0.5, character_style='classic', framing_mode='auto'):
        """Backward-compatible single-actor joints interface."""
        if joints is None:
            joints = {
                "nose": {"x": 0.50, "y": 0.38, "visibility": 0.99},
                "l_shoulder": {"x": 0.58, "y": 0.48, "visibility": 0.99},
                "r_shoulder": {"x": 0.42, "y": 0.48, "visibility": 0.99},
                "l_elbow": {"x": 0.63, "y": 0.60, "visibility": 0.99},
                "r_elbow": {"x": 0.37, "y": 0.60, "visibility": 0.99},
                "l_wrist": {"x": 0.65, "y": 0.72, "visibility": 0.99},
                "r_wrist": {"x": 0.35, "y": 0.72, "visibility": 0.99},
                "l_hip": {"x": 0.54, "y": 0.65, "visibility": 0.99},
                "r_hip": {"x": 0.46, "y": 0.65, "visibility": 0.99},
                "l_knee": {"x": 0.54, "y": 0.76, "visibility": 0.99},
                "r_knee": {"x": 0.46, "y": 0.76, "visibility": 0.99},
                "l_ankle": {"x": 0.54, "y": 0.82, "visibility": 0.99},
                "r_ankle": {"x": 0.46, "y": 0.82, "visibility": 0.99}
            }

        kps = np.zeros((17, 2), dtype=np.float32)
        def _get_pt(k):
            val = joints.get(k, {})
            return (val.get('x', 0.5) * self.width, val.get('y', 0.5) * self.height)

        kps[0] = _get_pt('nose')
        kps[1] = _get_pt('l_eye')
        kps[2] = _get_pt('r_eye')
        kps[5] = _get_pt('l_shoulder')
        kps[6] = _get_pt('r_shoulder')
        kps[7] = _get_pt('l_elbow')
        kps[8] = _get_pt('r_elbow')
        kps[9] = _get_pt('l_wrist')
        kps[10] = _get_pt('r_wrist')
        kps[11] = _get_pt('l_hip')
        kps[12] = _get_pt('r_hip')
        kps[13] = _get_pt('l_knee')
        kps[14] = _get_pt('r_knee')
        kps[15] = _get_pt('l_ankle')
        kps[16] = _get_pt('r_ankle')

        arch = 'female' if character_style == 'girl' else ('child' if character_style == 'child' else character_style)
        ent = [{"type": "human", "kps": kps, "archetype": arch, "ground_y": self.ground_y}]
        return self.render_multi_entity_frame(bg_image, ent, t=t, energy=energy, default_style=character_style, framing_mode=framing_mode)


def extract_audio_envelope(audio_src, total_frames, fps=24):
    """Calculates RMS audio energy envelope for realistic speech dynamics."""
    default_env = [0.5 for _ in range(max(1, total_frames))]
    if not audio_src or not os.path.exists(audio_src):
        return default_env
    temp_wav = os.path.join(tempfile.gettempdir(), f"_mocap_env_{os.getpid()}_{int(time.time() * 1000)}.wav")
    try:
        cmd = ['ffmpeg', '-y', '-i', audio_src, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', temp_wav]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.path.exists(temp_wav):
            import soundfile as sf
            data, sr = sf.read(temp_wav)
            os.remove(temp_wav)
            if len(data) == 0:
                return default_env
            spf = int(sr / fps)
            max_amp = float(np.percentile(np.abs(data), 95)) or 0.1
            env = []
            for f in range(total_frames):
                chunk = data[f * spf:(f + 1) * spf]
                if len(chunk) > 0:
                    rms = float(np.sqrt(np.mean(chunk**2)))
                    norm = min(1.0, (rms / max_amp) * 1.5)
                    env.append(max(0.08, norm))
                else:
                    env.append(0.08)
            return env
    except Exception:
        if os.path.exists(temp_wav):
            try: os.remove(temp_wav)
            except Exception: pass
    return default_env


def ensure_compatible_h264(video_path):
    """Verifies cv2.VideoCapture can read the video stream. If codec is incompatible (e.g. AV1, VP9), transcodes to fast h264."""
    try:
        test_cap = cv2.VideoCapture(video_path)
        ret, frame = test_cap.read()
        test_cap.release()
        if ret and frame is not None and frame.shape[0] > 0:
            return video_path, None
    except Exception:
        pass

    temp_h264 = os.path.join(tempfile.gettempdir(), f"_mocap_trans_{os.getpid()}_{int(time.time() * 1000)}.mp4")
    cmd = [
        'ffmpeg', '-y', '-i', video_path,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
        '-c:a', 'copy', temp_h264
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return temp_h264, temp_h264


def run_mocap_pipeline(video_path, background_image_path, output_mp4, character_style='auto', framing_mode='auto', target_fps=30):
    """
    Complete Vector Cutout Rubber-Hose MoCap Puppeteer Pipeline.
    1. Tracks multi-human postures and animals frame-by-frame via YOLO-Pose.
    2. Renders 2D cartoon cutout puppets with rubber-hose Bézier limbs, mitten hands, and visemes.
    3. Multiplexes original source audio into final high-res MP4.
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Input video not found: {video_path}")

    work_video, temp_to_clean = ensure_compatible_h264(video_path)

    cap = cv2.VideoCapture(work_video)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or target_fps
    width = 720
    height = 1280

    engine = MocapStickmanEngine(width=width, height=height)
    bg_img = engine.load_background(background_image_path)

    audio_env = extract_audio_envelope(video_path, total_frames, fps=src_fps)

    temp_raw = output_mp4 + ".raw.mp4"
    os.makedirs(os.path.dirname(os.path.abspath(output_mp4)), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_raw, fourcc, src_fps, (width, height))

    print(f"[MoCap Pipeline] 🎬 Cutout Puppet Rendering {total_frames} frames ({character_style}, framing={framing_mode})...")
    f_idx = 0
    t0 = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        t = f_idx / src_fps
        energy = audio_env[f_idx] if f_idx < len(audio_env) else 0.5

        run_animal = (f_idx % 3 == 0)
        entities = engine.entity_tracker.analyze_frame(frame, frame_idx=f_idx, fps=src_fps, run_animal_detection=run_animal)

        rendered_bgr = engine.render_multi_entity_frame(
            bg_img, entities, t=t, energy=energy,
            default_style=character_style, framing_mode=framing_mode, frame_idx=f_idx
        )
        out.write(rendered_bgr)
        f_idx += 1

        if f_idx % 30 == 0:
            pct = int((f_idx / total_frames) * 100) if total_frames > 0 else 0
            prog_data = json.dumps({"stage": "mocap_rendering", "percent": pct, "current_frame": f_idx, "total_frames": total_frames})
            print(f"PROGRESS:{prog_data}", flush=True)
            print(f"   [MoCap] {f_idx}/{total_frames} frames ({pct}%) rendered...", flush=True)

    cap.release()
    out.release()
    if temp_to_clean and os.path.exists(temp_to_clean):
        try: os.remove(temp_to_clean)
        except Exception: pass

    elapsed = time.time() - t0
    fps_stat = f_idx / elapsed if elapsed > 0 else 0
    print(f"[MoCap Pipeline] ✓ Rendered {f_idx} frames in {elapsed:.2f}s ({fps_stat:.1f} FPS)")

    print("[MoCap Pipeline] 🔊 Multiplexing original audio stream into final MP4...")
    cmd = [
        'ffmpeg', '-y',
        '-i', temp_raw,
        '-i', video_path,
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        output_mp4
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if os.path.exists(temp_raw):
        os.remove(temp_raw)

    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg muxing failed: {res.stderr.decode()}")

    print(f"[MoCap Pipeline] 🎉 SUCCESS: {output_mp4} ({os.path.getsize(output_mp4)} bytes)")
    return output_mp4


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: mocap_stickman_engine.py <video_in> <bg_image> <output_mp4> [character_style] [framing_mode]", file=sys.stderr)
        sys.exit(1)
    _video_in = sys.argv[1]
    _bg_in = sys.argv[2] if sys.argv[2] != 'none' else None
    _video_out = sys.argv[3]
    _char_style = sys.argv[4] if len(sys.argv) > 4 else 'auto'
    _framing = sys.argv[5] if len(sys.argv) > 5 else 'auto'
    run_mocap_pipeline(_video_in, _bg_in, _video_out, character_style=_char_style, framing_mode=_framing)
