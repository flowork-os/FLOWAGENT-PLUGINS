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
        'category': 'music_ambience',
        'trigger_words': ['[music', 'ambience', 'soundtrack', 'instrumental', 'ambient'],
        'pose': 'listen',
        'emotion': 'happy',
        'prop': 'heart',
        'background': 'cyber_grid',
        'accent': '#a855f7',
        'camera_shake': 0,
        'template': "Stickman grooves with rhythmic head-bobbing and neon pulses in sync with the ambient soundscape"
    },
    {
        'category': 'cliffhanger',
        'trigger_words': [
            'tapi ternyata', 'jangan-jangan', 'plot twist', 'shocking', 'rahasia', 'waspada',
            'bahaya', 'jeng jeng', 'unbelievable', 'misteri', 'terbongkar', 'ketahuan', 'gawat',
            'panik', 'waduh', 'oh no', 'secret', 'twist', 'warning', 'matiin kamera', 'nyala',
            'ketangkap', 'kamera nyala', 'kaget', 'syok', 'shock'
        ],
        'pose': 'panic_look',
        'emotion': 'surprised',
        'prop': 'alert',
        'background': 'speedlines_panic',
        'accent': '#ef4444',
        'camera_shake': 5,
        'template': "Stickman freezes in sheer panic as red warning beacons spin and screen vibrates violently at the sudden twist: '{snippet}'"
    },
    {
        'category': 'funny',
        'trigger_words': [
            'wkwk', 'haha', 'lucu', 'ngakak', 'ketawa', 'jokes', 'konyol', 'lawak', 'parodi',
            'absurd', 'silly', 'lol', 'lmao', 'rofl', 'hilarious', 'humor', 'prank', 'joke',
            'meme', 'kocak', 'gokil', 'ngocol', 'asem bener', 'malu'
        ],
        'pose': 'cough_fail',
        'emotion': 'happy',
        'prop': 'eyes',
        'background': 'podcast_studio',
        'accent': '#eab308',
        'camera_shake': 2,
        'template': "Stickman doubles over wheezing with tears streaming from bulging cartoon eyes reacting to '{snippet}'"
    },
    {
        'category': 'energetic',
        'trigger_words': [
            'cuan', 'untung', 'kaya', 'profit', 'naik', 'milyar', 'juta', 'sukses', 'menang',
            'kaya raya', 'sultan', 'gass', 'semangat', 'ayo', 'cepat', 'buru', 'viral',
            'let\'s go', 'fire', 'boom', 'win', 'juara', 'champion', 'best', 'mantap', 'keren'
        ],
        'pose': 'celebrate',
        'emotion': 'happy',
        'prop': 'money_bag',
        'background': 'cyber_grid',
        'accent': '#10b981',
        'camera_shake': 2,
        'template': "Stickman does an electric victory hype dance under flying money bags and cyber neon grid celebrating '{snippet}'"
    },
    {
        'category': 'storytelling',
        'trigger_words': [
            'ceritanya', 'suatu hari', 'dulu', 'kemarin', 'waktu itu', 'awalnya', 'tiba-tiba',
            'pengalaman', 'kisah', 'ingat', 'flashback', 'jadi begini', 'once upon', 'remember',
            'back then', 'happened', 'story', 'journey', 'kejadian', 'seumur hidup', 'cerita'
        ],
        'pose': 'point',
        'emotion': 'neutral',
        'prop': 'book',
        'background': 'living_room',
        'accent': '#38bdf8',
        'camera_shake': 0,
        'template': "Stickman dramatically opens an ancient storybook illustrating the narrative flashback of '{snippet}'"
    },
    {
        'category': 'technical',
        'trigger_words': [
            'server', 'coding', 'code', 'python', 'javascript', 'database', 'ai', 'prompt',
            'model', 'bug', 'error', 'sistem', 'arsitektur', 'deploy', 'api', 'flowork',
            'cloud', 'data', 'teknis', 'laptop', 'komputer', 'software', 'tech', 'algorithm',
            'pipeline', 'wi -fi', 'wifi', 'kabel', 'colokan', 'internet'
        ],
        'pose': 'think',
        'emotion': 'happy',
        'prop': 'brain',
        'background': 'cyber_grid',
        'accent': '#00e5ff',
        'camera_shake': 0,
        'template': "Stickman's brain surges with neon neural circuitry furiously decoding the technical puzzle of '{snippet}'"
    },
    {
        'category': 'question',
        'trigger_words': [
            'kenapa', 'gimana', 'mengapa', 'bagaimana', 'kok', 'apakah', 'siapa', 'dimana',
            'kapan', 'really', 'what', 'how', 'why', 'who', 'seriously', 'bingung', 'penasaran',
            'maksudnya', 'apaan', 'kok bisa', 'gak ngerti', 'aneh', 'tau gak', 'pernah ga', 'apa'
        ],
        'pose': 'shrug',
        'emotion': 'confused',
        'prop': 'question',
        'background': 'office_meeting',
        'accent': '#f59e0b',
        'camera_shake': 0,
        'template': "Stickman shrugs quizzically as oversized question marks bounce around pondering '{snippet}'"
    },
    {
        'category': 'disaster',
        'trigger_words': [
            'hancur', 'rusak', 'bangkrut', 'rugi', 'turun', 'drop', 'minus', 'fail', 'batal',
            'hilang', 'habis', 'terpuruk', 'putus', 'mati', 'down', 'crash', 'bencana'
        ],
        'pose': 'panic_look',
        'emotion': 'surprised',
        'prop': 'chart_down',
        'background': 'speedlines_panic',
        'accent': '#ef4444',
        'camera_shake': 4,
        'template': "Stickman stares in utter horror as a red financial chart crashes into a downward spiral regarding '{snippet}'"
    },
    {
        'category': 'angry',
        'trigger_words': [
            'marah', 'gila', 'kacau', 'kesel', 'ngamuk', 'ribut', 'bodoh', 'hate', 'emosi',
            'kecewa', 'parah', 'lawan', 'tinju', 'tarung', 'duel', 'hajar', 'fight', 'debat',
            'adu', 'benci', 'toxic', 'nyebelin', 'agresif'
        ],
        'pose': 'angry',
        'emotion': 'angry',
        'prop': 'boxing_glove',
        'background': 'speedlines_panic',
        'accent': '#f43f5e',
        'camera_shake': 4,
        'template': "Stickman slams cartoon boxing gloves with lightning flashing over '{snippet}'"
    },
    {
        'category': 'office',
        'trigger_words': [
            'rapat', 'kantor', 'meeting', 'zoom', 'kerja', 'bos', 'klien', 'proyek', 'deadline',
            'target', 'masuk kantor', 'presentasi', 'corporate', 'lembur', 'meja', 'dus'
        ],
        'pose': 'talk',
        'emotion': 'neutral',
        'prop': 'clock',
        'background': 'office_meeting',
        'accent': '#38bdf8',
        'camera_shake': 0,
        'template': "Stickman gestures across the formal boardroom whiteboard racing against the clock for '{snippet}'"
    },
    {
        'category': 'chill',
        'trigger_words': [
            'kopi', 'santai', 'nongkrong', 'kafe', 'istirahat', 'chill', 'tenang', 'ngopi',
            'relax', 'weekend', 'makan', 'mie instan', 'dusmi'
        ],
        'pose': 'rest',
        'emotion': 'happy',
        'prop': 'coffee',
        'background': 'living_room',
        'accent': '#d97706',
        'camera_shake': 0,
        'template': "Stickman kicks feet up sipping a steaming beverage while casually reflecting on '{snippet}'"
    }
]


