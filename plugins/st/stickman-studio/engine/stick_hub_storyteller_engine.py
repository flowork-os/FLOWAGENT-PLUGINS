#!/usr/bin/env python3
# [FL_INDEX: keywords="stick_hub_storyteller_engine, stickman_animation, viral_cartoon, kinetic_subtitles, walk_cycle, audio_lipsync, rubber_hose, storytelling" | purpose="Sovereign Stick Hub animated storyteller engine delivering high-fidelity full-body solo cartoon stickman animations with dynamic walk cycles, lip-sync, expressive poses, and clean kinetic subtitles"]
"""
Stick Hub Animated Storyteller Engine
High-fidelity 2D dynamic animation engine inspired by Stick Hub Animation
and Alan Becker viral cartoon standards.
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import math
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Import props from stickman_renderer if available
try:
    from stickman_renderer import PROP_DRAW, Local, G, font
except ImportError:
    PROP_DRAW = {}
    Local = None
    G = None
    font = None


def ease_out_back(x):
    x = max(0.0, min(1.0, x))
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


class StorytellerCanvas:
    """Logical coordinate canvas wrapper with exact 1.0 scaling."""
    def __init__(self, img):
        self.d = ImageDraw.Draw(img)
        self.s = 1.0

    def p(self, pt):
        return (int(pt[0] * self.s), int(pt[1] * self.s))

    def wd(self, w):
        return max(1, int(round(w * self.s)))

    def line(self, pts, w, col=(27, 27, 31)):
        pp = [self.p(q) for q in pts]
        self.d.line(pp, fill=col, width=self.wd(w), joint="curve")
        r = w * self.s / 2
        for q in (pp[0], pp[-1]):
            self.d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=col)

    def circle(self, c, r, fill=None, outline=None, w=0):
        x, y = self.p(c)
        r = r * self.s
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=outline, width=self.wd(w) if outline else 0)

    def ellipse(self, box, fill=None, outline=None, w=0):
        self.d.ellipse([*self.p(box[:2]), *self.p(box[2:])], fill=fill, outline=outline, width=self.wd(w) if outline else 0)

    def rrect(self, box, rad, fill=None, outline=None, w=0):
        self.d.rounded_rectangle([*self.p(box[:2]), *self.p(box[2:])], radius=rad * self.s, fill=fill,
                                 outline=outline, width=self.wd(w) if outline else 0)

    def poly(self, pts, fill=None, outline=None, w=0):
        pp = [self.p(q) for q in pts]
        if fill:
            self.d.polygon(pp, fill=fill)
        if outline:
            self.line(list(pts) + [pts[0], pts[1]], w, outline)

    def arc(self, box, a0, a1, col, w):
        self.d.arc([*self.p(box[:2]), *self.p(box[2:])], a0, a1, fill=col, width=self.wd(w))

    def text(self, xy, s, px, fill=(27, 27, 31), stroke=0, stroke_fill=(27, 27, 31), anchor="mm"):
        self.d.text(self.p(xy), s, font=font(int(px * self.s)) if font else ImageFont.load_default(), fill=fill, anchor=anchor)


class StorytellerLocal:
    """Prop local space centered around cx, cy."""
    def __init__(self, g, cx, cy, k, bg, acc):
        self.g, self.cx, self.cy, self.k, self.bg, self.acc = g, cx, cy, k, bg, acc

    def pt(self, x, y):
        return (self.cx + x * self.k, self.cy + y * self.k)

    def line(self, pts, w=10, col=(27, 27, 31)):
        self.g.line([self.pt(*q) for q in pts], w * self.k, col)

    def circle(self, x, y, r, fill=None, ink=True, w=9):
        self.g.circle(self.pt(x, y), r * self.k, fill, (27, 27, 31) if ink else None, w * self.k)

    def ell(self, x0, y0, x1, y1, fill=None, ink=True, w=9):
        self.g.ellipse([*self.pt(x0, y0), *self.pt(x1, y1)], fill, (27, 27, 31) if ink else None, w * self.k)

    def rrect(self, x0, y0, x1, y1, rad=14, fill=None, ink=True, w=9):
        self.g.rrect([*self.pt(x0, y0), *self.pt(x1, y1)], rad * self.k, fill, (27, 27, 31) if ink else None, w * self.k)

    def poly(self, pts, fill=None, ink=True, w=9):
        self.g.poly([self.pt(*q) for q in pts], fill, (27, 27, 31) if ink else None, w * self.k)

    def arc(self, x0, y0, x1, y1, a0, a1, w=9, col=(27, 27, 31)):
        self.g.arc([*self.pt(x0, y0), *self.pt(x1, y1)], a0, a1, col, w * self.k)

    def text(self, x, y, s, px, fill=(27, 27, 31), stroke=0):
        self.g.text(self.pt(x, y), s, px * self.k, fill, stroke * self.k)


class StickHubStorytellerEngine:
    def __init__(self, width=720, height=1280):
        self.width = width
        self.height = height
        self.is_landscape = (self.width > self.height)
        if self.is_landscape:
            self.scale = 1.05 * (self.height / 720.0)
            self.ground_y = int(self.height * 0.84)
            self.cx = int(self.width * 0.36)
        else:
            self.scale = 1.15 * (self.height / 1280.0)
            self.ground_y = int(self.height * 0.82)
            self.cx = self.width // 2

        # High-res TrueType fonts for clean kinetic subtitles and UI
        self.font_bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if not os.path.exists(self.font_bold_path):
            self.font_bold_path = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

    def _get_font(self, size):
        try:
            return ImageFont.truetype(self.font_bold_path, int(size))
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

    def draw_bezier_limb(self, draw, p0, p1, p2, width=12, color=(27, 27, 31), outline=(255, 255, 255), outline_w=2):
        pts = self.quadratic_bezier(p0, p1, p2, num_points=24)
        if len(pts) >= 2:
            if outline and outline_w > 0:
                draw.line(pts, fill=outline, width=width + outline_w * 2, joint="curve")
            draw.line(pts, fill=color, width=width, joint="curve")
        r = width // 2
        for pt in [p0, p2]:
            if outline and outline_w > 0:
                draw.ellipse([pt[0] - r - outline_w, pt[1] - r - outline_w,
                              pt[0] + r + outline_w, pt[1] + r + outline_w], fill=outline)
            draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=color)

    # -------------------------------------------------------------
    # LAYER 1: Background & Ground Staging
    # -------------------------------------------------------------
    def draw_background(self, pil_img, draw, t, bg_image_path=None, stage_theme='minimal_clean'):
        # Option A: Custom or AI Generated Background Image
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
                pil_img.paste(resized, (0, 0))

                # Soft ground horizon shadow
                ground_overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
                g_draw = ImageDraw.Draw(ground_overlay)
                g_draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=(0, 0, 0, 60), width=3)
                pil_img.alpha_composite(ground_overlay)
                return (240, 240, 240)
            except Exception as e:
                print(f"[StickHubEngine] Warning loading bg {bg_image_path}: {e}", file=sys.stderr)

        th = (stage_theme or 'minimal_clean').lower()

        # Option B: Lyrical Narrative Music Video Dynamic Procedural Stages
        if 'raining_street' in th or 'rain' in th:
            # Dark rainy night street
            for y in range(self.ground_y):
                ratio = y / float(self.ground_y)
                r, g, b = int(10 + 10 * ratio), int(15 + 12 * ratio), int(28 + 18 * ratio)
                draw.line([(0, y), (self.width, y)], fill=(r, g, b))
            # Wet asphalt ground
            draw.rectangle([0, self.ground_y, self.width, self.height], fill=(12, 14, 20))
            draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=(40, 60, 90), width=3)
            # Streetlamp light cone
            lamp_x = int(self.width * 0.82) if not self.is_landscape else int(self.width * 0.88)
            lamp_overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
            l_draw = ImageDraw.Draw(lamp_overlay)
            l_draw.line([(lamp_x, int(self.height * 0.2)), (lamp_x, self.ground_y)], fill=(30, 35, 45, 255), width=6)
            l_draw.ellipse([lamp_x - 14, int(self.height * 0.2) - 10, lamp_x + 14, int(self.height * 0.2) + 10], fill=(254, 240, 138, 255))
            l_draw.polygon([(lamp_x, int(self.height * 0.2)), (lamp_x - 120, self.ground_y), (lamp_x + 120, self.ground_y)], fill=(254, 240, 138, 30))
            # Falling animated rain streaks
            for i in range(45):
                rx = (int(i * 37 + t * 900) % self.width)
                ry = (int(i * 59 + t * 1400) % self.ground_y)
                l_draw.line([(rx, ry), (rx - 6, ry + 18)], fill=(186, 230, 253, 110), width=1)
            pil_img.alpha_composite(lamp_overlay)
            return (20, 28, 48)

        elif 'bedroom_night' in th:
            # Melancholy bedroom at night
            for y in range(self.ground_y):
                ratio = y / float(self.ground_y)
                r, g, b = int(14 + 10 * ratio), int(18 + 10 * ratio), int(34 + 12 * ratio)
                draw.line([(0, y), (self.width, y)], fill=(r, g, b))
            draw.rectangle([0, self.ground_y, self.width, self.height], fill=(16, 20, 30))
            draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=(35, 45, 65), width=3)
            # Window with pale moonlight
            wx0 = int(self.width * 0.65) if self.is_landscape else int(self.width * 0.58)
            wy0 = int(self.height * 0.15)
            ww, wh = int(140 * self.scale), int(180 * self.scale)
            draw.rectangle([wx0, wy0, wx0 + ww, wy0 + wh], fill=(20, 32, 55), outline=(50, 65, 95), width=3)
            draw.line([(wx0 + ww // 2, wy0), (wx0 + ww // 2, wy0 + wh)], fill=(50, 65, 95), width=2)
            draw.line([(wx0, wy0 + wh // 2), (wx0 + ww, wy0 + wh // 2)], fill=(50, 65, 95), width=2)
            # Crescent moon in window
            draw.ellipse([wx0 + int(ww * 0.65), wy0 + int(wh * 0.25), wx0 + int(ww * 0.85), wy0 + int(wh * 0.45)], fill=(254, 240, 138))
            draw.ellipse([wx0 + int(ww * 0.68), wy0 + int(wh * 0.23), wx0 + int(ww * 0.88), wy0 + int(wh * 0.43)], fill=(20, 32, 55))
            return (18, 22, 36)

        elif 'dream_void' in th:
            # Deep abstract dream void with floating nebula particles
            for y in range(self.height):
                ratio = y / float(self.height)
                r, g, b = int(8 + 15 * ratio), int(10 + 8 * ratio), int(26 + 22 * ratio)
                draw.line([(0, y), (self.width, y)], fill=(r, g, b))
            void_overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
            v_draw = ImageDraw.Draw(void_overlay)
            for i in range(25):
                px = (int(i * 61 + math.sin(t * 0.5 + i) * 80) % self.width)
                py = (int(i * 73 - t * 45) % self.height)
                pr = int(2 + (i % 4) * self.scale)
                alpha = int(90 + 70 * math.sin(t * 2.0 + i))
                v_draw.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(0, 229, 255, alpha))
            pil_img.alpha_composite(void_overlay)
            return (18, 12, 35)

        elif 'rooftop_stars' in th:
            # Starry night sky on rooftop
            for y in range(self.ground_y):
                ratio = y / float(self.ground_y)
                r, g, b = int(5 + 8 * ratio), int(7 + 10 * ratio), int(20 + 20 * ratio)
                draw.line([(0, y), (self.width, y)], fill=(r, g, b))
            # Twinkling stars
            for i in range(35):
                sx = (i * 53) % self.width
                sy = (i * 37) % int(self.ground_y * 0.75)
                twinkle = int(180 + 75 * math.sin(t * 3.5 + i))
                draw.ellipse([sx - 1, sy - 1, sx + 1, sy + 1], fill=(twinkle, twinkle, 255))
            # Rooftop floor & railing
            draw.rectangle([0, self.ground_y, self.width, self.height], fill=(12, 14, 18))
            draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=(30, 36, 48), width=4)
            for rx in range(0, self.width, int(60 * self.scale)):
                draw.line([(rx, self.ground_y - int(35 * self.scale)), (rx, self.ground_y)], fill=(40, 48, 64), width=2)
            draw.line([(0, self.ground_y - int(35 * self.scale)), (self.width, self.ground_y - int(35 * self.scale))], fill=(50, 60, 80), width=3)
            return (10, 14, 30)

        elif 'sunrise_hill' in th:
            # Radiant warm sunrise over hill
            for y in range(self.ground_y):
                ratio = y / float(self.ground_y)
                # Orange-yellow dawn gradient
                r = int(249 - 50 * ratio)
                g = int(115 + 76 * ratio)
                b = int(22 + 180 * ratio)
                draw.line([(0, y), (self.width, y)], fill=(r, g, b))
            # Sun orb at horizon
            sun_cx = int(self.width * 0.72) if self.is_landscape else int(self.width * 0.65)
            draw.ellipse([sun_cx - 60, self.ground_y - 60, sun_cx + 60, self.ground_y + 60], fill=(254, 240, 138))
            # Rolling green-dark hill
            draw.rectangle([0, self.ground_y, self.width, self.height], fill=(22, 38, 28))
            draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=(34, 60, 42), width=4)
            return (220, 150, 70)

        elif 'cafe_interior' in th:
            # Warm ambient cafe interior
            for y in range(self.ground_y):
                ratio = y / float(self.ground_y)
                draw.line([(0, y), (self.width, y)], fill=(int(38 + 12 * ratio), int(26 + 10 * ratio), int(18 + 8 * ratio)))
            draw.rectangle([0, self.ground_y, self.width, self.height], fill=(24, 18, 14))
            draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=(70, 50, 35), width=4)
            return (38, 26, 18)

        # Option C: Clean Procedural Minimal Cartoon Stage (Stick Hub Aesthetic)
        if 'dark' in th or 'cyber' in th:
            top_c = (15, 23, 42)
            bot_c = (30, 41, 59)
            ground_c = (10, 15, 26)
            line_c = (56, 189, 248)
        else:
            # Stick Hub classic warm paper/minimal cartoon look
            top_c = (248, 246, 240)
            bot_c = (235, 233, 225)
            ground_c = (220, 218, 210)
            line_c = (180, 178, 170)

        # Vertical wall gradient
        for y in range(self.ground_y):
            ratio = y / float(self.ground_y)
            r = int(top_c[0] + (bot_c[0] - top_c[0]) * ratio)
            g = int(top_c[1] + (bot_c[1] - top_c[1]) * ratio)
            b = int(top_c[2] + (bot_c[2] - top_c[2]) * ratio)
            draw.line([(0, y), (self.width, y)], fill=(r, g, b))

        # Ground floor
        draw.rectangle([0, self.ground_y, self.width, self.height], fill=ground_c)
        draw.line([(0, self.ground_y), (self.width, self.ground_y)], fill=line_c, width=4)

        # Subtle comic perspective grid lines on the ground
        for offset_x in [-280, -140, 0, 140, 280]:
            x_top = self.cx + offset_x
            x_bot = self.cx + int(offset_x * 1.6)
            draw.line([(x_top, self.ground_y), (x_bot, self.height)], fill=(line_c[0], line_c[1], line_c[2], 80), width=2)

        return bot_c

    # -------------------------------------------------------------
    # LAYER 2: Kinetic Legs, Torso & Walk Cycle
    # -------------------------------------------------------------
    def draw_character(self, draw, cx, t, energy, action, emotion, is_walking=False, walk_offset=0.0):
        sc = self.scale
        leg_len = 160 * sc
        torso_len = 175 * sc
        head_r = int(58 * sc)
        ink_color = (25, 27, 34)
        white_color = (255, 255, 255)
        accent_color = (0, 229, 255)

        sad = (emotion == 'sad' or action == 'sad')
        breath = math.sin(t * 2.6) * 4 * sc

        # Ground & Hop Calculation
        if is_walking:
            # 4-stage procedural walk cycle
            walk_freq = 6.2  # stride cadence
            phi = t * walk_freq
            bounce = abs(math.cos(phi)) * 14 * sc
            gy = self.ground_y - bounce

            # Hip position
            hip = (int(cx), int(gy - leg_len))

            # Leg 1 (Front): Swings forward & plants
            l1_phase = phi
            foot1_x = int(cx + math.sin(l1_phase) * 55 * sc)
            foot1_lift = max(0.0, -math.cos(l1_phase)) * 26 * sc
            foot1_y = int(self.ground_y - foot1_lift)
            knee1_x = int((hip[0] + foot1_x) // 2 + 12 * sc)
            knee1_y = int((hip[1] + foot1_y) // 2)

            # Leg 2 (Back): Swings backward & lifts
            l2_phase = phi + math.pi
            foot2_x = int(cx + math.sin(l2_phase) * 55 * sc)
            foot2_lift = max(0.0, -math.cos(l2_phase)) * 26 * sc
            foot2_y = int(self.ground_y - foot2_lift)
            knee2_x = int((hip[0] + foot2_x) // 2 - 12 * sc)
            knee2_y = int((hip[1] + foot2_y) // 2)

            # Ground Shadow
            sw = int(140 * sc - bounce * 1.5)
            draw.ellipse([cx - sw, self.ground_y - 8, cx + sw, self.ground_y + 16], fill=(0, 0, 0, 50))

            # Draw Legs (Bezier)
            limb_w = max(8, int(13 * sc))
            self.draw_bezier_limb(draw, hip, (knee2_x, knee2_y), (foot2_x, foot2_y), width=limb_w, color=ink_color, outline=white_color)
            self.draw_bezier_limb(draw, hip, (knee1_x, knee1_y), (foot1_x, foot1_y), width=limb_w, color=ink_color, outline=white_color)
            # Feet lines
            draw.line([(foot2_x, foot2_y), (foot2_x + int(24 * sc), foot2_y)], fill=ink_color, width=limb_w)
            draw.line([(foot1_x, foot1_y), (foot1_x + int(24 * sc), foot1_y)], fill=ink_color, width=limb_w)

            # Torso with slight forward lean during walk
            lean = 14 * sc
            neck = (int(hip[0] + lean), int(hip[1] - torso_len))
            draw.line([hip, neck], fill=white_color, width=limb_w + 4)
            draw.line([hip, neck], fill=ink_color, width=limb_w)

            # Arms swing in opposition to legs during walk
            arm_swing = math.sin(phi) * 45 * sc
            sh_l = (int(neck[0] - 12 * sc), int(neck[1] + 16 * sc))
            sh_r = (int(neck[0] + 12 * sc), int(neck[1] + 16 * sc))

            el_l = (int(sh_l[0] - arm_swing * 0.7), int(sh_l[1] + 65 * sc))
            hand_l = (int(el_l[0] - arm_swing), int(el_l[1] + 60 * sc))

            el_r = (int(sh_r[0] + arm_swing * 0.7), int(sh_r[1] + 65 * sc))
            hand_r = (int(el_r[0] + arm_swing), int(el_r[1] + 60 * sc))

            self.draw_bezier_limb(draw, sh_l, el_l, hand_l, width=limb_w - 1, color=ink_color, outline=white_color)
            self.draw_bezier_limb(draw, sh_r, el_r, hand_r, width=limb_w - 1, color=ink_color, outline=white_color)

        elif 'kneel' in str(action).lower():
            # Dramatic Kneeling Breakdown Pose
            breath = math.sin(t * 6.0) * 3 * sc
            gy = self.ground_y
            hip = (int(cx), int(gy - 55 * sc + breath * 0.4))

            # Ground Shadow
            sw = int(175 * sc)
            draw.ellipse([cx - sw, gy - 8, cx + sw, gy + 16], fill=(0, 0, 0, 60))

            # Kneeling legs bent on the floor
            limb_w = max(8, int(13 * sc))
            for side in (-1, 1):
                knee = (int(cx + side * 45 * sc), gy)
                foot = (int(cx + side * 15 * sc), gy)
                self.draw_bezier_limb(draw, hip, (int(knee[0] - side * 10 * sc), int(knee[1] - 25 * sc)), knee, width=limb_w, color=ink_color, outline=white_color)
                draw.line([knee, foot], fill=ink_color, width=limb_w)

            # Torso leaning forward in sorrow
            lean = 18 * sc
            neck = (int(cx + lean), int(hip[1] - torso_len * 0.82 + breath))
            draw.line([hip, neck], fill=white_color, width=limb_w + 4)
            draw.line([hip, neck], fill=ink_color, width=limb_w)

            # Arms & Expressive Gestures
            sh_l = (int(neck[0] - 12 * sc), int(neck[1] + 16 * sc))
            sh_r = (int(neck[0] + 12 * sc), int(neck[1] + 16 * sc))
            self.draw_standing_arms(draw, sh_l, sh_r, action, t, energy, sc, limb_w, ink_color, white_color)

        else:
            # Standing dynamic stance with natural breathing & weight shift
            breath = math.sin(t * 2.6) * 4 * sc
            gy = self.ground_y
            hip = (int(cx), int(gy - leg_len + breath * 0.3))

            # Ground Shadow
            sw = int(155 * sc)
            draw.ellipse([cx - sw, gy - 8, cx + sw, gy + 16], fill=(0, 0, 0, 50))

            # Standing Legs with natural solid stance
            limb_w = max(8, int(13 * sc))
            for side in (-1, 1):
                foot = (int(cx + side * 44 * sc), gy)
                knee = (int(cx + side * 28 * sc), int(gy - leg_len * 0.5))
                self.draw_bezier_limb(draw, hip, knee, foot, width=limb_w, color=ink_color, outline=white_color)
                draw.line([foot, (foot[0] + int(side * 26 * sc), gy)], fill=ink_color, width=limb_w)

            # Torso
            sad = emotion == 'sad' or action == 'sad' or 'cry' in str(action)
            lean = 12 * sc if sad else 0.0
            neck = (int(cx + lean), int(hip[1] - torso_len + breath * 0.5))
            draw.line([hip, neck], fill=white_color, width=limb_w + 4)
            draw.line([hip, neck], fill=ink_color, width=limb_w)

            # Arms & Expressive Gestures
            sh_l = (int(neck[0] - 12 * sc), int(neck[1] + 16 * sc))
            sh_r = (int(neck[0] + 12 * sc), int(neck[1] + 16 * sc))
            self.draw_standing_arms(draw, sh_l, sh_r, action, t, energy, sc, limb_w, ink_color, white_color)

        # Scarf / Accent Collar (Stick Hub Trademark Personality)
        draw.line([(int(neck[0] - 28 * sc), int(neck[1] + 4 * sc)),
                   (int(neck[0] + 28 * sc), int(neck[1] + 4 * sc))], fill=accent_color, width=int(16 * sc))
        sway = math.sin(t * 3.2) * 8 * sc
        draw.polygon([(int(neck[0] + 12 * sc), int(neck[1] + 8 * sc)),
                      (int(neck[0] + 38 * sc + sway), int(neck[1] + 62 * sc)),
                      (int(neck[0] + 8 * sc + sway), int(neck[1] + 58 * sc))], fill=accent_color)

        # Head & Face Rig
        head_cx = int(neck[0] + (12 * sc if sad else 0))
        head_cy = int(neck[1] - head_r - 6 * sc + breath * 0.4)
        self.draw_head_and_face(draw, head_cx, head_cy, head_r, emotion, energy, t, sc, ink_color, white_color)

        return (head_cx, head_cy)

    # -------------------------------------------------------------
    # LAYER 3: Standing Arm Poses & Bezier Gestures
    # -------------------------------------------------------------
    def draw_standing_arms(self, draw, sh_l, sh_r, action, t, energy, sc, limb_w, ink_color, white_color):
        act = (action or 'talk').lower()
        s = math.sin

        # --- THEATRICAL MUSIC MV DRAMATIC ACTING POSES ---
        if 'kneel_crying' in act or 'cry' in act or 'weep' in act:
            # Hands cupped up covering face in sorrow
            heave = s(t * 7.0) * 5 * sc
            el_l = (int(sh_l[0] - 25 * sc), int(sh_l[1] + 10 * sc + heave))
            hand_l = (int(sh_l[0] + 5 * sc), int(sh_l[1] - 45 * sc + heave))
            el_r = (int(sh_r[0] + 25 * sc), int(sh_r[1] + 10 * sc + heave))
            hand_r = (int(sh_r[0] - 5 * sc), int(sh_r[1] - 45 * sc + heave))

        elif 'holding_photo' in act:
            # Both hands gently held inward close to heart cupping a photo frame
            el_l = (int(sh_l[0] - 30 * sc), int(sh_l[1] + 45 * sc))
            hand_l = (int(sh_l[0] + 12 * sc), int(sh_l[1] + 55 * sc))
            el_r = (int(sh_r[0] + 30 * sc), int(sh_r[1] + 45 * sc))
            hand_r = (int(sh_r[0] - 12 * sc), int(sh_r[1] + 55 * sc))
            # Mini photo frame held in hands
            p_cx = (sh_l[0] + sh_r[0]) // 2
            p_cy = int(sh_l[1] + 55 * sc)
            draw.rectangle([p_cx - int(14 * sc), p_cy - int(18 * sc), p_cx + int(14 * sc), p_cy + int(18 * sc)],
                           fill=(245, 245, 245), outline=ink_color, width=max(1, int(2 * sc)))
            draw.line([(p_cx - int(10 * sc), p_cy + int(8 * sc)), (p_cx, p_cy - int(4 * sc)), (p_cx + int(10 * sc), p_cy + int(8 * sc))],
                      fill=(180, 180, 180), width=1)

        elif 'reaching_out' in act or 'reach' in act:
            # Desperate reach forward toward empty void
            el_r = (int(sh_r[0] + 65 * sc), int(sh_r[1] - 15 * sc))
            hand_r = (int(sh_r[0] + 145 * sc), int(sh_r[1] - 40 * sc))
            # Open reaching fingers
            draw.line([hand_r, (hand_r[0] + int(12 * sc), hand_r[1] - int(6 * sc))], fill=ink_color, width=max(2, int(3 * sc)))
            draw.line([hand_r, (hand_r[0] + int(14 * sc), hand_r[1])], fill=ink_color, width=max(2, int(3 * sc)))
            draw.line([hand_r, (hand_r[0] + int(10 * sc), hand_r[1] + int(8 * sc))], fill=ink_color, width=max(2, int(3 * sc)))
            # Left arm trailing back
            el_l = (int(sh_l[0] - 45 * sc), int(sh_l[1] + 50 * sc))
            hand_l = (int(sh_l[0] - 65 * sc), int(sh_l[1] + 95 * sc))

        elif 'walking_cold' in act or 'cold' in act:
            # Hands hunched deep in coat pockets
            el_l = (int(sh_l[0] - 25 * sc), int(sh_l[1] + 45 * sc))
            hand_l = (int(sh_l[0] - 5 * sc), int(sh_l[1] + 75 * sc))
            el_r = (int(sh_r[0] + 25 * sc), int(sh_r[1] + 45 * sc))
            hand_r = (int(sh_r[0] + 5 * sc), int(sh_r[1] + 75 * sc))

        elif 'running_chase' in act:
            # Dynamic sprinting arms pumping
            s_arm = s(t * 12.0) * 65 * sc
            el_l = (int(sh_l[0] - 45 * sc - s_arm * 0.6), int(sh_l[1] + 35 * sc))
            hand_l = (int(sh_l[0] - 70 * sc - s_arm), int(sh_l[1] + 25 * sc))
            el_r = (int(sh_r[0] + 45 * sc + s_arm * 0.6), int(sh_r[1] + 35 * sc))
            hand_r = (int(sh_r[0] + 70 * sc + s_arm), int(sh_r[1] + 25 * sc))

        elif 'peeking_heartbreak' in act:
            # Peeking from edge, one hand holding wall, one clutching chest
            el_l = (int(sh_l[0] - 50 * sc), int(sh_l[1] + 15 * sc))
            hand_l = (int(sh_l[0] - 75 * sc), int(sh_l[1] + 10 * sc))
            el_r = (int(sh_r[0] + 20 * sc), int(sh_r[1] + 40 * sc))
            hand_r = (int(sh_r[0] - 15 * sc), int(sh_r[1] + 35 * sc))

        elif 'cafe_reflecting' in act:
            # Seated posture, right elbow resting on table, palm propping chin
            el_r = (int(sh_r[0] + 45 * sc), int(sh_r[1] + 45 * sc))
            hand_r = (int(sh_r[0] + 20 * sc), int(sh_r[1] - 45 * sc))
            # Left arm resting on lap
            el_l = (int(sh_l[0] - 30 * sc), int(sh_l[1] + 50 * sc))
            hand_l = (int(sh_l[0] - 10 * sc), int(sh_l[1] + 90 * sc))

        elif 'heartbreak_clutch' in act:
            # Both hands clutching tightly over left chest
            thump = s(t * 9.0) * 3 * sc
            el_l = (int(sh_l[0] - 35 * sc), int(sh_l[1] + 35 * sc))
            hand_l = (int(sh_l[0] - 5 * sc), int(sh_l[1] + 30 * sc + thump))
            el_r = (int(sh_r[0] + 15 * sc), int(sh_r[1] + 35 * sc))
            hand_r = (int(sh_l[0] - 5 * sc), int(sh_l[1] + 32 * sc + thump))

        elif 'stargazing_rooftop' in act or 'stargaze' in act:
            # Wistful stargaze: left hand pointing up to night sky, right at side
            el_l = (int(sh_l[0] - 50 * sc), int(sh_l[1] - 30 * sc))
            hand_l = (int(sh_l[0] - 80 * sc), int(sh_l[1] - 110 * sc))
            el_r = (int(sh_r[0] + 35 * sc), int(sh_r[1] + 50 * sc))
            hand_r = (int(sh_r[0] + 25 * sc), int(sh_r[1] + 95 * sc))

        elif 'peaceful_sunrise' in act or 'peace' in act:
            # Open serene posture welcoming the sunrise
            el_l = (int(sh_l[0] - 55 * sc), int(sh_l[1] + 35 * sc))
            hand_l = (int(sh_l[0] - 90 * sc), int(sh_l[1] + 55 * sc))
            el_r = (int(sh_r[0] + 55 * sc), int(sh_r[1] + 35 * sc))
            hand_r = (int(sh_r[0] + 90 * sc), int(sh_r[1] + 55 * sc))

        elif 'think' in act:
            # Right hand touches chin / head
            el_r = (int(sh_r[0] + 55 * sc), int(sh_r[1] + 35 * sc))
            hand_r = (int(sh_r[0] + 15 * sc), int(sh_r[1] - 70 * sc))
            # Left arm folded across chest
            el_l = (int(sh_l[0] - 45 * sc), int(sh_l[1] + 45 * sc))
            hand_l = (int(sh_l[0] + 25 * sc), int(sh_l[1] + 45 * sc))

        elif 'excited' in act or 'celebrate' in act:
            # Both hands raised joyfully waving in air
            w1 = s(t * 8.0) * 16 * sc
            w2 = s(t * 8.0 + 1.5) * 16 * sc
            el_l = (int(sh_l[0] - 65 * sc), int(sh_l[1] - 50 * sc))
            hand_l = (int(sh_l[0] - 110 * sc + w1), int(sh_l[1] - 130 * sc))
            el_r = (int(sh_r[0] + 65 * sc), int(sh_r[1] - 50 * sc))
            hand_r = (int(sh_r[0] + 110 * sc + w2), int(sh_r[1] - 130 * sc))

        elif 'shrug' in act:
            # Elbows bent outward, hands upturned
            el_l = (int(sh_l[0] - 75 * sc), int(sh_l[1] + 25 * sc))
            hand_l = (int(sh_l[0] - 110 * sc), int(sh_l[1] - 25 * sc))
            el_r = (int(sh_r[0] + 75 * sc), int(sh_r[1] + 25 * sc))
            hand_r = (int(sh_r[0] + 110 * sc), int(sh_r[1] - 25 * sc))

        elif 'stop' in act or 'warn' in act:
            # Right hand open palm extended forward
            el_r = (int(sh_r[0] + 55 * sc), int(sh_r[1] + 10 * sc))
            hand_r = (int(sh_r[0] + 120 * sc), int(sh_r[1] + 10 * sc))
            # Left arm at side
            el_l = (int(sh_l[0] - 35 * sc), int(sh_l[1] + 60 * sc))
            hand_l = (int(sh_l[0] - 25 * sc), int(sh_l[1] + 110 * sc))

        elif 'hips' in act:
            # Hands firmly on hips
            el_l = (int(sh_l[0] - 60 * sc), int(sh_l[1] + 45 * sc))
            hand_l = (int(sh_l[0] - 20 * sc), int(sh_l[1] + 75 * sc))
            el_r = (int(sh_r[0] + 60 * sc), int(sh_r[1] + 45 * sc))
            hand_r = (int(sh_r[0] + 20 * sc), int(sh_r[1] + 75 * sc))

        elif 'sad' in act:
            # Arms hanging limp
            el_l = (int(sh_l[0] - 20 * sc), int(sh_l[1] + 65 * sc))
            hand_l = (int(sh_l[0] - 15 * sc), int(sh_l[1] + 120 * sc))
            el_r = (int(sh_r[0] + 20 * sc), int(sh_r[1] + 65 * sc))
            hand_r = (int(sh_r[0] + 15 * sc), int(sh_r[1] + 120 * sc))

        else:
            # Default 'talk': Active conversational gesturing driven by speech energy
            talk_wave = s(t * 5.0) * (20 + 25 * energy) * sc
            el_r = (int(sh_r[0] + 45 * sc), int(sh_r[1] + 45 * sc))
            hand_r = (int(sh_r[0] + 85 * sc), int(sh_r[1] + talk_wave))

            el_l = (int(sh_l[0] - 35 * sc), int(sh_l[1] + 55 * sc))
            hand_l = (int(sh_l[0] - 20 * sc), int(sh_l[1] + 105 * sc))

        self.draw_bezier_limb(draw, sh_l, el_l, hand_l, width=limb_w - 1, color=ink_color, outline=white_color)
        self.draw_bezier_limb(draw, sh_r, el_r, hand_r, width=limb_w - 1, color=ink_color, outline=white_color)

    # -------------------------------------------------------------
    # LAYER 4: Expressive Head, Eyes, Eyebrows & Audio-Reactive Lipsync
    # -------------------------------------------------------------
    def draw_head_and_face(self, draw, hx, hy, r, emotion, energy, t, sc, ink_color, white_color):
        # 1. Head circle with crisp outline
        draw.ellipse([hx - r - 2, hy - r - 2, hx + r + 2, hy + r + 2], fill=white_color)
        draw.ellipse([hx - r, hy - r, hx + r, hy + r], fill=white_color, outline=ink_color, width=max(4, int(7 * sc)))

        # 2. Eye gaze & blinking
        blink = (t % 3.4) < 0.12
        look_dx = int(math.sin(t * 1.5) * 4 * sc)
        look_dy = int(math.cos(t * 1.2) * 2 * sc)
        if emotion == 'thinking':
            look_dx, look_dy = int(8 * sc), int(-8 * sc)
        elif emotion == 'sad':
            look_dx, look_dy = 0, int(6 * sc)

        eye_offset_x = int(18 * sc)
        eye_y = int(hy - 6 * sc)
        eye_r = max(4, int(6.5 * sc))

        for side in (-1, 1):
            ex = hx + side * eye_offset_x + look_dx
            ey = eye_y + look_dy
            if blink:
                draw.line([(ex - int(7 * sc), ey), (ex + int(7 * sc), ey)], fill=ink_color, width=max(2, int(4 * sc)))
            elif emotion == 'surprised':
                draw.ellipse([ex - eye_r - 4, ey - eye_r - 4, ex + eye_r + 4, ey + eye_r + 4], fill=white_color, outline=ink_color, width=int(3 * sc))
                draw.ellipse([ex - 3, ey - 3, ex + 3, ey + 3], fill=ink_color)
            else:
                draw.ellipse([ex - eye_r, ey - eye_r, ex + eye_r, ey + eye_r], fill=ink_color)

        # Heartbreak / sad tear animation
        if emotion == 'sad' or 'cry' in str(emotion):
            for side in (-1, 1):
                tear_phase = (t * 2.8 + (0.5 if side == 1 else 0.0)) % 1.2
                tear_y = int(eye_y + 8 * sc + tear_phase * 35 * sc)
                tear_x = int(hx + side * eye_offset_x + look_dx)
                if tear_y < hy + 50 * sc:
                    draw.ellipse([tear_x - int(2.5 * sc), tear_y - int(3.5 * sc),
                                  tear_x + int(2.5 * sc), tear_y + int(3.5 * sc)], fill=(56, 189, 248))

        # 3. Expressive Eyebrows
        brow_y = hy - int(24 * sc)
        brow_w = int(18 * sc)
        if emotion == 'angry':
            draw.line([(hx - eye_offset_x - brow_w//2, brow_y - int(4 * sc)), (hx - eye_offset_x + brow_w//2, brow_y + int(6 * sc))], fill=ink_color, width=int(4 * sc))
            draw.line([(hx + eye_offset_x - brow_w//2, brow_y + int(6 * sc)), (hx + eye_offset_x + brow_w//2, brow_y - int(4 * sc))], fill=ink_color, width=int(4 * sc))
        elif emotion in ('worried', 'sad'):
            draw.line([(hx - eye_offset_x - brow_w//2, brow_y + int(6 * sc)), (hx - eye_offset_x + brow_w//2, brow_y - int(4 * sc))], fill=ink_color, width=int(4 * sc))
            draw.line([(hx + eye_offset_x - brow_w//2, brow_y - int(4 * sc)), (hx + eye_offset_x + brow_w//2, brow_y + int(6 * sc))], fill=ink_color, width=int(4 * sc))
        elif emotion == 'thinking':
            draw.line([(hx - eye_offset_x - brow_w//2, brow_y), (hx - eye_offset_x + brow_w//2, brow_y)], fill=ink_color, width=int(4 * sc))
            draw.line([(hx + eye_offset_x - brow_w//2, brow_y - int(8 * sc)), (hx + eye_offset_x + brow_w//2, brow_y - int(8 * sc))], fill=ink_color, width=int(4 * sc))
        else:
            # Normal friendly arch
            draw.arc([hx - eye_offset_x - brow_w//2, brow_y - int(6 * sc), hx - eye_offset_x + brow_w//2, brow_y + int(6 * sc)], start=190, end=350, fill=ink_color, width=int(4 * sc))
            draw.arc([hx + eye_offset_x - brow_w//2, brow_y - int(6 * sc), hx + eye_offset_x + brow_w//2, brow_y + int(6 * sc)], start=190, end=350, fill=ink_color, width=int(4 * sc))

        # 4. Audio-Reactive Mouth (Procedural Lip-Sync)
        mouth_x = hx + int(look_dx * 0.5)
        mouth_y = hy + int(24 * sc + look_dy * 0.5)

        if energy > 0.12:
            # Speaking: open mouth scaled to energy
            mw = int((12 + 10 * energy) * sc)
            mh = int((6 + 18 * energy) * sc)
            draw.ellipse([mouth_x - mw, mouth_y - mh//2, mouth_x + mw, mouth_y + mh//2], fill=ink_color)
            # Little tongue or teeth pop inside open mouth
            if mh > 12 * sc:
                draw.arc([mouth_x - mw + 4, mouth_y, mouth_x + mw - 4, mouth_y + mh//2], start=0, end=180, fill=(244, 114, 182), width=int(4 * sc))
        elif emotion == 'happy':
            # Wide smile arc
            draw.arc([mouth_x - int(16 * sc), mouth_y - int(12 * sc), mouth_x + int(16 * sc), mouth_y + int(10 * sc)], start=15, end=165, fill=ink_color, width=int(4 * sc))
        elif emotion in ('sad', 'worried'):
            # Downward frown arc
            draw.arc([mouth_x - int(14 * sc), mouth_y + int(2 * sc), mouth_x + int(14 * sc), mouth_y + int(22 * sc)], start=195, end=345, fill=ink_color, width=int(4 * sc))
        else:
            # Neutral / subtle smile line
            draw.line([(mouth_x - int(10 * sc), mouth_y), (mouth_x + int(10 * sc), mouth_y)], fill=ink_color, width=int(4 * sc))

    # -------------------------------------------------------------
    # LAYER 5: Pop-In Comic Props
    # -------------------------------------------------------------
    def draw_prop_item(self, pil_img, draw, prop_name, cx, cy, t, lt, sc):
        if not prop_name or prop_name not in PROP_DRAW:
            return
        k = ease_out_back(lt / 0.45)
        if k < 0.05:
            return

        prop_x = cx
        prop_y = int(self.height * 0.28)

        # Soft disc halo behind prop
        halo_r = int(120 * sc * min(1.05, k))
        halo_overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        h_draw = ImageDraw.Draw(halo_overlay)
        h_draw.ellipse([prop_x - halo_r, prop_y - halo_r, prop_x + halo_r, prop_y + halo_r], fill=(0, 229, 255, 45))
        pil_img.alpha_composite(halo_overlay)

        # Render prop using exact 1.0 scaling StorytellerLocal context
        g = StorytellerCanvas(pil_img)
        loc = StorytellerLocal(g, prop_x, prop_y, max(0.02, k) * sc * 0.85, (245, 245, 245), (0, 229, 255))
        PROP_DRAW[prop_name](loc, t, lt)

    # -------------------------------------------------------------
    # LAYER 6: Clean Kinetic Subtitles (High-Contrast Modern Typography)
    # -------------------------------------------------------------
    def draw_kinetic_subtitles(self, pil_img, draw, text, t, sc):
        if not text or text.strip() == "" or text.strip() == "[Music / Ambience]":
            return

        clean_text = text.strip()
        font_size = max(24, int(36 * (self.height / 1280.0)))
        font = self._get_font(font_size)

        # Word wrap text to fit within 88% width
        max_w = int(self.width * 0.86)
        words = clean_text.split()
        lines = []
        cur_line = []

        for w in words:
            test_line = " ".join(cur_line + [w])
            bbox = font.getbbox(test_line)
            w_px = bbox[2] - bbox[0]
            if w_px <= max_w:
                cur_line.append(w)
            else:
                if cur_line:
                    lines.append(" ".join(cur_line))
                cur_line = [w]
        if cur_line:
            lines.append(" ".join(cur_line))

        # Calculate bounding box for pill backdrop
        line_height = int(font_size * 1.35)
        total_text_h = len(lines) * line_height
        sub_y = int(self.height * 0.88 - total_text_h // 2)

        # Measure max line width
        max_line_w = 0
        for line in lines:
            bbox = font.getbbox(line)
            max_line_w = max(max_line_w, bbox[2] - bbox[0])

        pad_x = 24
        pad_y = 14
        pill_box = [
            self.cx - max_line_w // 2 - pad_x,
            sub_y - pad_y,
            self.cx + max_line_w // 2 + pad_x,
            sub_y + total_text_h + pad_y - int(font_size * 0.2)
        ]

        # Draw translucent rounded pill backdrop with cyan highlight border
        sub_overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        s_draw = ImageDraw.Draw(sub_overlay)
        s_draw.rounded_rectangle(pill_box, radius=18, fill=(15, 23, 42, 220), outline=(0, 229, 255, 230), width=2)
        pil_img.alpha_composite(sub_overlay)

        # Draw each line centered with high contrast white text
        for i, line in enumerate(lines):
            ly = sub_y + i * line_height
            bbox = font.getbbox(line)
            lw = bbox[2] - bbox[0]
            lx = self.cx - lw // 2
            # Drop shadow
            draw.text((lx + 2, ly + 2), line, font=font, fill=(0, 0, 0, 180))
            # Main white text
            draw.text((lx, ly), line, font=font, fill=(255, 255, 255))

    # -------------------------------------------------------------
    # LAYER 5B: Glowing Memory Silhouette Partner (Music Story MV)
    # -------------------------------------------------------------
    def draw_silhouette_actor(self, pil_img, draw, sx, t, sc):
        """Draws a translucent cyan/violet glowing memory silhouette of the lost partner."""
        sil_overlay = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
        s_draw = ImageDraw.Draw(sil_overlay)

        torso_len = 160 * sc
        leg_len = 150 * sc
        head_r = int(48 * sc)
        gy = self.ground_y
        hip = (int(sx), int(gy - leg_len))
        neck = (int(sx), int(hip[1] - torso_len))
        head_cy = int(neck[1] - head_r - 4 * sc)

        # Soft glowing ethereal aura
        aura_r = int(75 * sc)
        s_draw.ellipse([sx - aura_r, head_cy - aura_r, sx + aura_r, head_cy + aura_r], fill=(0, 229, 255, 35))

        # Silhouette body (translucent glowing ethereal violet-cyan)
        col = (192, 132, 252, 95)
        # Head
        s_draw.ellipse([sx - head_r, head_cy - head_r, sx + head_r, head_cy + head_r], fill=col)
        # Torso
        s_draw.line([hip, neck], fill=col, width=int(10 * sc))
        # Flowing dress or gentle legs
        s_draw.polygon([(int(sx - 24 * sc), gy), (int(sx + 24 * sc), gy), hip], fill=(192, 132, 252, 80))
        # Gentle arm folded
        s_draw.line([neck, (int(sx + 25 * sc), int(neck[1] + 60 * sc)), (int(sx + 10 * sc), int(neck[1] + 90 * sc))], fill=col, width=int(7 * sc))

        # Floating memory light dust rising into the sky
        for i in range(8):
            p_phi = (t * 1.5 + i * 0.8) % 3.0
            p_y = int(gy - (p_phi / 3.0) * 350 * sc)
            p_x = int(sx + math.sin(t * 2.0 + i) * 35 * sc)
            p_alpha = int(120 * (1.0 - p_phi / 3.0))
            s_draw.ellipse([p_x - 3, p_y - 3, p_x + 3, p_y + 3], fill=(0, 229, 255, p_alpha))

        pil_img.alpha_composite(sil_overlay)

    # -------------------------------------------------------------
    # MASTER FRAME RENDERER: Full Composite
    # -------------------------------------------------------------
    def render_frame(self, beat_data, t=0.0, energy=0.7):
        """
        Renders a single frame of Stick Hub Storyteller animation.
        Returns a cv2 BGR NumPy image array (width x height).
        """
        pil_img = Image.new("RGBA", (self.width, self.height), (245, 245, 245, 255))
        draw = ImageDraw.Draw(pil_img)

        # 1. Background
        custom_bg = beat_data.get("background_image") or beat_data.get("background_path")
        stage_theme = beat_data.get("stage_theme") or beat_data.get("background", "minimal_clean")
        self.draw_background(pil_img, draw, t, bg_image_path=custom_bg, stage_theme=stage_theme)

        # 2. Action & Movement Detection
        action = beat_data.get("action") or beat_data.get("pose", "talk")
        emotion = beat_data.get("emotion", "neutral")
        text = beat_data.get("text", "")
        text_lower = text.lower()

        # Semantic action heuristics if default talk
        is_walking = False
        if any(w in text_lower for w in ["walk", "jalan", "melangkah", "pergi", "bergerak", "run", "lari"]):
            is_walking = True
        elif action in ["walk", "run", "stride", "move", "walking_cold", "running_chase"]:
            is_walking = True

        if not action or action == 'talk':
            if any(w in text_lower for w in ["menangis", "tangis", "air mata", "cried", "tears", "weep"]):
                action = 'kneel_crying'
                emotion = 'sad'
            elif any(w in text_lower for w in ["foto", "kenangan", "bayangmu", "memori", "photograph"]):
                action = 'holding_photo'
                emotion = 'sad'
            elif any(w in text_lower for w in ["pergi", "tinggalkan", "jangan pergi", "ku mohon", "stay"]):
                action = 'reaching_out'
                emotion = 'sad'
            elif any(w in text_lower for w in ["hujan", "gerimis", "dingin", "rain", "storm"]):
                action = 'walking_cold'
                emotion = 'sad'
            elif any(w in text_lower for w in ["kejar", "mengejar", "chasing", "find you"]):
                action = 'running_chase'
                emotion = 'surprised'
            elif any(w in text_lower for w in ["bintang", "stars", "night sky"]):
                action = 'stargazing_rooftop'
            elif any(w in text_lower for w in ["ikhlas", "mentari", "fajar", "sunrise"]):
                action = 'peaceful_sunrise'
                emotion = 'happy'
            elif any(w in text_lower for w in ["pikir", "think", "kenapa", "mengapa", "tahu", "gimana"]):
                action = 'think'
                emotion = 'thinking'
            elif any(w in text_lower for w in ["kaget", "shock", "wow", "astaga", "lihat", "surprised"]):
                action = 'point'
                emotion = 'surprised'
            elif any(w in text_lower for w in ["senang", "cuan", "sukses", "hebat", "berhasil", "happy"]):
                action = 'excited'
                emotion = 'happy'
            elif any(w in text_lower for w in ["sedih", "kecewa", "rugi", "sayang", "sad"]):
                action = 'sad'
                emotion = 'sad'
            elif any(w in text_lower for w in ["stop", "tunggu", "jangan", "wait", "awas"]):
                action = 'stop'

        # Character position (stationary or subtle walking translation)
        char_x = self.cx
        if is_walking:
            # Walking across screen or subtle cyclical drift
            char_x = int(self.cx + math.sin(t * 0.8) * 40 * self.scale)

        # 3. Solo Animated Character or Music MV Duo with Silhouette Memory
        actors = beat_data.get('actors')
        has_silhouette = False
        sil_x = int(self.width * 0.72) if self.is_landscape else int(self.width * 0.70)

        if actors and len(actors) >= 2:
            a2 = actors[1]
            if a2.get('is_silhouette') or a2.get('label') == 'FADING MEMORY':
                has_silhouette = True
                sil_x = a2.get('x', sil_x)

        if has_silhouette or beat_data.get('secondary_actor') == 'fading_silhouette' or 'bayangmu' in text_lower or 'silhouette' in text_lower:
            # Draw the glowing memory silhouette partner
            self.draw_silhouette_actor(pil_img, draw, sil_x, t, self.scale)

        head_pos = self.draw_character(draw, char_x, t, energy, action, emotion, is_walking=is_walking)

        # 4. Comic Props Pop-In
        prop_name = beat_data.get("prop")
        lt = beat_data.get("local_time", t % 3.0)
        if prop_name:
            self.draw_prop_item(pil_img, draw, prop_name, self.cx, head_pos[1] - int(100 * self.scale), t, lt, self.scale)

        # 5. Kinetic Story Subtitles
        self.draw_kinetic_subtitles(pil_img, draw, text, t, self.scale)

        # Return RGB NumPy image formatted for OpenCV
        rgb_img = pil_img.convert("RGB")
        return cv2.cvtColor(np.array(rgb_img), cv2.COLOR_RGB2BGR)
