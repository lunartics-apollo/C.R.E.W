"""Synthesizes the game's sound effects into assets/audio (mono 16-bit WAV, 44.1 kHz).

Run from the project root:  python art/make_sfx.py
Everything is generated from fixed seeds, so re-running reproduces the same files.
"""
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"


# ── building blocks ──────────────────────────────────────────────────────────
def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def env(dur: float, attack: float, tau: float) -> np.ndarray:
    """Linear attack then exponential decay with time constant tau."""
    t = t_axis(dur)
    a = np.clip(t / max(attack, 1e-4), 0.0, 1.0)
    return a * np.exp(-np.maximum(t - attack, 0.0) / tau)


def band(x: np.ndarray, lo: float, hi: float, order: int = 4) -> np.ndarray:
    sos = signal.butter(order, [lo, hi], btype="bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x: np.ndarray, hz: float, order: int = 4) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, hz, fs=SR, output="sos"), x)


def sweep(f0: float, f1: float, dur: float) -> np.ndarray:
    """Sine gliding exponentially from f0 to f1."""
    t = t_axis(dur)
    freq = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def tone(freq: float, dur: float, harmonics=(1.0,)) -> np.ndarray:
    t = t_axis(dur)
    return sum(a * np.sin(2 * np.pi * freq * (i + 1) * t) for i, a in enumerate(harmonics))


def bell(freq: float, dur: float, tau: float) -> np.ndarray:
    """Glockenspiel-like strike: inharmonic partials, the high ones dying first."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, amp, k in [(1.0, 1.0, 1.0), (2.76, 0.45, 0.45), (5.40, 0.22, 0.25), (8.93, 0.10, 0.15)]:
        out += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / (tau * k))
    return out * np.clip(t / 0.002, 0, 1)


def place(buf: np.ndarray, clip: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    n = min(len(clip), len(buf) - i)
    buf[i:i + n] += gain * clip[:n]


def fade_edges(x: np.ndarray, ms: float = 4.0) -> np.ndarray:
    n = int(SR * ms / 1000)
    x = x.copy()
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def save(name: str, x: np.ndarray, peak_db: float) -> None:
    x = fade_edges(x)
    x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)
    sf.write(OUT / f"{name}.wav", x.astype(np.float32), SR, subtype="PCM_16")
    print(f"{name}.wav  {len(x) / SR:.2f}s  peak {peak_db} dBFS")


# ── footsteps ────────────────────────────────────────────────────────────────
# A footfall is a heel strike then a softer toe roll ~60 ms later. The low body is
# filtered noise (not a pitched glide, which reads as a kick drum).
def footfall(rng: np.random.Generator, dur: float, texture) -> np.ndarray:
    n = int(dur * SR)
    buf = np.zeros(n)
    toe_at = rng.uniform(0.05, 0.07)
    for at, gain in [(0.0, 1.0), (toe_at, rng.uniform(0.45, 0.65))]:
        body = lowpass(rng.standard_normal(n), 260, 2) * env(dur, 0.008, 0.022)
        place(buf, 0.5 * body / np.max(np.abs(body)) + texture(rng, n), at, gain)
    return buf


def grass_rustle(rng: np.random.Generator, n: int) -> np.ndarray:
    # Blades crumpling: many soft overlapping grains (not one noise burst, which is a snare),
    # swelling over ~20 ms and thinning out across ~150 ms.
    rustle = np.zeros(n)
    for _ in range(rng.integers(110, 160)):
        g = rng.uniform(0.004, 0.012)
        lo = rng.uniform(350, 1400)
        grain = band(rng.standard_normal(int(g * SR)), lo, lo * 2.4, 2) * np.hanning(int(g * SR))
        at = rng.gamma(2.0, 0.025)
        place(rustle, grain, min(at, n / SR - g), rng.uniform(0.15, 1.0) * np.exp(-at / 0.08))
    return 0.8 * rustle / np.max(np.abs(rustle))


def gravel_crunch(rng: np.random.Generator, n: int) -> np.ndarray:
    crunch = np.zeros(n)
    for _ in range(rng.integers(45, 70)):
        g = rng.uniform(0.002, 0.006)
        lo = rng.uniform(700, 2200)
        grain = band(rng.standard_normal(int(g * SR)), lo, lo * 2.6, 2) * np.hanning(int(g * SR))
        place(crunch, grain, abs(rng.normal(0.03, 0.03)), rng.uniform(0.2, 1.0))
    return 0.9 * crunch / np.max(np.abs(crunch))


def step_grass(rng: np.random.Generator) -> np.ndarray:
    return footfall(rng, 0.28, grass_rustle)


def step_path(rng: np.random.Generator) -> np.ndarray:
    return footfall(rng, 0.26, gravel_crunch)


# ── station and UI cues ──────────────────────────────────────────────────────
def station_near() -> np.ndarray:
    dur = 0.16
    pop = sweep(520, 900, dur) + 0.15 * sweep(1040, 1800, dur)
    return pop * env(dur, 0.003, 0.045)


def denied() -> np.ndarray:
    buf = np.zeros(int(0.32 * SR))
    for at, f in [(0.0, 330.0), (0.13, 247.0)]:
        boop = tone(f, 0.12, (1.0, 0.0, 0.25)) * env(0.12, 0.004, 0.05)
        place(buf, boop, at)
    return lowpass(buf, 2500)


def radio_static(rng: np.random.Generator, dur: float) -> np.ndarray:
    crackle = (rng.random(int(dur * SR)) < 0.02) * rng.uniform(-1, 1, int(dur * SR))
    hiss = band(rng.standard_normal(int(dur * SR)), 900, 3500) * 0.5 + band(crackle, 500, 4000, 2) * 4
    return hiss * env(dur, 0.004, dur / 2.5)


def mission_control() -> np.ndarray:
    rng = np.random.default_rng(11)
    buf = np.zeros(int(1.0 * SR))
    place(buf, radio_static(rng, 0.14), 0.0, 0.5)
    for at, f in [(0.14, 1320.0), (0.34, 1760.0)]:
        beep = tone(f, 0.15, (1.0, 0.0, 0.18)) * env(0.15, 0.004, 0.2)
        place(buf, beep, at, 0.8)
    # Telemetry burst: a quick run of random data tones under the second beep's tail.
    for i in range(9):
        blip = tone(rng.choice([880, 1175, 1480, 1975]), 0.022) * env(0.022, 0.001, 0.012)
        place(buf, blip, 0.55 + i * 0.026, 0.3)
    place(buf, radio_static(rng, 0.1), 0.82, 0.35)
    return band(buf, 280, 5000, 2)  # small-speaker radio band


def lab_build() -> np.ndarray:
    rng = np.random.default_rng(23)
    buf = np.zeros(int(1.7 * SR))
    for i in range(6):  # ratchet
        click = band(rng.standard_normal(int(0.005 * SR)), 2000, 8000, 2) * env(0.005, 0.0003, 0.0015)
        ping = tone(3200 + 90 * (i % 2), 0.03) * env(0.03, 0.0005, 0.008)
        place(buf, click, i * 0.055, 0.8)
        place(buf, ping, i * 0.055, 0.28)
    clunk = sweep(220, 110, 0.12) * env(0.12, 0.002, 0.03) + 0.4 * band(rng.standard_normal(int(0.12 * SR)), 400, 2500) * env(0.12, 0.002, 0.02)
    place(buf, clunk, 0.40, 0.9)
    for i, f in enumerate([1046.5, 1318.5, 1568.0]):  # C6 E6 G6: assembled!
        place(buf, bell(f, 1.1, 0.35), 0.58 + i * 0.075, 0.5)
    return buf


def launch() -> np.ndarray:
    """Ignition crackle into a roar that swells, then fades and darkens as the rocket climbs away."""
    rng = np.random.default_rng(5)
    dur = 6.0
    n = int(dur * SR)
    t = t_axis(dur)
    noise = rng.standard_normal(n)
    # Roar: noise through a lowpass whose cutoff rises at liftoff and falls as it recedes.
    cutoff = np.interp(t, [0, 0.9, 1.6, 3.0, 6.0], [250, 900, 1500, 900, 300])
    roar = np.zeros(n)
    block = 1024
    zi = None
    for s in range(0, n, block):
        sos = signal.butter(2, cutoff[s], fs=SR, output="sos")
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        roar[s:s + block], zi = signal.sosfilt(sos, noise[s:s + block], zi=zi)
    flutter = 1 + 0.35 * lowpass(rng.standard_normal(n), 14, 2) / 0.05
    rumble = lowpass(np.cumsum(rng.standard_normal(n)) * 0.02, 90, 4)  # brown-noise sub
    level = np.interp(t, [0, 0.25, 0.9, 1.4, 2.6, 6.0], [0.0, 0.25, 0.7, 1.0, 0.8, 0.0]) ** 1.3
    out = (roar / np.max(np.abs(roar)) * np.clip(flutter, 0.3, 2) + 1.6 * rumble / np.max(np.abs(rumble))) * level
    crackle = np.zeros(n)
    for _ in range(40):  # ignition pops
        pop = band(rng.standard_normal(int(0.01 * SR)), 800, 6000, 2) * env(0.01, 0.0005, 0.003)
        place(crackle, pop, rng.uniform(0.05, 1.1), rng.uniform(0.3, 1.0))
    # High-pass removes the DC drift the brown-noise integration builds up.
    return signal.sosfilt(signal.butter(2, 30, btype="highpass", fs=SR, output="sos"), out + 0.2 * crackle)


def mission_complete() -> np.ndarray:
    buf = np.zeros(int(2.4 * SR))
    for i, f in enumerate([784.0, 1046.5, 1318.5, 1568.0]):  # G5 C6 E6 G6
        place(buf, bell(f, 1.2, 0.3), i * 0.11, 0.55)
    for f in [1046.5, 1318.5, 1568.0, 2093.0]:  # final C major chord
        place(buf, bell(f, 1.9, 0.6), 0.5, 0.35)
    return buf


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(4):
        save(f"step_grass_{i + 1}", step_grass(np.random.default_rng(100 + i)), -10)
        save(f"step_path_{i + 1}", step_path(np.random.default_rng(200 + i)), -9)
    save("station_near", station_near(), -12)
    save("denied", denied(), -9)
    # Peaks chosen so the cues land near -16 LUFS (checked with earshot measure).
    save("mission_control", mission_control(), -12)
    save("lab_build", lab_build(), -4)
    save("launch", launch(), -1)
    save("mission_complete", mission_complete(), -5)


if __name__ == "__main__":
    main()
