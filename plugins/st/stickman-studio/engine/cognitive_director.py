#!/usr/bin/env python3
# [FL_INDEX: keywords="cognitive_director, multimodal_director, scene_choreographer, dual_stickman, dialogue_director" | purpose="Multimodal cognitive director that analyzes video beats and narrative to craft lively dual-character stickman parody scenes"]
"""
Stickman Studio Multimodal Cognitive Director (Dual-Stickman & Dynamic Staging)
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
        'comic_shout': 'MUSIC VIBES',
        'template': "Stickman grooves with rhythmic head-bobbing and neon pulses in sync with the ambient soundscape"
    },
    {
        'category': 'disaster',
        'trigger_words': [
            'bangkrut', 'hancur', 'rusak', 'rugi', 'turun', 'drop', 'minus', 'fail', 'batal',
            'hilang', 'habis', 'terpuruk', 'putus', 'mati', 'down', 'crash', 'bencana', 'terancam'
        ],
        'pose': 'panic_look',
        'emotion': 'surprised',
        'prop': 'chart_down',
        'background': 'speedlines_panic',
        'accent': '#ef4444',
        'camera_shake': 4,
        'comic_shout': 'BANGKRUT TOTAL?!',
        'template': "Host stickman shouts crisis alert as red crashed financial chart spirals down regarding '{snippet}'"
    },
    {
        'category': 'cliffhanger',
        'trigger_words': [
            'tapi ternyata', 'jangan-jangan', 'plot twist', 'shocking', 'rahasia', 'waspada',
            'bahaya', 'jeng jeng', 'unbelievable', 'misteri', 'terbongkar', 'ketahuan', 'gawat',
            'panik', 'waduh', 'oh no', 'secret', 'twist', 'warning', 'matiin kamera', 'nyala',
            'kaget', 'syok', 'shock', 'malamuncul'
        ],
        'pose': 'surprised',
        'emotion': 'surprised',
        'prop': 'alert',
        'background': 'speedlines_panic',
        'accent': '#ef4444',
        'camera_shake': 5,
        'comic_shout': 'PLOT TWIST!!',
        'template': "Both stickmen freeze in sheer shock at the sudden plot twist: '{snippet}'"
    },
    {
        'category': 'shopping_olshop',
        'trigger_words': [
            'shop', 'shopee', 'tokopedia', 'online', 'dijual', 'pasar online', 'beli', 'jualan',
            'baju', 'dagang', 'diskon', 'promo', 'flash sale', 'marketplace', 'ecommerce'
        ],
        'pose': 'shrug',
        'emotion': 'happy',
        'prop': 'shopping_cart',
        'background': 'office_meeting',
        'accent': '#f59e0b',
        'camera_shake': 1,
        'comic_shout': 'FLASH SALE 99%?!',
        'template': "Co-host waves a shopping cart in disbelief comparing hotel liquidation to online clothing sales: '{snippet}'"
    },
    {
        'category': 'tourism_bali',
        'trigger_words': [
            'bali', 'wisata', 'surga', 'pantai', 'hotel', 'villa', 'dunia', 'turis', 'liburan',
            'pulaudewata', 'dewata', 'holiday', 'beach', 'resort', 'travel', 'trip'
        ],
        'pose': 'point',
        'emotion': 'happy',
        'prop': 'sunglasses',
        'background': 'beach_bali',
        'accent': '#00e5ff',
        'camera_shake': 0,
        'comic_shout': 'SURGA WISATA!',
        'template': "Host stickman rocks tropical sunglasses pointing toward paradise beaches: '{snippet}'"
    },
    {
        'category': 'funny',
        'trigger_words': [
            'wkwk', 'haha', 'lucu', 'ngakak', 'ketawa', 'jokes', 'konyol', 'lawak', 'parodi',
            'absurd', 'silly', 'lol', 'lmao', 'rofl', 'hilarious', 'humor', 'prank', 'joke',
            'kocak', 'gokil', 'ngocol', 'aduh'
        ],
        'pose': 'cough_fail',
        'emotion': 'happy',
        'prop': 'coffee',
        'background': 'podcast_studio',
        'accent': '#eab308',
        'camera_shake': 2,
        'comic_shout': 'WKWK KONYOL!',
        'template': "Co-host spits out coffee wheezing in laughter at the ridiculous situation: '{snippet}'"
    },
    {
        'category': 'energetic',
        'trigger_words': [
            'cuan', 'untung', 'kaya', 'profit', 'naik', 'milyar', 'juta', 'sukses', 'menang',
            'sultan', 'gass', 'semangat', 'ayo', 'cepat', 'buru', 'viral', 'fire', 'boom', 'win'
        ],
        'pose': 'celebrate',
        'emotion': 'happy',
        'prop': 'money_bag',
        'background': 'cyber_grid',
        'accent': '#10b981',
        'camera_shake': 2,
        'comic_shout': 'CUAN MELIMPAH?!',
        'template': "Stickman does an electric victory dance holding money bags celebrating '{snippet}'"
    },
    {
        'category': 'question',
        'trigger_words': [
            'kenapa', 'gimana', 'mengapa', 'bagaimana', 'kok', 'apakah', 'siapa', 'dimana',
            'kapan', 'really', 'what', 'how', 'why', 'who', 'seriously', 'bingung', 'penasaran',
            'apaan', 'kok bisa', 'gak ngerti', 'aneh', 'tau gak'
        ],
        'pose': 'shrug',
        'emotion': 'confused',
        'prop': 'question',
        'background': 'podcast_studio',
        'accent': '#f59e0b',
        'camera_shake': 0,
        'comic_shout': 'KOK BISA?!',
        'template': "Stickmen shrug quizzically as oversized question marks bounce around pondering '{snippet}'"
    },
    {
        'category': 'news_evidence',
        'trigger_words': [
            'liat nih', 'lu liat', 'detik', 'cnbc', 'berita', 'koran', 'headline', 'fakta',
            'terbukti', 'bukti', 'oktober', 'media', 'news', 'artikel'
        ],
        'pose': 'point',
        'emotion': 'surprised',
        'prop': 'phone',
        'background': 'podcast_studio',
        'accent': '#38bdf8',
        'camera_shake': 1,
        'comic_shout': 'LIAT BERITANYA!',
        'template': "Host stickman pulls out glowing smartphone showing headline evidence of '{snippet}'"
    }
]


def clean_snippet(text, max_len=45):
    cleaned = re.sub(r'\[.*?\]', '', text).strip()
    cleaned = re.sub(r'\s+', ' ', cleaned)
    if not cleaned:
        cleaned = text.strip()
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len] + '...'
    return cleaned


def direct_storyboard_beats(manifest):
    beats = manifest.get('beats', [])
    total_beats = len(beats)

    # 1. Determine if Dialogue / Two-Character Staging applies
    # A video with conversation, banter, or > 6 seconds benefits heavily from dual stickman staging!
    enable_two_actors = total_beats >= 2

    # Staging variations across beats to guarantee zero monotony
    stagings_cycle = [
        'two_shot_dialogue', 'left_closeup', 'two_shot_dialogue', 'right_closeup', 
        'split_panic', 'beach_shot', 'two_shot_dialogue', 'center_closeup'
    ]

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
            pose = matched_reaction['pose']
            emotion = matched_reaction['emotion']
            prop = matched_reaction['prop']
            background = matched_reaction['background']
            accent = matched_reaction['accent']
            camera_shake = matched_reaction['camera_shake']
            comic_shout = matched_reaction.get('comic_shout', 'HEBOH!')
        else:
            fallbacks = [
                {'pose': 'talk', 'emotion': 'neutral', 'prop': 'megaphone', 'background': 'podcast_studio', 'accent': '#00e5ff', 'action': 'lays down the premise of', 'shout': 'HOT NEWS!'},
                {'pose': 'point', 'emotion': 'surprised', 'prop': 'phone', 'background': 'office_meeting', 'accent': '#38bdf8', 'action': 'points out headline details of', 'shout': 'LIAT NIH!'},
                {'pose': 'think', 'emotion': 'happy', 'prop': 'brain', 'background': 'beach_bali', 'accent': '#a855f7', 'action': 'analyzes the economic impact of', 'shout': 'MIKIR KERAS!'},
                {'pose': 'shrug', 'emotion': 'confused', 'prop': 'coffee', 'background': 'podcast_studio', 'accent': '#f59e0b', 'action': 'reacts with disbelief to', 'shout': 'SERIUSAN?!'},
                {'pose': 'celebrate', 'emotion': 'happy', 'prop': 'money_bag', 'background': 'cyber_grid', 'accent': '#10b981', 'action': 'delivers a punchline about', 'shout': 'GOKIL ABIS!'}
            ]
            fb = fallbacks[idx % len(fallbacks)]
            pose = fb['pose']
            emotion = fb['emotion']
            prop = fb['prop']
            background = fb['background']
            accent = fb['accent']
            camera_shake = 0
            comic_shout = fb['shout']
            parody_idea = f"Host and Guest react with expressive comic timing to '{snippet}'"

        # Staging assignment: alternates every beat
        staging = stagings_cycle[idx % len(stagings_cycle)]

        # Determine speaker turn: Host speaks on even/narrative beats, Guest reacts/speaks on response beats
        is_guest_speaking = (idx % 3 == 2) or ('udah kayak' in t_clean or 'aduh' in t_clean or 'shopee' in t_clean)

        # Build Dual Actor Specification
        actor_1 = {
            'label': 'HOST',
            'x': 210,
            'speaking': not is_guest_speaking,
            'action': pose if not is_guest_speaking else 'listen',
            'prop': prop if not is_guest_speaking else 'coffee',
            'emotion': emotion if not is_guest_speaking else 'neutral',
            'accent_color': [255, 230, 0], # Cyan / Gold aura
            'comic_shout': comic_shout if not is_guest_speaking else None,
            'scale': 1.05 if not is_guest_speaking else 0.95
        }

        actor_2 = {
            'label': 'CO-HOST',
            'x': 510,
            'speaking': is_guest_speaking,
            'action': pose if is_guest_speaking else ('surprised' if camera_shake > 0 else 'listen'),
            'prop': prop if is_guest_speaking else 'question',
            'emotion': emotion if is_guest_speaking else 'confused',
            'accent_color': [247, 85, 168], # Magenta / Purple aura
            'comic_shout': comic_shout if is_guest_speaking else None,
            'scale': 1.05 if is_guest_speaking else 0.95
        }

        directed_beat = dict(beat)
        directed_beat.update({
            'model': 'classic',
            'pose': pose,
            'emotion': emotion,
            'prop': prop,
            'background': background,
            'accent': accent,
            'camera_shake': camera_shake,
            'staging': staging,
            'comic_shout': comic_shout,
            'dual_character': enable_two_actors,
            'actors': [actor_1, actor_2] if enable_two_actors else [actor_1],
            'parody_idea': parody_idea,
            'title': f"Beat #{beat.get('beat_id') or beat.get('index') or beat.get('id', idx + 1)} ({beat.get('start', 0)}s - {beat.get('end', 0)}s)"
        })
        directed_beats.append(directed_beat)

    manifest['beats'] = directed_beats
    manifest['directed'] = True
    manifest['dual_character_enabled'] = enable_two_actors
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
