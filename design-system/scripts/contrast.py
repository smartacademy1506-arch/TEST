#!/usr/bin/env python3
"""Vérifie les ratios WCAG 2.2 AA de design-system/tokens.json. Sortie 1 si un échec."""
import json, sys, pathlib

def lum(h):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= .03928 else ((c + .055) / 1.055) ** 2.4
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)

def ratio(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + .05) / (lo + .05)

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parent.parent / 'tokens.json')
t = json.loads(path.read_text())
fails = 0
for theme in ('light', 'dark'):
    roles = t['roles'][theme]
    print(f'== {theme} ==')
    for fg, bg, need in t['pairs'][theme]:
        r = ratio(roles[fg], roles[bg]); ok = r >= need
        fails += not ok
        print(f"{'OK  ' if ok else 'FAIL'} {fg:14} sur {bg:10} {r:5.2f}:1 (min {need})")
print(f'\n{fails} échec(s) AA')
sys.exit(1 if fails else 0)
