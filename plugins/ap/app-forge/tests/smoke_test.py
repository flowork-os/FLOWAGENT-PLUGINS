#!/usr/bin/env python3
# =============================================================================
# 🧪 SOVEREIGN APP FORGE — SMOKE TEST & CONTRACT VERIFICATION
# =============================================================================
import os
import sys
import json
import subprocess
import yaml

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def test_manifest_and_contracts():
    manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
    assert os.path.exists(manifest_path), "Missing plugin.manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data.get("id") == "app-forge", "Invalid app id"
    assert isinstance(data.get("entry"), dict), "'entry' must be an object"
    assert data["entry"].get("gui"), "'entry' must define gui"
    assert data["entry"].get("backend"), "'entry' must define backend"
    assert isinstance(data.get("ipc"), dict), "'ipc' must be an object"
    assert data["ipc"].get("port_env"), "'ipc' must define port_env"
    
    gui_file = os.path.join(APP_DIR, data["entry"]["gui"])
    assert os.path.exists(gui_file), f"GUI file missing: {gui_file}"
    backend_file = os.path.join(APP_DIR, data["entry"]["backend"])
    assert os.path.exists(backend_file), f"Backend file missing: {backend_file}"
    
    # Check syntax using bun build
    res = subprocess.run(["bun", "build", backend_file, "--no-bundle", "--target=node"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert res.returncode == 0, f"Backend syntax error: {res.stderr.decode()}"
    
    # Check SKILL.md keywords count (exact 20)
    skill_file = os.path.join(APP_DIR, "SKILL.md")
    assert os.path.exists(skill_file), "Missing SKILL.md"
    with open(skill_file, "r", encoding="utf-8") as f:
        parts = f.read().split("---", 2)
        assert len(parts) >= 3, "Invalid frontmatter in SKILL.md"
        frontmatter = yaml.safe_load(parts[1])
        keywords = frontmatter.get("keywords") or []
        assert len(keywords) == 20, f"SKILL.md must have exactly 20 keywords (Found: {len(keywords)})"
        
    print("✅ App Forge manifest, backend syntax, and SKILL.md contracts verified.")

def main():
    try:
        test_manifest_and_contracts()
        print("✅ App Forge smoke test passed with Exit Code 0.")
        sys.exit(0)
    except AssertionError as e:
        print(f"❌ App Forge test failure: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