def clean_snippet(text, max_len=45):
    """Clean text snippet for human-readable parody prompts."""
    cleaned = re.sub(r'\[.*?\]', '', text).strip()
    if not cleaned:
        cleaned = text.strip()
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len] + '...'
    return cleaned


def direct_storyboard_beats(manifest):
    beats = manifest.get('beats', [])
    has_video = manifest.get('has_video', False)
    total_beats = len(beats)

    directed_beats = []
    for idx, beat in enumerate(beats):
        text = beat.get('text', '')
        t_clean = text.lower()
        snippet = clean_snippet(text)

        matched_reaction = None
        for r in POSE_REACTIONS:
            for w in r['trigger_words']:
                if ' ' in w or '[' in w:
                    if w in t_clean:
                        matched_reaction = r
                        break
                else:
                    if re.search(r'\b' + re.escape(w) + r'\b', t_clean):
                        matched_reaction = r
                        break
            if matched_reaction:
                break

        if matched_reaction:
            parody_idea = matched_reaction['template'].format(snippet=snippet)
            if has_video and matched_reaction['category'] not in ['music_ambience']:
                parody_idea = f"In top/bottom split parody, {parody_idea}"
            pose = matched_reaction['pose']
            emotion = matched_reaction['emotion']
            prop = matched_reaction['prop']
            background = matched_reaction['background']
            accent = matched_reaction['accent']
            camera_shake = matched_reaction['camera_shake']
        else:
            # Rhythmically cycle through expressive conversational archetypes with dialogue context
            fallbacks = [
                {'pose': 'talk', 'emotion': 'neutral', 'prop': 'bulb', 'background': 'podcast_studio', 'accent': '#00e5ff', 'action': 'lays down the premise of'},
                {'pose': 'point', 'emotion': 'neutral', 'prop': 'target', 'background': 'office_meeting', 'accent': '#38bdf8', 'action': 'underscores the key takeaway of'},
                {'pose': 'think', 'emotion': 'happy', 'prop': 'brain', 'background': 'podcast_studio', 'accent': '#a855f7', 'action': 'ponders the implications of'},
                {'pose': 'shrug', 'emotion': 'confused', 'prop': 'phone', 'background': 'office_meeting', 'accent': '#f59e0b', 'action': 'reacts with candid humor to'},
                {'pose': 'celebrate', 'emotion': 'happy', 'prop': 'money_bag', 'background': 'cyber_grid', 'accent': '#10b981', 'action': 'delivers a high-energy punchline about'}
            ]
            fb = fallbacks[idx % len(fallbacks)]
            pose = fb['pose']
            emotion = fb['emotion']
            prop = fb['prop']
            background = fb['background']
            accent = fb['accent']
            camera_shake = 0
            prefix = "In top/bottom split parody, " if has_video else ""
            parody_idea = f"{prefix}Stickman {fb['action']} '{snippet}' with expressive comic timing"

        # Construct enriched beat
        directed_beat = dict(beat)
        directed_beat.update({
            'model': beat.get('model', 'classic'),
            'pose': pose,
            'emotion': emotion,
            'prop': prop,
            'background': background,
            'accent': accent,
            'camera_shake': camera_shake,
            'parody_idea': parody_idea,
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
