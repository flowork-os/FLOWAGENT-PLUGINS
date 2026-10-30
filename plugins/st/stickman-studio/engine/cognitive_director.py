#!/usr/bin/env python3
# [FL_INDEX: keywords="cognitive_director, multimodal_director, scene_choreographer, dual_stickman, dialogue_director, semantic_ai, context_parody, props_rigging, medical_director, consistent_staging" | purpose="Multimodal cognitive director that analyzes video beats and narrative to craft lively, coherent dual-character stickman parody scenes"]
"""
Stickman Studio Multimodal Cognitive Director (Context-Aware Staging & Dynamic Parody)
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import re


POSE_REACTIONS = [
    # --- MUSIC & SONG LYRIC DRAMATIC NARRATIVE ACTING ---
    {
        'category': 'music_crying',
        'trigger_words': ['menangis', 'tangis', 'air mata', 'menetes', 'terisak', 'cried', 'tears', 'crying', 'weep', 'sakit hati', 'hancur hatiku'],
        'pose': 'kneel_crying',
        'emotion': 'sad',
        'prop': 'broken_heart',
        'background': 'raining_street',
        'accent': '#38bdf8',
        'camera_shake': 1,
        'comic_shout': 'MENANGIS...',
        'template': "Sticky breaks down crying in the rain overwhelmed by heartbreak: '{snippet}'"
    },
    {
        'category': 'music_photo_memory',
        'trigger_words': ['foto', 'potret', 'kenangan', 'bayangmu', 'memori', 'teringat', 'wajahmu', 'photograph', 'remember', 'memories', 'masa lalu'],
        'pose': 'holding_photo',
        'emotion': 'sad',
        'prop': 'photo_frame',
        'background': 'bedroom_night',
        'accent': '#c084fc',
        'camera_shake': 0,
        'comic_shout': 'KENANGAN KITA',
        'template': "Sticky clutches an old photo close to his heart reminiscing '{snippet}'"
    },
    {
        'category': 'music_reaching_void',
        'trigger_words': ['pergi', 'tinggalkan', 'jangan pergi', 'ku mohon', 'meraih', 'kembali', 'pulanglah', 'stay', 'leave', 'goodbye', 'fading', 'tinggalkanku'],
        'pose': 'reaching_out',
        'emotion': 'sad',
        'prop': 'fading_silhouette',
        'background': 'dream_void',
        'accent': '#818cf8',
        'camera_shake': 2,
        'comic_shout': 'JANGAN PERGI!',
        'template': "Sticky desperately reaches out into empty space pleading '{snippet}'"
    },
    {
        'category': 'music_rain_cold',
        'trigger_words': ['hujan', 'gerimis', 'basah', 'dingin', 'malam dingin', 'payung', 'rain', 'storm', 'cold night', 'kedinginan'],
        'pose': 'walking_cold',
        'emotion': 'sad',
        'prop': 'umbrella',
        'background': 'raining_street',
        'accent': '#38bdf8',
        'camera_shake': 1,
        'comic_shout': 'MALAM HUJAN',
        'template': "Sticky walks hunched alone through cold falling rain: '{snippet}'"
    },
    {
        'category': 'music_running_chase',
        'trigger_words': ['kejar', 'mengejar', 'lari', 'mencari', 'temukanmu', 'chasing', 'running after', 'find you', 'berlari kencang'],
        'pose': 'running_chase',
        'emotion': 'surprised',
        'prop': 'speedlines',
        'background': 'motion_street',
        'accent': '#f59e0b',
        'camera_shake': 3,
        'comic_shout': 'MENGEJAR!',
        'template': "Sticky sprints frantically down the street chasing after '{snippet}'"
    },
    {
        'category': 'music_watching_betrayal',
        'trigger_words': ['kau dengannya', 'dia bersamamu', 'melihatmu bersamanya', 'bahagia dengannya', 'with someone else', 'replaced', 'duaan', 'pelukanmu dengannya'],
        'pose': 'peeking_heartbreak',
        'emotion': 'sad',
        'prop': 'couple_silhouette',
        'background': 'park_bench',
        'accent': '#ef4444',
        'camera_shake': 2,
        'comic_shout': 'BERSAMANYA...',
        'template': "Sticky watches from shadows as his love walks with someone else: '{snippet}'"
    },
    {
        'category': 'music_cafe_reflecting',
        'trigger_words': ['kopi', 'kafe', 'secangkir', 'duduk sendiri', 'menunggu', 'cafe', 'coffee cup', 'solitude', 'meja kafe'],
        'pose': 'cafe_reflecting',
        'emotion': 'neutral',
        'prop': 'coffee_steam',
        'background': 'cafe_interior',
        'accent': '#fbbf24',
        'camera_shake': 0,
        'comic_shout': 'MENUNGGU...',
        'template': "Sticky sits alone in a quiet cafe staring into steaming coffee: '{snippet}'"
    },
    {
        'category': 'music_heartbreak_clutch',
        'trigger_words': ['sesak', 'dada', 'perih', 'menusuk', 'remuk', 'terluka', 'chest hurts', 'bleeding heart', 'hancur dadaku'],
        'pose': 'heartbreak_clutch',
        'emotion': 'sad',
        'prop': 'broken_heart',
        'background': 'speedlines_panic',
        'accent': '#ef4444',
        'camera_shake': 3,
        'comic_shout': 'SESAK DADA!',
        'template': "Sticky clutches his chest stumbling in intense emotional ache: '{snippet}'"
    },
    {
        'category': 'music_rooftop_stargazing',
        'trigger_words': ['bintang', 'langit', 'rembulan', 'malam berbintang', 'stars', 'night sky', 'moonlight', 'menatap langit', 'waktu malam'],
        'pose': 'stargazing_rooftop',
        'emotion': 'neutral',
        'prop': 'shooting_star',
        'background': 'rooftop_stars',
        'accent': '#a78bfa',
        'camera_shake': 0,
        'comic_shout': 'DI BAWAH BINTANG',
        'template': "Sticky gazes upward at the starry night sky wishing upon a star: '{snippet}'"
    },
    {
        'category': 'music_peaceful_sunrise',
        'trigger_words': ['ikhlas', 'merelakan', 'bangkit', 'esok hari', 'mentari', 'fajar', 'tersenyum', 'sunrise', 'new dawn', 'peace', 'bahagia lagi', 'terang'],
        'pose': 'peaceful_sunrise',
        'emotion': 'happy',
        'prop': 'sunrise_rays',
        'background': 'sunrise_hill',
        'accent': '#fbbf24',
        'camera_shake': 0,
        'comic_shout': 'MENYAMBUT FAJAR!',
        'template': "Sticky stands tall smiling serenely into the golden sunrise: '{snippet}'"
    },
    {
        'category': 'medical_dna',
        'trigger_words': ['dna', 'replikasi', 'genetik', 'molekul', 'rantai', 'biologi', 'double helix'],
        'pose': 'point',
        'emotion': 'happy',
        'prop': 'dna',
        'background': 'medical_lab',
        'accent': '#00e5ff',
        'camera_shake': 1,
        'comic_shout': 'REPLIKASI DNA!',
        'template': "Host demonstrates interactive 3D DNA replication model with glowing base pairs for '{snippet}'"
    },
    {
        'category': 'medical_bones',
        'trigger_words': ['tulang', '206', '266', 'flashcard', 'muhafal', 'menghafal', 'hafal', 'rangka', 'situlang', 'si tulang', 'anatomi', 'skeleton'],
        'pose': 'think',
        'emotion': 'surprised',
        'prop': 'bone',
        'background': 'medical_lab',
        'accent': '#38bdf8',
        'camera_shake': 2,
        'comic_shout': '206 TULANG?!',
        'template': "Si Tulang holds anatomy flashcards as student stickman drills 206 human bones: '{snippet}'"
    },
    {
        'category': 'medical_quiz',
        'trigger_words': ['kuis', 'kuislatahan', 'latihan', 'ujian', 'tes', 'menguji', 'pemahaman', 'skor', 'lulus', 'tryout', 'quiz'],
        'pose': 'celebrate',
        'emotion': 'happy',
        'prop': 'quiz',
        'background': 'medical_lab',
        'accent': '#10b981',
        'camera_shake': 2,
        'comic_shout': 'KUIS LATIHAN!',
        'template': "Host and Si Tulang ace the practice exam with 100% checkmarks testing '{snippet}'"
    },
    {
        'category': 'ai_gemini_study',
        'trigger_words': ['gemini', 'ai', 'tiga cara', '3 cara', 'cara gemini', 'bantu', 'membantu', 'doktoran', 'kedokteran', 'praktek', 'intraktif', 'interaktif', 'fitur'],
        'pose': 'talk',
        'emotion': 'happy',
        'prop': 'brain',
        'background': 'medical_lab',
        'accent': '#a855f7',
        'camera_shake': 0,
        'comic_shout': '3 CARA GEMINI!',
        'template': "Host breaks down 3 breakthrough AI study workflows helping in medical education: '{snippet}'"
    },
    {
        'category': 'call_to_action',
        'trigger_words': ['daftar sekarang', 'daftar', 'sekarang', 'link', 'klik', 'join', 'unduh', 'download', 'coba gratis'],
        'pose': 'point',
        'emotion': 'happy',
        'prop': 'phone',
        'background': 'medical_lab',
        'accent': '#00e5ff',
        'camera_shake': 1,
        'comic_shout': 'DAFTAR SEKARANG!',
        'template': "Both stickmen point to the screen encouraging viewers: '{snippet}'"
    },
    {
        'category': 'music_ambience',
        'trigger_words': ['[music', 'ambience', 'soundtrack', 'instrumental', 'ambient'],
        'pose': 'listen',
        'emotion': 'happy',
        'prop': 'brain',
        'background': 'podcast_studio',
        'accent': '#a855f7',
        'camera_shake': 0,
        'comic_shout': 'MUSIC VIBES',
        'template': "Stickman grooves with rhythmic head-bobbing in sync with the ambient soundscape"
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
        'comic_shout': 'CRASH PARAH?!',
        'template': "Crisis alert as financial chart spirals down regarding '{snippet}'"
    },
    {
        'category': 'cliffhanger',
        'trigger_words': [
            'tapi ternyata', 'jangan-jangan', 'plot twist', 'shocking', 'rahasia', 'waspada',
            'bahaya', 'jeng jeng', 'unbelievable', 'misteri', 'terbongkar', 'ketahuan', 'gawat',
            'panik', 'waduh', 'oh no', 'secret', 'twist', 'warning', 'kaget', 'syok', 'shock'
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
        'template': "Co-host waves shopping cart comparing deals: '{snippet}'"
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
        'template': "Co-host spits out coffee wheezing in laughter: '{snippet}'"
    },
    {
        'category': 'energetic',
        'trigger_words': [
            'cuan', 'untung', 'kaya', 'profit', 'naik', 'milyar', 'juta', 'sukses', 'menang',
            'sultan', 'gass', 'semangat', 'ayo', 'cepat', 'buru', 'viral', 'fire', 'boom', 'win'
        ],
        'pose': 'celebrate',
        'emotion': 'happy',
        'prop': 'chart_up',
        'background': 'cyber_grid',
        'accent': '#10b981',
        'camera_shake': 2,
        'comic_shout': 'CUAN MELIMPAH?!',
        'template': "Stickman does a victory dance celebrating '{snippet}'"
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
        'template': "Stickmen shrug quizzically pondering '{snippet}'"
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


def extract_punchy_shout(text, default="IKUTI INI!"):
    """Extracts a short, relevant punchy comic shout from the actual spoken words."""
    words = re.findall(r'[a-zA-Z0-9]+', text)
    if not words:
        return default
    # Filter stopwords
    stops = {'ini', 'dan', 'di', 'ke', 'dari', 'yang', 'untuk', 'pada', 'saya', 'dia', 'kamu', 'aku', 'adalah', 'dengan', 'juga', 'akan', 'bisa'}
    meaningful = [w.upper() for w in words if w.lower() not in stops and len(w) > 2]
    if len(meaningful) >= 2:
        return f"{meaningful[0]} {meaningful[1]}!"
    elif len(meaningful) == 1:
        return f"{meaningful[0]}!"
    else:
        return f"{words[0].upper()}!"


def detect_video_domain(all_text, staging_style=None):
    """Detects global narrative domain to guarantee consistent visual world and characters."""
    t = all_text.lower()
    
    music_words = [
        'lirik', 'lagu', 'nyanyi', 'musik', 'cover', 'nada', 'melodi', 'vokal', 'sing',
        'song', 'singing', 'acoustic', 'reff', 'chorus', 'verse', 'cinta', 'rindu',
        'hati', 'menangis', 'sayang', 'galau', 'kenangan', 'kekasih', 'bayangmu'
    ]
    if (staging_style == 'music_narrative_story') or any(w in t for w in music_words):
        return {
            'theme': 'music_narrative_story',
            'default_bg': 'raining_street',
            'actor1_label': 'STICKY',
            'actor2_label': 'FADING MEMORY',
            'actor2_is_silhouette': True,
            'actor2_is_skeleton': False,
            'fallback_props': ['broken_heart', 'photo_frame', 'umbrella', 'fading_silhouette', 'coffee_steam', 'sunrise_rays']
        }

    medical_words = ['doktoran', 'kedokteran', 'dokter', 'dna', 'tulang', 'medis', 'anatomi', 'flashcard', 'replikasi', 'situlang', 'gemini']
    if any(w in t for w in medical_words):
        return {
            'theme': 'medical_ai',
            'default_bg': 'medical_lab',
            'actor1_label': 'MAHASISWA',
            'actor2_label': 'SI TULANG',
            'actor2_is_skeleton': True,
            'actor2_is_silhouette': False,
            'fallback_props': ['brain', 'dna', 'bone', 'quiz', 'phone']
        }
    
    tourism_words = ['bali', 'wisata', 'pantai', 'dewata', 'turis', 'liburan', 'hotel', 'villa']
    if any(w in t for w in tourism_words):
        return {
            'theme': 'tourism_bali',
            'default_bg': 'beach_bali',
            'actor1_label': 'HOST',
            'actor2_label': 'CO-HOST',
            'actor2_is_skeleton': False,
            'actor2_is_silhouette': False,
            'fallback_props': ['sunglasses', 'phone', 'coffee', 'megaphone']
        }

    finance_words = ['saham', 'trading', 'cuan', 'investasi', 'rupiah', 'dolar', 'profit', 'rugi', 'bangkrut', 'crypto']
    if any(w in t for w in finance_words):
        return {
            'theme': 'finance_crypto',
            'default_bg': 'office_meeting',
            'actor1_label': 'TRADER',
            'actor2_label': 'ANALYST',
            'actor2_is_skeleton': False,
            'actor2_is_silhouette': False,
            'fallback_props': ['chart_up', 'chart_down', 'phone', 'money_bag', 'coffee']
        }

    return {
        'theme': 'creator_talk',
        'default_bg': 'podcast_studio',
        'actor1_label': 'HOST',
        'actor2_label': 'CO-HOST',
        'actor2_is_skeleton': False,
        'actor2_is_silhouette': False,
        'fallback_props': ['bulb', 'phone', 'coffee', 'brain', 'megaphone']
    }


def direct_storyboard_beats(manifest):
    beats = manifest.get('beats', [])
    total_beats = len(beats)

    # 1. Global Narrative Domain & World Establishment
    staging_style = manifest.get('staging_style')
    full_transcript = " ".join([b.get('text', '') for b in beats])
    domain = detect_video_domain(full_transcript, staging_style=staging_style)
    manifest['domain_theme'] = domain['theme']

    enable_two_actors = total_beats >= 2 or domain.get('actor2_is_silhouette', False)

    # Staging variations across beats to guarantee dynamic positions
    stagings_cycle = [
        'two_shot_dialogue', 'left_closeup', 'two_shot_dialogue', 'right_closeup', 
        'two_shot_dialogue', 'center_closeup'
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
            comic_shout = matched_reaction.get('comic_shout') or extract_punchy_shout(text)
        else:
            # Context-Aware Fallback: Use domain's world background and thematic props!
            background = domain['default_bg']
            prop = domain['fallback_props'][idx % len(domain['fallback_props'])]
            
            poses = ['talk', 'point', 'think', 'celebrate']
            pose = poses[idx % len(poses)]
            emotion = 'happy' if pose == 'celebrate' else 'neutral'
            accent = '#00e5ff'
            camera_shake = 0
            comic_shout = extract_punchy_shout(text, default="SIMAK INI!")
            parody_idea = f"{domain['actor1_label']} and {domain['actor2_label']} explore: '{snippet}'"

        # Staging assignment: alternates every beat
        staging = stagings_cycle[idx % len(stagings_cycle)]

        # Determine speaker turn & actor roles:
        if domain.get('actor2_is_silhouette'):
            is_actor2_speaking = False
            actor2_action = 'wistful_memory' if idx % 2 == 0 else 'fading_away'
            actor2_prop = 'fading_silhouette'
            actor2_shout = None
        elif domain.get('actor2_is_skeleton') and ('situlang' in t_clean or 'si tulang' in t_clean):
            is_actor2_speaking = True
            actor2_action = 'celebrate'
            actor2_prop = 'bone'
            actor2_shout = extract_punchy_shout(text, default="SI TULANG!")
        elif domain.get('actor2_is_skeleton') and ('tulang' in t_clean or 'flashcard' in t_clean):
            is_actor2_speaking = True
            actor2_action = 'think'
            actor2_prop = 'bone'
            actor2_shout = comic_shout
        elif idx % 3 == 2:
            is_actor2_speaking = True
            actor2_action = pose
            actor2_prop = prop
            actor2_shout = comic_shout
        else:
            is_actor2_speaking = False
            actor2_action = 'listen'
            actor2_prop = 'bone' if domain.get('actor2_is_skeleton') else 'coffee'
            actor2_shout = None

        # Build Dual Actor Specification
        actor_1 = {
            'label': domain['actor1_label'],
            'x': 210,
            'speaking': not is_actor2_speaking,
            'action': pose if not is_actor2_speaking else 'listen',
            'prop': prop if not is_actor2_speaking else 'coffee',
            'emotion': emotion if not is_actor2_speaking else 'neutral',
            'accent_color': [255, 230, 0] if not domain.get('actor2_is_silhouette') else [0, 229, 255],
            'comic_shout': comic_shout if not is_actor2_speaking else None,
            'scale': 1.05 if not is_actor2_speaking else 0.95
        }

        if domain.get('actor2_is_silhouette'):
            actor_2 = {
                'label': domain['actor2_label'],
                'x': 510,
                'speaking': False,
                'action': actor2_action,
                'prop': actor2_prop,
                'emotion': 'neutral',
                'accent_color': [192, 132, 252], # Ethereal violet-cyan glowing memory
                'comic_shout': None,
                'is_silhouette': True,
                'opacity': 0.45,
                'scale': 0.92
            }
        else:
            actor_2 = {
                'label': domain['actor2_label'],
                'x': 510,
                'speaking': is_actor2_speaking,
                'action': actor2_action,
                'prop': actor2_prop,
                'emotion': 'happy' if is_actor2_speaking else 'neutral',
                'accent_color': [0, 229, 255] if domain.get('actor2_is_skeleton') else [247, 85, 168],
                'comic_shout': actor2_shout,
                'scale': 1.05 if is_actor2_speaking else 0.95
            }

        directed_beat = dict(beat)
        directed_beat.update({
            'model': 'classic',
            'action': pose,
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
