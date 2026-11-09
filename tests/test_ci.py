"""Exercise the workflow's privacy range selection without real Git identities."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CIRangeFixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        block = workflow.split('        run: |\n', 1)[1].split('\n      - ', 1)[0]
        self.script = '\n'.join(line[10:] for line in block.splitlines())
        scripts = self.directory / 'scripts'
        scripts.mkdir()
        (scripts / 'check-email-privacy.sh').write_text('printf "%s\\n" "$@" > guard-range\n')
        fake_git = self.directory / 'git'
        fake_git.write_text(
            '#!/bin/sh\nset -eu\n'
            '[ "$*" = "merge-base origin/main head" ] || exit 9\n'
            '[ "${GIT_FAILURE:-0}" = 0 ] || exit 7\n'
            'printf "%s\\n" fork\n')
        fake_git.chmod(0o755)
        self.env = {
            **os.environ, 'PATH': str(self.directory) + os.pathsep + os.environ['PATH'],
            'EVENT_NAME': 'push', 'BASE_SHA': '0' * 40,
            'HEAD_SHA': 'head', 'GITHUB_REF_NAME': 'feature/map', 'GIT_FAILURE': '0',
        }

    def run_range(self, **env):
        return subprocess.run(['sh', '-c', self.script], cwd=self.directory,
                              env={**self.env, **env}, capture_output=True, text=True)

    def assert_range(self, expected, **env):
        self.assertEqual(self.run_range(**env).returncode, 0)
        self.assertEqual((self.directory / 'guard-range').read_text(), expected + '\n')

    def test_first_feature_push_uses_main_fork(self):
        self.assert_range('fork..head')

    def test_existing_push_uses_before(self):
        self.assert_range('before..head', BASE_SHA='before')

    def test_pull_request_uses_base(self):
        self.assert_range('pr-base..head', EVENT_NAME='pull_request', BASE_SHA='pr-base')

    def test_first_main_push_checks_all(self):
        self.assert_range('--all', GITHUB_REF_NAME='main')

    def test_missing_merge_base_fails_closed(self):
        self.assertNotEqual(self.run_range(GIT_FAILURE='1').returncode, 0)
        self.assertFalse((self.directory / 'guard-range').exists())
