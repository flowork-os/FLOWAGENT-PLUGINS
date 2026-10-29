#!/usr/bin/env python3
# [FL_INDEX: keywords="cognitive_director, multimodal_director, scene_choreographer, emotion_mapping, stickman_parody" | purpose="Multimodal cognitive director that analyzes video beats and narrative to craft high-conversion stickman parody scenes"]
"""
Stickman Studio Multimodal Cognitive Director
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import re

POSE_REACTIONS = [
    {
        'trigger_words': ['hancur', 'rusak', 'bangkrut', 'rugi', 'turun', 'drop', 'minus', 'fail', 'batal', 'hilang', 'habis', 'terpuruk'],
        'pose': 'panic_look',
        'emotion': 'surprised',
        'prop': 'chart_down',
        'background': 'speedlines_panic',
        'accent': '#ef4444',
        'camera_shake': 4,
        'parody_idea': 'Stickman looks at portfolio in horror with sweat drops flying and red chart crashing down'
    },
    {
        'trigger_words': ['cuan', 'untung', 'kaya', 'profit', 'naik', 'milyar', 'juta', 'sukses', 'menang', 'kaya raya', 'sultan'],
        'pose': 'celebrate',
        'emotion': 'happy',
        'prop': 'money_bag',
        'background': 'cyber_grid',
        'accent': '#10b981',
        'camera_shake': 0,
        'parody_idea': 'Stickman does victory dance under floating bags of money and cyber neon grid'
    },
    {
        'trigger_words': ['kenapa', 'gimana', 'bingung', 'maksudnya', 'what', 'why', 'how', 'apaan', 'kok bisa', 'gak ngerti', 'aneh'],
        'pose': 'shrug',
        'emotion': 'confused',
        'prop': 'question',
        'background': 'office_meeting',
        'accent': '#f59e0b',
        'camera_shake': 0,
        'parody_idea': 'Stickman shrugs with oversized question marks popping above head'
    },
    {
        'trigger_words': ['ide', 'pikir', 'rencananya', 'solusi', 'trik', 'rahasia', 'strategi', 'concept', 'rumus', 'otak'],
        'pose': 'think',
        'emotion': 'happy',
        'prop': 'brain',
        'background': 'podcast_studio',
        'accent': '#00e5ff',
        'camera_shake': 0,
        'parody_idea': 'Stickman taps chin with glowing neural brain pulsing above head'
    },
    {
        'trigger_words': ['marah', 'gila', 'kacau', 'kesel', 'ngamuk', 'ribut', 'bodoh', 'hate', 'emosi', 'kecewa', 'parah'],
        'pose': 'angry',
        'emotion': 'angry',
        'prop': 'alert',
        'background': 'speedlines_panic',
        'accent': '#f43f5e',
        'camera_shake': 5,
        'parody_idea': 'Stickman slams fists with cartoon lightning and pulsing red warning siren'
    },
    {
        'trigger_words': ['dia bilang', 'katanya', 'menurutku', 'saya rasa', 'dengerin', 'kamu harus', 'ingat ya', 'pesanku'],
        'pose': 'point',
        'emotion': 'neutral',
        'prop': 'megaphone',
        'background': 'podcast_studio',
        'accent': '#00e5ff',
        'camera_shake': 0,
        'parody_idea': 'Stickman leans forward aggressively pointing finger through a giant megaphone'
    },
    {
        'trigger_words': ['wkwk', 'haha', 'lucu', 'ngakak', 'ketawa', 'jokes', 'konyol', 'lawak', 'parodi'],
        'pose': 'cough_fail',
        'emotion': 'happy',
        'prop': 'eyes',
        'background': 'podcast_studio',
        'accent': '#eab308',
        'camera_shake': 2,
        'parody_idea': 'Stickman doubles over with cartoon tears streaming from eyes'
    },
    {
        'trigger_words': ['rapat', 'kantor', 'meeting', 'zoom', 'kerja', 'bos', 'klien', 'proyek', 'deadline'],
        'pose': 'talk',
        'emotion': 'neutral',
        'prop': 'clock',
        'background': 'office_meeting',
        'accent': '#38bdf8',
        'camera_shake': 0,
        'parody_idea': 'Stickman gestures at formal boardroom desk with ticking clock'
    },
    {
        'trigger_words': ['kopi', 'santai', 'nongkrong', 'kafe', 'istirahat', 'chill', 'tenang'],
        'pose': 'rest',
        'emotion': 'happy',
        'prop': 'coffee',
        'background': 'living_room',
        'accent': '#d97706',
        'camera_shake': 0,
        'parody_idea': 'Stickman kicks feet up while sipping hot steam from a giant mug'
    },
    {
        'trigger_words': ['lawan', 'tinju', 'tarung', 'duel', 'hajar', 'fight', 'debat', 'adu'],
        'pose': 'run',
        'emotion': 'angry',
        'prop': 'boxing_glove',
        'background': 'courtroom',
        'accent': '#ef4444',
        'camera_shake': 3,
        'parody_idea': 'Stickman winds up with oversized red boxing glove ready to strike'
    }
]


def direct_storyboard_beats(manifest):
    beats = manifest.get('beats', [])
    total_beats = len(beats)

    directed_beats = []
    for idx, beat in enumerate(beats):
        text = beat.get('text', '')
        t_clean = text.lower()

        matched_reaction = None
        for r in POSE_REACTIONS:
            if any(re.search(r'\b' + re.escape(w) + r'\b', t_clean) for w in r['trigger_words']):
                matched_reaction = r
                break

        if not matched_reaction:
            # Rhythmically cycle through conversational archetypes
            fallbacks = [
                {'pose': 'talk', 'emotion': 'neutral', 'prop': 'bulb', 'background': 'podcast_studio', 'accent': '#00e5ff', 'idea': 'Speaker lays down opening premise with animated lightbulb'},
                {'pose': 'point', 'emotion': 'neutral', 'prop': 'target', 'background': 'office_meeting', 'accent': '#38bdf8', 'idea': 'Speaker underscores core focal point'},
                {'pose': 'think', 'emotion': 'happy', 'prop': 'brain', 'background': 'podcast_studio', 'accent': '#a855f7', 'idea': 'Speaker poses deep reflective question'},
                {'pose': 'shrug', 'emotion': 'confused', 'prop': 'phone', 'background': 'office_meeting', 'accent': '#f59e0b', 'idea': 'Speaker reacts to external message/callout'},
                {'pose': 'celebrate', 'emotion': 'happy', 'prop': 'money_bag', 'background': 'cyber_grid', 'accent': '#10b981', 'idea': 'Speaker delivers punchy takeaway conclusion'}
            ]
            matched_reaction = fallbacks[idx % len(fallbacks)]
            matched_reaction['camera_shake'] = 0
            matched_reaction['parody_idea'] = matched_reaction['idea']

        # Construct enriched beat
        directed_beat = dict(beat)
        directed_beat.update({
            'model': beat.get('model', 'classic'),
            'pose': matched_reaction['pose'],
            'emotion': matched_reaction['emotion'],
            'prop': matched_reaction['prop'],
            'background': matched_reaction['background'],
            'accent': matched_reaction['accent'],
            'camera_shake': matched_reaction.get('camera_shake', 0),
            'parody_idea': matched_reaction['parody_idea'],
            'title': f"Beat #{beat.get('beat_id') or beat.get('index') or beat.get('id', idx + 1)} ({beat.get('start', 0)}s - {beat.get('end', 0)}s)"
        })
        directed_beats.append(directed_beat)

    manifest['beats'] = directed_beats
    manifest['directed'] = True
    return manifest


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: cognitive_director.py <manifest_json_file>'}))
        sys.exit(1)

    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = json.load(f)

    res = direct_storyboard_beats(data)
    with open(sys.argv[1], 'w', encoding='utf-8') as f:
        json.dump(res, f, indent=2)

    print(json.dumps({'success': True, 'total_beats': len(res.get('beats', []))}, indent=2))
    sys.exit(0)
