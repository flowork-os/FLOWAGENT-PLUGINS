#!/usr/bin/env python3
# [FL_INDEX: keywords="multi_entity_tracker, multi_person_mocap, demographic_classifier, animal_stickman, yolo_pose, motion_puppeteer, stickman_studio" | purpose="Sovereign Multi-Entity Vision AI tracker detecting multiple humans, classifying demographics (male, female, child), tracking animals (dog, cat, bird), and puppeteering stylized stick characters over custom backgrounds"]
"""
Stickman Studio Multi-Entity Vision AI Tracker & Demographic Classifier
Detects multiple humans and animals in video frames, classifies gender and age brackets,
and tracks movement smoothly across temporal frames.
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import os
import sys
import math
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Suppress YOLO verbose output
os.environ["YOLO_VERBOSE"] = "False"

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from stickman_motion_smoother import OneEuroFilter, MocapMotionProcessor


class MultiEntityTracker:
    def __init__(self, width=720, height=1280, smoothing_alpha=0.60):
        self.width = width
        self.height = height
        self.alpha = smoothing_alpha
        
        # Mocap Motion Processor (OneEuro adaptive filter + Cartoon Pose Snapper on Twos)
        self.motion_processor = MocapMotionProcessor(
            fps=30.0,
            enable_one_euro=True,
            enable_snapping=True,
            enable_on_twos=True,
            min_cutoff=0.85,
            beta=0.025,
            deadzone_radius=3.0
        )
        
        # Active tracks: {track_id: dict_data}
        self.tracks = {}
        self.next_track_id = 1
        
        # Load Ultralytics YOLO models (nano for CPU speed & precision)
        from ultralytics import YOLO
        self.pose_model = YOLO('yolov8n-pose.pt')
        self.det_model = YOLO('yolov8n.pt')
        
        # Animal classes recognized in COCO
        self.animal_classes = {
            15: 'cat',
            16: 'dog',
            14: 'bird',
            17: 'horse',
            18: 'sheep',
            19: 'cow'
        }

    def reset(self):
        """Reset state between videos."""
        self.tracks.clear()
        self.next_track_id = 1
        self.motion_processor.reset()

    def _match_tracks(self, detections, track_type='human', max_dist=160.0):
        """Matches current detections with existing active tracks using Euclidean distance."""
        matched = []
        unmatched_dets = list(range(len(detections)))
        unmatched_tracks = [t_id for t_id, t in self.tracks.items() if t['type'] == track_type]

        for det_idx in list(unmatched_dets):
            det = detections[det_idx]
            det_center = det['center']
            
            best_id = None
            min_d = float('inf')
            
            for t_id in unmatched_tracks:
                t_center = self.tracks[t_id]['center']
                d = math.hypot(det_center[0] - t_center[0], det_center[1] - t_center[1])
                if d < min_d and d < max_dist:
                    min_d = d
                    best_id = t_id
                    
            if best_id is not None:
                matched.append((det_idx, best_id))
                unmatched_dets.remove(det_idx)
                unmatched_tracks.remove(best_id)

        return matched, unmatched_dets, unmatched_tracks

    def _classify_human(self, kps, bbox, all_bboxes):
        """
        Anthropometric & Biomechanical Demographic Classification:
        - Child: head-to-body ratio >= 0.18 or height < 0.68 * max adult height in scene.
        - Female: shoulder-to-hip ratio < 1.15.
        - Male: shoulder-to-hip ratio >= 1.15.
        """
        x1, y1, x2, y2 = bbox
        box_h = max(10, y2 - y1)
        
        sh_l, sh_r = kps[5], kps[6]
        hip_l, hip_r = kps[11], kps[12]
        nose = kps[0]
        
        sh_w = math.hypot(sh_l[0] - sh_r[0], sh_l[1] - sh_r[1])
        hip_w = math.hypot(hip_l[0] - hip_r[0], hip_l[1] - hip_r[1])
        
        mid_sh = ((sh_l[0] + sh_r[0]) / 2.0, (sh_l[1] + sh_r[1]) / 2.0)
        head_len = math.hypot(nose[0] - mid_sh[0], nose[1] - mid_sh[1])
        head_ratio = head_len / float(box_h)
        
        # 1. Child Stature & Cephalic Ratio Check
        is_child = False
        if head_ratio >= 0.185 and box_h < 450:
            is_child = True
        elif all_bboxes and len(all_bboxes) > 1:
            scene_heights = [b[3] - b[1] for b in all_bboxes]
            max_h = max(scene_heights)
            if box_h < 0.68 * max_h:
                is_child = True
                
        if is_child:
            return 'child'
            
        # 2. Adult Gender Biomechanics (Shoulder / Hip Ratio)
        sh_to_hip = sh_w / max(10.0, hip_w)
        if sh_to_hip < 1.14:
            return 'female'
        else:
            return 'male'

    def analyze_frame(self, frame, frame_idx=0, fps=24, run_animal_detection=True):
        """
        Extracts all human poses and animals from frame with persistent temporal tracking.
        Returns a list of tracked entities ready for rendering.
        """
        orig_h, orig_w = frame.shape[:2]
        scale_x = self.width / float(orig_w)
        scale_y = self.height / float(orig_h)
        
        # 1. Detect Humans (YOLO-Pose with conf >= 0.50)
        pose_res = self.pose_model(frame, verbose=False, conf=0.50)[0]
        human_dets = []
        raw_human_boxes = []

        if pose_res.keypoints is not None and len(pose_res.keypoints) > 0:
            kps_all = pose_res.keypoints.xy.cpu().numpy()
            boxes_all = pose_res.boxes.xyxy.cpu().numpy()
            confs_all = pose_res.boxes.conf.cpu().numpy()

            filtered_entries = []
            for kps, box, conf in zip(kps_all, boxes_all, confs_all):
                if conf < 0.50 or np.sum(kps) == 0:
                    continue
                # Require shoulders and head to avoid phantom limb / furniture hallucinations
                has_sh = (np.sum(kps[5]) > 0 and np.sum(kps[6]) > 0)
                has_head = (np.sum(kps[0]) > 0 or (np.sum(kps[1]) > 0 and np.sum(kps[2]) > 0))
                area_pct = ((box[2] - box[0]) * (box[3] - box[1])) / float(orig_w * orig_h)
                if not has_sh or not has_head or area_pct < 0.04:
                    continue
                raw_human_boxes.append(box)
                filtered_entries.append((conf, box, kps))

            # Deduplicate vertical body splits (if one box is directly below another in same X column)
            filtered_entries.sort(key=lambda x: x[0], reverse=True)
            kept_entries = []
            for conf, box, kps in filtered_entries:
                overlap = False
                for k_conf, k_box, _ in kept_entries:
                    x_left = max(box[0], k_box[0])
                    x_right = min(box[2], k_box[2])
                    if x_right > x_left:
                        col_overlap = (x_right - x_left) / float(min(box[2] - box[0], k_box[2] - k_box[0]))
                        if col_overlap > 0.65:
                            overlap = True
                            break
                if not overlap:
                    kept_entries.append((conf, box, kps))

            for conf, box, kps in kept_entries:
                # Scale keypoints to target canvas (720x1280)
                scaled_kps = kps.copy()
                scaled_kps[:, 0] *= scale_x
                scaled_kps[:, 1] *= scale_y

                scaled_box = [
                    box[0] * scale_x, box[1] * scale_y,
                    box[2] * scale_x, box[3] * scale_y
                ]

                cx = (scaled_box[0] + scaled_box[2]) / 2.0
                cy = (scaled_box[1] + scaled_box[3]) / 2.0

                archetype = self._classify_human(kps, box, raw_human_boxes)

                human_dets.append({
                    "type": "human",
                    "archetype": archetype,
                    "kps": scaled_kps,
                    "bbox": scaled_box,
                    "center": (cx, cy),
                    "ground_y": scaled_box[3]
                })

        # 2. Detect Animals (YOLO-Object)
        animal_dets = []
        if run_animal_detection:
            det_res = self.det_model(frame, verbose=False)[0]
            if det_res.boxes is not None and len(det_res.boxes) > 0:
                d_boxes = det_res.boxes.xyxy.cpu().numpy()
                d_clss = det_res.boxes.cls.cpu().numpy()
                d_confs = det_res.boxes.conf.cpu().numpy()
                
                for box, cls_idx, conf in zip(d_boxes, d_clss, d_confs):
                    cls_id = int(cls_idx)
                    if cls_id in self.animal_classes and conf >= 0.35:
                        species = self.animal_classes[cls_id]
                        # Discard if heavily overlaps with a human detection
                        scaled_box = [
                            box[0] * scale_x, box[1] * scale_y,
                            box[2] * scale_x, box[3] * scale_y
                        ]
                        cx = (scaled_box[0] + scaled_box[2]) / 2.0
                        cy = (scaled_box[1] + scaled_box[3]) / 2.0
                        
                        animal_dets.append({
                            "type": "animal",
                            "species": species,
                            "archetype": f"stick_{species}",
                            "bbox": scaled_box,
                            "center": (cx, cy),
                            "ground_y": scaled_box[3]
                        })

        # 3. Temporal Tracking Update (Match or Spawn)
        if fps > 0:
            self.motion_processor.fps = float(fps)
        t_sec = frame_idx / float(fps if fps > 0 else 24.0)
        # Update humans
        matched_h, un_det_h, un_track_h = self._match_tracks(human_dets, track_type='human')
        for det_idx, t_id in matched_h:
            det = human_dets[det_idx]
            old_t = self.tracks[t_id]
            # Smooth & snap keypoints with MocapMotionProcessor (OneEuro + Cartoon Pose Snapper on Twos)
            sm_kps = self.motion_processor.process_frame(t_id, det['kps'], timestamp=t_sec, frame_idx=frame_idx)
            # Demographic stability voting
            old_t['archetype_votes'].append(det['archetype'])
            if len(old_t['archetype_votes']) > 15:
                old_t['archetype_votes'].pop(0)
            dominant_archetype = max(set(old_t['archetype_votes']), key=old_t['archetype_votes'].count)
            
            # Direction velocity
            dx = det['center'][0] - old_t['center'][0]
            facing = 'right' if dx > 1.5 else ('left' if dx < -1.5 else old_t.get('facing', 'right'))
            
            self.tracks[t_id].update({
                "kps": sm_kps,
                "bbox": det['bbox'],
                "center": det['center'],
                "ground_y": det['ground_y'],
                "archetype": dominant_archetype,
                "facing": facing,
                "last_seen": frame_idx
            })
            
        for det_idx in un_det_h:
            det = human_dets[det_idx]
            new_id = self.next_track_id
            self.next_track_id += 1
            sm_kps = self.motion_processor.process_frame(new_id, det['kps'], timestamp=t_sec, frame_idx=frame_idx)
            self.tracks[new_id] = {
                "id": new_id,
                "type": "human",
                "kps": sm_kps,
                "bbox": det['bbox'],
                "center": det['center'],
                "ground_y": det['ground_y'],
                "archetype": det['archetype'],
                "archetype_votes": [det['archetype']],
                "facing": "right",
                "last_seen": frame_idx
            }

        # Update animals
        matched_a, un_det_a, un_track_a = self._match_tracks(animal_dets, track_type='animal')
        for det_idx, t_id in matched_a:
            det = animal_dets[det_idx]
            old_t = self.tracks[t_id]
            dx = det['center'][0] - old_t['center'][0]
            facing = 'right' if dx > 1.0 else ('left' if dx < -1.0 else old_t.get('facing', 'right'))
            
            self.tracks[t_id].update({
                "bbox": det['bbox'],
                "center": det['center'],
                "ground_y": det['ground_y'],
                "facing": facing,
                "last_seen": frame_idx
            })
            
        for det_idx in un_det_a:
            det = animal_dets[det_idx]
            new_id = self.next_track_id
            self.next_track_id += 1
            self.tracks[new_id] = {
                "id": new_id,
                "type": "animal",
                "species": det['species'],
                "archetype": det['archetype'],
                "bbox": det['bbox'],
                "center": det['center'],
                "ground_y": det['ground_y'],
                "facing": "right",
                "last_seen": frame_idx
            }

        # Prune dead tracks (not seen for > 10 frames)
        dead_ids = [t_id for t_id, t in self.tracks.items() if frame_idx - t['last_seen'] > 10]
        for d_id in dead_ids:
            del self.tracks[d_id]

        # Return active tracks visible in current frame
        active_entities = [t for t in self.tracks.values() if t['last_seen'] == frame_idx]
        return active_entities
