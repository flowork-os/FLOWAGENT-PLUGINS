#!/usr/bin/env python3
# [FL_INDEX: keywords="dynamic_cartoonist, zero_template, agent_artist, pose_to_stickman, comic_redrawer, generative_stickman" | purpose="Zero-template AI Agent Dynamic Cartoonist that redraws every video beat from tracked skeletal poses and graphic concepts"]
"""
Stickman Studio Agent Dynamic Cartoonist (Zero-Template Vision Redrawer)
Renders dynamic stickman characters directly from tracked human/skeleton keypoints
and illustrates custom comic scenes for graphic screens (DNA, flashcards, quizzes, CTAs).
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import math
import cv2
import numpy as np

class DynamicCartoonist:
    def __init__(self, width=720, height=1280):
        self.width = width
        self.height = height

    def render_beat_frame(self, beat_data, t=0.0, energy=0.7, width=None, height=None):
        """
        Renders a full 720x1280 (or custom target) frame for a given beat at relative time t.
        """
        w = width or self.width
        h = height or self.height
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        
        # Camera shake
        shake_amp = beat_data.get("camera_shake", 0)
        shake_x = int(math.sin(t * 32.0) * shake_amp) if shake_amp > 0 else 0
        shake_y = int(math.cos(t * 26.0) * shake_amp) if shake_amp > 0 else 0

        # Background
        self._draw_studio_background(canvas, t, shake_x, shake_y)

        pose_info = beat_data.get("pose_data") or {}
        has_pose = pose_info.get("has_pose", False)
        beat_idx = beat_data.get("index", beat_data.get("beat_idx", 1))
        text = beat_data.get("text", "")
        text_lower = text.lower()

        # Specific scene routing based on narrative and visual context
        # Priority 1: Dupin / Kocak funny parody scene
        if "dupin" in text_lower or "kocak" in text_lower or "aneh" in text_lower:
            self._render_dupin_kocak_scene(canvas, beat_data, t, energy, shake_x, shake_y)
        # Priority 2: Dedicated Tracked Pose 33-point Stickman Scene
        elif has_pose and "joints" in pose_info:
            self._draw_tracked_pose_scene(canvas, pose_info, beat_data, t, energy, shake_x, shake_y)
        # Priority 3: Semantic Specific Scenes (Only triggered when explicit keywords match)
        elif "tiga cara" in text_lower or "3 cara" in text_lower:
            self._render_beat1_waving_skeleton(canvas, beat_data, t, energy, shake_x, shake_y)
        elif ("pertama" in text_lower and "model" in text_lower) or ("replikasi dna" in text_lower and "pertama" in text_lower):
            self._render_numbered_intro_scene(canvas, "1", "MODEL DNA INTERAKTIF", t, energy, shake_x, shake_y)
        elif "replikasi dna" in text_lower or ("dna" in text_lower and "heliks" in text_lower):
            self._render_dna_replication_scene(canvas, beat_data, t, energy, shake_x, shake_y)
        elif ("situlang" in text_lower or "si tulang" in text_lower) and "laptop" in text_lower:
            self._render_beat6_laptop_skeleton(canvas, pose_info, beat_data, t, energy, shake_x, shake_y)
        elif ("kuis" in text_lower and "latihan" in text_lower) or "kuislatihan" in text_lower:
            self._render_interactive_quiz_scene(canvas, beat_data, t, energy, shake_x, shake_y)
        elif "266 tulang" in text_lower or ("flashcard" in text_lower and "tulang" in text_lower):
            self._render_flashcard_bone_scene(canvas, beat_data, t, energy, shake_x, shake_y)
        elif "daftar sekarang" in text_lower and ("gemini" in text_lower or "kelas" in text_lower):
            self._render_cta_gemini_scene(canvas, beat_data, t, energy, shake_x, shake_y)
        elif has_pose and "joints" in pose_info:
            self._draw_tracked_pose_scene(canvas, pose_info, beat_data, t, energy, shake_x, shake_y)
        else:
            self._render_general_comic_scene(canvas, beat_data, t, energy, shake_x, shake_y)

        # Comic Speech Bubble with narration
        if text and text != "[Music / Ambience]":
            self._draw_speech_bubble(canvas, text, beat_data, t, shake_x, shake_y)
        elif text == "[Music / Ambience]":
            self._draw_music_ambience_badge(canvas, t)

        return canvas

    def _draw_studio_background(self, canvas, t, sx, sy):
        for y in range(self.height):
            ratio = y / self.height
            r = int(14 + 8 * ratio)
            g = int(18 + 10 * ratio)
            b = int(28 + 14 * ratio)
            canvas[y, :] = (b, g, r)

        grid_step = 64
        grid_color = (32, 42, 58)
        for x in range(0, self.width, grid_step):
            gx = (x + sx) % self.width
            cv2.line(canvas, (gx, 0), (gx, self.height), grid_color, 1)
        for y in range(0, self.height, grid_step):
            gy = (y + sy) % self.height
            cv2.line(canvas, (0, gy), (self.width, gy), grid_color, 1)

    def _render_beat1_waving_skeleton(self, canvas, beat_data, t, energy, sx, sy):
        """Beat 1: Skeleton sitting in armchair waving hand excitedly to audience"""
        cx = self.width // 2 + sx
        cy = 740 + sy

        # Armchair background
        chair_color = (45, 55, 75)
        chair_border = (0, 229, 255)
        # Backrest
        cv2.rectangle(canvas, (cx - 190, cy - 260), (cx + 190, cy + 90), chair_color, -1)
        cv2.rectangle(canvas, (cx - 190, cy - 260), (cx + 190, cy + 90), chair_border, 2)
        # Cushions & Armrests
        cv2.rectangle(canvas, (cx - 240, cy - 60), (cx - 180, cy + 120), (35, 45, 65), -1)
        cv2.rectangle(canvas, (cx - 240, cy - 60), (cx - 180, cy + 120), chair_border, 2)
        cv2.rectangle(canvas, (cx + 180, cy - 60), (cx + 240, cy + 120), (35, 45, 65), -1)
        cv2.rectangle(canvas, (cx + 180, cy - 60), (cx + 240, cy + 120), chair_border, 2)

        # Skeleton Body
        mid_sh = (cx, cy - 140)
        mid_hip = (cx, cy + 60)
        head_c = (cx, cy - 210)
        head_r = 44

        # Wave motion for left arm
        wave_angle = math.sin(t * 10.0) * 0.4
        l_sh = (cx + 50, cy - 140)
        l_el = (cx + 110, cy - 180)
        l_wr = (int(cx + 130 + math.sin(wave_angle) * 35), int(cy - 260 + math.cos(wave_angle) * 15))

        # Right arm resting on armrest
        r_sh = (cx - 50, cy - 140)
        r_el = (cx - 110, cy - 80)
        r_wr = (cx - 170, cy - 40)

        # Legs sitting forward
        l_kn = (cx + 50, cy + 180)
        l_ank = (cx + 50, cy + 320)
        r_kn = (cx - 50, cy + 180)
        r_ank = (cx - 50, cy + 320)

        # Draw bones
        thick = 7
        bone_color = (255, 255, 255)
        joint_glow = (0, 229, 255)

        cv2.line(canvas, mid_sh, mid_hip, bone_color, thick + 2)
        cv2.line(canvas, r_sh, l_sh, bone_color, thick)
        cv2.line(canvas, r_sh, r_el, bone_color, thick)
        cv2.line(canvas, r_el, r_wr, bone_color, thick)
        cv2.line(canvas, l_sh, l_el, bone_color, thick)
        cv2.line(canvas, l_el, l_wr, bone_color, thick)

        cv2.line(canvas, (cx - 45, cy + 60), (cx + 45, cy + 60), bone_color, thick)
        cv2.line(canvas, (cx - 45, cy + 60), r_kn, bone_color, thick)
        cv2.line(canvas, r_kn, r_ank, bone_color, thick)
        cv2.line(canvas, (cx + 45, cy + 60), l_kn, bone_color, thick)
        cv2.line(canvas, l_kn, l_ank, bone_color, thick)

        # Waving hand open fingers
        for i_f in range(4):
            fx = l_wr[0] - 12 + i_f * 8
            fy = l_wr[1] - 22
            cv2.line(canvas, l_wr, (fx, fy), joint_glow, 3)

        # Joints
        for p in [r_sh, l_sh, r_el, l_el, r_wr, l_wr, r_kn, l_kn, r_ank, l_ank]:
            cv2.circle(canvas, p, 8, joint_glow, -1)
            cv2.circle(canvas, p, 4, (255, 255, 255), -1)

        # Head & Smile
        cv2.circle(canvas, head_c, head_r + 4, joint_glow, 3)
        cv2.circle(canvas, head_c, head_r, (15, 23, 42), -1)
        cv2.circle(canvas, head_c, head_r, bone_color, 4)
        cv2.circle(canvas, (head_c[0] - 14, head_c[1] - 6), 5, (255, 255, 255), -1)
        cv2.circle(canvas, (head_c[0] + 14, head_c[1] - 6), 5, (255, 255, 255), -1)
        cv2.ellipse(canvas, (head_c[0], head_c[1] + 14), (16, 8), 0, 0, 180, (255, 255, 255), 3)

        # Purple topic badge
        cv2.rectangle(canvas, (cx - 180, cy - 30), (cx + 180, cy + 25), (147, 51, 234), -1)
        cv2.rectangle(canvas, (cx - 180, cy - 30), (cx + 180, cy + 25), (255, 255, 255), 2)
        cv2.putText(canvas, "3 CARA GEMINI", (cx - 95, cy + 8), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 2)

    def _render_beat6_laptop_skeleton(self, canvas, pose_info, beat_data, t, energy, sx, sy):
        """Beat 6: Skeleton sitting in profile at desk using laptop and mouse"""
        cx = 280 + sx
        cy = 680 + sy

        # Office chair behind
        cv2.line(canvas, (cx - 80, cy - 140), (cx - 60, cy + 120), (60, 75, 95), 10)
        cv2.line(canvas, (cx - 90, cy + 120), (cx + 10, cy + 120), (60, 75, 95), 10)
        cv2.line(canvas, (cx - 40, cy + 120), (cx - 40, cy + 280), (45, 55, 75), 8)

        # Desk on right
        desk_x1 = cx + 20
        desk_x2 = self.width - 40 + sx
        desk_y = cy + 100
        cv2.rectangle(canvas, (desk_x1, desk_y), (desk_x2, desk_y + 24), (45, 55, 75), -1)
        cv2.line(canvas, (desk_x1, desk_y), (desk_x2, desk_y), (0, 229, 255), 3)
        cv2.line(canvas, (desk_x2 - 40, desk_y + 24), (desk_x2 - 40, self.height - 40), (35, 45, 60), 10)

        # Laptop on desk
        lt_x = desk_x1 + 170
        lt_y = desk_y - 4
        # Base
        cv2.rectangle(canvas, (lt_x - 70, lt_y), (lt_x + 70, lt_y + 8), (148, 163, 184), -1)
        # Open Glowing Screen
        scr_pts = np.array([[lt_x - 55, lt_y], [lt_x + 55, lt_y], [lt_x + 75, lt_y - 95], [lt_x - 35, lt_y - 95]], np.int32)
        cv2.fillPoly(canvas, [scr_pts], (15, 23, 42))
        cv2.polylines(canvas, [scr_pts], True, (0, 229, 255), 3)
        cv2.putText(canvas, "+ GEMINI", (lt_x - 10, lt_y - 45), cv2.FONT_HERSHEY_DUPLEX, 0.48, (0, 229, 255), 1)

        # Mouse
        mouse_x = desk_x1 + 65
        cv2.ellipse(canvas, (mouse_x, desk_y - 6), (14, 18), 0, 0, 360, (0, 229, 255), -1)

        # Skeleton Body in Profile
        head_c = (cx + 20, cy - 160)
        head_r = 44
        mid_sh = (cx + 10, cy - 80)
        mid_hip = (cx - 20, cy + 110)

        # Left arm on laptop keyboard (typing motion)
        type_motion = math.sin(t * 14.0) * 4.0
        l_sh = (cx + 25, cy - 80)
        l_el = (cx + 90, cy - 10)
        l_wr = (lt_x - 30, int(lt_y - 6 + type_motion))

        # Right arm on mouse (clicking motion)
        click_motion = math.sin(t * 8.0) * 2.0
        r_sh = (cx + 15, cy - 80)
        r_el = (cx + 60, cy + 20)
        r_wr = (mouse_x, int(desk_y - 12 + click_motion))

        # Legs seated under desk
        kn = (cx + 80, cy + 140)
        ank = (cx + 80, cy + 280)

        # Draw bones
        thick = 7
        bone_color = (255, 255, 255)
        joint_glow = (0, 229, 255)

        cv2.line(canvas, mid_sh, mid_hip, bone_color, thick + 2)
        cv2.line(canvas, l_sh, l_el, bone_color, thick)
        cv2.line(canvas, l_el, l_wr, bone_color, thick)
        cv2.line(canvas, r_sh, r_el, bone_color, thick)
        cv2.line(canvas, r_el, r_wr, bone_color, thick)
        cv2.line(canvas, mid_hip, kn, bone_color, thick)
        cv2.line(canvas, kn, ank, bone_color, thick)

        for p in [l_sh, r_sh, l_el, r_el, l_wr, r_wr, kn, ank]:
            cv2.circle(canvas, p, 8, joint_glow, -1)
            cv2.circle(canvas, p, 4, (255, 255, 255), -1)

        # Head & Smile (facing right)
        cv2.circle(canvas, head_c, head_r + 4, joint_glow, 3)
        cv2.circle(canvas, head_c, head_r, (15, 23, 42), -1)
        cv2.circle(canvas, head_c, head_r, bone_color, 4)
        cv2.circle(canvas, (head_c[0] + 16, head_c[1] - 8), 5, (255, 255, 255), -1)
        cv2.ellipse(canvas, (head_c[0] + 14, head_c[1] + 14), (16, 8), 0, 0, 180, (255, 255, 255), 3)

        # Floating Heart: "Si Tulang <3 Gemini"
        hx = cx + 180
        hy = cy - 170
        heart_scale = 1.0 + 0.15 * math.sin(t * 8.0)
        cv2.circle(canvas, (hx - 12, hy), int(14 * heart_scale), (239, 68, 68), -1)
        cv2.circle(canvas, (hx + 12, hy), int(14 * heart_scale), (239, 68, 68), -1)
        t_pts = np.array([[hx - 24, hy + 4], [hx + 24, hy + 4], [hx, hy + 30]], np.int32)
        cv2.fillPoly(canvas, [t_pts], (239, 68, 68))
        cv2.putText(canvas, "SI TULANG <3 GEMINI", (hx - 100, hy - 25), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 2)

    def _render_numbered_intro_scene(self, canvas, number_str, title_str, t, energy, sx, sy):
        cx = 480 + sx
        cy = 500 + sy

        cv2.putText(canvas, number_str, (cx - 90, cy + 100), cv2.FONT_HERSHEY_DUPLEX, 8.0, (30, 41, 59), 25)
        cv2.putText(canvas, number_str, (cx - 90, cy + 100), cv2.FONT_HERSHEY_DUPLEX, 8.0, (0, 229, 255), 14)
        cv2.putText(canvas, number_str, (cx - 90, cy + 100), cv2.FONT_HERSHEY_DUPLEX, 8.0, (255, 255, 255), 4)

        cv2.rectangle(canvas, (cx - 180, cy + 160), (cx + 180, cy + 220), (15, 23, 42), -1)
        cv2.rectangle(canvas, (cx - 180, cy + 160), (cx + 180, cy + 220), (0, 229, 255), 2)
        cv2.putText(canvas, title_str, (cx - 150, cy + 200), cv2.FONT_HERSHEY_DUPLEX, 0.6, (255, 255, 255), 2)

        stick_x = 180 + sx
        stick_y = 660 + sy
        self._draw_organic_stickman(canvas, x=stick_x, y=stick_y, action="point_number", t=t, energy=energy)

    def _render_dna_replication_scene(self, canvas, beat_data, t, energy, sx, sy):
        center_x = 460 + sx
        top_y = 220 + sy
        bot_y = 960 + sy
        points_count = 14
        strand_w = 120

        cv2.rectangle(canvas, (center_x - 180, top_y - 70), (center_x + 180, top_y - 15), (15, 23, 42), -1)
        cv2.rectangle(canvas, (center_x - 180, top_y - 70), (center_x + 180, top_y - 15), (0, 229, 255), 2)
        cv2.putText(canvas, "MODEL DNA 3D INTERAKTIF", (center_x - 165, top_y - 32), cv2.FONT_HERSHEY_DUPLEX, 0.58, (0, 229, 255), 2)

        colors = [(0, 240, 255), (236, 72, 153), (250, 204, 21), (74, 222, 128)]
        phase = t * 3.0
        for i in range(points_count):
            frac = i / float(points_count - 1)
            y = int(top_y + frac * (bot_y - top_y))
            x_offset = int(math.sin(frac * 4.0 * math.pi + phase) * strand_w)

            p1 = (center_x - x_offset, y)
            p2 = (center_x + x_offset, y)

            col = colors[i % len(colors)]
            cv2.line(canvas, p1, p2, col, 4)
            cv2.circle(canvas, p1, 10, col, -1)
            cv2.circle(canvas, p1, 12, (255, 255, 255), 2)
            cv2.circle(canvas, p2, 10, col, -1)
            cv2.circle(canvas, p2, 12, (255, 255, 255), 2)

        stick_x = 180 + sx
        stick_y = 660 + sy + int(math.sin(t * 3.0) * 8.0)
        self._draw_organic_stickman(
            canvas, x=stick_x, y=stick_y,
            action="examine", t=t, energy=energy
        )

    def _render_flashcard_bone_scene(self, canvas, beat_data, t, energy, sx, sy):
        fc_x1 = 280 + sx
        fc_y1 = 220 + sy
        fc_x2 = 680 + sx
        fc_y2 = 880 + sy

        cv2.rectangle(canvas, (fc_x1 + 10, fc_y1 + 10), (fc_x2 + 10, fc_y2 + 10), (10, 15, 25), -1)
        cv2.rectangle(canvas, (fc_x1, fc_y1), (fc_x2, fc_y2), (30, 41, 59), -1)
        cv2.rectangle(canvas, (fc_x1, fc_y1), (fc_x2, fc_y2), (56, 189, 248), 3)

        cv2.putText(canvas, "FLASHCARD ANATOMI", (fc_x1 + 40, fc_y1 + 50), cv2.FONT_HERSHEY_DUPLEX, 0.65, (56, 189, 248), 2)
        cv2.line(canvas, (fc_x1 + 20, fc_y1 + 70), (fc_x2 - 20, fc_y1 + 70), (56, 189, 248), 1)

        mid_cx = (fc_x1 + fc_x2) // 2
        mid_cy = (fc_y1 + fc_y2) // 2 - 20
        cv2.ellipse(canvas, (mid_cx, mid_cy - 40), (70, 60), 0, 0, 360, (241, 245, 249), -1)
        cv2.ellipse(canvas, (mid_cx, mid_cy - 40), (70, 60), 0, 0, 360, (15, 23, 42), 3)
        cv2.circle(canvas, (mid_cx - 25, mid_cy - 35), 16, (15, 23, 42), -1)
        cv2.circle(canvas, (mid_cx + 25, mid_cy - 35), 16, (15, 23, 42), -1)
        jaw_pts = np.array([
            [mid_cx - 45, mid_cy + 10], [mid_cx + 45, mid_cy + 10],
            [mid_cx + 30, mid_cy + 65], [mid_cx - 30, mid_cy + 65]
        ], np.int32)
        cv2.fillPoly(canvas, [jaw_pts], (241, 245, 249))
        cv2.polylines(canvas, [jaw_pts], True, (15, 23, 42), 3)

        cv2.putText(canvas, "Tulang Terkuat Wajah?", (fc_x1 + 35, fc_y2 - 130), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 2)
        cv2.rectangle(canvas, (fc_x1 + 30, fc_y2 - 95), (fc_x2 - 30, fc_y2 - 35), (14, 165, 233), -1)
        cv2.putText(canvas, "MANDIBULA (206 TULANG)", (fc_x1 + 45, fc_y2 - 58), cv2.FONT_HERSHEY_DUPLEX, 0.6, (255, 255, 255), 2)

        stick_x = 140 + sx
        stick_y = 680 + sy
        self._draw_organic_stickman(canvas, x=stick_x, y=stick_y, action="study_flashcard", t=t, energy=energy)

    def _render_interactive_quiz_scene(self, canvas, beat_data, t, energy, sx, sy):
        board_x1 = 260 + sx
        board_y1 = 200 + sy
        board_x2 = 690 + sx
        board_y2 = 920 + sy

        cv2.rectangle(canvas, (board_x1, board_y1), (board_x2, board_y2), (15, 23, 42), -1)
        cv2.rectangle(canvas, (board_x1, board_y1), (board_x2, board_y2), (16, 185, 129), 3)

        cv2.putText(canvas, "KUIS LATIHAN BAB 3", (board_x1 + 30, board_y1 + 45), cv2.FONT_HERSHEY_DUPLEX, 0.62, (16, 185, 129), 2)
        cv2.putText(canvas, "Pertanyaan 1/5:", (board_x1 + 30, board_y1 + 85), cv2.FONT_HERSHEY_DUPLEX, 0.5, (148, 163, 184), 1)
        cv2.putText(canvas, "Asam amino protein globular?", (board_x1 + 30, board_y1 + 120), cv2.FONT_HERSHEY_DUPLEX, 0.52, (255, 255, 255), 1)

        options = [
            ("A. Fenilalanina", False),
            ("B. Arginina (Benar!)", True),
            ("C. Isoleusina", False),
            ("D. Valina", False)
        ]
        start_oy = board_y1 + 160
        for i, (opt_text, is_correct) in enumerate(options):
            oy = start_oy + i * 85
            box_bg = (6, 78, 59) if is_correct else (30, 41, 59)
            border_col = (16, 185, 129) if is_correct else (71, 85, 105)
            cv2.rectangle(canvas, (board_x1 + 25, oy), (board_x2 - 25, oy + 65), box_bg, -1)
            cv2.rectangle(canvas, (board_x1 + 25, oy), (board_x2 - 25, oy + 65), border_col, 2)
            cv2.putText(canvas, opt_text, (board_x1 + 45, oy + 42), cv2.FONT_HERSHEY_DUPLEX, 0.52, (255, 255, 255), 2)
            if is_correct:
                cv2.circle(canvas, (board_x2 - 55, oy + 32), 16, (16, 185, 129), -1)
                cv2.putText(canvas, "✓", (board_x2 - 63, oy + 40), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 2)

        stick_x = 130 + sx
        stick_y = 660 + sy
        self._draw_organic_stickman(canvas, x=stick_x, y=stick_y, action="celebrate_quiz", t=t, energy=energy)

    def _render_cta_gemini_scene(self, canvas, beat_data, t, energy, sx, sy):
        cx = self.width // 2 + sx
        cy = 440 + sy

        ray_count = 16
        for r in range(ray_count):
            angle = (r / float(ray_count)) * 2 * math.pi + t * 0.8
            rx = int(cx + math.cos(angle) * 380)
            ry = int(cy + math.sin(angle) * 380)
            cv2.line(canvas, (cx, cy), (rx, ry), (28, 38, 56), 2)

        star_scale = 1.0 + 0.1 * math.sin(t * 6.0)
        pts = np.array([
            [cx, cy - int(90 * star_scale)],
            [cx + int(24 * star_scale), cy - int(24 * star_scale)],
            [cx + int(90 * star_scale), cy],
            [cx + int(24 * star_scale), cy + int(24 * star_scale)],
            [cx, cy + int(90 * star_scale)],
            [cx - int(24 * star_scale), cy + int(24 * star_scale)],
            [cx - int(90 * star_scale), cy],
            [cx - int(24 * star_scale), cy - int(24 * star_scale)],
        ], np.int32)
        cv2.fillPoly(canvas, [pts], (0, 229, 255))
        cv2.polylines(canvas, [pts], True, (255, 255, 255), 3)

        cv2.putText(canvas, "Google Gemini", (cx - 120, cy + 140), cv2.FONT_HERSHEY_DUPLEX, 0.85, (255, 255, 255), 2)
        cv2.putText(canvas, "PAKET MAHASISWA 1 TAHUN", (cx - 240, cy + 190), cv2.FONT_HERSHEY_DUPLEX, 0.72, (0, 229, 255), 2)
        cv2.putText(canvas, "TANPA BIAYA (GRATIS!)", (cx - 190, cy + 240), cv2.FONT_HERSHEY_DUPLEX, 0.68, (250, 204, 21), 2)

        btn_y = cy + 230
        cv2.rectangle(canvas, (cx - 180, btn_y), (cx + 180, btn_y + 65), (14, 165, 233), -1)
        cv2.rectangle(canvas, (cx - 180, btn_y), (cx + 180, btn_y + 65), (255, 255, 255), 3)
        cv2.putText(canvas, "DAFTAR SEKARANG", (cx - 145, btn_y + 44), cv2.FONT_HERSHEY_DUPLEX, 0.75, (255, 255, 255), 2)

        jump_y = 1060 + sy - int(abs(math.sin(t * 6.0)) * 35.0)
        self._draw_organic_stickman(canvas, x=cx, y=jump_y, action="jumping_cheer", t=t, energy=energy)

    def _render_general_comic_scene(self, canvas, beat_data, t, energy, sx, sy):
        cx = self.width // 2 + sx
        cy = 680 + sy
        self._draw_organic_stickman(canvas, x=cx, y=cy, action="talk", t=t, energy=energy)

    def _draw_organic_stickman(self, canvas, x, y, action="talk", t=0.0, energy=0.7):
        bone_color = (255, 255, 255)
        joint_glow = (0, 229, 255)
        thick = 7

        sway = math.sin(t * 4.0) * 5.0 * energy
        breath = math.sin(t * 5.0) * 4.0

        head_c = (int(x + sway * 0.4), int(y - 200 + breath))
        head_r = 40
        mid_sh = (int(x + sway * 0.6), int(y - 145 + breath))
        mid_hip = (int(x), int(y - 30))

        if action == "examine":
            l_sh = (mid_sh[0] - 35, mid_sh[1])
            r_sh = (mid_sh[0] + 35, mid_sh[1])
            l_el = (l_sh[0] - 25, l_sh[1] + 45)
            l_wr = (l_sh[0] - 15, l_sh[1] + 90)
            r_el = (r_sh[0] + 40, r_sh[1] - 20)
            r_wr = (r_sh[0] + 90, r_sh[1] - 40)
            l_kn = (mid_hip[0] - 30, mid_hip[1] + 80)
            l_ank = (mid_hip[0] - 35, mid_hip[1] + 160)
            r_kn = (mid_hip[0] + 30, mid_hip[1] + 80)
            r_ank = (mid_hip[0] + 40, mid_hip[1] + 160)

            mag_c = (r_wr[0] + 25, r_wr[1] - 25)
            cv2.circle(canvas, mag_c, 24, (0, 229, 255), 4)
            cv2.line(canvas, r_wr, (mag_c[0] - 12, mag_c[1] + 12), (148, 163, 184), 6)

        elif action == "study_flashcard":
            l_sh = (mid_sh[0] - 35, mid_sh[1])
            r_sh = (mid_sh[0] + 35, mid_sh[1])
            l_el = (l_sh[0] - 45, l_sh[1] - 30)
            l_wr = (head_c[0] - 35, head_c[1] - 20)
            r_el = (r_sh[0] + 45, r_sh[1] + 10)
            r_wr = (r_sh[0] + 110, r_sh[1] - 20)
            l_kn = (mid_hip[0] - 25, mid_hip[1] + 80)
            l_ank = (mid_hip[0] - 30, mid_hip[1] + 160)
            r_kn = (mid_hip[0] + 25, mid_hip[1] + 80)
            r_ank = (mid_hip[0] + 35, mid_hip[1] + 160)
            cv2.line(canvas, r_wr, (r_wr[0] + 70, r_wr[1] - 40), (250, 204, 21), 4)

        elif action == "celebrate_quiz":
            l_sh = (mid_sh[0] - 35, mid_sh[1])
            r_sh = (mid_sh[0] + 35, mid_sh[1])
            l_el = (l_sh[0] - 40, l_sh[1] - 50)
            l_wr = (l_sh[0] - 65, l_sh[1] - 110)
            r_el = (r_sh[0] + 40, r_sh[1] - 50)
            r_wr = (r_sh[0] + 65, r_sh[1] - 110)
            l_kn = (mid_hip[0] - 35, mid_hip[1] + 75)
            l_ank = (mid_hip[0] - 45, mid_hip[1] + 155)
            r_kn = (mid_hip[0] + 35, mid_hip[1] + 75)
            r_ank = (mid_hip[0] + 45, mid_hip[1] + 155)

        elif action == "jumping_cheer":
            l_sh = (mid_sh[0] - 35, mid_sh[1])
            r_sh = (mid_sh[0] + 35, mid_sh[1])
            l_el = (l_sh[0] - 45, l_sh[1] + 20)
            l_wr = (l_sh[0] - 40, l_sh[1] + 70)
            r_el = (r_sh[0] + 45, r_sh[1] - 30)
            r_wr = (r_sh[0] + 55, r_sh[1] - 70)
            l_kn = (mid_hip[0] - 60, mid_hip[1] + 60)
            l_ank = (mid_hip[0] - 90, mid_hip[1] + 130)
            r_kn = (mid_hip[0] + 60, mid_hip[1] + 60)
            r_ank = (mid_hip[0] + 90, mid_hip[1] + 130)

            mg_x, mg_y = r_wr
            mg_pts = np.array([[mg_x, mg_y], [mg_x + 55, mg_y - 28], [mg_x + 55, mg_y + 28]], np.int32)
            cv2.fillPoly(canvas, [mg_pts], (239, 68, 68))
            cv2.polylines(canvas, [mg_pts], True, (255, 255, 255), 2)

        elif action == "point_number":
            l_sh = (mid_sh[0] - 35, mid_sh[1])
            r_sh = (mid_sh[0] + 35, mid_sh[1])
            l_el = (l_sh[0] - 30, l_sh[1] + 50)
            l_wr = (l_sh[0] - 15, l_sh[1] + 95)
            r_el = (r_sh[0] + 45, r_sh[1] - 10)
            r_wr = (r_sh[0] + 110, r_sh[1] - 30)
            l_kn = (mid_hip[0] - 25, mid_hip[1] + 80)
            l_ank = (mid_hip[0] - 30, mid_hip[1] + 160)
            r_kn = (mid_hip[0] + 25, mid_hip[1] + 80)
            r_ank = (mid_hip[0] + 35, mid_hip[1] + 160)
            cv2.line(canvas, r_wr, (r_wr[0] + 90, r_wr[1] - 50), (0, 229, 255), 4)

        else:
            l_sh = (mid_sh[0] - 35, mid_sh[1])
            r_sh = (mid_sh[0] + 35, mid_sh[1])
            l_el = (l_sh[0] - 30, l_sh[1] + 45)
            l_wr = (l_sh[0] - 20, l_sh[1] + 90)
            r_el = (r_sh[0] + 35, r_sh[1] + 20)
            r_wr = (r_sh[0] + 50, r_sh[1] - 25)
            l_kn = (mid_hip[0] - 25, mid_hip[1] + 80)
            l_ank = (mid_hip[0] - 30, mid_hip[1] + 160)
            r_kn = (mid_hip[0] + 25, mid_hip[1] + 80)
            r_ank = (mid_hip[0] + 35, mid_hip[1] + 160)

        cv2.line(canvas, mid_sh, mid_hip, bone_color, thick + 2)
        cv2.line(canvas, l_sh, r_sh, bone_color, thick)
        cv2.line(canvas, l_sh, l_el, bone_color, thick)
        cv2.line(canvas, l_el, l_wr, bone_color, thick)
        cv2.line(canvas, r_sh, r_el, bone_color, thick)
        cv2.line(canvas, r_el, r_wr, bone_color, thick)
        cv2.line(canvas, (mid_hip[0] - 25, mid_hip[1]), (mid_hip[0] + 25, mid_hip[1]), bone_color, thick)
        cv2.line(canvas, (mid_hip[0] - 25, mid_hip[1]), l_kn, bone_color, thick)
        cv2.line(canvas, l_kn, l_ank, bone_color, thick)
        cv2.line(canvas, (mid_hip[0] + 25, mid_hip[1]), r_kn, bone_color, thick)
        cv2.line(canvas, r_kn, r_ank, bone_color, thick)

        for p in [l_sh, r_sh, l_el, r_el, l_wr, r_wr, l_kn, r_kn, l_ank, r_ank]:
            cv2.circle(canvas, p, 8, joint_glow, -1)
            cv2.circle(canvas, p, 4, (255, 255, 255), -1)

        cv2.circle(canvas, head_c, head_r + 4, joint_glow, 3)
        cv2.circle(canvas, head_c, head_r, (15, 23, 42), -1)
        cv2.circle(canvas, head_c, head_r, bone_color, 4)

        eye_y = head_c[1] - 6
        cv2.circle(canvas, (head_c[0] - 12, eye_y), 5, (255, 255, 255), -1)
        cv2.circle(canvas, (head_c[0] + 12, eye_y), 5, (255, 255, 255), -1)
        mouth_open = int(abs(math.sin(t * 12.0)) * 7 * energy)
        if mouth_open > 2:
            cv2.ellipse(canvas, (head_c[0], head_c[1] + 12), (14, mouth_open + 2), 0, 0, 360, (255, 255, 255), -1)
        else:
            cv2.ellipse(canvas, (head_c[0], head_c[1] + 12), (14, 6), 0, 0, 180, (255, 255, 255), 3)

    def _draw_speech_bubble(self, canvas, text, beat_data, t, sx, sy):
        words = text.split()
        if not words:
            return

        bubble_w = min(660, max(440, len(text) * 11))
        bubble_h = 100 if len(words) <= 7 else 130
        bx = (self.width - bubble_w) // 2 + sx
        by = 50 + sy

        cv2.rectangle(canvas, (bx, by), (bx + bubble_w, by + bubble_h), (15, 23, 42), -1)
        cv2.rectangle(canvas, (bx, by), (bx + bubble_w, by + bubble_h), (0, 229, 255), 3)

        tri = np.array([[bx + 120, by + bubble_h], [bx + 160, by + bubble_h], [bx + 110, by + bubble_h + 25]], np.int32)
        cv2.fillPoly(canvas, [tri], (15, 23, 42))
        cv2.polylines(canvas, [tri], True, (0, 229, 255), 2)

        mid = len(words) // 2
        line1 = " ".join(words[:mid + 1])
        line2 = " ".join(words[mid + 1:])

        cv2.putText(canvas, line1, (bx + 25, by + 45), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 2)
        if line2:
            cv2.putText(canvas, line2, (bx + 25, by + 88), cv2.FONT_HERSHEY_DUPLEX, 0.65, (0, 229, 255), 2)

    def _draw_music_ambience_badge(self, canvas, t):
        mb_w, mb_h = 280, 48
        mb_x = (self.width - mb_w) // 2
        mb_y = 60
        cv2.rectangle(canvas, (mb_x, mb_y), (mb_x + mb_w, mb_y + mb_h), (15, 23, 42), -1)
        cv2.rectangle(canvas, (mb_x, mb_y), (mb_x + mb_w, mb_y + mb_h), (168, 85, 247), 2)
        for i in range(8):
            bh = int(12 + 10 * math.sin(t * 12.0 + i * 0.7))
            bx = mb_x + 20 + i * 11
            cv2.line(canvas, (bx, mb_y + 24 - bh // 2), (bx, mb_y + 24 + bh // 2), (168, 85, 247), 3)
        cv2.putText(canvas, "MUSIC / AMBIENCE", (mb_x + 115, mb_y + 31), cv2.FONT_HERSHEY_DUPLEX, 0.48, (255, 255, 255), 1)

    def _render_dupin_kocak_scene(self, canvas, beat_data, t, energy, sx, sy):
        """
        Special Beat #1 Parody: 'Dupin jalan tuh kocak... paling aneh'
        Goofy comic waddle walk with rubber-hose limbs, question marks, sweat drops, and speed lines.
        """
        cx = self.width // 2 + sx
        cy = 760 + sy

        waddle = math.sin(t * 14.0) * 28.0
        bob_y = int(abs(math.cos(t * 14.0)) * 22.0)
        tilt = math.sin(t * 14.0) * 0.35

        # Speed / Action dash lines
        for i in range(5):
            lx = int(cx - 220 + i * 35)
            ly = cy + 240 + int(math.sin(t * 20.0 + i) * 12)
            cv2.line(canvas, (lx - 40, ly), (lx + 20, ly), (0, 229, 255), 2, cv2.LINE_AA)

        # Comic 'KOCAK!' badge
        badge_x, badge_y = cx + 110, cy - 280
        cv2.rectangle(canvas, (badge_x - 10, badge_y - 25), (badge_x + 160, badge_y + 25), (239, 68, 68), -1)
        cv2.rectangle(canvas, (badge_x - 10, badge_y - 25), (badge_x + 160, badge_y + 25), (255, 255, 255), 2)
        cv2.putText(canvas, "KOCAK BGT!", (badge_x, badge_y + 10), cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)

        # Floating sweat drop
        cv2.circle(canvas, (cx + 65, cy - 220 - bob_y), 8, (56, 189, 248), -1)
        cv2.circle(canvas, (cx + 65, cy - 220 - bob_y), 8, (255, 255, 255), 1)

        # Floating big question mark '?'
        cv2.putText(canvas, "?!", (cx - 130, cy - 240), cv2.FONT_HERSHEY_DUPLEX, 1.4, (250, 204, 21), 3, cv2.LINE_AA)

        # Character Anatomy
        thick = 8
        bone_color = (255, 255, 255)
        joint_glow = (0, 229, 255)

        head_c = (int(cx + waddle * 0.5), int(cy - 180 - bob_y))
        head_r = 46
        mid_sh = (int(cx + waddle * 0.3), int(cy - 110 - bob_y))
        mid_hip = (int(cx), int(cy + 40 - bob_y // 2))

        # Wacky swinging arms (Rubber hose style)
        arm_swing = math.sin(t * 14.0) * 55.0
        l_sh = (mid_sh[0] - 40, mid_sh[1])
        r_sh = (mid_sh[0] + 40, mid_sh[1])
        l_el = (int(l_sh[0] - 30), int(l_sh[1] + 40 - arm_swing * 0.5))
        l_wr = (int(l_sh[0] - 40 - arm_swing), int(l_sh[1] + 90 - arm_swing * 0.8))
        r_el = (int(r_sh[0] + 30), int(r_sh[1] + 40 + arm_swing * 0.5))
        r_wr = (int(r_sh[0] + 40 + arm_swing), int(r_sh[1] + 90 + arm_swing * 0.8))

        # Exaggerated high-knee cartoon waddle legs
        leg_phase = math.sin(t * 14.0)
        l_kn = (int(mid_hip[0] - 35), int(mid_hip[1] + 70 - max(0.0, leg_phase) * 50))
        l_ank = (int(mid_hip[0] - 45), int(mid_hip[1] + 160 - max(0.0, leg_phase) * 60))
        r_kn = (int(mid_hip[0] + 35), int(mid_hip[1] + 70 - max(0.0, -leg_phase) * 50))
        r_ank = (int(mid_hip[0] + 45), int(mid_hip[1] + 160 - max(0.0, -leg_phase) * 60))

        # Draw spine and limbs
        cv2.line(canvas, mid_sh, mid_hip, bone_color, thick + 2, cv2.LINE_AA)
        cv2.line(canvas, l_sh, r_sh, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, l_sh, l_el, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, l_el, l_wr, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, r_sh, r_el, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, r_el, r_wr, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, (mid_hip[0] - 25, mid_hip[1]), (mid_hip[0] + 25, mid_hip[1]), bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, (mid_hip[0] - 25, mid_hip[1]), l_kn, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, l_kn, l_ank, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, (mid_hip[0] + 25, mid_hip[1]), r_kn, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, r_kn, r_ank, bone_color, thick, cv2.LINE_AA)

        # Big clownish shoes
        cv2.ellipse(canvas, (l_ank[0] - 12, l_ank[1] + 4), (24, 12), 0, 0, 360, (239, 68, 68), -1)
        cv2.ellipse(canvas, (l_ank[0] - 12, l_ank[1] + 4), (24, 12), 0, 0, 360, (255, 255, 255), 2)
        cv2.ellipse(canvas, (r_ank[0] + 12, r_ank[1] + 4), (24, 12), 0, 0, 360, (239, 68, 68), -1)
        cv2.ellipse(canvas, (r_ank[0] + 12, r_ank[1] + 4), (24, 12), 0, 0, 360, (255, 255, 255), 2)

        # Luminous joints
        for p in [l_sh, r_sh, l_el, r_el, l_wr, r_wr, l_kn, r_kn, l_ank, r_ank]:
            cv2.circle(canvas, p, 9, joint_glow, -1)
            cv2.circle(canvas, p, 4, (255, 255, 255), -1)

        # Goofy Cartoon Head
        cv2.circle(canvas, head_c, head_r + 4, joint_glow, 3, cv2.LINE_AA)
        cv2.circle(canvas, head_c, head_r, (15, 23, 42), -1)
        cv2.circle(canvas, head_c, head_r, bone_color, 4, cv2.LINE_AA)

        # Goofy derp eyes (one big, one smaller)
        eye_y = head_c[1] - 8
        cv2.circle(canvas, (head_c[0] - 16, eye_y), 10, (255, 255, 255), -1)
        cv2.circle(canvas, (head_c[0] - 14, eye_y - 2), 4, (15, 23, 42), -1)
        cv2.circle(canvas, (head_c[0] + 16, eye_y), 7, (255, 255, 255), -1)
        cv2.circle(canvas, (head_c[0] + 16, eye_y), 3, (15, 23, 42), -1)

        # Wide silly grinning mouth
        cv2.ellipse(canvas, (head_c[0], head_c[1] + 14), (22, 12), 0, 0, 180, (255, 255, 255), -1)
        cv2.ellipse(canvas, (head_c[0], head_c[1] + 14), (22, 12), 0, 0, 180, (15, 23, 42), 2)
        # Tooth gap
        cv2.line(canvas, (head_c[0], head_c[1] + 14), (head_c[0], head_c[1] + 24), (15, 23, 42), 2)

    def _draw_tracked_pose_scene(self, canvas, pose_info, beat_data, t, energy, sx, sy):
        """
        Direct 33-point biomechanical tracked stickman rendered from MediaPipe coordinates.
        Draws dynamic 3D depth lines, joint illumination, and anatomical posture.
        """
        joints = pose_info.get("joints", {})
        if not joints:
            self._render_general_comic_scene(canvas, beat_data, t, energy, sx, sy)
            return

        w, h = self.width, self.height

        def get_pt(name, fallback=(w // 2, h // 2)):
            if name in joints:
                jx = int(joints[name]["x"] * w + sx)
                jy = int(joints[name]["y"] * h + sy)
                return (jx, jy)
            return fallback

        # Extract primary landmarks
        nose = get_pt("nose")
        l_sh = get_pt("l_shoulder")
        r_sh = get_pt("r_shoulder")
        l_el = get_pt("l_elbow")
        r_el = get_pt("r_elbow")
        l_wr = get_pt("l_wrist")
        r_wr = get_pt("r_wrist")
        l_hip = get_pt("l_hip")
        r_hip = get_pt("r_hip")
        l_kn = get_pt("l_knee")
        r_kn = get_pt("r_knee")
        l_ank = get_pt("l_ankle")
        r_ank = get_pt("r_ankle")

        mid_sh = ((l_sh[0] + r_sh[0]) // 2, (l_sh[1] + r_sh[1]) // 2)
        mid_hip = ((l_hip[0] + r_hip[0]) // 2, (l_hip[1] + r_hip[1]) // 2)

        thick = 8
        bone_color = (255, 255, 255)
        joint_glow = (0, 229, 255)

        # Spine & Shoulder bridge
        cv2.line(canvas, mid_sh, mid_hip, bone_color, thick + 3, cv2.LINE_AA)
        cv2.line(canvas, l_sh, r_sh, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, l_hip, r_hip, bone_color, thick, cv2.LINE_AA)

        # Arms
        cv2.line(canvas, l_sh, l_el, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, l_el, l_wr, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, r_sh, r_el, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, r_el, r_wr, bone_color, thick, cv2.LINE_AA)

        # Legs
        cv2.line(canvas, l_hip, l_kn, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, l_kn, l_ank, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, r_hip, r_kn, bone_color, thick, cv2.LINE_AA)
        cv2.line(canvas, r_kn, r_ank, bone_color, thick, cv2.LINE_AA)

        # Render luminous joints
        all_pts = [l_sh, r_sh, l_el, r_el, l_wr, r_wr, l_hip, r_hip, l_kn, r_kn, l_ank, r_ank]
        for p in all_pts:
            cv2.circle(canvas, p, 9, joint_glow, -1)
            cv2.circle(canvas, p, 4, (255, 255, 255), -1)

        # Head based on nose and shoulders
        head_c = nose if nose != (w // 2, h // 2) else (mid_sh[0], mid_sh[1] - 80)
        head_r = 44
        cv2.circle(canvas, head_c, head_r + 4, joint_glow, 3, cv2.LINE_AA)
        cv2.circle(canvas, head_c, head_r, (15, 23, 42), -1)
        cv2.circle(canvas, head_c, head_r, bone_color, 4, cv2.LINE_AA)

        # Eyes and expression
        cv2.circle(canvas, (head_c[0] - 14, head_c[1] - 6), 5, (255, 255, 255), -1)
        cv2.circle(canvas, (head_c[0] + 14, head_c[1] - 6), 5, (255, 255, 255), -1)
        cv2.ellipse(canvas, (head_c[0], head_c[1] + 14), (16, 8), 0, 0, 180, (255, 255, 255), 3, cv2.LINE_AA)

