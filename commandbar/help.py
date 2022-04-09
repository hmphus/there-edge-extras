# -*- coding: utf-8 -*-

import os
import re
import sys
import json


if __name__ == '__main__':
    with open('shortcutbar/shortcutbar2.json') as file:
        config = json.loads(file.read())
    entries = []
    for command, entry in config['commands'].items():
        aliases = entry.get('aliases', [])
        commands = [command] + aliases
        entries.append([
            ' '.join(['/%s' % c for c in commands]),
            entry.get('help', ''),
        ])
    size = max([len(e[0]) for e in entries])
    lines = []
    lines.append('# Command Bar Help')
    lines.append('')
    lines.append('| Command | Action |')
    lines.append('|-|-|')
    for entry in sorted(entries, key=lambda e: e[0]):
        lines.append('| %s | %s |' % (entry[0], entry[1]))
    with open('../COMMANDS.md', 'w') as file:
        for line in lines:
            print(line)
            print(line, file=file)