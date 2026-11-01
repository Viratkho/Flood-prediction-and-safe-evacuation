import json
import time
from datetime import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Response, Request
from backend.api.auth_admin import check_admin_rbac
from fastapi.responses import JSONResponse
from backend.database import get_db, SEED_DATA_PATH
from backend.models import person_row_to_dict

router = APIRouter()

def load_scenarios() -> List[Dict[str, Any]]:
    try:
        with open(SEED_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("scenarios", [])
    except Exception:
        return []

SCENARIOS = load_scenarios()

def experiment_log_row_to_dict(row: Any) -> Dict[str, Any]:
    if not row:
        return {}
    d = dict(row)
    return {
        "id": d.get("id"),
        "timestamp": d.get("timestamp"),
        "scenarioId": d.get("scenario_id"),
        "scenarioName": d.get("scenario_name"),
        "personId": d.get("person_id"),
        "personName": d.get("person_name"),
        "inputCondition": d.get("input_condition"),
        "previousPriority": d.get("previous_priority"),
        "newPriority": d.get("new_priority"),
        "reason": d.get("reason"),
        "outcome": d.get("outcome"),
    }

@router.get("/api/research/scenarios")
def get_scenarios():
    return SCENARIOS

@router.post("/api/research/run-scenario")
def run_scenario(request: Request, payload: Dict[str, Any] = None):
    check_admin_rbac(request)
    payload = payload or {}
    scenario_id = payload.get("scenarioId")
    scenario = next((s for s in SCENARIOS if s["id"] == scenario_id), None)
    if not scenario:
        return JSONResponse(status_code=404, content={"error": "Scenario not found"})

    now_str = time.strftime("%I:%M:%S %p")
    new_logs = []

    with get_db() as conn:
        people_rows = conn.execute("SELECT * FROM people").fetchall()
        people = [person_row_to_dict(r) for r in people_rows]

        if scenario_id == "SCENARIO-A":
            for p in people:
                if p["personId"] == "P-103":
                    prev_p = p["rescuePriority"]
                    p["driftStatus"] = "DRIFTING"
                    p["driftConfidence"] = 98
                    p["driftVelocityMs"] = 2.4
                    p["floodDepthCm"] = 78
                    p["rescuePriority"] = "P0"

                    conn.execute(
                        """
                        UPDATE people
                        SET drift_status = 'DRIFTING',
                            drift_confidence = 98,
                            drift_velocity_ms = 2.4,
                            flood_depth_cm = 78,
                            rescue_priority = 'P0'
                        WHERE person_id = 'P-103'
                        """
                    )

                    log_entry = {
                        "timestamp": now_str,
                        "scenarioId": scenario_id,
                        "scenarioName": scenario["name"],
                        "personId": p["personId"],
                        "personName": p["name"],
                        "inputCondition": "Drift velocity surge: 2.4 m/s in 78cm water",
                        "previousPriority": prev_p,
                        "newPriority": "P0",
                        "reason": "P0 Immediate Danger: High-velocity drift along Kovur tributary",
                        "outcome": "Surfaced as Top P0 Emergency Beacon on Command Dashboard",
                    }
                    new_logs.append(log_entry)

        elif scenario_id == "SCENARIO-B":
            for p in people:
                if p["personId"] in ("P-105", "P-107"):
                    prev_p = p["rescuePriority"]
                    p["commStatus"] = "UNREACHABLE"
                    p["healthDataValidity"] = "UNKNOWN"

                    conn.execute(
                        """
                        UPDATE people
                        SET comm_status = 'UNREACHABLE',
                            health_data_validity = 'UNKNOWN'
                        WHERE person_id = ?
                        """,
                        (p["personId"],),
                    )

                    log_entry = {
                        "timestamp": now_str,
                        "scenarioId": scenario_id,
                        "scenarioName": scenario["name"],
                        "personId": p["personId"],
                        "personName": p["name"],
                        "inputCondition": "LoRa gateway packet loss: Health data unavailable",
                        "previousPriority": prev_p,
                        "newPriority": p["rescuePriority"],
                        "reason": "Mandatory Rule: Missing data in flood zone must not lower priority",
                        "outcome": f"Priority preserved at {p['rescuePriority']} (Not lowered to routine)",
                    }
                    new_logs.append(log_entry)

        elif scenario_id == "SCENARIO-C":
            for p in people:
                if p["personId"] == "P-102":
                    prev_p = p["rescuePriority"]
                    p["rescuePriority"] = "P1"
                    conn.execute(
                        "UPDATE people SET rescue_priority = 'P1' WHERE person_id = 'P-102'"
                    )
                    log_entry = {
                        "timestamp": now_str,
                        "scenarioId": scenario_id,
                        "scenarioName": scenario["name"],
                        "personId": p["personId"],
                        "personName": p["name"],
                        "inputCondition": "Compound route obstruction and rising culvert",
                        "previousPriority": prev_p,
                        "newPriority": "P1",
                        "reason": "P1 High Priority: Impending roadway submergence",
                        "outcome": "Dispatched tactical reroute directive",
                    }
                    new_logs.append(log_entry)

        elif scenario_id == "SCENARIO-D":
            for p in people:
                if p["personId"] == "P-101":
                    log_entry = {
                        "timestamp": now_str,
                        "scenarioId": scenario_id,
                        "scenarioName": scenario["name"],
                        "personId": p["personId"],
                        "personName": p["name"],
                        "inputCondition": "Baseline sensor noise check within normal variance",
                        "previousPriority": p["rescuePriority"],
                        "newPriority": p["rescuePriority"],
                        "reason": "False-positive suppression: Micro-drift rejected",
                        "outcome": "Priority maintained without spurious escalation",
                    }
                    new_logs.append(log_entry)

        for l in new_logs:
            conn.execute(
                """
                INSERT INTO experiment_logs (
                    timestamp, scenario_id, scenario_name, person_id, person_name,
                    input_condition, previous_priority, new_priority, reason, outcome
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    l["timestamp"],
                    l["scenarioId"],
                    l["scenarioName"],
                    l["personId"],
                    l["personName"],
                    l["inputCondition"],
                    l["previousPriority"],
                    l["newPriority"],
                    l["reason"],
                    l["outcome"],
                ),
            )

        all_logs_rows = conn.execute("SELECT * FROM experiment_logs ORDER BY id DESC").fetchall()
        all_logs = [experiment_log_row_to_dict(r) for r in all_logs_rows]

        people_after_rows = conn.execute("SELECT * FROM people").fetchall()
        people_after = [person_row_to_dict(r) for r in people_after_rows]

    return {
        "success": True,
        "scenario": scenario,
        "message": f"Scenario {scenario['name']} executed. Recorded experiment metrics.",
        "logs": all_logs,
        "peopleAfter": people_after,
    }

@router.get("/api/research/logs")
def get_research_logs():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM experiment_logs ORDER BY id DESC").fetchall()
        logs = [experiment_log_row_to_dict(r) for r in rows]
    return logs

@router.get("/api/research/export")
def export_research(format: str = "json"):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM experiment_logs ORDER BY id ASC").fetchall()
        logs = [experiment_log_row_to_dict(r) for r in rows]

    if format.lower() == "csv":
        headers = "Timestamp,ScenarioID,ScenarioName,PersonID,PersonName,InputCondition,PreviousPriority,NewPriority,Reason,Outcome\n"
        csv_rows = []
        for l in logs:
            ts = l.get("timestamp", "")
            sid = l.get("scenarioId", "")
            sname = l.get("scenarioName", "")
            pid = l.get("personId", "")
            pname = l.get("personName", "")
            cond = str(l.get("inputCondition", "")).replace('"', '""')
            prev_p = l.get("previousPriority", "")
            new_p = l.get("newPriority", "")
            reason = str(l.get("reason", "")).replace('"', '""')
            outcome = str(l.get("outcome", "")).replace('"', '""')
            csv_rows.append(f'"{ts}","{sid}","{sname}","{pid}","{pname}","{cond}","{prev_p}","{new_p}","{reason}","{outcome}"')

        content = headers + "\n".join(csv_rows)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="floodguard_research_experiment_logs.csv"'},
        )

    return {
        "exportedAt": datetime.now().isoformat(),
        "totalLogs": len(logs),
        "logs": logs,
    }
