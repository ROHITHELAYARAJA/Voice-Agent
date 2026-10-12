from pathlib import Path

TAMIL_QUESTIONS = {
    "accomplishments": "இன்று என்ன வேலை செய்தீர்கள்?",
    "learning": "இன்று புதிதாக என்ன கற்றுக்கொண்டீர்கள்?",
    "spending": "இன்று எதற்கெல்லாம் பணம் செலவு செய்தீர்கள்?",
    "income": "இன்று உங்களுக்கு வருமானம் ஏதாவது வந்ததா?",
    "wellbeing": "இன்று எப்படி உணர்கிறீர்கள்?",
    "tomorrow": "நாளை முக்கியமாக என்ன செய்ய நினைக்கிறீர்கள்?",
    "notes": "வேறு ஏதாவது நினைவில் வைத்துக்கொள்ள வேண்டுமா?",
}
TAMIL_CLARIFICATIONS = {
    **TAMIL_QUESTIONS,
    "accomplishments": "முடிக்கவில்லை என்றாலும், எந்த வேலையில் இன்று நேரம் செலவிட்டீர்கள்?",
    "spending": "சரியான தொகை என்ன, எதற்காக செலவு செய்தீர்கள்? தெரியாவிட்டால் தெரியவில்லை என்று சொல்லலாம்.",
    "income": "எவ்வளவு பணம் வந்தது, எதற்காக வந்தது? வருமானம் இல்லை என்றாலும் சொல்லலாம்.",
}

LANGUAGE_RULES = (
    (Path(__file__).resolve().parents[1] / "prompts" / "tamil_voice_agent.txt")
    .read_text(encoding="utf-8")
    .strip()
)
