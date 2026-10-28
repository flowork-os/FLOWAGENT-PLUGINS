#!/usr/bin/env python3
# =============================================================================
# ♟️ SOVEREIGN CHESS ARENA — SMOKE TEST & CONTRACT VERIFICATION
# =============================================================================
import os
import sys
import json
import subprocess

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def test_manifest():
    manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
    assert os.path.exists(manifest_path), "Missing plugin.manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data.get("id") == "chess", "Invalid app id"
    assert isinstance(data.get("entry"), dict), "Entry must be a dict"
    assert data["entry"].get("gui"), "Entry must define gui"
    assert data["entry"].get("backend"), "Entry must define backend"
    
    gui_file = os.path.join(APP_DIR, data["entry"]["gui"])
    assert os.path.exists(gui_file), f"GUI file missing: {gui_file}"
    backend_file = os.path.join(APP_DIR, data["entry"]["backend"])
    assert os.path.exists(backend_file), f"Backend file missing: {backend_file}"
    
    # Check syntax using bun build
    res = subprocess.run(["bun", "build", backend_file, "--no-bundle", "--target=node"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert res.returncode == 0, f"Backend syntax error: {res.stderr.decode()}"
    print("✅ Chess manifest and entry points verified.")

def main():
    try:
        test_manifest()
        print("✅ Chess smoke test passed with Exit Code 0.")
        sys.exit(0)
    except AssertionError as e:
        print(f"❌ Chess test failure: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
