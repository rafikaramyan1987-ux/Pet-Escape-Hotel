"""CI check of the submission folders: CrazyGames (covers, trailers ≤ 20 s, README, zips v1 + v2), GameDistribution
(zip, JPG thumbnails) and GamePix (zip, icon, cover, README description 100–500 and how-to-play ≤ 500 characters)."""
import os
import re
import struct
import sys

def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    assert head[:8] == b'\x89PNG\r\n\x1a\n', f'{path}: not a PNG'
    return struct.unpack('>II', head[16:24])

def mp4_info(path):
    data = open(path, 'rb').read()
    i = data.find(b'mvhd')
    v = data[i + 4]
    if v == 1:
        scale, dur = struct.unpack('>IQ', data[i + 24:i + 36])
    else:
        scale, dur = struct.unpack('>II', data[i + 16:i + 24])
    j = data.find(b'tkhd')
    tv = data[j + 4]
    off = j + (92 if tv == 1 else 80)
    w, h = struct.unpack('>II', data[off:off + 8])
    return dur / scale, w >> 16, h >> 16

def jpg_size(path):
    data = open(path, 'rb').read()
    assert data[:2] == b'\xff\xd8', f'{path}: not a JPEG'
    i = 2
    while i < len(data):
        marker, seg = data[i + 1], struct.unpack('>H', data[i + 2:i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack('>HH', data[i + 5:i + 9])
            return w, h
        i += 2 + seg
    raise AssertionError(f'{path}: no frame header')

errors = []
for name, size in [('cover-1920x1080.png', (1920, 1080)), ('cover-800x1200.png', (800, 1200)), ('cover-800x800.png', (800, 800))]:
    got = png_size(f'submission/{name}')
    if got != size:
        errors.append(f'{name}: {got} != {size}')
for name, size in [('trailer-1920x1080.mp4', (1920, 1080)), ('trailer-1080x1620.mp4', (1080, 1620))]:
    secs, w, h = mp4_info(f'submission/{name}')
    print(f'{name}: {w}x{h}, {secs:.1f} s')
    if (w, h) != size:
        errors.append(f'{name}: {w}x{h} != {size}')
    if not 5 <= secs <= 20:
        errors.append(f'{name}: {secs:.1f} s (must be ≤ 20 s)')
readme = open('submission/README.md', encoding='utf-8').read()
for section in ['## Short description', '## Description', '## Controls', '## Tags']:
    if section not in readme:
        errors.append(f'README.md: missing "{section}"')
for z in ['submission/screw-and-rescue-v1.zip', 'submission/screw-and-rescue-v2.zip', 'submission-gd/screw-and-rescue-gd-v1.zip', 'submission-gamepix/screw-and-rescue-gamepix-v1.zip',
          'submission/screw-and-rescue-v3.zip', 'submission-gd/screw-and-rescue-gd-v2.zip', 'submission-gamepix/screw-and-rescue-gamepix-v3.zip',
          'submission-playgama/screw-and-rescue-playgama-v3.zip', 'submission-web/screw-and-rescue-web-v2.zip',
          'submission-gamemonetize/screw-and-rescue-gamemonetize-v2.zip', 'submission-y8/screw-and-rescue-y8-v2.zip']:
    if not os.path.isfile(z):
        errors.append(f'{z} missing')
for name, size in [('thumb-512x384.jpg', (512, 384)), ('thumb-512x512.jpg', (512, 512)), ('thumb-200x120.jpg', (200, 120)), ('thumb-1280x720.jpg', (1280, 720)), ('thumb-1280x550.jpg', (1280, 550))]:
    got = jpg_size(f'submission-gd/{name}')
    if got != size:
        errors.append(f'submission-gd/{name}: {got} != {size}')
for name, size in [('icon-256x256.jpg', (256, 256)), ('cover-1360x850.jpg', (1360, 850))]:
    got = jpg_size(f'submission-gamepix/{name}')
    if got != size:
        errors.append(f'submission-gamepix/{name}: {got} != {size}')
gpx = open('submission-gamepix/README.md', encoding='utf-8').read()
def section(text, title):
    m = re.search(r'## ' + title + r'\n\n(.*?)(?:\n\n## |\Z)', text, re.S)
    return m.group(1).strip() if m else ''
desc, how = section(gpx, 'Description'), section(gpx, 'How to play')
print(f'GamePix README: description {len(desc)} chars, how to play {len(how)} chars')
if not 100 <= len(desc) <= 500:
    errors.append(f'GamePix description: {len(desc)} characters (100–500)')
if not 0 < len(how) <= 500:
    errors.append(f'GamePix how to play: {len(how)} characters (≤ 500)')
print('\n'.join(errors) or 'submission folders ok')
sys.exit(1 if errors else 0)
