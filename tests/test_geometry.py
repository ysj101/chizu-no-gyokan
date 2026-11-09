"""Regression fixtures for coastline crossing, touching and collinear cases."""
import runpy
import unittest
from pathlib import Path

geometry = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/check-geometry.py'))


class CoastlineIntersections(unittest.TestCase):
    def test_reject_crossing_and_coastline_contact(self):
        intersects = geometry['intersects']
        self.assertTrue(intersects([0, 0], [2, 0], [1, -1], [1, 1]))
        self.assertTrue(intersects([0, 0], [2, 0], [2, 0], [3, 1]))
        self.assertTrue(intersects([0, 0], [2, 0], [1, 0], [3, 0]))
        self.assertFalse(intersects([0, 0], [2, 0], [3, 0], [4, 0]))
        self.assertFalse(intersects([0, 0], [2, 0], [0, 1], [2, 1]))
