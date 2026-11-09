"""Synthetic fixtures: fake Git metadata only; never read actual user identities."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
GOOD = 'robot@noreply.example.test'
BAD = 'private@example.test'
ALLOW = '@noreply.example.test'

class PrivacyFixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        fake = self.dir/'git'
        fake.write_text('''#!/usr/bin/env python3
import os, sys
args=sys.argv[1:]
if os.environ.get('GIT_FAILURE') == '1': sys.exit(7)
if args[0]=='rev-list':
 if args[1]=='invalid..range': sys.exit(128)
 print('a'*40)
elif args[0]=='show':
 fmt=args[2]
 print(os.environ.get({'--format=%ae':'FIX_AUTHOR','--format=%ce':'FIX_COMMITTER','--format=%B':'FIX_MESSAGE'}[fmt], ''))
elif args[0]=='var':
 role='FIX_AUTHOR' if args[1]=='GIT_AUTHOR_IDENT' else 'FIX_COMMITTER'
 print('Synthetic <'+os.environ[role]+'> 1000000000 +0000')
else: sys.exit(9)
''')
        fake.chmod(0o755)
        self.env = {**os.environ, 'PATH': str(self.dir)+os.pathsep+os.environ['PATH'],
                    'FIX_AUTHOR': GOOD, 'FIX_COMMITTER': GOOD, 'FIX_MESSAGE': 'synthetic',
                    'EMAIL_ALLOWLIST': ALLOW, 'PR_TITLE': '', 'PR_BODY': ''}
    def run_guard(self, *args, **env):
        return subprocess.run(['sh', str(ROOT/'scripts/check-email-privacy.sh'), *args],
                              env={**self.env, **env}, capture_output=True, text=True)
    def test_each_surface_allowed_and_rejected(self):
        for field in ['FIX_AUTHOR', 'FIX_COMMITTER', 'FIX_MESSAGE', 'PR_TITLE', 'PR_BODY']:
            with self.subTest(field=field):
                self.assertEqual(self.run_guard('base..head', **{field: GOOD}).returncode, 0)
                result = self.run_guard('base..head', **{field: BAD})
                self.assertEqual(result.returncode, 1)
                self.assertNotIn(BAD, result.stdout+result.stderr)
                self.assertNotIn('example.test', result.stdout+result.stderr)
                self.assertIn('[masked]', result.stderr)
    def test_coauthor(self):
        for email, code in [(GOOD, 0), (BAD, 1)]:
            self.assertEqual(self.run_guard('base..head', FIX_MESSAGE=f'body\n\nCo-authored-by: Synthetic <{email}>').returncode, code)
    def test_suffix_and_case(self):
        self.assertEqual(self.run_guard(FIX_AUTHOR='ROBOT@NOREPLY.EXAMPLE.TEST').returncode, 0)
        for email in ['robot@noreply.example.test.evil.test', 'robot@evilnoreply.example.test']:
            self.assertEqual(self.run_guard(FIX_AUTHOR=email).returncode, 1)
    def test_override_and_exact_address(self):
        self.assertEqual(self.run_guard(EMAIL_ALLOWLIST=BAD, FIX_AUTHOR=BAD, FIX_COMMITTER=BAD).returncode, 0)
        self.assertEqual(self.run_guard(EMAIL_ALLOWLIST=BAD, FIX_AUTHOR='not'+BAD, FIX_COMMITTER=BAD).returncode, 1)
        self.assertEqual(self.run_guard(EMAIL_ALLOWLIST='').returncode, 1)
    def test_commit_msg_untouched(self):
        path = self.dir/'message'
        for email, code in [(BAD, 1), (GOOD, 0)]:
            original = f'body\nCo-authored-by: Synthetic <{email}>\n'.encode()
            path.write_bytes(original)
            self.assertEqual(self.run_guard('--commit-msg', str(path)).returncode, code)
            self.assertEqual(path.read_bytes(), original)
        path.write_text('synthetic')
        self.assertEqual(self.run_guard('--commit-msg', str(path), FIX_AUTHOR=BAD).returncode, 1)
        self.assertEqual(self.run_guard('--commit-msg', str(path), FIX_COMMITTER=BAD).returncode, 1)
    def test_fail_closed(self):
        self.assertEqual(self.run_guard('invalid..range').returncode, 2)
        self.assertEqual(self.run_guard('base..head', GIT_FAILURE='1').returncode, 2)
        self.assertEqual(self.run_guard('base..head', FIX_AUTHOR='').returncode, 2)
        self.assertEqual(self.run_guard('--bad-option').returncode, 2)
        self.assertEqual(self.run_guard('--commit-msg', str(self.dir/'missing')).returncode, 2)
        self.assertEqual(self.run_guard(EMAIL_ALLOWLIST='invalid').returncode, 2)
