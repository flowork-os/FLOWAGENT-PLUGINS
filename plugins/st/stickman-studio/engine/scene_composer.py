# [FL_INDEX: keywords="scene_composer, stickman_rig, meme_fx, procedural_backgrounds, animation_pipeline" | purpose="Multi-layer procedural scene composer with dynamic backgrounds and expressive stickman skeleton for Stickman Studio"]
import cv2
import numpy as np
import math
import os

class StickmanSceneComposer:
    def __init__(self, width=720, height=1280):
        self.w = width
        self.h = height

    def draw_background(self, img, bg_type='office_meeting', camera_shake=(0, 0)):
        ox, oy = int(camera_shake[0]), int(camera_shake[1])
        if bg_type == 'office_meeting':
            # Wall gradient
            for y in range(0, int(self.h * 0.72)):
                ratio = y / (self.h * 0.72)
                b = int(45 + ratio * 20)
                g = int(35 + ratio * 15)
                r = int(30 + ratio * 10)
                cv2.line(img, (0, y), (self.w, y), (b, g, r), 1)
            # Floor
            for y in range(int(self.h * 0.72), self.h):
                ratio = (y - self.h * 0.72) / (self.h * 0.28)
                b = int(25 - ratio * 10)
                g = int(22 - ratio * 8)
                r = int(20 - ratio * 6)
                cv2.line(img, (0, y), (self.w, y), (b, g, r), 1)
            # Office Window with skyscraper silhouettes
            win_x1, win_y1, win_x2, win_y2 = 60 + ox, 180 + oy, 320 + ox, 500 + oy
            cv2.rectangle(img, (win_x1, win_y1), (win_x2, win_y2), (70, 50, 40), -1)
            cv2.rectangle(img, (win_x1+8, win_y1+8), (win_x2-8, win_y2-8), (160, 110, 80), -1)
            # Building silhouettes inside window
            cv2.rectangle(img, (win_x1+20, win_y2-180), (win_x1+80, win_y2-8), (60, 45, 35), -1)
            cv2.rectangle(img, (win_x1+100, win_y2-240), (win_x1+170, win_y2-8), (45, 35, 28), -1)
            cv2.rectangle(img, (win_x1+190, win_y2-150), (win_x2-20, win_y2-8), (70, 50, 40), -1)
            # Window frame divider
            cv2.line(img, ((win_x1+win_x2)//2, win_y1+8), ((win_x1+win_x2)//2, win_y2-8), (70, 50, 40), 4)
            cv2.line(img, (win_x1+8, (win_y1+win_y2)//2), (win_x2-8, (win_y1+win_y2)//2), (70, 50, 40), 4)
            # Presentation Board / Screen
            sb_x1, sb_y1, sb_x2, sb_y2 = 380 + ox, 200 + oy, 660 + ox, 480 + oy
            cv2.rectangle(img, (sb_x1, sb_y1), (sb_x2, sb_y2), (50, 45, 45), -1)
            cv2.rectangle(img, (sb_x1+6, sb_y1+6), (sb_x2-6, sb_y2-6), (230, 235, 238), -1)
            # Chart on screen
            cv2.putText(img, 'Q4 FINANCIALS: TOP SECRET', (sb_x1+18, sb_y1+40), cv2.FONT_HERSHEY_DUPLEX, 0.55, (40, 40, 40), 2)
            cv2.line(img, (sb_x1+30, sb_y2-40), (sb_x2-30, sb_y2-40), (100, 100, 100), 2)
            cv2.line(img, (sb_x1+30, sb_y2-40), (sb_x1+30, sb_y1+60), (100, 100, 100), 2)
            cv2.polylines(img, [np.array([[sb_x1+40, sb_y2-50], [sb_x1+100, sb_y2-110], [sb_x1+160, sb_y2-80], [sb_x2-50, sb_y1+80]], np.int32)], False, (40, 180, 50), 3)
            # Meeting table in foreground
            cv2.ellipse(img, (self.w // 2 + ox, int(self.h * 0.90) + oy), (int(self.w * 0.65), 180), 0, 0, 360, (55, 40, 35), -1)
            cv2.ellipse(img, (self.w // 2 + ox, int(self.h * 0.90) + oy), (int(self.w * 0.65), 180), 0, 0, 360, (90, 70, 60), 4)
        elif bg_type == 'speedlines_panic':
            img[:] = (20, 20, 35)
            center = (self.w // 2 + ox, int(self.h * 0.45) + oy)
            for angle_deg in range(0, 360, 6):
                rad = math.radians(angle_deg)
                r_inner = 140 + (angle_deg % 12) * 10
                r_outer = 900
                p1 = (int(center[0] + r_inner * math.cos(rad)), int(center[1] + r_inner * math.sin(rad)))
                p2 = (int(center[0] + r_outer * math.cos(rad)), int(center[1] + r_outer * math.sin(rad)))
                color = (40, 40, 160) if (angle_deg % 12 == 0) else (30, 30, 80)
                cv2.line(img, p1, p2, color, 3)
        else:
            img[:] = (25, 28, 35)

    def draw_expressive_stickman(self, img, cx, cy, action='idle', t=0.0, energy=0.0, flipped=False):
        sign = -1 if flipped else 1
        scale = 1.0 + min(energy * 0.3, 0.25)
        head_radius = int(52 * scale)
        head_cy = int(cy - 230)
        
        bob_y = int(math.sin(t * 8.0) * (4 + energy * 15))
        head_cy += bob_y
        
        body_start = (cx, head_cy + head_radius)
        body_end = (cx, cy)
        
        l_hand = (cx - int(70 * sign), cy - 100)
        r_hand = (cx + int(70 * sign), cy - 100)
        l_foot = (cx - 50, cy + 180)
        r_foot = (cx + 50, cy + 180)
        
        eye_expression = 'normal'
        mouth_expression = 'flat'
        fx_list = []
        
        if action == 'panic_look':
            head_cx = cx + int(math.sin(t * 12.0) * 14)
            body_start = (head_cx, head_cy + head_radius)
            l_hand = (cx - int(90 * sign), cy - 60 + int(math.sin(t * 10) * 10))
            r_hand = (cx + int(40 * sign), cy - 120 + int(math.cos(t * 10) * 10))
            eye_expression = 'wide_sweat'
            mouth_expression = 'wavy'
            fx_list.append(('sweat', head_cx + 45, head_cy - 30))
            fx_list.append(('sweat', head_cx - 45, head_cy - 20))
            stomach_cx = cx
            stomach_cy = cy - 80
            cv2.circle(img, (stomach_cx, stomach_cy), int(30 + math.sin(t*25)*8), (30, 120, 230), 2)
            cv2.putText(img, 'KRUUUKK!', (cx + 45, cy - 85), cv2.FONT_HERSHEY_DUPLEX, 0.65, (40, 200, 255), 2)
        elif action == 'cough_fail':
            head_cy += 30
            head_cx = cx + 25 * sign
            body_start = (head_cx, head_cy + head_radius)
            l_hand = (head_cx - 10, head_cy + 30)
            r_hand = (head_cx + 10, head_cy + 30)
            eye_expression = 'squint'
            mouth_expression = 'open_cough'
            fx_list.append(('speech_bubble', cx - 120, head_cy - 80, 'UHUK!! UHUK!!'))
            if t % 1.5 > 0.8:
                fx_list.append(('shock_blast', cx + 70, cy + 60, 'PROOOT!!'))
        elif action == 'chair_drag':
            head_cx = cx - 35 * sign
            body_start = (head_cx, head_cy + head_radius)
            l_hand = (cx - int(120 * sign), cy + 40)
            r_hand = (cx - int(60 * sign), cy + 50)
            chair_x = cx - int(100 * sign)
            chair_y = cy + 20
            cv2.rectangle(img, (chair_x-25, chair_y), (chair_x+25, chair_y+90), (60, 100, 180), -1)
            cv2.line(img, (chair_x-20, chair_y+90), (chair_x-30, chair_y+170), (40, 60, 120), 5)
            cv2.line(img, (chair_x+20, chair_y+90), (chair_x+10, chair_y+170), (40, 60, 120), 5)
            fx_list.append(('speech_bubble', cx - 110, head_cy - 70, 'SREEEETTT!!'))
            eye_expression = 'panic'
        elif action == 'blame_friend':
            head_cx = cx
            l_hand = (cx - int(40 * sign), cy - 60)
            r_hand = (cx + int(160 * sign), cy - 130)
            eye_expression = 'side_glance'
            mouth_expression = 'smug_innocent'
            fx_list.append(('speech_bubble', cx - 100, head_cy - 90, 'Bukan gua sumpah!'))
        elif action == 'zoom_mic_shock':
            head_cx = cx
            l_hand = (cx - head_radius - 10, head_cy)
            r_hand = (cx + head_radius + 10, head_cy)
            eye_expression = 'jaw_drop'
            mouth_expression = 'huge_open'
            fx_list.append(('sweat_waterfall', cx, head_cy))
            fx_list.append(('speech_bubble', cx - 130, head_cy - 110, 'MIC ZOOM NYALA?!'))
        elif action == 'outro_clap':
            head_cx = cx
            clap_offset = int(math.sin(t * 18.0) * 20)
            l_hand = (cx - clap_offset, cy - 120)
            r_hand = (cx + clap_offset, cy - 120)
            eye_expression = 'derp_smile'
            mouth_expression = 'happy'
            fx_list.append(('speech_bubble', cx - 100, head_cy - 90, 'Besok kirim CV baru!'))
        else:
            head_cx = cx
            talk_bob = int(math.sin(t * 14.0) * (3 + energy * 10))
            head_cy += talk_bob
            l_hand = (cx - int(70 * sign), cy - 90 + int(math.sin(t * 5) * 15))
            r_hand = (cx + int(70 * sign), cy - 110 + int(math.cos(t * 6) * 20))
            eye_expression = 'normal'
            mouth_expression = 'speaking'

        body_color = (245, 245, 250)
        thickness = 7
        
        knee_l = ((cx + l_foot[0]) // 2 - 15, (cy + l_foot[1]) // 2)
        knee_r = ((cx + r_foot[0]) // 2 + 15, (cy + r_foot[1]) // 2)
        cv2.line(img, body_end, knee_l, body_color, thickness)
        cv2.line(img, knee_l, l_foot, body_color, thickness)
        cv2.line(img, body_end, knee_r, body_color, thickness)
        cv2.line(img, knee_r, r_foot, body_color, thickness)
        
        cv2.line(img, body_start, body_end, body_color, thickness + 2)
        
        elbow_l = ((cx + l_hand[0]) // 2 - 10, (body_start[1] + l_hand[1]) // 2 + 10)
        elbow_r = ((cx + r_hand[0]) // 2 + 10, (body_start[1] + r_hand[1]) // 2 + 10)
        cv2.line(img, (body_start[0], body_start[1] + 25), elbow_l, body_color, thickness)
        cv2.line(img, elbow_l, l_hand, body_color, thickness)
        cv2.line(img, (body_start[0], body_start[1] + 25), elbow_r, body_color, thickness)
        cv2.line(img, elbow_r, r_hand, body_color, thickness)
        
        head_center = (head_cx, head_cy)
        cv2.circle(img, head_center, head_radius, (245, 245, 250), -1)
        cv2.circle(img, head_center, head_radius, (25, 25, 30), 5)
        
        self.draw_face(img, head_center, head_radius, eye_expression, mouth_expression, t, energy)
        
        for fx in fx_list:
            if fx[0] == 'sweat':
                cv2.circle(img, (fx[1], fx[2]), 7, (230, 180, 50), -1)
                cv2.line(img, (fx[1], fx[2]), (fx[1]-2, fx[2]-12), (230, 180, 50), 3)
            elif fx[0] == 'speech_bubble':
                self.draw_comic_bubble(img, fx[1], fx[2], fx[3])

    def draw_face(self, img, center, radius, eye_type, mouth_type, t, energy):
        cx, cy = center
        if eye_type == 'wide_sweat':
            cv2.circle(img, (cx - 18, cy - 8), 11, (20, 20, 20), -1)
            cv2.circle(img, (cx + 18, cy - 8), 11, (20, 20, 20), -1)
            cv2.circle(img, (cx - 16, cy - 10), 4, (250, 250, 250), -1)
            cv2.circle(img, (cx + 20, cy - 10), 4, (250, 250, 250), -1)
        elif eye_type == 'squint':
            cv2.line(img, (cx - 25, cy - 10), (cx - 8, cy - 5), (20, 20, 20), 4)
            cv2.line(img, (cx + 8, cy - 5), (cx + 25, cy - 10), (20, 20, 20), 4)
        elif eye_type == 'jaw_drop':
            cv2.circle(img, (cx - 20, cy - 15), 18, (20, 20, 20), 3)
            cv2.circle(img, (cx + 20, cy - 15), 18, (20, 20, 20), 3)
            cv2.circle(img, (cx - 20, cy - 15), 6, (20, 20, 20), -1)
            cv2.circle(img, (cx + 20, cy - 15), 6, (20, 20, 20), -1)
        elif eye_type == 'side_glance':
            cv2.circle(img, (cx - 18, cy - 8), 8, (20, 20, 20), 2)
            cv2.circle(img, (cx + 18, cy - 8), 8, (20, 20, 20), 2)
            cv2.circle(img, (cx - 13, cy - 8), 5, (20, 20, 20), -1)
            cv2.circle(img, (cx + 23, cy - 8), 5, (20, 20, 20), -1)
        else:
            cv2.circle(img, (cx - 18, cy - 8), 7, (20, 20, 20), -1)
            cv2.circle(img, (cx + 18, cy - 8), 7, (20, 20, 20), -1)

        if mouth_type == 'huge_open':
            cv2.ellipse(img, (cx, cy + 24), (20, 28), 0, 0, 360, (20, 20, 20), -1)
            cv2.ellipse(img, (cx, cy + 30), (12, 10), 0, 0, 180, (70, 70, 220), -1)
        elif mouth_type == 'open_cough':
            cv2.circle(img, (cx, cy + 18), 12, (20, 20, 20), -1)
        elif mouth_type == 'speaking':
            open_h = int(6 + math.sin(t * 18.0) * 8 + energy * 10)
            cv2.ellipse(img, (cx, cy + 18), (14, max(4, open_h)), 0, 0, 360, (20, 20, 20), -1)
        elif mouth_type == 'wavy':
            pts = np.array([[cx - 18, cy + 16], [cx - 6, cy + 22], [cx + 6, cy + 14], [cx + 18, cy + 20]], np.int32)
            cv2.polylines(img, [pts], False, (20, 20, 20), 3)
        else:
            cv2.line(img, (cx - 14, cy + 18), (cx + 14, cy + 18), (20, 20, 20), 3)

    def draw_comic_bubble(self, img, bx, by, text):
        font = cv2.FONT_HERSHEY_DUPLEX
        f_scale = 0.65
        thick = 2
        size = cv2.getTextSize(text, font, f_scale, thick)[0]
        pad = 14
        x1, y1 = max(10, bx - pad), max(40, by - size[1] - pad)
        x2, y2 = min(self.w - 10, bx + size[0] + pad), min(self.h - 10, by + pad)
        cv2.rectangle(img, (x1+4, y1+4), (x2+4, y2+4), (20, 20, 30), -1)
        cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 255), -1)
        cv2.rectangle(img, (x1, y1), (x2, y2), (20, 20, 30), 3)
        pts = np.array([[x1+30, y2], [x1+20, y2+18], [x1+45, y2]], np.int32)
        cv2.fillPoly(img, [pts], (255, 255, 255))
        cv2.polylines(img, [pts], True, (20, 20, 30), 2)
        cv2.putText(img, text, (bx, by), font, f_scale, (20, 20, 20), thick)
