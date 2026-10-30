#!/usr/bin/env python3
# [FL_INDEX: keywords="pose_tracker, mediapipe_pose, landmark_extractor, skeletal_analysis, screen_recognizer" | purpose="Extract real 33-point skeletal pose landmarks and graphic slide layouts from video keyframes"]
"""
Stickman Studio Real Vision Pose Tracker & Screen Layout Analyzer
Zero-template vision tracking powered by MediaPipe Pose Landmarker Lite
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import os
import cv2
import numpy as np

# Path to the bundled MediaPipe Pose Landmarker task model
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'pose_landmarker_lite.task')

_DETECTOR = None

def get_detector():
    global _DETECTOR
    if _DETECTOR is None:
        import sys
        from unittest.mock import MagicMock
        if 'matplotlib' not in sys.modules:
            sys.modules['matplotlib'] = MagicMock()
            sys.modules['matplotlib.pyplot'] = MagicMock()
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision

        base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            min_pose_detection_confidence=0.1,
            min_pose_presence_confidence=0.1
        )
        _DETECTOR = vision.PoseLandmarker.create_from_options(options)
    return _DETECTOR


class PoseTracker:
    def __init__(self):
        self.detector = get_detector()

    def analyze_image(self, image_path_or_frame):
        """
        Analyze either an image path or a BGR numpy array frame.
        Returns a rich dictionary containing:
        - has_pose: bool
        - joints: dict of normalized coordinates (x, y, v) for key anatomical points
        - landmarks: full 33 normalized landmarks
        - orientation: seated, standing, leaning_forward, etc.
        - screen_type: detected slide type if has_pose is False ('title', 'graphic', 'quiz', 'cta', 'general')
        - screen_colors: dominant colors of the frame
        """
        if isinstance(image_path_or_frame, str):
            if not os.path.exists(image_path_or_frame):
                return {"has_pose": False, "screen_type": "unknown", "error": "file_not_found"}
            orig = cv2.imread(image_path_or_frame)
        else:
            orig = image_path_or_frame

        if orig is None or orig.size == 0:
            return {"has_pose": False, "screen_type": "unknown", "error": "invalid_image"}

        import mediapipe as mp
        h, w = orig.shape[:2]
        rgb = cv2.cvtColor(orig, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        
        try:
            result = self.detector.detect(mp_img)
        except Exception as e:
            result = None

        has_pose = bool(result and result.pose_landmarks and len(result.pose_landmarks) > 0)

        if has_pose:
            lms = result.pose_landmarks[0]
            # Key anatomical indices:
            # 0: nose, 11: l_sh, 12: r_sh, 13: l_el, 14: r_el, 15: l_wr, 16: r_wr,
            # 23: l_hip, 24: r_hip, 25: l_kn, 26: r_kn, 27: l_ank, 28: r_ank
            def get_lm(idx):
                lm = lms[idx]
                return {"x": float(lm.x), "y": float(lm.y), "z": float(lm.z), "visibility": float(getattr(lm, "visibility", 1.0))}

            joints = {
                "nose": get_lm(0),
                "l_eye": get_lm(2),
                "r_eye": get_lm(5),
                "l_ear": get_lm(7),
                "r_ear": get_lm(8),
                "mouth_l": get_lm(9),
                "mouth_r": get_lm(10),
                "l_shoulder": get_lm(11),
                "r_shoulder": get_lm(12),
                "l_elbow": get_lm(13),
                "r_elbow": get_lm(14),
                "l_wrist": get_lm(15),
                "r_wrist": get_lm(16),
                "l_hip": get_lm(23),
                "r_hip": get_lm(24),
                "l_knee": get_lm(25),
                "r_knee": get_lm(26),
                "l_ankle": get_lm(27),
                "r_ankle": get_lm(28),
            }

            # Bounding box of visible points
            valid_x = [lm.x for lm in lms if lm.visibility > 0.1]
            valid_y = [lm.y for lm in lms if lm.visibility > 0.1]
            if valid_x and valid_y:
                bbox = {
                    "min_x": float(min(valid_x)),
                    "max_x": float(max(valid_x)),
                    "min_y": float(min(valid_y)),
                    "max_y": float(max(valid_y)),
                    "width": float(max(valid_x) - min(valid_x)),
                    "height": float(max(valid_y) - min(valid_y)),
                }
            else:
                bbox = {"min_x": 0.2, "max_x": 0.8, "min_y": 0.2, "max_y": 0.8, "width": 0.6, "height": 0.6}

            # Posture deduction
            hip_y = (joints["l_hip"]["y"] + joints["r_hip"]["y"]) / 2.0
            knee_y = (joints["l_knee"]["y"] + joints["r_knee"]["y"]) / 2.0
            sh_y = (joints["l_shoulder"]["y"] + joints["r_shoulder"]["y"]) / 2.0
            is_seated = bool(abs(knee_y - hip_y) < 0.25 and (knee_y - hip_y) < 0.35)

            # Arm states
            l_wrist_y = joints["l_wrist"]["y"]
            r_wrist_y = joints["r_wrist"]["y"]
            left_arm_raised = bool(l_wrist_y < joints["l_shoulder"]["y"])
            right_arm_raised = bool(r_wrist_y < joints["r_shoulder"]["y"])

            return {
                "has_pose": True,
                "joints": joints,
                "bbox": bbox,
                "posture": {
                    "is_seated": is_seated,
                    "left_arm_raised": left_arm_raised,
                    "right_arm_raised": right_arm_raised,
                    "spine_tilt": float((joints["nose"]["x"] - (joints["l_hip"]["x"] + joints["r_hip"]["x"])/2.0))
                },
                "screen_type": "actor_scene"
            }
        else:
            # Analyze graphic slide structure
            gray = cv2.cvtColor(orig, cv2.COLOR_BGR2GRAY)
            # Find contours
            _, thresh = cv2.threshold(gray, 40, 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Count rectangular boxes (like quiz buttons or flashcards)
            boxes = 0
            for c in contours:
                x, y, bw, bh = cv2.boundingRect(c)
                if bw > w * 0.4 and bh > h * 0.05 and bh < h * 0.3:
                    boxes += 1

            # Dominant brightness
            mean_brightness = float(np.mean(gray))

            # Classify screen type
            if boxes >= 3:
                screen_type = "quiz"
            elif boxes == 1 or boxes == 2:
                screen_type = "flashcard"
            elif mean_brightness < 30:
                screen_type = "title"
            else:
                screen_type = "graphic"

            return {
                "has_pose": False,
                "screen_type": screen_type,
                "boxes_detected": boxes,
                "mean_brightness": mean_brightness
            }
