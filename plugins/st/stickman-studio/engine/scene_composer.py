# [FL_INDEX: keywords="scene_composer, stickman_rig, meme_fx, procedural_backgrounds, dual_character, animation_pipeline" | purpose="Multi-layer procedural scene composer with dynamic backgrounds, dual-stickman dialogue staging, and expressive stickman skeleton for Stickman Studio"]
import cv2
import numpy as np
import math
import os

class StickmanSceneComposer:
    def __init__(self, width=720, height=1280):
        self.w = width
        self.h = height

    def draw_background(self, img, bg_type='podcast_studio', camera_shake=(0, 0)):
        ox, oy = int(camera_shake[0]), int(camera_shake[1])
        
        if bg_type == 'beach_bali':
            # Tropical Sunset Bali: Sky gradient from fiery orange to deep purple
            for y in range(0, int(self.h * 0.65)):
                ratio = y / (self.h * 0.65)
                r = int(240 - ratio * 100)
                g = int(120 - ratio * 70)
                b = int(40 + ratio * 80)
                cv2.line(img, (0, y), (self.w, y), (b, g, r), 1)
            # Glowing Sun
            sun_cx, sun_cy = self.w // 2 + ox, int(self.h * 0.40) + oy
            cv2.circle(img, (sun_cx, sun_cy), 75, (60, 200, 255), -1)
            # Ocean Water with gentle waves
            for y in range(int(self.h * 0.65), int(self.h * 0.82)):
                ratio = (y - self.h * 0.65) / (self.h * 0.17)
                b = int(140 - ratio * 40)
                g = int(80 - ratio * 30)
                r = int(25 - ratio * 10)
                cv2.line(img, (0, y), (self.w, y), (b, g, r), 1)
            # Sandy Beach Floor
            for y in range(int(self.h * 0.82), self.h):
                ratio = (y - self.h * 0.82) / (self.h * 0.18)
                b = int(80 - ratio * 30)
                g = int(140 - ratio * 40)
                r = int(190 - ratio * 50)
                cv2.line(img, (0, y), (self.w, y), (b, g, r), 1)
            # Palm Tree Silhouette on Left side
            pt_x = 80 + ox
            cv2.ellipse(img, (pt_x, int(self.h * 0.55) + oy), (25, 200), -15, 0, 360, (20, 25, 30), -1)
            # Palm leaves
            for angle in [-60, -30, 0, 30, 60, 90]:
                rad = math.radians(angle)
                lx = int(pt_x + 130 * math.cos(rad))
                ly = int((self.h * 0.38) + 70 * math.sin(rad))
                cv2.line(img, (pt_x, int(self.h * 0.38) + oy), (lx, ly + oy), (20, 25, 30), 6)

        elif bg_type == 'podcast_studio':
            # Modern Neon Podcast Studio with Acoustic Wall Panels
            img[:] = (22, 24, 32)
            # Vertical Neon LED light bars
            cv2.line(img, (60 + ox, 0), (60 + ox, self.h), (255, 60, 180), 3)
            cv2.line(img, (self.w - 60 + ox, 0), (self.w - 60 + ox, self.h), (0, 230, 255), 3)
            # Acoustic foam panels pattern
            for row in range(4):
                py = 140 + row * 100 + oy
                cv2.rectangle(img, (110 + ox, py), (self.w - 110 + ox, py + 70), (32, 36, 48), -1)
                cv2.rectangle(img, (110 + ox, py), (self.w - 110 + ox, py + 70), (45, 52, 68), 1)
            # ON AIR glowing badge
            cv2.rectangle(img, (self.w // 2 - 70 + ox, 50 + oy), (self.w // 2 + 70 + ox, 90 + oy), (15, 20, 30), -1)
            cv2.rectangle(img, (self.w // 2 - 70 + ox, 50 + oy), (self.w // 2 + 70 + ox, 90 + oy), (0, 50, 240), 2)
            cv2.putText(img, 'LIVE ON AIR', (self.w // 2 - 58 + ox, 78 + oy), cv2.FONT_HERSHEY_DUPLEX, 0.55, (40, 60, 255), 2)
            # Podcast Desk in foreground
            cv2.rectangle(img, (0, int(self.h * 0.78)), (self.w, self.h), (28, 30, 38), -1)
            cv2.line(img, (0, int(self.h * 0.78)), (self.w, int(self.h * 0.78)), (0, 229, 255), 3)

        elif bg_type == 'speedlines_panic':
            img[:] = (15, 15, 25)
            center = (self.w // 2 + ox, int(self.h * 0.45) + oy)
            # Pulsing red danger vignette
            cv2.circle(img, center, int(self.w * 0.7), (25, 25, 60), -1)
            for angle_deg in range(0, 360, 5):
                rad = math.radians(angle_deg)
                r_inner = 130 + (angle_deg % 10) * 12
                r_outer = 950
                p1 = (int(center[0] + r_inner * math.cos(rad)), int(center[1] + r_inner * math.sin(rad)))
                p2 = (int(center[0] + r_outer * math.cos(rad)), int(center[1] + r_outer * math.sin(rad)))
                color = (30, 30, 210) if (angle_deg % 10 == 0) else (20, 20, 80)
                cv2.line(img, p1, p2, color, 3)

        elif bg_type == 'cyber_grid':
            # Cyberpunk neon grid floor
            for y in range(0, int(self.h * 0.65)):
                ratio = y / (self.h * 0.65)
                cv2.line(img, (0, y), (self.w, y), (int(40 * ratio), int(15 * ratio), int(30 * ratio)), 1)
            # Grid floor with perspective
            cv2.rectangle(img, (0, int(self.h * 0.65)), (self.w, self.h), (12, 10, 20), -1)
            cv2.line(img, (0, int(self.h * 0.65)), (self.w, int(self.h * 0.65)), (0, 229, 255), 2)
            vp = (self.w // 2 + ox, int(self.h * 0.65))
            for gx in range(-200, self.w + 300, 70):
                cv2.line(img, vp, (gx, self.h), (180, 50, 160), 1)
            for gy in range(int(self.h * 0.65), self.h, 45):
                cv2.line(img, (0, gy), (self.w, gy), (0, 229, 255), 1)

        elif bg_type == 'medical_lab':
            # Clean High-Tech Medical & Science Laboratory
            img[:] = (35, 40, 48)
            # Medical Wall Tiles / Grid
            for gy in range(0, int(self.h * 0.75), 60):
                cv2.line(img, (0, gy), (self.w, gy), (45, 52, 62), 1)
            # High-Tech ECG / DNA Monitor Screen
            mon_x1, mon_y1, mon_x2, mon_y2 = 100 + ox, 140 + oy, 620 + ox, 380 + oy
            cv2.rectangle(img, (mon_x1, mon_y1), (mon_x2, mon_y2), (20, 24, 30), -1)
            cv2.rectangle(img, (mon_x1, mon_y1), (mon_x2, mon_y2), (0, 229, 255), 2)
            cv2.putText(img, 'AI MEDICAL & SCIENCE LAB', (mon_x1 + 30, mon_y1 + 45), cv2.FONT_HERSHEY_DUPLEX, 0.65, (0, 229, 255), 2)
            # Animated / Stylized ECG Pulse & DNA Waves
            ecg_pts = []
            for ex in range(mon_x1 + 30, mon_x2 - 30, 20):
                rel = (ex - mon_x1)
                ey = int(mon_y1 + 130 + math.sin(rel * 0.08) * 25)
                if 220 < rel < 320:
                    ey = int(mon_y1 + 130 + ((rel % 40) - 20) * 3)
                ecg_pts.append([ex, ey])
            cv2.polylines(img, [np.array(ecg_pts, np.int32)], False, (60, 255, 120), 3)
            # Medical Cross Icon
            cv2.circle(img, (mon_x2 - 50, mon_y1 + 40), 16, (40, 200, 240), -1)
            cv2.putText(img, '+', (mon_x2 - 58, mon_y1 + 48), cv2.FONT_HERSHEY_DUPLEX, 0.8, (255, 255, 255), 2)
            # Lab Counter Table in foreground
            cv2.rectangle(img, (0, int(self.h * 0.78)), (self.w, self.h), (25, 30, 38), -1)
            cv2.line(img, (0, int(self.h * 0.78)), (self.w, int(self.h * 0.78)), (0, 229, 255), 3)

        elif bg_type == 'office_meeting':
            for y in range(0, int(self.h * 0.72)):
                ratio = y / (self.h * 0.72)
                cv2.line(img, (0, y), (self.w, y), (int(45 + ratio * 20), int(35 + ratio * 15), int(30 + ratio * 10)), 1)
            for y in range(int(self.h * 0.72), self.h):
                cv2.line(img, (0, y), (self.w, y), (25, 22, 20), 1)
            # Presentation Whiteboard
            sb_x1, sb_y1, sb_x2, sb_y2 = 120 + ox, 180 + oy, 600 + ox, 420 + oy
            cv2.rectangle(img, (sb_x1, sb_y1), (sb_x2, sb_y2), (40, 40, 45), -1)
            cv2.rectangle(img, (sb_x1+6, sb_y1+6), (sb_x2-6, sb_y2-6), (235, 240, 245), -1)
            cv2.putText(img, 'EXECUTIVE STRATEGY', (sb_x1+35, sb_y1+45), cv2.FONT_HERSHEY_DUPLEX, 0.65, (30, 30, 30), 2)
            # Growth diagram
            cv2.polylines(img, [np.array([[sb_x1+40, sb_y2-40], [sb_x1+160, sb_y2-60], [sb_x1+280, sb_y1+100], [sb_x2-40, sb_y1+80]], np.int32)], False, (0, 180, 60), 4)

        else:
            # Minimal Dark Slate
            img[:] = (20, 22, 28)

    def draw_prop(self, img, prop_type, px, py, sign=1, accent=(0, 229, 255)):
        if not prop_type:
            return
        if prop_type == 'dna':
            # Glowing Double Helix DNA strand
            for i in range(-3, 4):
                dy = py + i * 14
                sin_v = math.sin(i * 1.0) * 18 * sign
                p1 = (int(px - sin_v), dy)
                p2 = (int(px + sin_v), dy)
                cv2.line(img, p1, p2, (0, 229, 255), 2)
                cv2.circle(img, p1, 5, (247, 85, 168), -1)
                cv2.circle(img, p2, 5, (0, 229, 255), -1)
        elif prop_type in ['bone', 'skeleton']:
            # Cartoon Medical Bone for Skeleton co-host
            bx, by = px, py - 10
            cv2.line(img, (bx - 18, by), (bx + 18, by), (255, 255, 255), 8)
            cv2.circle(img, (bx - 18, by - 6), 6, (240, 245, 255), -1)
            cv2.circle(img, (bx - 18, by + 6), 6, (240, 245, 255), -1)
            cv2.circle(img, (bx + 18, by - 6), 6, (240, 245, 255), -1)
            cv2.circle(img, (bx + 18, by + 6), 6, (240, 245, 255), -1)
        elif prop_type in ['book', 'flashcard']:
            # Study Book / Flashcard
            cv2.rectangle(img, (px - 22, py - 28), (px + 22, py + 22), (245, 245, 250), -1)
            cv2.rectangle(img, (px - 22, py - 28), (px + 22, py + 22), (0, 180, 255), 2)
            cv2.line(img, (px - 14, py - 16), (px + 14, py - 16), (40, 50, 70), 2)
            cv2.line(img, (px - 14, py - 6), (px + 14, py - 6), (40, 50, 70), 2)
            cv2.line(img, (px - 14, py + 4), (px + 14, py + 4), (40, 50, 70), 2)
            cv2.putText(img, 'A+', (px + 4, py + 18), cv2.FONT_HERSHEY_DUPLEX, 0.45, (30, 30, 230), 2)
        elif prop_type == 'bulb':
            # Glowing Light Bulb (Idea)
            cv2.circle(img, (px, py - 16), 18, (60, 230, 255), -1)
            cv2.circle(img, (px, py - 16), 18, (255, 255, 255), 2)
            cv2.rectangle(img, (px - 8, py + 2), (px + 8, py + 12), (180, 180, 190), -1)
            for ray_ang in [-45, 0, 45, 180+45, 180, 180-45]:
                rx = int(px + 28 * math.cos(math.radians(ray_ang)))
                ry = int((py - 16) + 28 * math.sin(math.radians(ray_ang)))
                cv2.line(img, (px, py - 16), (rx, ry), (60, 230, 255), 2)
        elif prop_type == 'brain':
            # AI / Brain Neural Node
            cv2.circle(img, (px - 10, py - 14), 14, (247, 85, 168), -1)
            cv2.circle(img, (px + 10, py - 14), 14, (247, 85, 168), -1)
            cv2.circle(img, (px, py - 4), 16, (220, 70, 150), -1)
            cv2.circle(img, (px, py - 10), 18, (255, 255, 255), 2)
            cv2.line(img, (px - 12, py - 14), (px + 12, py - 14), (255, 255, 255), 2)
        elif prop_type in ['quiz', 'target']:
            # Exam Quiz Board with Checkmarks
            cv2.rectangle(img, (px - 22, py - 26), (px + 22, py + 24), (240, 245, 250), -1)
            cv2.rectangle(img, (px - 22, py - 26), (px + 22, py + 24), (0, 200, 120), 2)
            for cy_off in [-14, -2, 10]:
                cv2.line(img, (px - 14, py + cy_off), (px - 9, py + cy_off + 5), (30, 180, 50), 2)
                cv2.line(img, (px - 9, py + cy_off + 5), (px - 2, py + cy_off - 5), (30, 180, 50), 2)
                cv2.line(img, (px + 2, py + cy_off), (px + 16, py + cy_off), (80, 90, 110), 2)
            cv2.putText(img, '100', (px + 2, py + 20), cv2.FONT_HERSHEY_DUPLEX, 0.4, (30, 180, 50), 1)
        elif prop_type == 'chart_up':
            cv2.rectangle(img, (px - 24, py - 18), (px + 24, py + 18), (30, 30, 40), -1)
            cv2.rectangle(img, (px - 24, py - 18), (px + 24, py + 18), (0, 229, 255), 2)
            cv2.line(img, (px - 18, py + 12), (px - 6, py + 2), (50, 220, 80), 3)
            cv2.line(img, (px - 6, py + 2), (px + 18, py - 12), (50, 220, 80), 3)
        elif prop_type == 'phone':
            # Smartphone
            cv2.rectangle(img, (px - 14, py - 26), (px + 14, py + 26), (30, 30, 35), -1)
            cv2.rectangle(img, (px - 11, py - 22), (px + 11, py + 20), (240, 230, 50), -1)
            cv2.rectangle(img, (px - 14, py - 26), (px + 14, py + 26), (255, 255, 255), 1)
        elif prop_type == 'coffee':
            # Coffee cup with steam
            cv2.rectangle(img, (px - 14, py - 18), (px + 14, py + 18), (220, 225, 230), -1)
            cv2.rectangle(img, (px - 14, py - 18), (px + 14, py + 18), (50, 50, 50), 2)
            # Cup handle
            cv2.ellipse(img, (px + int(14 * sign), py), (8, 10), 0, -90, 90, (220, 225, 230), 3)
            # Steam squiggles
            cv2.line(img, (px - 5, py - 24), (px - 2, py - 34), (200, 200, 200), 2)
            cv2.line(img, (px + 5, py - 24), (px + 8, py - 34), (200, 200, 200), 2)
        elif prop_type == 'money_bag':
            # Money Bag with $ symbol
            cv2.circle(img, (px, py), 22, (50, 160, 50), -1)
            cv2.circle(img, (px, py), 22, (20, 80, 20), 2)
            cv2.rectangle(img, (px - 10, py - 28), (px + 10, py - 18), (50, 160, 50), -1)
            cv2.putText(img, '$', (px - 6, py + 8), cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2)
        elif prop_type == 'megaphone':
            # Megaphone pointing outward
            pts = np.array([[px, py - 8], [px + int(36 * sign), py - 24], [px + int(36 * sign), py + 24], [px, py + 8]], np.int32)
            cv2.fillPoly(img, [pts], (40, 160, 240))
            cv2.polylines(img, [pts], True, (255, 255, 255), 2)
            cv2.rectangle(img, (px - int(10 * sign), py + 6), (px, py + 20), (60, 60, 60), -1)
        elif prop_type in ['alert', 'fire']:
            # Alert danger sign
            cv2.circle(img, (px, py - 30), 24, (30, 30, 225), -1)
            cv2.circle(img, (px, py - 30), 24, (255, 255, 255), 2)
            cv2.putText(img, '!', (px - 5, py - 18), cv2.FONT_HERSHEY_DUPLEX, 0.9, (255, 255, 255), 3)
        elif prop_type == 'chart_down':
            # Red crashed chart board
            cv2.rectangle(img, (px - 28, py - 20), (px + 28, py + 20), (30, 30, 40), -1)
            cv2.rectangle(img, (px - 28, py - 20), (px + 28, py + 20), (200, 200, 200), 2)
            cv2.line(img, (px - 20, py - 12), (px, py), (30, 30, 220), 3)
            cv2.line(img, (px, py), (px + 20, py + 14), (30, 30, 220), 3)
        elif prop_type == 'question':
            # Bouncing question mark
            cv2.putText(img, '?', (px - 10, py - 10), cv2.FONT_HERSHEY_DUPLEX, 1.2, (40, 210, 255), 4)
        elif prop_type == 'sunglasses':
            # Cool sunglasses on face
            cv2.rectangle(img, (px - 28, py - 8), (px - 4, py + 8), (15, 15, 20), -1)
            cv2.rectangle(img, (px + 4, py - 8), (px + 28, py + 8), (15, 15, 20), -1)
            cv2.line(img, (px - 4, py), (px + 4, py), (15, 15, 20), 3)
        elif prop_type == 'shopping_cart':
            # Shopping cart / olshop
            cv2.rectangle(img, (px - 20, py - 15), (px + 20, py + 12), (0, 200, 255), 2)
            cv2.line(img, (px - 24, py - 15), (px - 20, py - 15), (255, 255, 255), 3)
            cv2.circle(img, (px - 12, py + 18), 5, (255, 255, 255), -1)
            cv2.circle(img, (px + 12, py + 18), 5, (255, 255, 255), -1)

    def draw_expressive_stickman(self, img, cx, cy, action='idle', t=0.0, energy=0.0, flipped=False, 
                                 body_color=(245, 245, 250), accent_color=(0, 229, 255), prop=None, 
                                 label=None, scale_mult=1.0, comic_shout=None):
        sign = -1 if flipped else 1
        scale = scale_mult * (1.0 + min(energy * 0.25, 0.2))
        head_radius = int(50 * scale)
        head_cy = int(cy - 220 * scale)
        
        bob_y = int(math.sin(t * 8.0) * (4 + energy * 14))
        head_cy += bob_y
        
        body_start = (cx, head_cy + head_radius)
        body_end = (cx, int(cy))
        
        l_hand = (cx - int(68 * sign * scale), int(cy - 95 * scale))
        r_hand = (cx + int(68 * sign * scale), int(cy - 95 * scale))
        l_foot = (cx - int(48 * scale), int(cy + 175 * scale))
        r_foot = (cx + int(48 * scale), int(cy + 175 * scale))
        
        eye_expression = 'normal'
        mouth_expression = 'flat'
        fx_list = []
        
        if action == 'panic_look':
            head_cx = cx + int(math.sin(t * 12.0) * 14)
            body_start = (head_cx, head_cy + head_radius)
            l_hand = (cx - int(90 * sign * scale), int(cy - 60 * scale + math.sin(t * 10) * 10))
            r_hand = (cx + int(40 * sign * scale), int(cy - 120 * scale + math.cos(t * 10) * 10))
            eye_expression = 'wide_sweat'
            mouth_expression = 'wavy'
            fx_list.append(('sweat', head_cx + int(45 * scale), head_cy - int(30 * scale)))
            fx_list.append(('sweat', head_cx - int(45 * scale), head_cy - int(20 * scale)))
            stomach_cx = cx
            stomach_cy = int(cy - 80 * scale)
            cv2.circle(img, (stomach_cx, stomach_cy), int((28 + math.sin(t*25)*8) * scale), (30, 120, 230), 2)
        elif action == 'cough_fail':
            head_cy += int(25 * scale)
            head_cx = cx + int(25 * sign * scale)
            body_start = (head_cx, head_cy + head_radius)
            l_hand = (head_cx - 10, head_cy + 30)
            r_hand = (head_cx + 10, head_cy + 30)
            eye_expression = 'squint'
            mouth_expression = 'open_cough'
            fx_list.append(('sweat', head_cx + 40, head_cy - 15))
        elif action == 'point':
            head_cx = cx
            l_hand = (cx - int(40 * sign * scale), int(cy - 70 * scale))
            r_hand = (cx + int(140 * sign * scale), int(cy - 130 * scale + math.sin(t * 8) * 8))
            eye_expression = 'normal'
            mouth_expression = 'speaking'
        elif action == 'shrug':
            head_cx = cx
            head_cy += int(15 * scale)
            l_hand = (cx - int(95 * sign * scale), int(cy - 110 * scale))
            r_hand = (cx + int(95 * sign * scale), int(cy - 110 * scale))
            eye_expression = 'side_glance'
            mouth_expression = 'wavy'
            fx_list.append(('speech_bubble', cx - 40, head_cy - 70, '???'))
        elif action == 'celebrate':
            head_cx = cx
            l_hand = (cx - int(80 * sign * scale), int(cy - 180 * scale + math.sin(t * 10) * 15))
            r_hand = (cx + int(80 * sign * scale), int(cy - 180 * scale + math.cos(t * 10) * 15))
            eye_expression = 'derp_smile'
            mouth_expression = 'happy'
        elif action == 'surprised':
            head_cx = cx
            l_hand = (cx - head_radius - 10, head_cy)
            r_hand = (cx + head_radius + 10, head_cy)
            eye_expression = 'jaw_drop'
            mouth_expression = 'huge_open'
            fx_list.append(('sweat', cx + 35, head_cy - 30))
        elif action == 'angry':
            head_cx = cx + int(math.sin(t * 20.0) * 6)
            l_hand = (cx - int(70 * sign * scale), int(cy - 120 * scale))
            r_hand = (cx + int(110 * sign * scale), int(cy - 130 * scale))
            eye_expression = 'squint'
            mouth_expression = 'wavy'
        elif action == 'listen':
            head_cx = cx
            l_hand = (cx - int(50 * sign * scale), int(cy - 60 * scale))
            r_hand = (cx + int(50 * sign * scale), int(cy - 60 * scale))
            eye_expression = 'side_glance'
            mouth_expression = 'flat'
        else:
            # Standard expressive talking
            head_cx = cx
            talk_bob = int(math.sin(t * 14.0) * (3 + energy * 10))
            head_cy += talk_bob
            l_hand = (cx - int(70 * sign * scale), int(cy - 90 * scale + math.sin(t * 5) * 15))
            r_hand = (cx + int(70 * sign * scale), int(cy - 110 * scale + math.cos(t * 6) * 20))
            eye_expression = 'normal'
            mouth_expression = 'speaking'

        thickness = max(4, int(7 * scale))
        
        # Legs
        knee_l = ((cx + l_foot[0]) // 2 - 15, (int(cy) + l_foot[1]) // 2)
        knee_r = ((cx + r_foot[0]) // 2 + 15, (int(cy) + r_foot[1]) // 2)
        cv2.line(img, body_end, knee_l, body_color, thickness)
        cv2.line(img, knee_l, l_foot, body_color, thickness)
        cv2.line(img, body_end, knee_r, body_color, thickness)
        cv2.line(img, knee_r, r_foot, body_color, thickness)
        
        # Torso Spine
        cv2.line(img, body_start, body_end, body_color, thickness + 2)
        
        # Arms
        elbow_l = ((cx + l_hand[0]) // 2 - 10, (body_start[1] + l_hand[1]) // 2 + 10)
        elbow_r = ((cx + r_hand[0]) // 2 + 10, (body_start[1] + r_hand[1]) // 2 + 10)
        cv2.line(img, (body_start[0], body_start[1] + int(22 * scale)), elbow_l, body_color, thickness)
        cv2.line(img, elbow_l, l_hand, body_color, thickness)
        cv2.line(img, (body_start[0], body_start[1] + int(22 * scale)), elbow_r, body_color, thickness)
        cv2.line(img, elbow_r, r_hand, body_color, thickness)
        
        # Head (with subtle glow aura)
        head_center = (head_cx, head_cy)
        cv2.circle(img, head_center, head_radius + 4, accent_color, 2)
        cv2.circle(img, head_center, head_radius, body_color, -1)
        cv2.circle(img, head_center, head_radius, (25, 25, 30), max(3, int(5 * scale)))
        
        # Face Expression
        self.draw_face(img, head_center, head_radius, eye_expression, mouth_expression, t, energy)
        
        # Hand Prop Rendering
        if prop:
            prop_pos = r_hand if sign > 0 else l_hand
            self.draw_prop(img, prop, prop_pos[0], prop_pos[1], sign=sign, accent=accent_color)
        
        # Character Label Badge (e.g. HOST or GUEST)
        if label:
            lbl_w = int(len(label) * 9 + 16)
            lbl_x1 = head_cx - lbl_w // 2
            lbl_y1 = head_cy - head_radius - 28
            cv2.rectangle(img, (lbl_x1, lbl_y1), (lbl_x1 + lbl_w, lbl_y1 + 20), (15, 20, 28), -1)
            cv2.rectangle(img, (lbl_x1, lbl_y1), (lbl_x1 + lbl_w, lbl_y1 + 20), accent_color, 1)
            cv2.putText(img, label, (lbl_x1 + 8, lbl_y1 + 14), cv2.FONT_HERSHEY_DUPLEX, 0.4, (255, 255, 255), 1)

        # Comic Shout Bubble
        if comic_shout:
            shout_y = head_cy - head_radius - 60
            self.draw_comic_bubble(img, head_cx - 50, shout_y, comic_shout)

        # FX items
        for fx in fx_list:
            if fx[0] == 'sweat':
                cv2.circle(img, (fx[1], fx[2]), 7, (230, 180, 50), -1)
                cv2.line(img, (fx[1], fx[2]), (fx[1]-2, fx[2]-12), (230, 180, 50), 3)
            elif fx[0] == 'speech_bubble':
                self.draw_comic_bubble(img, fx[1], fx[2], fx[3])

    def draw_face(self, img, center, radius, eye_type, mouth_type, t, energy):
        cx, cy = center
        scale = radius / 50.0
        
        # Eyes
        if eye_type == 'wide_sweat':
            cv2.circle(img, (cx - int(18*scale), cy - int(8*scale)), int(11*scale), (20, 20, 20), -1)
            cv2.circle(img, (cx + int(18*scale), cy - int(8*scale)), int(11*scale), (20, 20, 20), -1)
            cv2.circle(img, (cx - int(16*scale), cy - int(10*scale)), int(4*scale), (250, 250, 250), -1)
            cv2.circle(img, (cx + int(20*scale), cy - int(10*scale)), int(4*scale), (250, 250, 250), -1)
        elif eye_type == 'squint':
            cv2.line(img, (cx - int(25*scale), cy - int(10*scale)), (cx - int(8*scale), cy - int(5*scale)), (20, 20, 20), 4)
            cv2.line(img, (cx + int(8*scale), cy - int(5*scale)), (cx + int(25*scale), cy - int(10*scale)), (20, 20, 20), 4)
        elif eye_type == 'jaw_drop':
            cv2.circle(img, (cx - int(20*scale), cy - int(15*scale)), int(18*scale), (20, 20, 20), 3)
            cv2.circle(img, (cx + int(20*scale), cy - int(15*scale)), int(18*scale), (20, 20, 20), 3)
            cv2.circle(img, (cx - int(20*scale), cy - int(15*scale)), int(6*scale), (20, 20, 20), -1)
            cv2.circle(img, (cx + int(20*scale), cy - int(15*scale)), int(6*scale), (20, 20, 20), -1)
        elif eye_type == 'side_glance':
            cv2.circle(img, (cx - int(18*scale), cy - int(8*scale)), int(8*scale), (20, 20, 20), 2)
            cv2.circle(img, (cx + int(18*scale), cy - int(8*scale)), int(8*scale), (20, 20, 20), 2)
            cv2.circle(img, (cx - int(13*scale), cy - int(8*scale)), int(5*scale), (20, 20, 20), -1)
            cv2.circle(img, (cx + int(23*scale), cy - int(8*scale)), int(5*scale), (20, 20, 20), -1)
        elif eye_type == 'derp_smile':
            cv2.ellipse(img, (cx - int(18*scale), cy - int(8*scale)), (int(10*scale), int(6*scale)), 0, 180, 360, (20, 20, 20), 3)
            cv2.ellipse(img, (cx + int(18*scale), cy - int(8*scale)), (int(10*scale), int(6*scale)), 0, 180, 360, (20, 20, 20), 3)
        else:
            cv2.circle(img, (cx - int(18*scale), cy - int(8*scale)), int(7*scale), (20, 20, 20), -1)
            cv2.circle(img, (cx + int(18*scale), cy - int(8*scale)), int(7*scale), (20, 20, 20), -1)

        # Mouth
        if mouth_type == 'huge_open':
            cv2.ellipse(img, (cx, cy + int(24*scale)), (int(18*scale), int(26*scale)), 0, 0, 360, (20, 20, 20), -1)
            cv2.ellipse(img, (cx, cy + int(30*scale)), (int(12*scale), int(10*scale)), 0, 0, 180, (70, 70, 220), -1)
        elif mouth_type == 'open_cough':
            cv2.circle(img, (cx, cy + int(18*scale)), int(12*scale), (20, 20, 20), -1)
        elif mouth_type == 'speaking':
            open_h = int((6 + math.sin(t * 18.0) * 8 + energy * 10) * scale)
            cv2.ellipse(img, (cx, cy + int(18*scale)), (int(14*scale), max(4, open_h)), 0, 0, 360, (20, 20, 20), -1)
        elif mouth_type == 'wavy':
            pts = np.array([[cx - int(18*scale), cy + int(16*scale)], 
                            [cx - int(6*scale), cy + int(22*scale)], 
                            [cx + int(6*scale), cy + int(14*scale)], 
                            [cx + int(18*scale), cy + int(20*scale)]], np.int32)
            cv2.polylines(img, [pts], False, (20, 20, 20), 3)
        elif mouth_type == 'happy':
            cv2.ellipse(img, (cx, cy + int(14*scale)), (int(16*scale), int(10*scale)), 0, 0, 180, (20, 20, 20), 3)
        else:
            cv2.line(img, (cx - int(14*scale), cy + int(18*scale)), (cx + int(14*scale), cy + int(18*scale)), (20, 20, 20), 3)

    def draw_comic_bubble(self, img, bx, by, text):
        font = cv2.FONT_HERSHEY_DUPLEX
        f_scale = 0.58
        thick = 2
        size = cv2.getTextSize(text, font, f_scale, thick)[0]
        pad = 12
        x1, y1 = max(10, bx - pad), max(40, by - size[1] - pad)
        x2, y2 = min(self.w - 10, bx + size[0] + pad), min(self.h - 10, by + pad)
        # Drop shadow
        cv2.rectangle(img, (x1+4, y1+4), (x2+4, y2+4), (10, 10, 15), -1)
        # White bubble
        cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 255), -1)
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 229, 255), 2)
        # Bubble tail
        pts = np.array([[x1+25, y2], [x1+15, y2+15], [x1+35, y2]], np.int32)
        cv2.fillPoly(img, [pts], (255, 255, 255))
        cv2.polylines(img, [pts], True, (0, 229, 255), 2)
        cv2.putText(img, text, (bx, by), font, f_scale, (15, 20, 30), thick)
