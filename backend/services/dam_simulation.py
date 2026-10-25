import time
import math
import random
import json
from datetime import datetime
from typing import Dict, Any, List
from backend.database import get_db
from backend.models import dam_state_row_to_dict

class DamSimulationService:
    def __init__(self):
        self.is_storm_active = False
        self.is_full_flood_active = False

    def get_state(self) -> Dict[str, Any]:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM dam_state WHERE id = 1").fetchone()
            return dam_state_row_to_dict(row)

    def start_storm(self) -> Dict[str, Any]:
        self.is_storm_active = True
        self.is_full_flood_active = False
        now_iso = datetime.now().isoformat()
        with get_db() as conn:
            conn.execute(
                """
                UPDATE dam_state
                SET precipitation_mm_h = 48,
                    rate_of_rise_m_min = 0.05,
                    status = 'STORM BUILDUP',
                    is_storm_active = 1,
                    is_full_flood_active = 0,
                    last_updated = ?
                WHERE id = 1
                """,
                (now_iso,),
            )
        return self.get_state()

    def surge(self, surge_cm: float = 25.0) -> Dict[str, Any]:
        surge_m = surge_cm / 100.0
        now_iso = datetime.now().isoformat()
        with get_db() as conn:
            row = conn.execute("SELECT * FROM dam_state WHERE id = 1").fetchone()
            curr_level = row["reservoir_level_m"] if row else 32.4
            curr_rate = row["rate_of_rise_m_min"] if row else 0.02
            release = row["spillway_release_cusecs"] if row else 3500.0
            status = row["status"] if row else "NORMAL"

            new_level = round(curr_level + surge_m, 2)
            new_rate = round(curr_rate + 0.03, 2)

            if new_level >= 36:
                status = "CRITICAL"
                release += 9000
            elif new_level >= 34:
                status = "WARNING"
                release += 4500

            conn.execute(
                """
                UPDATE dam_state
                SET reservoir_level_m = ?,
                    rate_of_rise_m_min = ?,
                    spillway_release_cusecs = ?,
                    status = ?,
                    last_updated = ?
                WHERE id = 1
                """,
                (new_level, new_rate, release, status, now_iso),
            )
        return self.get_state()

    def trigger_full_flood(self) -> Dict[str, Any]:
        self.is_full_flood_active = True
        self.is_storm_active = True
        now_iso = datetime.now().isoformat()
        with get_db() as conn:
            conn.execute(
                """
                UPDATE dam_state
                SET precipitation_mm_h = 75,
                    spillway_release_cusecs = 31000,
                    inflow_cusecs = 39000,
                    reservoir_level_m = 37.4,
                    rate_of_rise_m_min = 0.09,
                    status = 'CRITICAL',
                    is_storm_active = 1,
                    is_full_flood_active = 1,
                    last_updated = ?
                WHERE id = 1
                """,
                (now_iso,),
            )
        return self.get_state()

    def reset(self) -> Dict[str, Any]:
        self.is_storm_active = False
        self.is_full_flood_active = False
        now_iso = datetime.now().isoformat()
        with get_db() as conn:
            conn.execute(
                """
                UPDATE dam_state
                SET reservoir_level_m = 32.4,
                    precipitation_mm_h = 14.5,
                    rate_of_rise_m_min = 0.02,
                    spillway_release_cusecs = 3500,
                    inflow_cusecs = 14200,
                    status = 'NORMAL',
                    is_storm_active = 0,
                    is_full_flood_active = 0,
                    last_updated = ?
                WHERE id = 1
                """,
                (now_iso,),
            )
        return self.get_state()

    def tick(self):
        now_iso = datetime.now().isoformat()
        time_str = datetime.now().strftime("%I:%M:%S %p")
        with get_db() as conn:
            row = conn.execute("SELECT * FROM dam_state WHERE id = 1").fetchone()
            if not row:
                return

            level = row["reservoir_level_m"]
            precip = row["precipitation_mm_h"]
            rate = row["rate_of_rise_m_min"]
            release = row["spillway_release_cusecs"]
            inflow = row["inflow_cusecs"]
            status = row["status"]
            history = json.loads(row["history"] or "[]")

            if self.is_full_flood_active:
                level = min(37.8, round(level + 0.05, 2))
                precip = 68
                rate = 0.09
                release = 28500
                inflow = 39000
                status = "CRITICAL"
            elif self.is_storm_active:
                level = min(36.2, round(level + 0.02, 2))
                precip = 46
                rate = 0.04
                release = 12000
                inflow = 24500
                status = "WARNING"
            else:
                delta = (random.random() - 0.5) * 0.01
                level = round(max(30.0, min(34.0, level + delta)), 2)
                status = "WARNING" if level > 35 else "NORMAL"

            history.append({
                "timestamp": time_str,
                "level": level,
                "precipitation": precip,
                "release": release,
            })
            if len(history) > 60:
                history = history[-60:]

            conn.execute(
                """
                UPDATE dam_state
                SET reservoir_level_m = ?,
                    precipitation_mm_h = ?,
                    rate_of_rise_m_min = ?,
                    spillway_release_cusecs = ?,
                    inflow_cusecs = ?,
                    status = ?,
                    history = ?,
                    last_updated = ?
                WHERE id = 1
                """,
                (level, precip, rate, release, inflow, status, json.dumps(history), now_iso),
            )

dam_service = DamSimulationService()
