"""
Edge TTS — Direct Synthesis Test + API Endpoint Test
======================================================

Usage:
    # Test all voices directly (no server needed):
    python test/test_edge_tts.py

    # Quick single-voice test (no server needed):
    python test/test_edge_tts.py quick

    # Test the live API endpoints:
    python test/test_edge_tts.py api [base_url]
    python test/test_edge_tts.py api http://localhost:8000

Output audio files → test/tts_output/
"""

import asyncio
import os
import sys
import edge_tts

# ---------------------------------------------------------------------------
# OUTPUT FOLDER
# ---------------------------------------------------------------------------
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "tts_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# ALL AVAILABLE EDGE TTS VOICES (for reference)
# ---------------------------------------------------------------------------
# ── ENGLISH (en-US) ──────────────────────────────────────────────────────────
# en-US-AvaMultilingualNeural         (Female, multilingual – best for Hinglish)
# en-US-AndrewMultilingualNeural      (Male,   multilingual)
# en-US-EmmaMultilingualNeural        (Female, multilingual)
# en-US-BrianMultilingualNeural       (Male,   multilingual)
# en-US-AvaNeural                     (Female, natural)
# en-US-AndrewNeural                  (Male,   natural)
# en-US-EmmaNeural                    (Female, natural)
# en-US-BrianNeural                   (Male,   natural)
# en-US-AriaNeural                    (Female, expressive)
# en-US-ChristopherNeural             (Male,   expressive)
# en-US-EricNeural                    (Male,   natural)
# en-US-GuyNeural                     (Male,   natural)
# en-US-JennyNeural                   (Female, news/chat)
# en-US-MichelleNeural                (Female, friendly)
# en-US-RogerNeural                   (Male,   natural)
# en-US-SteffanNeural                 (Male,   natural)
#
# ── ENGLISH (en-IN – India) ──────────────────────────────────────────────────
# en-IN-NeerjaExpressiveNeural        (Female, expressive)
# en-IN-NeerjaNeural                  (Female)
# en-IN-PrabhatNeural                 (Male)
#
# ── ENGLISH (en-GB) ──────────────────────────────────────────────────────────
# en-GB-SoniaNeural                   (Female)
# en-GB-RyanNeural                    (Male)
# en-GB-LibbyNeural                   (Female)
# en-GB-MaisieNeural                  (Female, child)
#
# ── HINDI (hi-IN) ────────────────────────────────────────────────────────────
# hi-IN-SwaraNeural                   (Female) ← best Hindi female
# hi-IN-MadhurNeural                  (Male)   ← best Hindi male
#
# ── HINGLISH (Hindi + English mixed) ─────────────────────────────────────────
# Use en-US-AvaMultilingualNeural or en-US-AndrewMultilingualNeural —
# they handle Hindi script + Roman Hindi + English seamlessly.
# ---------------------------------------------------------------------------

SAMPLES = {
    "english": {
        "text": (
            "Hello! Welcome to the Edge TTS sound quality test. "
            "This is a demonstration of Microsoft's neural text-to-speech technology. "
            "The voice should sound natural, clear, and expressive. "
            "Edge TTS supports multiple languages and accents across the globe."
        ),
        "voices": [
            ("en-US-AvaNeural",              "en_US_Ava_Female"),
            ("en-US-AndrewNeural",           "en_US_Andrew_Male"),
            ("en-US-AriaNeural",             "en_US_Aria_Female"),
            ("en-US-GuyNeural",              "en_US_Guy_Male"),
            ("en-IN-NeerjaExpressiveNeural", "en_IN_Neerja_Female"),
            ("en-IN-PrabhatNeural",          "en_IN_Prabhat_Male"),
            ("en-GB-SoniaNeural",            "en_GB_Sonia_Female"),
        ],
    },
    "hindi": {
        "text": (
            "नमस्ते! यह एज टीटीएस साउंड क्वालिटी टेस्ट है। "
            "माइक्रोसॉफ्ट की न्यूरल टेक्स्ट-टू-स्पीच तकनीक बहुत अच्छी है। "
            "यह आवाज़ बिल्कुल स्वाभाविक और स्पष्ट सुनाई देनी चाहिए। "
            "हिंदी में बोलना अब बहुत आसान हो गया है।"
        ),
        "voices": [
            ("hi-IN-SwaraNeural",  "hi_IN_Swara_Female"),
            ("hi-IN-MadhurNeural", "hi_IN_Madhur_Male"),
        ],
    },
    "hinglish": {
        "text": (
            "Hello दोस्तों! आज हम Edge TTS को test करने वाले हैं। "
            "यह technology बहुत amazing है — यह Hindi और English दोनों को "
            "एक साथ समझती है। "
            "Machine learning की वजह से यह voice बहुत natural लगती है। "
            "तो चलिए शुरू करते हैं और देखते हैं कि यह कैसा sound करती है!"
        ),
        "voices": [
            ("en-US-AvaMultilingualNeural",    "hinglish_Ava_Multilingual_Female"),
            ("en-US-AndrewMultilingualNeural", "hinglish_Andrew_Multilingual_Male"),
            ("en-US-EmmaMultilingualNeural",   "hinglish_Emma_Multilingual_Female"),
            ("en-US-BrianMultilingualNeural",  "hinglish_Brian_Multilingual_Male"),
            ("en-IN-NeerjaExpressiveNeural",   "hinglish_Neerja_India_Female"),
        ],
    },
}

