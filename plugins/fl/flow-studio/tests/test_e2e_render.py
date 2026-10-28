#!/usr/bin/env python3
# [FL_INDEX: keywords="flow_studio_e2e, integration_test, ffmpeg_render, e2e_verification, test_suite" | purpose="Comprehensive E2E integration test verifying all Flow Studio endpoints, health, media samples, and physical multitrack FFmpeg rendering"]

import unittest
import urllib.request
import urllib.error
import json
import time
import os
import subprocess

PORT = 18012
BASE_URL = f"http://127.0.0.1:{PORT}"

class TestFlowStudioE2E(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Verify server is responding
        try:
            req = urllib.request.urlopen(f"{BASE_URL}/health", timeout=3)
            data = json.loads(req.read().decode())
            cls.server_online = (data.get("status") == "ok")
        except Exception:
            cls.server_online = False

    def test_01_server_health(self):
        """Verify Flow Studio health endpoint and tool availability"""
        if not self.server_online:
            self.skipTest(f"Flow Studio server not listening on {BASE_URL}")
        res = urllib.request.urlopen(f"{BASE_URL}/health")
        self.assertEqual(res.status, 200)
        data = json.loads(res.read().decode())
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "flow-studio")
        self.assertTrue(data.get("ffmpeg_available"), "FFmpeg must be available")

    def test_02_media_samples(self):
        """Verify media samples catalog API returns valid sample assets"""
        if not self.server_online:
            self.skipTest(f"Flow Studio server not listening on {BASE_URL}")
        res = urllib.request.urlopen(f"{BASE_URL}/api/media/samples")
        self.assertEqual(res.status, 200)
        data = json.loads(res.read().decode())
        self.assertEqual(data.get("status"), "success")
        self.assertIsInstance(data.get("samples"), list)
        self.assertGreater(len(data["samples"]), 0, "Samples library must not be empty")

    def test_03_export_and_render_lifecycle(self):
        """Verify full export lifecycle: trigger render, poll status, verify physical MP4 artifact"""
        if not self.server_online:
            self.skipTest(f"Flow Studio server not listening on {BASE_URL}")

        payload = {
            "resolution": "1280x720",
            "fps": 30,
            "duration": 3,
            "titleText": "E2E Automated Test",
            "tracks": [
                {
                    "type": "video",
                    "clips": [
                        {
                            "source": "uploads/synth_intro_test.mp4",
                            "start": 0,
                            "duration": 2.5,
                            "title": "synth_intro_test.mp4"
                        }
                    ]
                }
            ]
        }

        req = urllib.request.Request(
            f"{BASE_URL}/api/project/export",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        res = urllib.request.urlopen(req)
        self.assertIn(res.status, [200, 202])
        data = json.loads(res.read().decode())
        self.assertEqual(data.get("status"), "accepted")
        self.assertIn("jobId", data)
        job_id = data["jobId"]

        # Poll status until completion (up to 15 seconds)
        completed = False
        for _ in range(15):
            time.sleep(1)
            status_res = urllib.request.urlopen(f"{BASE_URL}/api/project/status/{job_id}")
            self.assertEqual(status_res.status, 200)
            status_data = json.loads(status_res.read().decode())
            job = status_data.get("job", {})
            if job.get("status") == "completed":
                completed = True
                output_file = job.get("filename")
                self.assertIsNotNone(output_file)
                # Verify physical file exists on disk and is non-empty
                target_path = os.path.join(os.path.dirname(__file__), "..", "exports", output_file)
                self.assertTrue(os.path.exists(target_path), f"Rendered file {target_path} must exist on disk")
                self.assertGreater(os.path.getsize(target_path), 1000, "Rendered file must have valid video bytes")
                break
            elif job.get("status") == "failed":
                self.fail(f"Render job failed with error: {job.get('error')}")

        self.assertTrue(completed, "Render job did not complete within the timeout window")

if __name__ == "__main__":
    unittest.main()
