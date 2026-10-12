import re
from decimal import Decimal

SMALL = dict(
    zip(
        "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(),
        range(20),
    )
)
TENS = dict(
    zip("twenty thirty forty fifty sixty seventy eighty ninety".split(), range(20, 100, 10))
)
SCALES = {"thousand": 1000, "lakh": 100000, "lakhs": 100000, "crore": 10000000, "crores": 10000000}


def requests_stop(speech: str) -> bool:
    return bool(
        re.search(
            r"(?:^|\s)(?:நிறுத்து|நிறுத்துங்க|நிறுத்துங்கள்|வேண்டாம்|வேணாம்|போதும்)(?:[.!?]|\s|$)|பிறகு பேச|அழைப்பை முடி|தவறான எண்|தவறான நபர்",
            speech,
        )
    ) or bool(
        re.search(
            r"\b(stop(?: the call| asking)?|end (?:the|this) call|hang up|not now|call me later|wrong (?:person|number)|leave (?:a|your) message)\b",
            speech.lower(),
        )
    )


def money_evidence(text: str) -> set[Decimal]:
    values = {
        Decimal(value.replace(",", ""))
        for value in re.findall(r"(?<![\w.])\d+(?:,\d{2,3})*(?:\.\d{1,2})?(?![\w.])", text)
    }
    total = current = 0
    active = False

    def finish():
        nonlocal total, current, active
        if active:
            values.add(Decimal(total + current))
        total = current = 0
        active = False

    for word in re.findall(r"[a-z]+", text.lower()):
        if word in SMALL or word in TENS:
            current += SMALL.get(word, TENS.get(word, 0))
            active = True
        elif word == "hundred":
            current = (current or 1) * 100
            active = True
        elif word in SCALES:
            total += (current or 1) * SCALES[word]
            current = 0
            active = True
        elif word == "and" and active:
            continue
        else:
            finish()
    finish()
    return values


def uncertain_money(text: str) -> bool:
    return bool(
        re.search(
            r"\b(about|around|roughly|approximately|maybe|guess|estimated|refund|transfer|transferred|between)\b",
            text.lower(),
        )
    )
