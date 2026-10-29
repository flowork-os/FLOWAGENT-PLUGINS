#!/usr/bin/env python3
"""
Test Vision Pose Extraction and Dynamic Stickman Skeleton Generation
"""
import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

model_path = '/home/mrflow/flowork/apps/stickman-studio/engine/models/pose_landmarker_lite.task'
base_options = python.BaseOptions(model_asset_path=model_path)
options = vision.PoseLandmarkerOptions(
    base_options=base_options,
    min_pose_detection_confidence=0.1,
    min_pose_presence_confidence=0.1
)
detector = vision.PoseLandmarker.create_from_options(options)

def extract_and_draw_stickman(image_path, output_path):
    orig = cv2.imread(image_path)
    if orig is None:
        print("Failed to read image:", image_path)
        return False

    h, w = orig.shape[:2]
    rgb = cv2.cvtColor(orig, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = detector.detect(mp_img)

    # Canvas for pure stickman rendering (720x1280)
    canvas = np.zeros((1280, 720, 3), dtype=np.uint8)
    canvas[:] = (20, 24, 32) # Dark studio slate

    if not result.pose_landmarks or len(result.pose_landmarks) == 0:
        print(f"No pose detected in {image_path}, using organic cartoon fallback")
        cv2.putText(canvas, "NO SKELETAL JOINTS DETECTED", (50, 640), cv2.FONT_HERSHEY_DUPLEX, 0.7, (0, 229, 255), 2)
        cv2.imwrite(output_path, canvas)
        return False

    lms = result.pose_landmarks[0]
    print(f"Pose detected with {len(lms)} landmarks!")

    # Helper to convert normalized (x, y) to canvas (X, Y)
    # We map bounding box to center of 720x1280
    xs = [lm.x for lm in lms if lm.visibility > 0.1]
    ys = [lm.y for lm in lms if lm.visibility > 0.1]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    box_w = max(0.01, max_x - min_x)
    box_h = max(0.01, max_y - min_y)

    target_h = 750 # height on 1280 canvas
    scale = target_h / (box_h * 1280)
    offset_x = 360 - int(((min_x + max_x) / 2.0) * 720 * scale)
    offset_y = 640 - int(((min_y + max_y) / 2.0) * 1280 * scale)

    def pt(idx):
        lm = lms[idx]
        px = int(lm.x * 720 * scale + offset_x)
        py = int(lm.y * 1280 * scale + offset_y)
        # clamp to canvas
        px = max(10, min(710, px))
        py = max(10, min(1270, py))
        return (px, py)

    # 33 MediaPipe Landmarks mapping:
    # 0: nose, 11: l_shoulder, 12: r_shoulder
    # 13: l_elbow, 14: r_elbow, 15: l_wrist, 16: r_wrist
    # 23: l_hip, 24: r_hip, 25: l_knee, 26: r_knee, 27: l_ankle, 28: r_ankle

    nose = pt(0)
    l_sh = pt(11)
    r_sh = pt(12)
    l_el = pt(13)
    r_el = pt(14)
    l_wr = pt(15)
    r_wr = pt(16)
    l_hip = pt(23)
    r_hip = pt(24)
    l_knee = pt(25)
    r_knee = pt(26)
    l_ank = pt(27)
    r_ank = pt(28)

    mid_sh = ((l_sh[0] + r_sh[0]) // 2, (l_sh[1] + r_sh[1]) // 2)
    mid_hip = ((l_hip[0] + r_hip[0]) // 2, (l_hip[1] + r_hip[1]) // 2)

    stick_color = (255, 255, 255)
    thick = 6

    # Draw spine
    cv2.line(canvas, mid_sh, mid_hip, stick_color, thick + 2)
    # Draw shoulders
    cv2.line(canvas, l_sh, r_sh, stick_color, thick)
    # Draw Left Arm (shoulder -> elbow -> wrist)
    cv2.line(canvas, l_sh, l_el, stick_color, thick)
    cv2.line(canvas, l_el, l_wr, stick_color, thick)
    # Draw Right Arm (shoulder -> elbow -> wrist)
    cv2.line(canvas, r_sh, r_el, stick_color, thick)
    cv2.line(canvas, r_el, r_wr, stick_color, thick)
    # Draw Hips
    cv2.line(canvas, l_hip, r_hip, stick_color, thick)
    # Draw Left Leg (hip -> knee -> ankle)
    cv2.line(canvas, l_hip, l_knee, stick_color, thick)
    cv2.line(canvas, l_knee, l_ank, stick_color, thick)
    # Draw Right Leg (hip -> knee -> ankle)
    cv2.line(canvas, r_hip, r_knee, stick_color, thick)
    cv2.line(canvas, r_knee, r_ank, stick_color, thick)

    # Draw Joint Circles
    for p in [l_sh, r_sh, l_el, r_el, l_wr, r_wr, l_hip, r_hip, l_knee, r_knee, l_ank, r_ank]:
        cv2.circle(canvas, p, 8, (0, 229, 255), -1)

    # Draw Head based on nose and shoulders
    head_r = max(28, int(np.linalg.norm(np.array(l_sh) - np.array(r_sh)) * 0.45))
    head_c = (nose[0], min(nose[1], mid_sh[1] - head_r - 10))
    cv2.circle(canvas, head_c, head_r + 4, (0, 229, 255), 3)
    cv2.circle(canvas, head_c, head_r, (15, 20, 28), -1)
    cv2.circle(canvas, head_c, head_r, stick_color, 4)

    # Cartoon Eyes & Smile
    cv2.circle(canvas, (head_c[0] - 10, head_c[1] - 4), 4, (255, 255, 255), -1)
    cv2.circle(canvas, (head_c[0] + 10, head_c[1] - 4), 4, (255, 255, 255), -1)
    cv2.ellipse(canvas, (head_c[0], head_c[1] + 10), (12, 8), 0, 0, 180, (255, 255, 255), 2)

    cv2.imwrite(output_path, canvas)
    print("Successfully wrote pose stickman to:", output_path)
    return True

if __name__ == '__main__':
    in_img = '/home/mrflow/flowork/apps/stickman-studio/data/beats_1793262917932/keyframes/beats_1793262917932_beat_006.jpg'
    out_img = '/home/mrflow/.gemini/antigravity/brain/9d84b1bc-9008-4ff0-8385-38876f178980/test_pose_stickman_beat6.jpg'
    extract_and_draw_stickman(in_img, out_img)
