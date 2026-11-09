"""CI check of the submission folder: files present, cover sizes, trailer sizes and length (≤ 20 s)."""
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
print('\n'.join(errors) or 'submission folder ok')
sys.exit(1 if errors else 0)
