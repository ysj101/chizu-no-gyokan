#!/usr/bin/env python3
"""Inspect Git metadata and supplied PR text, without emitting identities or messages."""
import os
import re
import subprocess
import sys
from pathlib import Path

EMAIL = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}')
DEFAULT = '@users.noreply.github.com noreply@github.com noreply@anthropic.com'

class GuardError(Exception):
    pass

def git(*args):
    result = subprocess.run(['git', *args], capture_output=True, text=True)
    if result.returncode:
        raise GuardError('Git metadata could not be checked')
    return result.stdout

def allowed(address, allowlist):
    address = address.lower()
    return any(address.endswith(s.lower()) if s.startswith('@') else address == s.lower() for s in allowlist)

def run(args):
    allowlist = os.environ.get('EMAIL_ALLOWLIST', DEFAULT).split()
    for item in allowlist:
        candidate = 'synthetic' + item if item.startswith('@') else item
        if not EMAIL.fullmatch(candidate):
            raise GuardError('Invalid EMAIL_ALLOWLIST')
    failures = []
    def check(label, text, identity=False):
        if identity and not EMAIL.fullmatch(text.strip()):
            raise GuardError('Invalid Git identity')
        for address in sorted(set(EMAIL.findall(text))):
            if not allowed(address, allowlist):
                failures.append(label)
                # Mask the full address, including domain, so no personal data is printed.
                print(f'email guard: {label} contains non-allowlisted email [masked]', file=sys.stderr)
    if args and args[0] == '--commit-msg':
        if len(args) != 2:
            raise GuardError('Usage: --commit-msg FILE')
        check('commit message', Path(args[1]).read_text())
        for role in ['AUTHOR', 'COMMITTER']:
            identity = git('var', f'GIT_{role}_IDENT')
            match = re.fullmatch(r'.* <([^<>\n]+)> \d+ [+-]\d{4}\n?', identity)
            if not match:
                raise GuardError('Invalid Git identity')
            check(role.lower(), match[1], identity=True)
    else:
        if len(args) > 1:
            raise GuardError('Only one Git range is accepted')
        ref = args[0] if args else 'origin/main..HEAD'
        if ref.startswith('-') and ref != '--all':
            raise GuardError('Invalid Git range')
        revisions = git('rev-list', ref, '--').splitlines()
        for sha in revisions:
            if not re.fullmatch(r'[0-9a-f]{40,64}', sha):
                raise GuardError('Invalid Git revision')
            for label, fmt in [('author', '%ae'), ('committer', '%ce'), ('message', '%B')]:
                check(label, git('show', '-s', f'--format={fmt}', sha, '--').strip(), identity=label != 'message')
    check('PR title', os.environ.get('PR_TITLE', ''))
    check('PR body', os.environ.get('PR_BODY', ''))
    if failures:
        print('email guard: rejected; use an allowlisted noreply identity.', file=sys.stderr)
        return 1
    print('email guard: passed')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(run(sys.argv[1:]))
    except (GuardError, OSError, UnicodeError, subprocess.SubprocessError):
        print('email guard: unable to complete checks; rejected [details masked]', file=sys.stderr)
        sys.exit(2)
