# [FL_INDEX: keywords="inspect_beats, stickman_manifest, transcript_dumper, timing_audit, beats_list" | purpose="Dump all 21 beats transcript and parameters to inspect context"]
import json

with open('apps/stickman-studio/data/beats_1793286350067/beats_manifest.json') as f:
    data = json.load(f)

print(f"Total Beats: {len(data['beats'])}, Duration: {data.get('duration')}s")
for i, b in enumerate(data['beats']):
    print(f"[{b['index']:02d}] {b['start']:.2f}s - {b['end']:.2f}s ({b['duration']:.2f}s) | Pose: {b.get('pose')} | Text: {b.get('text')}")
