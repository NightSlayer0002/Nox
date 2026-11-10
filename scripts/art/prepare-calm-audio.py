"""Make small, gentle playback cuts from the bundled CC0 cat recordings.

Run with Python + NumPy, or Blender's --background --python option.
The source recordings stay unchanged. No synthesized animal voice is added.
"""
from pathlib import Path
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[2] / 'public/assets/calm'


def read(name):
    with wave.open(str(ROOT / (name + '.wav'))) as audio:
        assert audio.getframerate() == 44100 and audio.getsampwidth() == 2 and audio.getnchannels() == 1
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(float) / 32768


def polish(samples, low, high):
    # Gentle high/low shelves remove handling rumble and recording hiss while
    # keeping the real purr pulses. Filter before reducing the sample rate.
    frequencies = np.fft.rfftfreq(len(samples), 1/44100)
    gain = (1-np.exp(-(frequencies/low)**2)) / (1+(frequencies/high)**4)
    return np.fft.irfft(np.fft.rfft(samples-samples.mean())*gain, n=len(samples))[::2]


def save(name, samples, peak):
    samples = samples * peak / max(.001, np.max(np.abs(samples)))
    with wave.open(str(ROOT / (name+'.wav')), 'wb') as audio:
        audio.setparams((1, 2, 22050, 0, 'NONE', 'not compressed'))
        audio.writeframes(np.round(samples*32767).astype('<i2').tobytes())


purr = polish(read('purr')[int(.16*44100):int(5.45*44100)], 32, 2200)
overlap = int(.28*22050)
ramp = np.linspace(0, 1, overlap)
# End-to-start overlap removes the recorded fade-out and fade-in. Rotating
# the loop places both joins in continuous parts of the same recording.
seam = purr[-overlap:]*(1-ramp)+purr[:overlap]*ramp
save('purr-soft', np.concatenate((purr[overlap:-overlap], seam)), .66)

source = read('meow')
for name, start, end, peak in [('mew-hello', .28, 1.24, .62), ('mew-soft', 1.28, 2.20, .52)]:
    samples = polish(source[int(start*44100):int(end*44100)], 85, 6000)
    attack, release = int(.025*22050), int(.08*22050)
    samples[:attack] *= np.linspace(0, 1, attack)**2
    samples[-release:] *= np.linspace(1, 0, release)**2
    save(name, samples, peak)
