# -*- coding: utf-8 -*-

import os
import re
import sys
import json


if __name__ == '__main__':
    with open('shortcutbar/shortcutbar2.json') as file:
        config = json.loads(file.read())
    for command, entry in config['commands'].items():
        aliases = entry.get('aliases', [])
        commands = [command] + aliases
        print(' '.join(['/%s' % c for c in commands]))
        