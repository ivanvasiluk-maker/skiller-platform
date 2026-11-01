import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = (ROOT / 'drizzle/0020_reconcile_published_memory.sql').read_text()
SCHEMA = '\n'.join((ROOT / 'drizzle' / name).read_text() for name in (
    '0008_relationship_memory.sql', '0011_behavioral_memory.sql'))


class MemoryUpgradeTests(unittest.TestCase):
    def test_both_histories_preserve_rows_and_reapply(self):
        for history in ('published', 'github', 'mixed'):
            with self.subTest(history=history):
                db = sqlite3.connect(':memory:')
                if history != 'published':
                    db.executescript(SCHEMA)
                if history != 'github':
                    published = SCHEMA.replace('intervention_memory', 'intervention_memory_v2').replace('behavioral_memory', 'behavioral_memory_v2')
                    db.executescript(published)
                suffix = '_v2' if history == 'published' else ''
                db.execute(f"INSERT INTO behavioral_memory{suffix} (id,user_id,analysis_id,kind,action_urge,topic,intervention_point,created_at) VALUES ('b','owner','a','task','avoid','report','start','2026')")
                db.execute(f"INSERT INTO intervention_memory{suffix} (id,user_id,skill_id,outcome,created_at) VALUES ('i','other','micro-start','done','2026')")
                if history == 'mixed':
                    db.execute("INSERT INTO behavioral_memory_v2 (id,user_id,analysis_id,kind,action_urge,topic,intervention_point,created_at) VALUES ('b2','other','a2','task','avoid','other report','start','2026')")
                db.executescript(BRIDGE)
                before = [db.execute(f'SELECT * FROM {t} ORDER BY id').fetchall() for t in ('behavioral_memory', 'intervention_memory')]
                self.assertEqual(before[0][0][1], 'owner')
                self.assertEqual(before[1][0][1], 'other')
                self.assertEqual(len(before[0]), 2 if history == 'mixed' else 1)
                db.executescript(BRIDGE)
                after = [db.execute(f'SELECT * FROM {t} ORDER BY id').fetchall() for t in ('behavioral_memory', 'intervention_memory')]
                self.assertEqual(before, after)
                if history != 'github':
                    self.assertGreater(db.execute('SELECT count(*) FROM behavioral_memory_v2').fetchone()[0], 0)
                db.close()

    def test_canonical_conflict_wins_without_deleting_source(self):
        db = sqlite3.connect(':memory:')
        db.executescript(BRIDGE)
        for table, topic in [('behavioral_memory', 'current'), ('behavioral_memory_v2', 'prior')]:
            db.execute(f"INSERT INTO {table} (id,user_id,analysis_id,kind,action_urge,topic,intervention_point,created_at) VALUES ('b','owner','a','task','avoid',?,'start','2026')", (topic,))
        db.executescript(BRIDGE)
        self.assertEqual(db.execute('SELECT topic FROM behavioral_memory').fetchone()[0], 'current')
        self.assertEqual(db.execute('SELECT topic FROM behavioral_memory_v2').fetchone()[0], 'prior')
        db.close()
