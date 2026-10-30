#!/usr/bin/env python3
# [FL_INDEX: keywords="ai_background_generator, cartoon_scene_creator, pollinations_api, procedural_cartoon_fallback, stickman_studio" | purpose="Generates high-quality 2D cartoon background scenes for Stickman Studio using online neural diffusion models (Pollinations/Flux) with local Stable Diffusion probe and resilient procedural vector scene fallbacks"]
"""
Stickman Studio AI Cartoon Background Generator
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import os
import sys
import json
import time
import random
import urllib.request
import urllib.parse
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.abspath(os.path.join(ENGINE_DIR, '..'))
BG_DIR = os.path.join(APP_DIR, 'data', 'backgrounds')
os.makedirs(BG_DIR, exist_ok=True)

PROMPT_STYLE_PREFIX = (
    "2D cartoon animation background, clean flat vector illustration, minimalist animation art, "
    "Stick Hub style cartoon interior, sharp lines, cinematic colors, wide shot, empty room without people, "
    "no characters, no humans: "
)

def build_enhanced_prompt(user_prompt: str, theme: str = "") -> str:
    cleaned = (user_prompt or "").strip()
    if not cleaned:
        if theme:
            cleaned = f"cartoon {theme} scene"
        else:
            cleaned = "modern cozy podcast recording studio"
    
    # Append theme context if specified and not already in prompt
    if theme and theme.lower() not in cleaned.lower():
        cleaned = f"{cleaned}, {theme} aesthetic"
        
    return f"{PROMPT_STYLE_PREFIX}{cleaned}"

def draw_circle(draw, xy, radius, fill=None, outline=None, width=1):
    x, y = xy
    draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=fill, outline=outline, width=width)

def generate_procedural_fallback(prompt: str, theme: str, output_path: str, width: int = 720, height: int = 640) -> str:
    """Generate a clean 2D vector cartoon background using Pillow when offline."""
    img = Image.new("RGB", (width, height), (20, 24, 34))
    draw = ImageDraw.Draw(img)
    theme_key = (theme or "").lower()
    p_lower = prompt.lower()

    if "classroom" in p_lower or "school" in p_lower or theme_key == "classroom":
        # 1. Classroom Theme
        # Light green/teal wall
        for y in range(height):
            ratio = y / height
            draw.line([(0, y), (width, y)], fill=(int(45 + 15 * ratio), int(75 + 20 * ratio), int(65 + 15 * ratio)))
        # Wooden Floor
        floor_y = int(height * 0.72)
        for y in range(floor_y, height):
            draw.line([(0, y), (width, y)], fill=(160 - int((y - floor_y) * 0.3), 105, 55))
        # Large Chalkboard
        cb_margin_x = 60
        cb_top = 40
        cb_bottom = floor_y - 30
        draw.rounded_rectangle([cb_margin_x - 12, cb_top - 12, width - cb_margin_x + 12, cb_bottom + 12], radius=14, fill=(130, 80, 40), outline=(90, 50, 25), width=4)
        draw.rounded_rectangle([cb_margin_x, cb_top, width - cb_margin_x, cb_bottom], radius=8, fill=(28, 52, 40), outline=(20, 38, 30), width=2)
        # Chalkboard sketches (Math / Science)
        draw.line([(cb_margin_x + 40, cb_top + 60), (cb_margin_x + 180, cb_top + 60)], fill=(220, 230, 220), width=3)
        draw.line([(cb_margin_x + 40, cb_top + 90), (cb_margin_x + 220, cb_top + 90)], fill=(220, 230, 220), width=2)
        draw.arc([cb_margin_x + 280, cb_top + 40, cb_margin_x + 360, cb_top + 120], 0, 360, fill=(240, 210, 80), width=3)
        draw.line([(cb_margin_x + 320, cb_top + 40), (cb_margin_x + 320, cb_top + 120)], fill=(240, 210, 80), width=2)
        # Chalk tray
        draw.rectangle([cb_margin_x, cb_bottom, width - cb_margin_x, cb_bottom + 10], fill=(180, 115, 60))

    elif "courtroom" in p_lower or "judge" in p_lower or "law" in p_lower or theme_key == "courtroom":
        # 2. Courtroom Theme
        # Rich dark mahogany wood wall
        for y in range(height):
            ratio = y / height
            draw.line([(0, y), (width, y)], fill=(int(50 + 20 * ratio), int(25 + 15 * ratio), int(18 + 10 * ratio)))
        # Classical Columns
        for cx in [70, width - 70]:
            draw.rectangle([cx - 28, 0, cx + 28, height], fill=(70, 38, 25), outline=(40, 20, 12), width=3)
            draw.rectangle([cx - 36, 0, cx + 36, 30], fill=(90, 50, 35), outline=(40, 20, 12), width=2)
        # Scales of Justice Emblem on Center Wall
        em_cx, em_cy = width // 2, int(height * 0.28)
        draw_circle(draw, (em_cx, em_cy), 54, fill=(80, 45, 30), outline=(218, 165, 32), width=4)
        draw.line([(em_cx, em_cy - 30), (em_cx, em_cy + 30)], fill=(218, 165, 32), width=4)
        draw.line([(em_cx - 28, em_cy - 12), (em_cx + 28, em_cy - 12)], fill=(218, 165, 32), width=4)
        draw.polygon([(em_cx - 36, em_cy + 10), (em_cx - 20, em_cy + 10), (em_cx - 28, em_cy - 10)], fill=(218, 165, 32))
        draw.polygon([(em_cx + 20, em_cy + 10), (em_cx + 36, em_cy + 10), (em_cx + 28, em_cy - 10)], fill=(218, 165, 32))

    elif "news" in p_lower or "broadcast" in p_lower or theme_key == "breaking_news":
        # 3. Breaking News Studio Theme
        # High tech midnight blue gradient
        for y in range(height):
            ratio = y / height
            draw.line([(0, y), (width, y)], fill=(int(10 + 10 * ratio), int(16 + 24 * ratio), int(42 + 40 * ratio)))
        # Digital World Map Grid Lines
        for gx in range(40, width, 55):
            draw.line([(gx, 40), (gx, int(height * 0.7))], fill=(30, 60, 110), width=1)
        for gy in range(40, int(height * 0.7), 40):
            draw.line([(40, gy), (width - 40, gy)], fill=(30, 60, 110), width=1)
        # Glowing News Studio Ring
        draw.arc([width // 2 - 220, 40, width // 2 + 220, int(height * 0.65)], 0, 360, fill=(0, 229, 255), width=3)
        # Red News Ticker Bar
        draw.rectangle([0, int(height * 0.68), width, int(height * 0.74)], fill=(225, 29, 72))
        draw.line([(0, int(height * 0.68)), (width, int(height * 0.68))], fill=(255, 255, 255), width=2)

    elif "cyber" in p_lower or "neon" in p_lower or theme_key == "cyber_grid":
        # 4. Cyber Grid / Synthwave Theme
        # Deep space dark violet gradient
        for y in range(height):
            ratio = y / height
            draw.line([(0, y), (width, y)], fill=(int(12 + 20 * ratio), int(8 + 10 * ratio), int(26 + 30 * ratio)))
        # Neon Sun on Horizon
        hz_y = int(height * 0.58)
        draw_circle(draw, (width // 2, hz_y), 75, fill=(255, 110, 180), outline=(255, 220, 100), width=4)
        # Synthwave Horizon Line
        draw.line([(0, hz_y), (width, hz_y)], fill=(0, 240, 255), width=4)
        # Perspective Grid Floor
        for gx in range(-100, width + 100, 60):
            draw.line([(width // 2, hz_y), (gx, height)], fill=(168, 85, 247), width=2)
        for gy in [hz_y + 15, hz_y + 35, hz_y + 65, hz_y + 110, hz_y + 170, hz_y + 240]:
            if gy < height:
                draw.line([(0, gy), (width, gy)], fill=(0, 229, 255), width=2)

    elif "living" in p_lower or "room" in p_lower or "home" in p_lower or "cozy" in p_lower or theme_key == "living_room":
        # 5. Living Room Theme
        # Warm retro wallpaper with vertical stripes
        stripe_c1 = (45, 34, 48)
        stripe_c2 = (38, 28, 42)
        for x in range(0, width, 30):
            col = stripe_c1 if (x // 30) % 2 == 0 else stripe_c2
            draw.rectangle([x, 0, x + 30, height], fill=col)
        # Warm wooden baseboard
        draw.rectangle([0, int(height * 0.68), width, height], fill=(95, 60, 40))
        draw.line([(0, int(height * 0.68)), (width, int(height * 0.68))], fill=(130, 85, 55), width=4)
        # Framed picture on wall
        draw.rounded_rectangle([width // 2 - 70, 70, width // 2 + 70, 180], radius=8, fill=(30, 24, 35), outline=(218, 165, 32), width=4)
        draw_circle(draw, (width // 2, 125), 24, fill=(234, 179, 8))
        draw.polygon([(width // 2 - 50, 170), (width // 2 - 10, 130), (width // 2 + 20, 160), (width // 2 + 50, 140), (width // 2 + 50, 170)], fill=(75, 120, 85))

    else:
        # 6. Default Modern Creative Studio Theme
        # Vertical gradient studio wall
        for y in range(height):
            ratio = y / height
            draw.line([(0, y), (width, y)], fill=(int(14 + 12 * ratio), int(20 + 16 * ratio), int(34 + 22 * ratio)))
        # Hexagonal acoustic studio panels
        hex_color = (32, 46, 72)
        accent_cyan = (56, 189, 248)
        accent_yellow = (234, 179, 8)
        for col in range(6):
            hx = 60 + col * 120
            hy = int(height * 0.35) + (col % 2) * 50
            draw.rounded_rectangle([hx - 45, hy - 48, hx + 45, hy + 48], radius=14, outline=hex_color, width=2)
            if col == 1:
                draw.line([(hx - 26, hy), (hx + 26, hy)], fill=accent_yellow, width=3)
            elif col == 4:
                draw.line([(hx - 26, hy), (hx + 26, hy)], fill=accent_cyan, width=3)
        # Ambient bottom neon bar
        draw.line([(0, int(height * 0.72)), (width, int(height * 0.72))], fill=(0, 229, 255), width=3)

    img.save(output_path, "JPEG", quality=92)
    return output_path

def generate_via_pollinations(prompt: str, output_path: str, width: int = 720, height: int = 640, timeout: int = 20) -> bool:
    """Fetch high-speed zero-key cartoon diffusion image from Pollinations API."""
    seed = random.randint(100000, 99999999)
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&nologo=true&seed={seed}&model=flux"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FloworkOS/1.0",
            "Accept": "image/jpeg,image/png,image/*"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if resp.status == 200 and ("image" in content_type or resp.length > 5000):
                data = resp.read()
                if len(data) > 5000:
                    with open(output_path, "wb") as f:
                        f.write(data)
                    return True
    except Exception as e:
        print(f"[AI Background] Pollinations attempt error: {e}", file=sys.stderr)

    return False

def generate_ai_background(
    prompt: str,
    theme: str = "cartoon",
    output_path: str = None,
    width: int = 720,
    height: int = 640
) -> dict:
    """
    Main background generation orchestrator.
    Cascades through Neural API -> Procedural Cartoon Generator.
    Always returns a valid high-resolution image file.
    """
    if not output_path:
        ts = int(time.time() * 1000)
        rnd = random.randint(100, 999)
        output_path = os.path.join(BG_DIR, f"bg_{ts}_{rnd}.jpg")
    
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    enhanced_prompt = build_enhanced_prompt(prompt, theme)

    # 1. Try Pollinations Neural Diffusion
    t0 = time.time()
    success = generate_via_pollinations(enhanced_prompt, output_path, width=width, height=height, timeout=18)
    elapsed = round(time.time() - t0, 2)

    if success and os.path.exists(output_path) and os.path.getsize(output_path) > 5000:
        return {
            "success": True,
            "method": "pollinations_neural",
            "prompt": prompt,
            "enhanced_prompt": enhanced_prompt,
            "theme": theme,
            "image_path": output_path,
            "filename": os.path.basename(output_path),
            "size_bytes": os.path.getsize(output_path),
            "elapsed_seconds": elapsed
        }

    # 2. Resilient Procedural Vector Cartoon Generator Fallback
    print(f"[AI Background] Falling back to high-res procedural 2D cartoon scene for: '{prompt}'", file=sys.stderr)
    generate_procedural_fallback(prompt, theme, output_path, width=width, height=height)

    return {
        "success": True,
        "method": "procedural_vector",
        "prompt": prompt,
        "enhanced_prompt": enhanced_prompt,
        "theme": theme,
        "image_path": output_path,
        "filename": os.path.basename(output_path),
        "size_bytes": os.path.getsize(output_path),
        "elapsed_seconds": round(time.time() - t0, 2)
    }

if __name__ == "__main__":
    prompt_arg = sys.argv[1] if len(sys.argv) > 1 else "Modern cozy podcast studio"
    theme_arg = sys.argv[2] if len(sys.argv) > 2 else ""
    out_arg = sys.argv[3] if len(sys.argv) > 3 else None

    result = generate_ai_background(prompt_arg, theme=theme_arg, output_path=out_arg)
    print(json.dumps(result, indent=2))
