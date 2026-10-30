#!/usr/bin/env python3
# [FL_INDEX: keywords="pro_stickman_engine, cartoon_puppet, bezier_limbs, procedural_lipsync, facial_rig, squash_stretch, studio_stage, slapstick_acting" | purpose="Sovereign high-fidelity cartoon stickman puppet engine with Bezier rubber-hose limbs, dynamic audio-driven lip-sync, expressive facial rigs, and 2.5D studio staging"]
"""
Stickman Studio Pro Cartoon Puppet & Stage Engine
High-fidelity 2D/2.5D animation engine delivering viral cartoon aesthetics
inspired by Stick Hub Animation and Alan Becker principles.
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import math
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

class ProStickmanEngine:
    def __init__(self, width=720, height=640):
        self.width = width
        self.height = height
        # Set desk height dynamically based on full vertical (1280) vs split PIP (640)
        if self.height > 800:
            self.desk_y = 780
            self.head_radius = 52
            self.host_x = int(self.width * 0.30)
            self.cohost_x = int(self.width * 0.70)
        else:
            self.desk_y = 390
            self.head_radius = 44
            self.host_x = 220
            self.cohost_x = 500

        # High-res TrueType fonts for clean comic pop-ups
        self.font_bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if not os.path.exists(self.font_bold_path):
            self.font_bold_path = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

    def _get_font(self, size):
        try:
            return ImageFont.truetype(self.font_bold_path, size)
        except Exception:
            return ImageFont.load_default()

    def quadratic_bezier(self, p0, p1, p2, num_points=24):
        points = []
        for i in range(num_points + 1):
            u = i / float(num_points)
            x = (1 - u)**2 * p0[0] + 2 * (1 - u) * u * p1[0] + u**2 * p2[0]
            y = (1 - u)**2 * p0[1] + 2 * (1 - u) * u * p1[1] + u**2 * p2[1]
            points.append((int(x), int(y)))
        return points

    def draw_bezier_limb(self, draw, p0, p1, p2, width=10, color=(255, 255, 255)):
        pts = self.quadratic_bezier(p0, p1, p2, num_points=24)
        if len(pts) >= 2:
            draw.line(pts, fill=color, width=width, joint="curve")
        r = width // 2
        for pt in [p0, p2]:
            draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=color)

    # -------------------------------------------------------------
    # LAYER 1: Background Wall & Neon Atmosphere (AI Scene / Custom / Thematic)
    # -------------------------------------------------------------
    def draw_background_wall(self, draw, t, bg_image_path=None, stage_theme='podcast_studio', pil_img=None):
        # Resolve background image path robustly
        resolved_bg = None
        if bg_image_path:
            bg_str = str(bg_image_path)
            if os.path.exists(bg_str):
                resolved_bg = bg_str
            else:
                app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                cands = [
                    os.path.join(app_root, 'data', 'backgrounds', os.path.basename(bg_str)),
                    os.path.join(app_root, bg_str.lstrip('/')),
                    os.path.join(app_root, 'data', bg_str.lstrip('/'))
                ]
                for c in cands:
                    if os.path.exists(c):
                        resolved_bg = c
                        break

        # Option A: Custom or AI Generated Background Image (Full-Frame 720x1280)
        if resolved_bg and os.path.exists(resolved_bg) and pil_img is not None:
            try:
                bg_raw = Image.open(resolved_bg).convert("RGBA")
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
                pil_img.paste(resized, (0, 0))

                # Ambient Neon Strip above Desk
                pulse = 0.85 + 0.15 * math.sin(t * 3.5)
                neon_c = (int(0 * pulse), int(229 * pulse), int(255 * pulse), 220)
                draw.line([(0, self.desk_y - 2), (self.width, self.desk_y - 2)], fill=neon_c, width=3)
                return True
            except Exception as e:
                print(f"[ProEngine] Warning loading background image {resolved_bg}: {e}", file=sys.stderr)

        # Option B: Thematic Procedural Backgrounds
        wall_h = self.desk_y + 10
        th = (stage_theme or 'podcast_studio').lower()
        if 'classroom' in th:
            for y in range(wall_h):
                ratio = y / float(wall_h)
                draw.line([(0, y), (self.width, y)], fill=(int(45 + 15 * ratio), int(75 + 20 * ratio), int(65 + 15 * ratio)))
            cb_mx = 50
            cb_top = int(wall_h * 0.12)
            cb_bot = int(wall_h * 0.88)
            draw.rounded_rectangle([cb_mx - 10, cb_top - 10, self.width - cb_mx + 10, cb_bot + 10], radius=12, fill=(120, 75, 40), outline=(80, 45, 20), width=3)
            draw.rounded_rectangle([cb_mx, cb_top, self.width - cb_mx, cb_bot], radius=8, fill=(28, 52, 40), outline=(20, 38, 30), width=2)
            draw.line([(cb_mx + 40, cb_top + 45), (cb_mx + 180, cb_top + 45)], fill=(210, 225, 210), width=2)
            draw.line([(cb_mx + 40, cb_top + 70), (cb_mx + 220, cb_top + 70)], fill=(210, 225, 210), width=2)
            draw.arc([cb_mx + 260, cb_top + 30, cb_mx + 330, cb_top + 100], 0, 360, fill=(240, 210, 80), width=3)
            draw.line([(cb_mx, cb_bot), (self.width - cb_mx, cb_bot)], fill=(170, 110, 55), width=6)
        elif 'courtroom' in th:
            for y in range(wall_h):
                ratio = y / float(wall_h)
                draw.line([(0, y), (self.width, y)], fill=(int(50 + 20 * ratio), int(25 + 15 * ratio), int(18 + 10 * ratio)))
            for cx in [65, self.width - 65]:
                draw.rectangle([cx - 26, 0, cx + 26, wall_h], fill=(70, 38, 25), outline=(40, 20, 12), width=3)
            em_cx, em_cy = self.width // 2, int(wall_h * 0.35)
            draw.ellipse([em_cx - 45, em_cy - 45, em_cx + 45, em_cy + 45], fill=(80, 45, 30), outline=(218, 165, 32), width=3)
            draw.line([(em_cx, em_cy - 24), (em_cx, em_cy + 24)], fill=(218, 165, 32), width=3)
            draw.line([(em_cx - 22, em_cy - 10), (em_cx + 22, em_cy - 10)], fill=(218, 165, 32), width=3)
        elif 'news' in th:
            for y in range(wall_h):
                ratio = y / float(wall_h)
                draw.line([(0, y), (self.width, y)], fill=(int(10 + 10 * ratio), int(18 + 22 * ratio), int(45 + 35 * ratio)))
            for gx in range(40, self.width, 50):
                draw.line([(gx, 20), (gx, wall_h - 10)], fill=(30, 55, 105), width=1)
            for gy in range(20, wall_h - 10, 35):
                draw.line([(20, gy), (self.width - 20, gy)], fill=(30, 55, 105), width=1)
            draw.arc([self.width // 2 - 180, 20, self.width // 2 + 180, wall_h - 30], 0, 360, fill=(0, 229, 255), width=3)
            draw.line([(0, wall_h - 12), (self.width, wall_h - 12)], fill=(225, 29, 72), width=8)
        elif 'cyber' in th:
            for y in range(wall_h):
                ratio = y / float(wall_h)
                draw.line([(0, y), (self.width, y)], fill=(int(12 + 18 * ratio), int(8 + 10 * ratio), int(26 + 28 * ratio)))
            hz_y = int(wall_h * 0.65)
            draw.ellipse([self.width // 2 - 60, hz_y - 60, self.width // 2 + 60, hz_y + 60], fill=(255, 110, 180), outline=(255, 220, 100), width=3)
            draw.line([(0, hz_y), (self.width, hz_y)], fill=(0, 240, 255), width=3)
            for gx in range(-60, self.width + 60, 50):
                draw.line([(self.width // 2, hz_y), (gx, wall_h)], fill=(168, 85, 247), width=2)
        elif 'living' in th:
            stripe_c1 = (45, 34, 48)
            stripe_c2 = (38, 28, 42)
            for x in range(0, self.width, 28):
                col = stripe_c1 if (x // 28) % 2 == 0 else stripe_c2
                draw.rectangle([x, 0, x + 28, wall_h], fill=col)
            draw.rounded_rectangle([self.width // 2 - 60, 40, self.width // 2 + 60, 130], radius=8, fill=(30, 24, 35), outline=(218, 165, 32), width=3)
            draw.ellipse([self.width // 2 - 18, 70, self.width // 2 + 18, 106], fill=(234, 179, 8))
        else:
            # Default Modern Podcast Studio
            for y in range(0, wall_h):
                ratio = y / float(wall_h)
                r = int(14 + 10 * ratio)
                g = int(20 + 14 * ratio)
                b = int(32 + 20 * ratio)
                draw.line([(0, y), (self.width, y)], fill=(r, g, b))

            hex_color = (32, 44, 66)
            accent_cyan = (56, 189, 248)
            accent_yellow = (234, 179, 8)
            for col in range(6):
                hx = 60 + col * 120
                hy = int(self.desk_y * 0.24) + (col % 2) * 45
                draw.rounded_rectangle([hx - 42, hy - 45, hx + 42, hy + 45], radius=12, outline=hex_color, width=2)
                if col == 1:
                    draw.line([(hx - 24, hy), (hx + 24, hy)], fill=accent_yellow, width=3)
                elif col == 4:
                    draw.line([(hx - 24, hy), (hx + 24, hy)], fill=accent_cyan, width=3)

        # Ambient Neon Strip above Desk
        pulse = 0.85 + 0.15 * math.sin(t * 3.5)
        neon_c = (int(0 * pulse), int(229 * pulse), int(255 * pulse))
        draw.line([(0, self.desk_y - 2), (self.width, self.desk_y - 2)], fill=neon_c, width=4)

    # -------------------------------------------------------------
    # LAYER 2: Studio Chairs (Behind characters)
    # -------------------------------------------------------------
    def draw_studio_chair(self, draw, cx, cy):
        chair_col = (24, 32, 48)
        c_rim = (45, 60, 85)
        scale = 1.2 if self.height > 800 else 1.0
        # Headrest
        hr_w = int(36 * scale)
        hr_top = cy - int(180 * scale)
        hr_bot = cy - int(130 * scale)
        draw.rounded_rectangle([cx - hr_w, hr_top, cx + hr_w, hr_bot], radius=10, fill=chair_col, outline=c_rim, width=2)
        # Backrest
        bw_top = int(44 * scale)
        bw_bot = int(48 * scale)
        draw.polygon([
            (cx - bw_top, hr_bot), (cx + bw_top, hr_bot),
            (cx + bw_bot, cy - 15), (cx - bw_bot, cy - 15)
        ], fill=chair_col)
        draw.line([(cx - bw_top, hr_bot), (cx - bw_bot, cy - 15)], fill=c_rim, width=2)
        draw.line([(cx + bw_top, hr_bot), (cx + bw_bot, cy - 15)], fill=c_rim, width=2)
        # Racing Stripe Accent
        draw.line([(cx, cy - int(120 * scale)), (cx, cy - 25)], fill=(56, 189, 248), width=3)

    # -------------------------------------------------------------
    # LAYER 3: Character Body, Head, and Facial Animation
    # -------------------------------------------------------------
    def draw_character_torso_and_head(self, draw, x, is_host=True, emotion="happy",
                                      speaking=True, speech_energy=0.7, t=0.0):
        breath = math.sin(t * 3.5 + (0.0 if is_host else 1.3)) * 3.5
        bob = math.cos(t * 8.0) * (3.0 if speaking else 0.8) * speech_energy
        sway = math.sin(t * 2.5) * (4.0 if speaking else 1.0)

        # Dynamic squash and stretch
        squash = 1.0 + (0.10 * speech_energy * math.sin(t * 16.0) if speaking else 0.0)
        stretch = 1.0 / math.sqrt(max(0.65, squash))

        head_radius = self.head_radius
        head_cx = int(x + sway)
        head_offset = int(150 * (self.height / 640.0) * 0.95)
        head_cy = int(self.desk_y - head_offset + breath + bob)

        neck_pt = (head_cx, int(head_cy + head_radius * stretch * 0.85))
        chest_pt = (head_cx, int(neck_pt[1] + (52 if self.height > 800 else 46)))
        seat_pt = (x, self.desk_y + 20)

        # Spine
        spine_ctrl = (int((chest_pt[0] + seat_pt[0]) / 2 + (6 if is_host else -6)), int((chest_pt[1] + seat_pt[1]) / 2))
        self.draw_bezier_limb(draw, neck_pt, spine_ctrl, seat_pt, width=12, color=(255, 255, 255))

        # Upper Arm Stubs (shoulders)
        sh_w = 34 if self.height > 800 else 32
        l_sh = (chest_pt[0] - sh_w, chest_pt[1])
        r_sh = (chest_pt[0] + sh_w, chest_pt[1])

        # Head assembly (Solid white oval with 4px dark border)
        hr_x = int(head_radius * (1.0 / stretch))
        hr_y = int(head_radius * stretch)

        head_box = [head_cx - hr_x, head_cy - hr_y, head_cx + hr_x, head_cy + hr_y]
        draw.ellipse([head_box[0] - 4, head_box[1] - 4, head_box[2] + 4, head_box[3] + 4], fill=(15, 23, 42))
        draw.ellipse(head_box, fill=(255, 255, 255))

        # Facial Assembly
        blink_cycle = (t + (0.0 if is_host else 1.6)) % 3.2
        is_blinking = blink_cycle < 0.16

        eye_spacing = int(19 * (head_radius / 44.0))
        eye_y = head_cy - 7
        eye_w = int(10 * (head_radius / 44.0))
        eye_h = int(14 * (head_radius / 44.0)) if not is_blinking else 2

        l_eye_cx = head_cx - eye_spacing
        r_eye_cx = head_cx + eye_spacing

        gaze_x = 4 if is_host else -4
        gaze_y = 1

        if is_blinking:
            draw.line([(l_eye_cx - eye_w, eye_y), (l_eye_cx + eye_w, eye_y)], fill=(15, 23, 42), width=3)
            draw.line([(r_eye_cx - eye_w, eye_y), (r_eye_cx + eye_w, eye_y)], fill=(15, 23, 42), width=3)
        else:
            # Sclera
            draw.ellipse([l_eye_cx - eye_w, eye_y - eye_h, l_eye_cx + eye_w, eye_y + eye_h], fill=(255, 255, 255), outline=(15, 23, 42), width=2)
            draw.ellipse([r_eye_cx - eye_w, eye_y - eye_h, r_eye_cx + eye_w, eye_y + eye_h], fill=(255, 255, 255), outline=(15, 23, 42), width=2)
            # Pupils with specular dot
            pr = int(6 * (head_radius / 44.0))
            l_px, l_py = l_eye_cx + gaze_x, eye_y + gaze_y
            r_px, r_py = r_eye_cx + gaze_x, eye_y + gaze_y
            draw.ellipse([l_px - pr, l_py - pr, l_px + pr, l_py + pr], fill=(15, 23, 42))
            draw.ellipse([l_px - 2, l_py - 3, l_px, l_py - 1], fill=(255, 255, 255))
            draw.ellipse([r_px - pr, r_py - pr, r_px + pr, r_py + pr], fill=(15, 23, 42))
            draw.ellipse([r_px - 2, r_py - 3, r_px, r_py - 1], fill=(255, 255, 255))

        # Eyebrows
        brow_y = eye_y - 20
        if emotion == "confused":
            draw.arc([l_eye_cx - 12, brow_y - 8, l_eye_cx + 12, brow_y + 8], start=190, end=350, fill=(15, 23, 42), width=3)
            draw.line([(r_eye_cx - 10, brow_y + 4), (r_eye_cx + 10, brow_y - 2)], fill=(15, 23, 42), width=3)
        elif emotion == "angry":
            draw.line([(l_eye_cx - 12, brow_y - 4), (l_eye_cx + 10, brow_y + 4)], fill=(15, 23, 42), width=4)
            draw.line([(r_eye_cx - 10, brow_y + 4), (r_eye_cx + 12, brow_y - 4)], fill=(15, 23, 42), width=4)
        else: # Happy arched
            draw.arc([l_eye_cx - 11, brow_y - 6, l_eye_cx + 11, brow_y + 6], start=200, end=340, fill=(15, 23, 42), width=3)
            draw.arc([r_eye_cx - 11, brow_y - 6, r_eye_cx + 11, brow_y + 6], start=200, end=340, fill=(15, 23, 42), width=3)

        # Procedural Lip-Sync Mouth
        mouth_y = head_cy + 18
        if speaking:
            open_h = int(5 + 17 * speech_energy * abs(math.sin(t * 18.0)))
            open_w = 17 + int(7 * speech_energy)
            mouth_box = [head_cx - open_w, mouth_y - open_h, head_cx + open_w, mouth_y + open_h]
            draw.ellipse(mouth_box, fill=(74, 14, 23), outline=(15, 23, 42), width=2)
            if open_h > 8:
                draw.rectangle([head_cx - open_w + 4, mouth_y - open_h + 2, head_cx + open_w - 4, mouth_y - open_h + 7], fill=(255, 255, 255))
            draw.ellipse([head_cx - 8, mouth_y + open_h - 10, head_cx + 8, mouth_y + open_h], fill=(255, 107, 139))
        else:
            draw.arc([head_cx - 14, mouth_y - 10, head_cx + 14, mouth_y + 10], start=20, end=160, fill=(15, 23, 42), width=3)

        # Accessories
        if is_host:
            # Pro Studio Headphones
            draw.arc([head_cx - hr_x - 4, head_cy - hr_y - 5, head_cx + hr_x + 4, head_cy + 12], start=180, end=360, fill=(234, 179, 8), width=5)
            draw.rounded_rectangle([head_cx - hr_x - 9, head_cy - 14, head_cx - hr_x + 3, head_cy + 20], radius=5, fill=(234, 179, 8), outline=(15, 23, 42), width=2)
            draw.rounded_rectangle([head_cx + hr_x - 3, head_cy - 14, head_cx + hr_x + 9, head_cy + 20], radius=5, fill=(234, 179, 8), outline=(15, 23, 42), width=2)
        else:
            # Modern Cyan Glasses
            draw.rectangle([l_eye_cx - 13, eye_y - 13, l_eye_cx + 13, eye_y + 13], outline=(56, 189, 248), width=3)
            draw.rectangle([r_eye_cx - 13, eye_y - 13, r_eye_cx + 13, eye_y + 13], outline=(56, 189, 248), width=3)
            draw.line([(l_eye_cx + 13, eye_y), (r_eye_cx - 13, eye_y)], fill=(56, 189, 248), width=3)

        return (l_sh, r_sh, head_cx, head_cy)

    # -------------------------------------------------------------
    # LAYER 4: Foreground Podcast Desk (In front of torsos!)
    # -------------------------------------------------------------
    def draw_foreground_desk(self, draw, has_custom_bg=False, pil_img=None):
        if has_custom_bg and pil_img is not None:
            # Modern sleek translucent acrylic desk bar with cyan neon edge
            overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
            o_draw = ImageDraw.Draw(overlay)
            desk_h = max(55, int((self.height - self.desk_y) * 0.35))
            o_draw.rounded_rectangle([20, self.desk_y, self.width - 20, self.desk_y + desk_h],
                                     radius=12, fill=(15, 23, 42, 140), outline=(0, 229, 255, 220), width=3)
            o_draw.line([(35, self.desk_y + 4), (self.width - 35, self.desk_y + 4)], fill=(255, 255, 255, 120), width=2)
            pil_img.alpha_composite(overlay)
        else:
            for y in range(self.desk_y, self.height):
                ratio = (y - self.desk_y) / float(self.height - self.desk_y)
                r = int(50 - 24 * ratio)
                g = int(34 - 18 * ratio)
                b = int(24 - 12 * ratio)
                draw.line([(0, y), (self.width, y)], fill=(r, g, b))

            draw.line([(0, self.desk_y), (self.width, self.desk_y)], fill=(130, 90, 60), width=3)
            draw.line([(0, self.desk_y + 3), (self.width, self.desk_y + 3)], fill=(80, 52, 32), width=2)

    # -------------------------------------------------------------
    # LAYER 5: Forearms, Hands on Desk, Props, Mics
    # -------------------------------------------------------------
    def draw_arms_and_props(self, draw, l_sh, r_sh, is_host=True, action="talk", speaking=True, speech_energy=0.7, t=0.0):
        stroke_color = (255, 255, 255)
        stroke_thick = 10
        table_rest_y = self.desk_y + 45

        if action == "point":
            l_el = (l_sh[0] - 20, self.desk_y + 15)
            l_wr = (l_sh[0] + 15, table_rest_y)
            r_el = (r_sh[0] + 35, self.desk_y - 15)
            r_wr = (r_sh[0] + 105, self.desk_y - 25)
            self.draw_bezier_limb(draw, l_sh, l_el, l_wr, width=stroke_thick, color=stroke_color)
            self.draw_bezier_limb(draw, r_sh, r_el, r_wr, width=stroke_thick, color=stroke_color)
            self.draw_cartoon_hand(draw, l_wr, pointing=False, facing_right=True)
            self.draw_cartoon_hand(draw, r_wr, pointing=True, facing_right=True)

        elif action == "shrug":
            l_el = (l_sh[0] - 32, self.desk_y - 10)
            l_wr = (l_sh[0] - 48, self.desk_y - 45)
            r_el = (r_sh[0] + 32, self.desk_y - 10)
            r_wr = (r_sh[0] + 48, self.desk_y - 45)
            self.draw_bezier_limb(draw, l_sh, l_el, l_wr, width=stroke_thick, color=stroke_color)
            self.draw_bezier_limb(draw, r_sh, r_el, r_wr, width=stroke_thick, color=stroke_color)
            self.draw_cartoon_hand(draw, l_wr, pointing=False, facing_right=False)
            self.draw_cartoon_hand(draw, r_wr, pointing=False, facing_right=True)

        elif action == "desk_slam":
            l_el = (l_sh[0] - 30, self.desk_y + 10)
            l_wr = (l_sh[0] - 10, self.desk_y + 35)
            r_el = (r_sh[0] + 30, self.desk_y + 10)
            r_wr = (r_sh[0] + 10, self.desk_y + 35)
            self.draw_bezier_limb(draw, l_sh, l_el, l_wr, width=stroke_thick, color=stroke_color)
            self.draw_bezier_limb(draw, r_sh, r_el, r_wr, width=stroke_thick, color=stroke_color)
            self.draw_cartoon_hand(draw, l_wr, pointing=False, facing_right=True)
            self.draw_cartoon_hand(draw, r_wr, pointing=False, facing_right=False)

        else:
            gesture = math.sin(t * 7.5) * 14.0 * speech_energy if speaking else 0.0
            l_el = (l_sh[0] - 22, self.desk_y + 15)
            l_wr = (l_sh[0] + 12, table_rest_y)
            r_el = (r_sh[0] + 28, self.desk_y + 10 - int(gesture * 0.4))
            r_wr = (r_sh[0] + 55, table_rest_y - int(gesture))
            self.draw_bezier_limb(draw, l_sh, l_el, l_wr, width=stroke_thick, color=stroke_color)
            self.draw_bezier_limb(draw, r_sh, r_el, r_wr, width=stroke_thick, color=stroke_color)
            self.draw_cartoon_hand(draw, l_wr, pointing=False, facing_right=True)
            self.draw_cartoon_hand(draw, r_wr, pointing=False, facing_right=True)

    def draw_cartoon_hand(self, draw, pt, pointing=False, facing_right=True):
        hx, hy = pt
        r = 10
        draw.ellipse([hx - r, hy - r, hx + r, hy + r], fill=(255, 255, 255), outline=(15, 23, 42), width=2)
        if pointing:
            dx = 18 if facing_right else -18
            draw.line([(hx, hy), (hx + dx, hy - 4)], fill=(255, 255, 255), width=7)
            draw.line([(hx, hy), (hx + dx, hy - 4)], fill=(15, 23, 42), width=2)
            draw.ellipse([hx + dx - 4, hy - 8, hx + dx + 4, hy], fill=(255, 255, 255))
        else:
            tx = hx + (6 if facing_right else -6)
            ty = hy - 6
            draw.ellipse([tx - 4, ty - 4, tx + 4, ty + 4], fill=(255, 255, 255))

    def draw_desk_centerpiece_and_mics(self, draw, t):
        desk_y = self.desk_y
        # Center Laptop
        lx, ly = self.width // 2, desk_y + 35
        draw.polygon([(lx - 55, ly + 25), (lx + 55, ly + 25), (lx + 45, ly), (lx - 45, ly)], fill=(71, 85, 105))
        draw.polygon([(lx - 45, ly), (lx + 45, ly), (lx + 40, ly - 50), (lx - 40, ly - 50)], fill=(30, 41, 59))
        draw.rectangle([lx - 36, ly - 46, lx + 36, ly - 4], fill=(15, 23, 42), outline=(56, 189, 248), width=2)
        draw.ellipse([lx - 8, ly - 28, lx + 8, ly - 12], fill=(0, 229, 255))

        # Microphones
        mic1_x = int(self.host_x + 30)
        mic2_x = int(self.cohost_x - 30)
        self.draw_mic(draw, x=mic1_x, y=desk_y + 10, facing_right=True)
        self.draw_mic(draw, x=mic2_x, y=desk_y + 10, facing_right=False)

        # Host Coffee Mug
        mx, my = int(self.host_x - 75), desk_y + 55
        draw.rounded_rectangle([mx - 14, my - 20, mx + 14, my + 15], radius=4, fill=(239, 68, 68), outline=(255, 255, 255), width=2)
        draw.arc([mx + 10, my - 12, mx + 24, my + 8], start=-90, end=90, fill=(255, 255, 255), width=3)
        steam_y = my - 26 - int(abs(math.sin(t * 4.0)) * 12)
        draw.arc([mx - 6, steam_y, mx + 6, steam_y + 12], start=0, end=180, fill=(200, 200, 200), width=2)

    def draw_mic(self, draw, x, y, facing_right=True):
        draw.ellipse([x - 12, y + 20, x + 12, y + 30], fill=(15, 23, 42), outline=(100, 116, 139), width=2)
        draw.line([(x, y + 25), (x, y - 10)], fill=(71, 85, 105), width=4)
        angle = -25 if facing_right else 25
        rad = math.radians(angle)
        mx = x + int(math.sin(rad) * 20)
        my = y - 10 - int(math.cos(rad) * 20)
        draw.line([(x, y - 10), (mx, my)], fill=(100, 116, 139), width=3)
        capsule_dx = 18 if facing_right else -18
        capsule_dy = -8
        cx1, cy1 = mx, my
        cx2, cy2 = mx + capsule_dx, my + capsule_dy
        draw.line([(cx1, cy1), (cx2, cy2)], fill=(30, 41, 59), width=14)
        draw.ellipse([cx2 - 8, cy2 - 8, cx2 + 8, cy2 + 8], fill=(15, 23, 42))
        draw.line([(cx1 + capsule_dx//2, cy1 + capsule_dy//2 - 7), (cx1 + capsule_dx//2, cy1 + capsule_dy//2 + 7)], fill=(0, 229, 255), width=2)

    # -------------------------------------------------------------
    # LAYER 6: Comic Shout Pop-Up & Overlays
    # -------------------------------------------------------------
    def draw_comic_shout_bubble(self, draw, text, speaker_pos, is_host=True, t=0.0):
        if not text:
            return
        sx, sy = speaker_pos
        bx = sx - 60 if is_host else sx - 160
        by = sy - 180

        font = self._get_font(26)
        tag_font = self._get_font(14)

        text_bbox = font.getbbox(text)
        tw = text_bbox[2] - text_bbox[0]
        th = text_bbox[3] - text_bbox[1]

        bw = max(210, tw + 42)
        bh = th + 36

        bx = max(16, min(self.width - bw - 16, bx))
        by = max(16, by)

        tail_tip = (sx, sy - 90)
        tail_poly = [(bx + 50, by + bh - 2), (bx + 85, by + bh - 2), tail_tip]

        draw.polygon([(p[0] + 4, p[1] + 4) for p in tail_poly], fill=(10, 15, 25, 120))
        draw.rounded_rectangle([bx + 4, by + 4, bx + bw + 4, by + bh + 4], radius=16, fill=(10, 15, 25, 120))

        bubble_bg = (255, 255, 255)
        border_col = (234, 179, 8) if is_host else (56, 189, 248)
        draw.polygon(tail_poly, fill=bubble_bg)
        draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=16, fill=bubble_bg, outline=border_col, width=4)
        draw.polygon(tail_poly, outline=border_col, fill=bubble_bg)

        tag = "HOST" if is_host else "CO-HOST"
        tag_col = (202, 138, 4) if is_host else (2, 132, 199)
        draw.text((bx + 16, by + 6), tag, font=tag_font, fill=tag_col)
        draw.text((bx + 16, by + 24), text, font=font, fill=(15, 23, 42))

    # -------------------------------------------------------------
    # MASTER RENDERER: Full 6-Layer Compositing Pipeline
    # -------------------------------------------------------------
    def render_full_frame(self, beat_data, t=0.0, energy=0.7):
        pil_img = Image.new("RGBA", (self.width, self.height), (15, 23, 42, 255))
        draw = ImageDraw.Draw(pil_img)

        # Layer 1: Background Wall & Neon Strip (Custom AI Image / Thematic / Studio)
        custom_bg = beat_data.get("background_image") or beat_data.get("background_path")
        stage_theme = beat_data.get("stage_theme") or beat_data.get("background", "podcast_studio")
        has_custom_bg = bool(self.draw_background_wall(draw, t, bg_image_path=custom_bg, stage_theme=stage_theme, pil_img=pil_img))

        # Layer 2: Ergonomic Studio Chairs (omitted when custom scenery is present so scenery is not blocked)
        if not has_custom_bg:
            self.draw_studio_chair(draw, cx=self.host_x, cy=self.desk_y)
            self.draw_studio_chair(draw, cx=self.cohost_x, cy=self.desk_y)

        # Layer 3: Character Torsos and Heads
        host_speaking = beat_data.get("speaking_actor", "HOST") == "HOST"
        # Determine host / cohost action
        beat_action = beat_data.get("action") or beat_data.get("pose", "talk")
        host_action = beat_action if host_speaking else "listen"
        host_energy = energy if host_speaking else 0.2
        l_sh_h, r_sh_h, h_cx, h_cy = self.draw_character_torso_and_head(
            draw, x=self.host_x, is_host=True, emotion=beat_data.get("emotion", "happy"),
            speaking=host_speaking, speech_energy=host_energy, t=t
        )

        cohost_speaking = not host_speaking
        cohost_action = beat_action if cohost_speaking else "listen"
        cohost_energy = energy if cohost_speaking else 0.2
        l_sh_c, r_sh_c, c_cx, c_cy = self.draw_character_torso_and_head(
            draw, x=self.cohost_x, is_host=False, emotion=beat_data.get("emotion", "confused"),
            speaking=cohost_speaking, speech_energy=cohost_energy, t=t
        )

        # Layer 4: Foreground Desk Surface (Translucent modern acrylic when custom scenery is present)
        self.draw_foreground_desk(draw, has_custom_bg=has_custom_bg, pil_img=pil_img)

        # Layer 5: Character Hands & Forearms resting/gesturing on desk + Microphones & Props
        self.draw_arms_and_props(draw, l_sh_h, r_sh_h, is_host=True, action=host_action,
                                 speaking=host_speaking, speech_energy=host_energy, t=t)
        self.draw_arms_and_props(draw, l_sh_c, r_sh_c, is_host=False, action=cohost_action,
                                 speaking=cohost_speaking, speech_energy=cohost_energy, t=t)
        self.draw_desk_centerpiece_and_mics(draw, t)

        # Layer 6: Comic Speech Bubble Pop-Up
        shout_text = beat_data.get("comic_shout") or beat_data.get("text", "")
        speaker_pos = (h_cx, h_cy) if host_speaking else (c_cx, c_cy)
        self.draw_comic_shout_bubble(draw, shout_text, speaker_pos, is_host=host_speaking, t=t)

        # Return RGB NumPy image for video rendering
        rgb_img = pil_img.convert("RGB")
        return cv2.cvtColor(np.array(rgb_img), cv2.COLOR_RGB2BGR)
