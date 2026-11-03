#!/usr/bin/env python3
"""Bundle game/index.html into the single offline file game/play.html.

Every <link rel="stylesheet" href="..."> becomes an inline <style>, and every
<script src="..."></script> becomes an inline <script>. Nothing else changes.
Usage: python3 build.py
"""
import re
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parent / 'game'
SRC, OUT = GAME / 'index.html', GAME / 'play.html'


def read(rel):
    p = GAME / rel
    if not p.is_file():
        sys.exit(f'build: missing {p}')
    return p.read_text(encoding='utf-8')


def inline_script(m):
    code = read(m.group(1))
    # a literal </script> inside the code would end the tag early
    code = re.sub(r'</(script)', r'<\\/\1', code, flags=re.I)
    return f'<script>\n{code}\n</script>'


def main():
    html = SRC.read_text(encoding='utf-8')
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: f'<style>\n{read(m.group(1))}\n</style>', html)
    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)
    left = re.findall(r'<script src=|<link rel="stylesheet"', html)
    if left:
        sys.exit(f'build: {len(left)} external references were not inlined')
    OUT.write_text(html, encoding='utf-8')
    print(f'play.html: {OUT.stat().st_size / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
