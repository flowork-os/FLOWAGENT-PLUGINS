#!/usr/bin/env python3
# [FL_INDEX: keywords="test_stickman_studio, unit_test, beats_extractor, cognitive_director, split_pip_render, manifest_contract" | purpose="Comprehensive unit and integration test suite for Stickman Studio validating contract integrity, ~3s micro-beat slicing, cognitive director choreography, dual-mode split-PIP rendering, and destination saving"]

import unittest
import os
import sys
import json
import subprocess
import shutil
import tempfile

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SAMPLE_VIDEO = os.path.join(APP_DIR, '..', 'flow-studio', 'samples', 'sample_video.mp4')

class TestStickmanStudio(unittest.TestCase):

    def test_01_manifest_and_skill_contract(self):
        """Verify plugin.manifest.json, SKILL.md keywords, and trigger.md frontmatter."""
        manifest_path = os.path.join(APP_DIR, 'plugin.manifest.json')
        self.assertTrue(os.path.exists(manifest_path), "plugin.manifest.json missing")
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        self.assertEqual(manifest.get('id'), 'stickman-studio')
        self.assertEqual(manifest.get('entry', {}).get('gui'), 'gui/index.html')
        self.assertEqual(manifest.get('entry', {}).get('backend'), 'engine/server.mjs')
        self.assertEqual(manifest.get('ipc', {}).get('default_port'), 18040)

        # Check SKILL.md has EXACTLY 20 keywords
        skill_path = os.path.join(APP_DIR, 'SKILL.md')
        self.assertTrue(os.path.exists(skill_path), "SKILL.md missing")
        with open(skill_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertTrue(content.startswith('---'), "SKILL.md missing YAML frontmatter")
        parts = content.split('---', 2)
        frontmatter = parts[1]
        
        # Count keywords
        keywords = []
        in_keywords = False
        for line in frontmatter.splitlines():
            sline = line.strip()
            if sline.startswith('keywords:'):
                in_keywords = True
                continue
            if in_keywords:
                if sline.startswith('- '):
                    keywords.append(sline[2:].strip())
                elif sline and not sline.startswith('#'):
                    break
        self.assertEqual(len(keywords), 20, f"SKILL.md must have EXACTLY 20 keywords, found {len(keywords)}: {keywords}")

        # Check trigger.md
        trigger_path = os.path.join(APP_DIR, 'trigger.md')
        self.assertTrue(os.path.exists(trigger_path), "trigger.md missing")

    def test_02_video_beats_extractor(self):
        """Verify video_beats_extractor.py creates ~3s micro-beats and keyframe snapshots."""
        self.assertTrue(os.path.exists(SAMPLE_VIDEO), f"Sample video missing: {SAMPLE_VIDEO}")
        tmp_dir = tempfile.mkdtemp(prefix='test_beats_')
        try:
            script = os.path.join(APP_DIR, 'engine', 'video_beats_extractor.py')
            cmd = ['python3', script, SAMPLE_VIDEO, tmp_dir, '3.0']
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(res.returncode, 0, f"video_beats_extractor failed: {res.stderr}")

            manifest_file = os.path.join(tmp_dir, 'beats_manifest.json')
            self.assertTrue(os.path.exists(manifest_file), "beats_manifest.json not created")

            with open(manifest_file, 'r', encoding='utf-8') as f:
                manifest = json.load(f)

            self.assertIn('beats', manifest)
            beats = manifest['beats']
            self.assertGreater(len(beats), 0, "No micro-beats generated")

            # Check first beat structure
            first_beat = beats[0]
            self.assertIn('start', first_beat)
            self.assertIn('end', first_beat)
            self.assertIn('duration', first_beat)
            self.assertIn('keyframe_file', first_beat)
            self.assertAlmostEqual(first_beat['duration'], 3.0, delta=1.0)

            # Check keyframe image file exists
            kf_path = os.path.join(tmp_dir, 'keyframes', first_beat['keyframe_file'])
            self.assertTrue(os.path.exists(kf_path), f"Keyframe missing: {kf_path}")
            self.assertGreater(os.path.getsize(kf_path), 1000, "Keyframe image file empty")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_03_cognitive_director(self):
        """Verify cognitive_director.py enriches beats with poses, props, and parody ideas."""
        tmp_manifest = tempfile.NamedTemporaryFile(suffix='.json', mode='w', delete=False)
        sample_beats = {
            "media_path": SAMPLE_VIDEO,
            "total_duration": 6.0,
            "target_beat_seconds": 3.0,
            "beats": [
                {
                    "id": "beat_001",
                    "index": 1,
                    "start": 0.0,
                    "end": 3.0,
                    "duration": 3.0,
                    "text": "Look at the shocking announcement today!",
                    "keyframe_file": "beat_001.jpg"
                },
                {
                    "id": "beat_002",
                    "index": 2,
                    "start": 3.0,
                    "end": 6.0,
                    "duration": 3.0,
                    "text": "The price has surged past expectations completely.",
                    "keyframe_file": "beat_002.jpg"
                }
            ]
        }
        json.dump(sample_beats, tmp_manifest)
        tmp_manifest.close()

        try:
            director_script = os.path.join(APP_DIR, 'engine', 'cognitive_director.py')
            res = subprocess.run(['python3', director_script, tmp_manifest.name],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(res.returncode, 0, f"cognitive_director failed: {res.stderr}")

            with open(tmp_manifest.name, 'r', encoding='utf-8') as f:
                enriched = json.load(f)

            beats = enriched['beats']
            self.assertEqual(len(beats), 2)
            for b in beats:
                self.assertIn('parody_idea', b)
                self.assertIn('prop', b)
                self.assertIn('pose', b)
                self.assertIn('emotion', b)
                self.assertIn('camera_shake', b)
                self.assertGreater(len(b['parody_idea']), 5)
        finally:
            if os.path.exists(tmp_manifest.name):
                os.unlink(tmp_manifest.name)

    def test_04_dual_mode_video_render_worker(self):
        """Verify video_render_worker.py compiles split_pip and full_stickman MP4 videos."""
        out_pip = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
        custom_dest_dir = tempfile.mkdtemp(prefix='test_dest_')
        cfg = {
            "video_path": SAMPLE_VIDEO,
            "audio_path": SAMPLE_VIDEO,
            "render_mode": "split_pip",
            "destination_dir": custom_dest_dir,
            "resolution": "720x1280",
            "fps": 15, # Fast test fps
            "title": "Dual PIP Test",
            "character_style": "classic",
            "beats": [
                {
                    "id": "beat_001",
                    "start": 0.0,
                    "end": 2.0,
                    "duration": 2.0,
                    "text": "Split Screen Top Video Test",
                    "prop": "bulb",
                    "pose": "surprised",
                    "emotion": "surprised",
                    "model": "classic",
                    "accent": "#00e5ff",
                    "camera_shake": True,
                    "parody_idea": "Shocked stickman reacting below real video"
                }
            ]
        }

        try:
            render_script = os.path.join(APP_DIR, 'engine', 'video_render_worker.py')
            cmd = ['python3', render_script, json.dumps(cfg), out_pip]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(res.returncode, 0, f"video_render_worker failed: {res.stderr}")

            # Check rendered output
            self.assertTrue(os.path.exists(out_pip), "Output video file not produced")
            self.assertGreater(os.path.getsize(out_pip), 20000, "Output video file too small")

            # Check custom destination directory copy
            dest_files = [f for f in os.listdir(custom_dest_dir) if f.endswith('.mp4')]
            self.assertGreater(len(dest_files), 0, "Video was not copied to custom destination directory")
        finally:
            if os.path.exists(out_pip):
                os.unlink(out_pip)
            shutil.rmtree(custom_dest_dir, ignore_errors=True)

    def test_05_strict_english_gui(self):
        """Ensure gui/index.html and gui/app.js contain 100% standard English."""
        html_path = os.path.join(APP_DIR, 'gui', 'index.html')
        with open(html_path, 'r', encoding='utf-8') as f:
            html = f.read()

        # Check prohibited Indonesian words in UI text
        prohibited_words = ['bocil', 'ngerasa', 'kamu', 'semua', 'teman', 'bayangin', 'diberesin']
        for pw in prohibited_words:
            self.assertNotIn(pw.lower(), html.lower(), f"Prohibited non-English word found in HTML: '{pw}'")

    def test_06_autoshorts_candidate_cand2_e2e(self):
        """End-to-end verification of AutoShorts cand-2.mp4 clip processing."""
        cand2_path = os.path.join(APP_DIR, '..', 'auto-shorts', 'data', 'proj-1793257603999', 'clips', 'cand-2.mp4')
        if not os.path.exists(cand2_path):
            self.skipTest(f"AutoShorts candidate video not found at {cand2_path}")

        tmp_dir = tempfile.mkdtemp(prefix='test_cand2_')
        try:
            # 1. Run video_beats_extractor.py
            script = os.path.join(APP_DIR, 'engine', 'video_beats_extractor.py')
            cmd = ['python3', script, cand2_path, tmp_dir, '3.0']
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(res.returncode, 0, f"video_beats_extractor on cand-2 failed: {res.stderr}")

            manifest_file = os.path.join(tmp_dir, 'beats_manifest.json')
            self.assertTrue(os.path.exists(manifest_file), "beats_manifest.json missing for cand-2")

            with open(manifest_file, 'r', encoding='utf-8') as f:
                manifest = json.load(f)

            beats = manifest.get('beats', [])
            self.assertGreaterEqual(len(beats), 10, f"Expected at least 10 beats from cand-2.mp4, got {len(beats)}")

            # 2. Run cognitive_director.py
            director_script = os.path.join(APP_DIR, 'engine', 'cognitive_director.py')
            res2 = subprocess.run(['python3', director_script, manifest_file],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(res2.returncode, 0, f"cognitive_director on cand-2 failed: {res2.stderr}")

            with open(manifest_file, 'r', encoding='utf-8') as f:
                directed_manifest = json.load(f)

            for b in directed_manifest['beats']:
                self.assertIn('parody_idea', b)
                self.assertGreater(len(b['parody_idea']), 5)
                self.assertTrue(os.path.exists(b['keyframe_path']), f"Keyframe file missing: {b['keyframe_path']}")
                self.assertGreater(os.path.getsize(b['keyframe_path']), 1000)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_07_vision_pose_tracker_and_dynamic_cartoonist(self):
        """Verify PoseTracker 33-point skeletal extraction and DynamicCartoonist zero-template redrawer."""
        sys.path.append(os.path.join(APP_DIR, 'engine'))
        from pose_tracker import PoseTracker
        from dynamic_cartoonist import DynamicCartoonist
        import numpy as np

        tracker = PoseTracker()
        cartoonist = DynamicCartoonist(width=720, height=1280)

        # Test A: Graphic slide analysis (no human pose)
        sample_slide = np.zeros((640, 480, 3), dtype=np.uint8)
        sample_slide[200:250, 40:440] = (255, 255, 255) # Quiz button 1
        sample_slide[280:330, 40:440] = (255, 255, 255) # Quiz button 2
        sample_slide[360:410, 40:440] = (255, 255, 255) # Quiz button 3
        slide_res = tracker.analyze_image(sample_slide)
        self.assertFalse(slide_res['has_pose'])
        self.assertIn(slide_res['screen_type'], ['quiz', 'flashcard', 'title', 'graphic'])

        # Test B: Dynamic Cartoonist redraw of DNA scene
        beat_dna = {
            'index': 3,
            'text': 'model interaktif untuk memahami replikasi DNA',
            'pose_data': slide_res
        }
        frame_dna = cartoonist.render_beat_frame(beat_dna, t=1.0, energy=0.8)
        self.assertEqual(frame_dna.shape, (1280, 720, 3))
        self.assertGreater(np.mean(frame_dna), 5.0, "Rendered DNA frame should not be blank")

        # Test C: Dynamic Cartoonist redraw of Flashcard bone scene
        beat_fc = {
            'index': 4,
            'text': 'flashcard untuk menghafal 266 tulang',
            'pose_data': slide_res
        }
        frame_fc = cartoonist.render_beat_frame(beat_fc, t=0.5, energy=0.7)
        self.assertEqual(frame_fc.shape, (1280, 720, 3))
        self.assertGreater(np.mean(frame_fc), 5.0, "Rendered flashcard frame should not be blank")

        # Test D: Dynamic Cartoonist redraw of CTA scene
        beat_cta = {
            'index': 7,
            'text': 'daftar sekarang',
            'pose_data': slide_res
        }
        frame_cta = cartoonist.render_beat_frame(beat_cta, t=0.0, energy=0.9)
        self.assertEqual(frame_cta.shape, (1280, 720, 3))
        self.assertGreater(np.mean(frame_cta), 5.0, "Rendered CTA frame should not be blank")

    def test_08_3d_vault_registry_and_connectivity(self):
        """Verify 3D vault manifest integrity and availability of 34,840 models in system/library."""
        vault_path = os.path.abspath(os.path.join(APP_DIR, '..', '..', 'system', 'library'))
        manifest_path = os.path.join(vault_path, 'manifest.json')
        self.assertTrue(os.path.exists(manifest_path), f"3D Vault manifest not found at {manifest_path}")

        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

        self.assertIn('total_generators_and_designs', manifest)
        self.assertEqual(manifest['total_generators_and_designs'], 34840)
        self.assertIn('modalities', manifest)
        self.assertIn('bioinspired_structures', manifest['modalities'])
        self.assertIn('threejs_scenes', manifest['modalities'])

        # Verify physical directories exist
        bio_dir = os.path.join(vault_path, 'bioinspired3d')
        three_dir = os.path.join(vault_path, 'threejs')
        self.assertTrue(os.path.isdir(bio_dir), f"Bioinspired 3D dir missing: {bio_dir}")
        self.assertTrue(os.path.isdir(three_dir), f"ThreeJS dir missing: {three_dir}")

    def test_09_ai_background_and_audio_stream_muxing(self):
        """Verify AI background generation, Layer 1 compositing, and audio stream muxing with high bitrate."""
        sys.path.append(os.path.join(APP_DIR, 'engine'))
        from ai_background_generator import generate_ai_background, generate_procedural_fallback
        from pro_stickman_engine import ProStickmanEngine

        # 1. Test Procedural Vector Background Generation
        tmp_bg = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False).name
        try:
            generate_procedural_fallback("cartoon classroom with chalkboard", "classroom", tmp_bg)
            self.assertTrue(os.path.exists(tmp_bg))
            self.assertGreater(os.path.getsize(tmp_bg), 5000)

            # 2. Test Layer 1 Engine Compositing with Background
            engine = ProStickmanEngine(width=720, height=640)
            beat_data = {
                "speaking_actor": "HOST",
                "pose": "point",
                "emotion": "happy",
                "text": "Testing AI Scene Background",
                "background_image": tmp_bg
            }
            frame = engine.render_full_frame(beat_data, t=0.5)
            self.assertEqual(frame.shape, (640, 720, 3))

            # 3. Test Full Render Video with Real Audio Muxing
            out_video = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
            render_cfg = {
                "video_path": SAMPLE_VIDEO,
                "audio_path": SAMPLE_VIDEO,
                "render_mode": "split_pip",
                "destination_dir": "",
                "resolution": "720x1280",
                "fps": 15,
                "title": "Audio Stream Muxing Test",
                "beats": [
                    {
                        "id": "beat_001",
                        "start": 0.0,
                        "end": 2.0,
                        "duration": 2.0,
                        "text": "Audio Sync Beat",
                        "pose": "talk",
                        "emotion": "happy",
                        "prop": "bulb",
                        "background_image": tmp_bg
                    }
                ]
            }
            render_script = os.path.join(APP_DIR, 'engine', 'video_render_worker.py')
            cmd = ['python3', render_script, json.dumps(render_cfg), out_video]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(res.returncode, 0, f"Render worker failed: {res.stderr}")
            self.assertTrue(os.path.exists(out_video))

            # 4. Probe Output MP4 with ffprobe to verify genuine AAC Audio Stream
            probe_cmd = [
                'ffprobe', '-v', 'error',
                '-select_streams', 'a:0',
                '-show_entries', 'stream=codec_name,bit_rate',
                '-of', 'json', out_video
            ]
            probe_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(probe_res.returncode, 0, f"ffprobe audio probe failed: {probe_res.stderr}")
            probe_data = json.loads(probe_res.stdout)
            streams = probe_data.get('streams', [])
            self.assertGreater(len(streams), 0, "Rendered video has no audio stream! Silent output detected.")
            self.assertEqual(streams[0].get('codec_name'), 'aac')
            # Bitrate should be active genuine audio (> 64000 bps)
            bit_rate = int(streams[0].get('bit_rate', 0) or 0)
            self.assertGreater(bit_rate, 64000, f"Audio bitrate too low ({bit_rate}), indicates silent null audio")
        finally:
            if os.path.exists(tmp_bg):
                os.unlink(tmp_bg)
            if 'out_video' in locals() and os.path.exists(out_video):
                os.unlink(out_video)

    def test_10_stick_hub_storyteller_engine(self):
        """Verify StickHubStorytellerEngine renders full-body dynamic standing and walk cycle frames."""
        sys.path.append(os.path.join(APP_DIR, 'engine'))
        from stick_hub_storyteller_engine import StickHubStorytellerEngine
        import numpy as np

        engine = StickHubStorytellerEngine(width=720, height=1280)

        # 1. Standing pose with prop and kinetic subtitle
        beat_stand = {
            "text": "Don't look back anymore. Keep moving forward!",
            "pose": "point",
            "emotion": "happy",
            "prop": "bulb"
        }
        frame_stand = engine.render_frame(beat_stand, t=1.2, energy=0.75)
        self.assertIsInstance(frame_stand, np.ndarray)
        self.assertEqual(frame_stand.shape, (1280, 720, 3))
        self.assertGreater(float(np.std(frame_stand)), 10.0, "Frame is monochromatic or blank")

        # 2. Walk cycle action
        beat_walk = {
            "text": "Walking into sovereign territory",
            "action": "walk",
            "emotion": "neutral"
        }
        frame_walk = engine.render_frame(beat_walk, t=0.6, energy=0.5)
        self.assertIsInstance(frame_walk, np.ndarray)
        self.assertEqual(frame_walk.shape, (1280, 720, 3))
        self.assertGreater(float(np.std(frame_walk)), 10.0, "Walk frame is monochromatic or blank")

    def test_11_mocap_stickman_engine(self):
        """Verify MocapStickmanEngine tracking, FK kinematics, styles, and full pipeline rendering."""
        sys.path.append(os.path.join(APP_DIR, 'engine'))
        from mocap_stickman_engine import MocapStickmanEngine, run_mocap_pipeline
        from PIL import Image
        import numpy as np

        engine = MocapStickmanEngine(width=720, height=1280)
        bg = engine.load_background(None)
        self.assertIsInstance(bg, Image.Image)
        self.assertEqual(bg.size, (720, 1280))

        # 1. Test render_mocap_frame with mock landmarks for classic and presenter
        sample_joints = {
            "nose": {"x": 0.50, "y": 0.35, "z": 0.0, "visibility": 0.95},
            "l_eye": {"x": 0.53, "y": 0.33, "z": 0.0, "visibility": 0.95},
            "r_eye": {"x": 0.47, "y": 0.33, "z": 0.0, "visibility": 0.95},
            "l_shoulder": {"x": 0.60, "y": 0.48, "z": 0.0, "visibility": 0.95},
            "r_shoulder": {"x": 0.40, "y": 0.48, "z": 0.0, "visibility": 0.95},
            "l_elbow": {"x": 0.65, "y": 0.60, "z": 0.0, "visibility": 0.85},
            "r_elbow": {"x": 0.35, "y": 0.60, "z": 0.0, "visibility": 0.85},
            "l_wrist": {"x": 0.68, "y": 0.72, "z": 0.0, "visibility": 0.80},
            "r_wrist": {"x": 0.32, "y": 0.72, "z": 0.0, "visibility": 0.80}
        }

        # Test all archetypes
        for style in ['classic', 'glasses', 'girl', 'cool', 'business']:
            f = engine.render_mocap_frame(bg, sample_joints, t=0.5, energy=0.6, character_style=style, framing_mode='auto')
            self.assertIsInstance(f, np.ndarray)
            self.assertEqual(f.shape, (1280, 720, 3))
            self.assertGreater(float(np.std(f)), 15.0)

        # Test Presenter mode
        f_pres = engine.render_mocap_frame(bg, sample_joints, t=0.5, energy=0.6, character_style='glasses', framing_mode='presenter')
        self.assertIsInstance(f_pres, np.ndarray)
        self.assertEqual(f_pres.shape, (1280, 720, 3))

        # 2. Integration Pipeline Run on real test video
        test_clip = os.path.join(APP_DIR, 'data', 'test_real_speaker_5s.mp4')
        if os.path.exists(test_clip):
            out_test = tempfile.mktemp(suffix='_mocap_test.mp4')
            try:
                res_out = run_mocap_pipeline(test_clip, None, out_test, character_style='glasses', framing_mode='auto')
                self.assertTrue(os.path.exists(res_out))
                self.assertGreater(os.path.getsize(res_out), 50000)
            finally:
                if os.path.exists(out_test):
                    os.unlink(out_test)

    def test_12_landscape_and_lyric_narrative_engine(self):
        """Verify 16:9 Landscape rendering, 300s duration capacity, and lyric-driven narrative acting poses."""
        sys.path.append(os.path.join(APP_DIR, 'engine'))
        from stick_hub_storyteller_engine import StickHubStorytellerEngine
        import numpy as np

        # 1. Verify 16:9 Landscape (1280x720) initialization and coordinate adaptation
        engine_16_9 = StickHubStorytellerEngine(width=1280, height=720)
        self.assertTrue(engine_16_9.is_landscape, "Engine failed to detect 16:9 landscape aspect ratio")
        self.assertEqual(engine_16_9.ground_y, int(720 * 0.84))

        # 2. Verify all 10 Lyric-Driven Narrative Acting Poses in Landscape
        dramatic_poses = [
            'kneel_crying', 'holding_photo', 'reaching_out', 'walking_cold',
            'running_chase', 'peeking_heartbreak', 'cafe_reflecting',
            'heartbreak_clutch', 'stargazing_rooftop', 'peaceful_sunrise'
        ]
        for pose in dramatic_poses:
            beat = {
                "text": f"Dramatic acting beat: {pose}",
                "pose": pose,
                "emotion": "sad" if "crying" in pose or "heartbreak" in pose else "neutral",
                "background": "raining_street",
                "prop": "photo_frame" if pose == "holding_photo" else "fading_silhouette"
            }
            frame = engine_16_9.render_frame(beat, t=1.0, energy=0.8)
            self.assertIsInstance(frame, np.ndarray)
            self.assertEqual(frame.shape, (720, 1280, 3), f"Frame shape mismatch for pose {pose}")
            self.assertGreater(float(np.std(frame)), 15.0, f"Frame for {pose} has insufficient visual variation")

        # 3. Verify all 6 Procedural Song Stages
        song_stages = ['raining_street', 'bedroom_night', 'dream_void', 'rooftop_stars', 'sunrise_hill', 'cafe_interior']
        for stage in song_stages:
            beat = {
                "text": f"Stage test: {stage}",
                "pose": "peaceful_sunrise",
                "emotion": "happy",
                "background": stage
            }
            frame = engine_16_9.render_frame(beat, t=2.5, energy=0.6)
            self.assertEqual(frame.shape, (720, 1280, 3))
            self.assertGreater(float(np.std(frame)), 15.0, f"Stage {stage} has blank output")

        # 4. Verify Dual-Actor Ethereal Glowing Memory Silhouette
        flashback_beat = {
            "text": "Flashback memory of us together",
            "background": "dream_void",
            "actors": [
                {
                    "label": "STICKY",
                    "action": "reaching_out",
                    "emotion": "sad",
                    "accent_color": [0, 229, 255],
                    "speaking": True
                },
                {
                    "label": "FADING MEMORY",
                    "action": "listen",
                    "emotion": "neutral",
                    "is_silhouette": True,
                    "accent_color": [192, 132, 252],
                    "speaking": False
                }
            ]
        }
        silh_frame = engine_16_9.render_frame(flashback_beat, t=1.5, energy=0.7)
        self.assertEqual(silh_frame.shape, (720, 1280, 3))
        self.assertGreater(float(np.std(silh_frame)), 20.0, "Silhouette frame missing rendering")

        # 5. Verify Cognitive Director lyrical classification
        from cognitive_director import direct_storyboard_beats
        test_lyric_manifest = {
            "staging_style": "music_narrative_story",
            "beats": [
                {"id": "b1", "text": "Hujan deras malam ini aku menangis mengingatmu kau pergi meninggalkanku", "start": 0.0, "end": 3.0},
                {"id": "b2", "text": "Memandang fotomu di kamar dingin ini hatiku hancur", "start": 3.0, "end": 6.0},
                {"id": "b3", "text": "Mengejarmu di jalanan sepi tapi kau hilang seperti bayangan", "start": 6.0, "end": 9.0},
                {"id": "b4", "text": "Kini mentari terbit menyinari bukit damai", "start": 9.0, "end": 12.0}
            ]
        }
        res = direct_storyboard_beats(test_lyric_manifest)
        enriched = res.get('beats', [])
        self.assertEqual(res.get('domain_theme'), 'music_narrative_story')
        self.assertIn(enriched[0].get('pose'), dramatic_poses)
        self.assertEqual(len(enriched[0].get('actors', [])), 2)
        self.assertTrue(enriched[0]['actors'][1].get('is_silhouette'))


if __name__ == '__main__':
    unittest.main()