# ---------------------------------------------------------------------------
# DIRECT SYNTHESIS (no server)
# ---------------------------------------------------------------------------
async def synthesize(
    text: str, voice: str, output_path: str,
    rate: str = "+0%", volume: str = "+0%"
) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
    await communicate.save(output_path)


async def run_direct_tests() -> None:
    total = sum(len(v["voices"]) for v in SAMPLES.values())
    done  = 0

    print(f"\n{'='*60}")
    print("  Edge TTS Direct Synthesis Test")
    print(f"{'='*60}")
    print(f"  Output : {OUTPUT_DIR}")
    print(f"  Total  : {total} samples")
    print(f"{'='*60}\n")

    for category, config in SAMPLES.items():
        text   = config["text"]
        voices = config["voices"]
        print(f"[{category.upper()}]")
        print(f"  Text preview : {text[:75]}...\n")

        for voice, label in voices:
            filename    = f"{category}__{label}.mp3"
            output_path = os.path.join(OUTPUT_DIR, filename)
            try:
                await synthesize(text, voice, output_path)
                size_kb = os.path.getsize(output_path) / 1024
                done   += 1
                print(f"  ✅  [{done:02d}/{total}]  {voice:<45}  →  {filename}  ({size_kb:.1f} KB)")
            except Exception as exc:
                print(f"  ❌  FAILED  {voice:<45}  →  {exc}")
        print()

    print(f"{'='*60}")
    print(f"  Done! {done}/{total} files saved to: {OUTPUT_DIR}")
    print(f"{'='*60}\n")


# ---------------------------------------------------------------------------
# QUICK SINGLE-VOICE TEST (direct, no server)
# ---------------------------------------------------------------------------
async def quick_test() -> None:
    voice = "en-US-AvaMultilingualNeural"   # ← change voice here
    text  = (
        "Hello दोस्तों! यह एक quick test है। "
        "Edge TTS की आवाज़ बहुत natural लगती है।"
    )
    out = os.path.join(OUTPUT_DIR, "quick_test.mp3")
    await synthesize(text, voice, out)
    print(f"\n✅  Quick test saved → {out}\n")


