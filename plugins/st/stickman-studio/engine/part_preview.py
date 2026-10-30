#!/usr/bin/env python3
# [FL_INDEX: keywords="part_preview_generator, pil_cairo, stickman_part_renderer, instantaneous_preview" | purpose="Generate single static PNG frame for a specific storyboard part with customized stickman model, pose, emotion, prop and accent color using stickman Local renderer"]
"""
Stickman Part Preview Generator
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import math
from PIL import Image, ImageDraw, ImageFont

import stickman_renderer as stickman

def hex_to_rgb(hex_str, default=(0, 229, 255)):
    hex_clean = hex_str.lstrip('#')
    if len(hex_clean) == 6:
        return (int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16))
    return default

def render_part_preview_frame(part_config, output_png_path, width=720, height=1280):
    model = part_config.get('model', 'classic')
    pose = part_config.get('pose', 'talk')
    emotion = part_config.get('emotion', 'neutral')
    prop = part_config.get('prop', 'bulb')
    accent_hex = part_config.get('accent', '#00e5ff')
    text = part_config.get('text', '')
    title = part_config.get('title', 'Part Preview')

    acc_rgb = hex_to_rgb(accent_hex, (0, 229, 255))
    bg_rgb = (16, 20, 28)

    # 1. Base Image
    img = Image.new("RGB", (width, height), bg_rgb)
    custom_bg = part_config.get('background_image') or part_config.get('background_path')
    if custom_bg and os.path.exists(custom_bg):
        try:
            bg_raw = Image.open(custom_bg).convert("RGB")
            bg_resized = bg_raw.resize((width, height), Image.Resampling.LANCZOS)
            tint = Image.new("RGB", (width, height), (10, 15, 25))
            blended = Image.blend(bg_resized, tint, 0.35)
            img.paste(blended, (0, 0))
        except Exception:
            pass
    g = stickman.G(img)

    # Floor glow
    g.circle((width // 2, int(height * 0.76)), 280, fill=(bg_rgb[0] + 15, bg_rgb[1] + 25, bg_rgb[2] + 45))

    # 2. Render Stickman Character with Pose & Emotion
    cx = width // 2
    cy = int(height * 0.62)

    # Stickman body color
    body_col = (255, 255, 255)
    if model == 'ninja':
        body_col = (180, 130, 250)
    elif model == 'cyber':
        body_col = (0, 229, 255)
    elif model == 'business':
        body_col = (245, 180, 60)
    elif model == 'rebel':
        body_col = (240, 70, 80)

    # Head
    head_r = 46
    g.circle((cx, cy - 190), head_r, fill=None, outline=body_col, w=9)

    # Face details (eyes & mouth)
    eye_col = body_col
    if emotion == 'happy':
        g.arc((cx - 24, cy - 206, cx - 10, cy - 192), 180, 360, col=eye_col, w=4)
        g.arc((cx + 10, cy - 206, cx + 24, cy - 192), 180, 360, col=eye_col, w=4)
        g.arc((cx - 16, cy - 188, cx + 16, cy - 168), 0, 180, col=eye_col, w=5)
    elif emotion == 'surprised':
        g.circle((cx - 16, cy - 195), 5, fill=eye_col, outline=eye_col, w=2)
        g.circle((cx + 16, cy - 195), 5, fill=eye_col, outline=eye_col, w=2)
        g.circle((cx, cy - 176), 9, fill=None, outline=eye_col, w=5)
    elif emotion == 'confused':
        g.circle((cx - 16, cy - 198), 4, fill=eye_col, outline=eye_col, w=2)
        g.circle((cx + 16, cy - 192), 5, fill=eye_col, outline=eye_col, w=2)
        g.line([(cx - 12, cy - 175), (cx + 14, cy - 182)], 5, eye_col)
    elif emotion == 'angry':
        g.line([(cx - 24, cy - 202), (cx - 10, cy - 196)], 5, eye_col)
        g.line([(cx + 24, cy - 202), (cx + 10, cy - 196)], 5, eye_col)
        g.arc((cx - 14, cy - 174, cx + 14, cy - 160), 180, 360, col=eye_col, w=5)
    else: # Neutral
        g.circle((cx - 16, cy - 195), 4, fill=eye_col, outline=eye_col, w=2)
        g.circle((cx + 16, cy - 195), 4, fill=eye_col, outline=eye_col, w=2)
        g.line([(cx - 12, cy - 176), (cx + 12, cy - 176)], 5, eye_col)

    # Torso
    g.line([(cx, cy - 190 + head_r), (cx, cy - 30)], 10, body_col)

    # Accessories
    if model == 'business':
        # Tie
        g.line([(cx, cy - 130), (cx, cy - 65)], 8, (230, 45, 55))
    elif model == 'ninja':
        # Headband tail
        g.line([(cx + head_r - 4, cy - 195), (cx + head_r + 35, cy - 160)], 7, (170, 50, 230))
    elif model == 'cyber':
        # Glowing visor
        g.line([(cx - head_r + 8, cy - 195), (cx + head_r - 8, cy - 195)], 7, (0, 240, 255))

    # Limbs based on Pose
    if pose == 'point':
        g.line([(cx, cy - 120), (cx - 50, cy - 90), (cx - 30, cy - 45)], 9, body_col)
        g.line([(cx, cy - 120), (cx + 70, cy - 145), (cx + 120, cy - 175)], 9, body_col)
    elif pose == 'think':
        g.line([(cx, cy - 120), (cx + 40, cy - 130), (cx + 25, cy - 180)], 9, body_col)
        g.line([(cx, cy - 120), (cx - 40, cy - 80), (cx + 25, cy - 85)], 9, body_col)
    elif pose == 'celebrate':
        g.line([(cx, cy - 120), (cx - 65, cy - 170), (cx - 95, cy - 225)], 9, body_col)
        g.line([(cx, cy - 120), (cx + 65, cy - 170), (cx + 95, cy - 225)], 9, body_col)
    elif pose == 'run':
        g.line([(cx, cy - 120), (cx - 60, cy - 145), (cx - 85, cy - 100)], 9, body_col)
        g.line([(cx, cy - 120), (cx + 65, cy - 100), (cx + 95, cy - 140)], 9, body_col)
    else: # Talk
        g.line([(cx, cy - 120), (cx - 50, cy - 95), (cx - 75, cy - 55)], 9, body_col)
        g.line([(cx, cy - 120), (cx + 55, cy - 105), (cx + 85, cy - 135)], 9, body_col)

    # Legs
    if pose == 'run':
        g.line([(cx, cy - 30), (cx - 60, cy + 35), (cx - 95, cy + 105)], 10, body_col)
        g.line([(cx, cy - 30), (cx + 60, cy + 20), (cx + 110, cy - 10)], 10, body_col)
    else:
        g.line([(cx, cy - 30), (cx - 40, cy + 45), (cx - 45, cy + 130)], 10, body_col)
        g.line([(cx, cy - 30), (cx + 40, cy + 45), (cx + 45, cy + 130)], 10, body_col)

    # 3. Prop Drawing using repo_reel Local coordinate system
    if prop and prop in stickman.PROP_DRAW:
        prop_x = int(width * 0.72)
        prop_y = int(height * 0.38)
        # Prop background halo
        g.circle((prop_x, prop_y), 105, fill=(bg_rgb[0] + 25, bg_rgb[1] + 35, bg_rgb[2] + 55), outline=acc_rgb, w=4)
        local_layer = stickman.Local(g, prop_x, prop_y, 0.58, bg_rgb, acc_rgb)
        stickman.PROP_DRAW[prop](local_layer, 1.0, 1.0)

    # 4. Top Header & Subtitle Overlay (PIL ImageDraw)
    d = ImageDraw.Draw(img)
    # Header box
    d.rounded_rectangle([(30, 40), (width - 30, 140)], radius=16, fill=(10, 14, 22), outline=acc_rgb, width=2)
    d.text((50, 55), f"🎬 {title.upper()}  //  MODEL: {model.upper()}", fill=(255, 255, 255))
    d.text((50, 95), f"Pose: {pose.capitalize()} | Emotion: {emotion.capitalize()} | Prop: {prop}", fill=(160, 185, 210))

    # Subtitle dialogue box
    if text:
        d.rounded_rectangle([(35, height - 240), (width - 35, height - 70)], radius=18, fill=(10, 14, 22), outline=acc_rgb, width=2)
        words = text.split()
        lines = []
        cur = []
        for w in words:
            cur.append(w)
            if len(" ".join(cur)) > 30:
                lines.append(" ".join(cur))
                cur = []
        if cur:
            lines.append(" ".join(cur))

        y_off = height - 215
        for l in lines[:3]:
            d.text((55, y_off), l, fill=(255, 235, 60))
            y_off += 42

    os.makedirs(os.path.dirname(os.path.abspath(output_png_path)), exist_ok=True)
    img.save(output_png_path, "PNG")
    return output_png_path

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Usage: python3 part_preview.py <part_json_or_file> <output_png>'}))
        sys.exit(1)

    json_arg = sys.argv[1]
    out_png = sys.argv[2]

    if os.path.exists(json_arg):
        with open(json_arg) as f:
            cfg = json.load(f)
    else:
        cfg = json.loads(json_arg)

    res = render_part_preview_frame(cfg, out_png)
    print(json.dumps({'success': True, 'output_png': res}))
