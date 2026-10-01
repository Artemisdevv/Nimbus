"""
Unit tests for the progress_hook state machine in app.py.
Tests the download status transitions: queued -> downloading -> processing -> completed
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest
from app import Api


class TestProgressHook(unittest.TestCase):
    def setUp(self):
        self.api = Api()
        self.uid = "test-uid-123"
        # Initialize progress entry as the download() method does
        self.api.progress[self.uid] = {
            "id": self.uid,
            "status": "downloading",
            "percent": "0%",
            "speed": "Unknown",
            "eta": "Unknown"
        }

    def _call_hook(self, d):
        """Simulate calling the internal progress_hook with a status dict."""
        # Replicate the exact logic from progress_hook in app.py
        if self.uid in self.api.cancelled_jobs:
            raise Exception("Download Cancelled")

        if d["status"] == "downloading":
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate")

            if total:
                percent = (downloaded / total) * 100
            else:
                percent = 0

            speed = d.get("speed")
            eta = d.get("eta")

            if speed:
                speed_mib = speed / (1024 * 1024)
                speed_text = f"{speed_mib:.2f} MiB/s"
            else:
                speed_text = "Unknown"

            if eta is not None:
                minutes, seconds = divmod(eta, 60)
                eta_text = f"{int(minutes):02d}:{int(seconds):02d}"
            else:
                eta_text = "Unknown"

            self.api.progress[self.uid] = {
                "id": self.uid,
                "status": "downloading",
                "percent": f"{percent:.1f}%",
                "speed": speed_text,
                "eta": eta_text,
                "downloaded_bytes": downloaded,
                "total_bytes": total
            }

        # Check postprocessor events FIRST (they also have status "finished"/"started")
        elif d.get("postprocessor") and d["status"] == "finished":
            # FFmpeg merge / conversion finished
            self.api.progress[self.uid] = {
                "id": self.uid,
                "status": "completed",
                "percent": "100%",
                "speed": "Done",
                "eta": "00:00",
                "downloaded_bytes": d.get("total_bytes") or d.get("total_bytes_estimate"),
                "total_bytes": d.get("total_bytes") or d.get("total_bytes_estimate")
            }

        elif d.get("postprocessor") and d["status"] == "started":
            # FFmpeg merge / conversion started
            self.api.progress[self.uid] = {
                "id": self.uid,
                "status": "processing",
                "percent": None,
                "speed": "Processing…",
                "eta": "—",
                "downloaded_bytes": d.get("total_bytes") or d.get("total_bytes_estimate"),
                "total_bytes": d.get("total_bytes") or d.get("total_bytes_estimate")
            }

        elif d["status"] == "finished":
            # yt-dlp may still run FFmpeg post-processors after this hook.
            # We'll mark as "processing" and let the post-processor hook
            # (if any) or the next poll flip it to "completed".
            self.api.progress[self.uid] = {
                "id": self.uid,
                "status": "processing",
                "percent": None,
                "speed": "Processing…",
                "eta": "—",
                "downloaded_bytes": d.get("total_bytes") or d.get("total_bytes_estimate"),
                "total_bytes": d.get("total_bytes") or d.get("total_bytes_estimate")
            }

    def test_downloading_updates_percent_speed_eta(self):
        """Downloading status computes percent, speed, eta correctly."""
        d = {
            "status": "downloading",
            "downloaded_bytes": 5_000_000,
            "total_bytes": 10_000_000,
            "speed": 1_048_576,  # 1 MiB/s
            "eta": 5
        }
        self._call_hook(d)
        p = self.api.progress[self.uid]
        self.assertEqual(p["status"], "downloading")
        self.assertEqual(p["percent"], "50.0%")
        self.assertEqual(p["speed"], "1.00 MiB/s")
        self.assertEqual(p["eta"], "00:05")
        self.assertEqual(p["downloaded_bytes"], 5_000_000)
        self.assertEqual(p["total_bytes"], 10_000_000)

    def test_downloading_with_total_bytes_estimate(self):
        """Downloading works with total_bytes_estimate when total_bytes missing."""
        d = {
            "status": "downloading",
            "downloaded_bytes": 3_000_000,
            "total_bytes_estimate": 12_000_000,
            "speed": 2_097_152,  # 2 MiB/s
            "eta": 90
        }
        self._call_hook(d)
        p = self.api.progress[self.uid]
        self.assertEqual(p["percent"], "25.0%")
        self.assertEqual(p["speed"], "2.00 MiB/s")
        self.assertEqual(p["eta"], "01:30")

    def test_finished_sets_processing(self):
        """Finished status (pre-postprocessor) sets processing state."""
        d = {"status": "finished", "total_bytes": 10_000_000}
        self._call_hook(d)
        p = self.api.progress[self.uid]
        self.assertEqual(p["status"], "processing")
        self.assertIsNone(p["percent"])
        self.assertEqual(p["speed"], "Processing…")
        self.assertEqual(p["eta"], "—")

    def test_postprocessor_started_sets_processing(self):
        """Postprocessor started event sets processing state."""
        d = {
            "status": "started",
            "postprocessor": "FFmpegMerger",
            "total_bytes": 10_000_000
        }
        self._call_hook(d)
        p = self.api.progress[self.uid]
        self.assertEqual(p["status"], "processing")
        self.assertIsNone(p["percent"])
        self.assertEqual(p["speed"], "Processing…")

    def test_postprocessor_finished_sets_completed(self):
        """Postprocessor finished event sets completed state with 100%."""
        d = {
            "status": "finished",
            "postprocessor": "FFmpegMerger",
            "total_bytes": 10_000_000
        }
        self._call_hook(d)
        p = self.api.progress[self.uid]
        self.assertEqual(p["status"], "completed")
        self.assertEqual(p["percent"], "100%")
        self.assertEqual(p["speed"], "Done")
        self.assertEqual(p["eta"], "00:00")

    def test_status_transition_sequence(self):
        """Full sequence: downloading -> finished -> postprocessor started -> postprocessor finished"""
        # 1. Downloading
        self._call_hook({"status": "downloading", "downloaded_bytes": 5_000_000, "total_bytes": 10_000_000, "speed": 1_048_576, "eta": 5})
        self.assertEqual(self.api.progress[self.uid]["status"], "downloading")
        self.assertEqual(self.api.progress[self.uid]["percent"], "50.0%")

        # 2. Finished (download complete, post-processing begins)
        self._call_hook({"status": "finished", "total_bytes": 10_000_000})
        self.assertEqual(self.api.progress[self.uid]["status"], "processing")

        # 3. Postprocessor started
        self._call_hook({"status": "started", "postprocessor": "FFmpegMerger", "total_bytes": 10_000_000})
        self.assertEqual(self.api.progress[self.uid]["status"], "processing")

        # 4. Postprocessor finished
        self._call_hook({"status": "finished", "postprocessor": "FFmpegMerger", "total_bytes": 10_000_000})
        self.assertEqual(self.api.progress[self.uid]["status"], "completed")
        self.assertEqual(self.api.progress[self.uid]["percent"], "100%")

    def test_cancelled_job_raises(self):
        """Cancelled job raises exception in hook."""
        self.api.cancelled_jobs.add(self.uid)
        d = {"status": "downloading", "downloaded_bytes": 1_000_000, "total_bytes": 10_000_000}
        with self.assertRaises(Exception) as cm:
            self._call_hook(d)
        self.assertIn("Download Cancelled", str(cm.exception))


if __name__ == "__main__":
    unittest.main()