# ---------------------------------------------------------------------------
# API ENDPOINT TEST (tests the live FastAPI server)
# ---------------------------------------------------------------------------
def test_api_endpoints(base_url: str = "http://localhost:8000") -> None:
    """
    Full roundtrip test of the TTS API service:
      1. GET  /v1/tts/voices          — list voices (no auth)
      2. POST /v1/tts/generate-key    — create a TTS key
      3. GET  /v1/tts/key-info        — check usage stats
      4. POST /v1/tts/synthesize      — synthesize Hinglish text, save MP3
      5. POST /v1/tts/synthesize      — synthesize Hindi text, save MP3
      6. POST /v1/tts/synthesize      — synthesize English text, save MP3
    """
    try:
        import requests
    except ImportError:
        print("❌  'requests' not installed. Run: pip install requests")
        return

    sep = "=" * 60
    print(f"\n{sep}")
    print(f"  TTS API Endpoint Test  →  {base_url}")
    print(f"{sep}\n")

    # ── 1. List voices ────────────────────────────────────────────────────────
    print("[1/6] GET /v1/tts/voices")
    r = requests.get(f"{base_url}/v1/tts/voices")
    if r.status_code == 200:
        data = r.json()
        print(f"  ✅  {data['total']} voices available")
        print(f"      Tip: {data['tip']}\n")
    else:
        print(f"  ❌  {r.status_code}: {r.text}\n")
        return

    # ── 2. Generate TTS key ───────────────────────────────────────────────────
    print("[2/6] POST /v1/tts/generate-key")
    r = requests.post(
        f"{base_url}/v1/tts/generate-key",
        json={"label": "Test Key from test_edge_tts.py"},
    )
    if r.status_code == 200:
        key_data = r.json()
        tts_key  = key_data["tts_key"]
        print(f"  ✅  Key generated : {tts_key[:22]}...")
        print(f"      Daily limit   : {key_data['daily_limit']:,} chars/day")
        print(f"      Remaining     : {key_data['remaining']:,} chars\n")
    else:
        print(f"  ❌  {r.status_code}: {r.text}\n")
        return

    headers = {"Authorization": f"Bearer {tts_key}"}

    # ── 3. Key info ───────────────────────────────────────────────────────────
    print("[3/6] GET /v1/tts/key-info")
    r = requests.get(f"{base_url}/v1/tts/key-info", headers=headers)
    if r.status_code == 200:
        info = r.json()
        print(f"  ✅  Chars used today : {info['chars_today']}")
        print(f"      Remaining        : {info['remaining']:,}")
        print(f"      Reset date       : {info['last_reset']}\n")
    else:
        print(f"  ❌  {r.status_code}: {r.text}\n")

    # ── 4. Synthesize Hinglish ────────────────────────────────────────────────
    synth_cases = [
        {
            "label":    "[4/6] Synthesize — Hinglish",
            "filename": "api_hinglish_test.mp3",
            "body": {
                "text":  "Hello दोस्तों! यह API test है। Edge TTS बहुत amazing sound करती है!",
                "voice": "en-US-AvaMultilingualNeural",
                "rate":  "+0%",
            },
        },
        {
            "label":    "[5/6] Synthesize — Hindi",
            "filename": "api_hindi_test.mp3",
            "body": {
                "text":  "नमस्ते! यह हिंदी टेक्स्ट-टू-स्पीच API का परीक्षण है। आवाज़ बिल्कुल स्पष्ट और प्राकृतिक है।",
                "voice": "hi-IN-SwaraNeural",
                "rate":  "+0%",
            },
        },
        {
            "label":    "[6/6] Synthesize — English",
            "filename": "api_english_test.mp3",
            "body": {
                "text":  "Hello! This is a live API test of the Edge TTS synthesis endpoint. The audio is returned as a streaming MP3.",
                "voice": "en-US-AriaNeural",
                "rate":  "+5%",
            },
        },
    ]

    for case in synth_cases:
        print(case["label"])
        r = requests.post(
            f"{base_url}/v1/tts/synthesize",
            headers=headers,
            json=case["body"],
        )
        if r.status_code == 200:
            out_path = os.path.join(OUTPUT_DIR, case["filename"])
            with open(out_path, "wb") as f:
                f.write(r.content)
            size_kb = len(r.content) / 1024
            print(f"  ✅  Audio saved  : {case['filename']}  ({size_kb:.1f} KB)")
            print(f"      Voice        : {r.headers.get('X-Voice', '?')}")
            print(f"      Chars used   : {r.headers.get('X-Chars-Used', '?')}")
            print(f"      Remaining    : {r.headers.get('X-Chars-Remaining', '?')} chars\n")
        else:
            print(f"  ❌  {r.status_code}: {r.text}\n")

    print(f"{sep}")
    print(f"  API test complete — audio files saved to: {OUTPUT_DIR}")
    print(f"{sep}\n")

    # ── Quick summary: check key-info again to confirm usage recorded ─────────
    r = requests.get(f"{base_url}/v1/tts/key-info", headers=headers)
    if r.status_code == 200:
        info = r.json()
        print(f"  Final usage  →  {info['chars_today']} chars used today "
              f"/ {info['remaining']:,} remaining\n")


# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    mode     = sys.argv[1] if len(sys.argv) > 1 else "direct"
    base_url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000"

    if mode == "quick":
        asyncio.run(quick_test())
    elif mode == "api":
        test_api_endpoints(base_url)
    else:
        asyncio.run(run_direct_tests())
