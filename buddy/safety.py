import re


def requests_stop(speech: str) -> bool:
    return bool(
        re.search(
            r"\b(stop(?: the call| asking)?|end (?:the|this) call|hang up|not now|call me later|wrong (?:person|number)|leave (?:a|your) message)\b",
            speech.lower(),
        )
    )
