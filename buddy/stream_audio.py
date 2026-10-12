import io
import wave
from collections import deque

import numpy as np
from scipy.signal import resample_poly


def decode_mulaw(payload):
    values = np.frombuffer(payload, dtype=np.uint8).astype(np.int32) ^ 255
    samples = (((values & 15) << 3) + 132) << ((values >> 4) & 7)
    samples = np.where(values & 128, 132 - samples, samples - 132)
    return (
        resample_poly(samples.astype(np.float32), 2, 1).clip(-32768, 32767).astype("<i2").tobytes()
    )


class MulawDecoder:
    def __init__(self):
        self.previous = 0

    def decode(self, payload):
        values = np.frombuffer(payload, dtype=np.uint8).astype(np.int32) ^ 255
        if not len(values):
            return b""
        samples = (((values & 15) << 3) + 132) << ((values >> 4) & 7)
        samples = np.where(values & 128, 132 - samples, samples - 132)
        previous = np.concatenate(([self.previous], samples[:-1]))
        result = np.empty(len(samples) * 2, dtype="<i2")
        result[::2] = (previous + samples) // 2
        result[1::2] = samples
        self.previous = int(samples[-1])
        return result.tobytes()


def encode_mulaw(samples):
    values = np.asarray(samples, dtype=np.int32)
    negative = values < 0
    magnitude = np.minimum(np.abs(values), 32635) + 132
    exponent = np.clip(np.floor(np.log2(magnitude)).astype(np.int32) - 7, 0, 7)
    mantissa = (magnitude >> (exponent + 3)) & 15
    return (
        ((~((negative.astype(np.int32) << 7) | (exponent << 4) | mantissa)) & 255)
        .astype(np.uint8)
        .tobytes()
    )


def telephone_audio(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
        if wav.getparams()[:3] != (1, 2, 24000):
            raise ValueError("Jessica audio must be mono 24 kHz PCM16")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32)
    return encode_mulaw(resample_poly(samples, 1, 3).clip(-32768, 32767).astype(np.int16))


class SpeechGate:
    def __init__(self, detector=None):
        if detector is None:
            import webrtcvad

            detector = webrtcvad.Vad(2)
        self.detector = detector
        self.pending = bytearray()
        self.preroll = deque(maxlen=10)
        self.audio = bytearray()
        self.voiced = self.quiet = self.total_voiced = 0
        self.active = False

    def feed(self, pcm):
        self.pending.extend(pcm)
        events = []
        while len(self.pending) >= 640:
            frame = bytes(self.pending[:640])
            del self.pending[:640]
            rms = np.sqrt(np.mean(np.frombuffer(frame, dtype="<i2").astype(np.float32) ** 2))
            speech = rms >= 130 and self.detector.is_speech(frame, 16000)
            if not self.active:
                self.preroll.append(frame)
                self.voiced = self.voiced + 1 if speech else 0
                if self.voiced >= 3:
                    self.active = True
                    self.audio.extend(b"".join(self.preroll))
                    self.total_voiced = 3
                    self.quiet = 0
                    events.append(("start", None))
            else:
                self.audio.extend(frame)
                self.total_voiced += bool(speech)
                self.quiet = 0 if speech else self.quiet + 1
                if self.quiet >= 35 or len(self.audio) >= 640000:
                    if self.total_voiced >= 8:
                        events.append(("utterance", bytes(self.audio)))
                    else:
                        events.append(("silence", None))
                    self.active = False
                    self.audio.clear()
                    self.preroll.clear()
                    self.voiced = self.quiet = self.total_voiced = 0
        return events
