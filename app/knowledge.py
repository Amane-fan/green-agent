from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.models import PredictionRecord, Scenario


class KnowledgePool:
    def __init__(self, db_path: str | Path = ":memory:") -> None:
        self.db_path = str(db_path)
        self._memory_connection: sqlite3.Connection | None = None
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        if self.db_path == ":memory:":
            if self._memory_connection is None:
                self._memory_connection = sqlite3.connect(
                    self.db_path,
                    check_same_thread=False,
                )
                self._memory_connection.row_factory = sqlite3.Row
            return self._memory_connection
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS active_scenario (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    scenario_id TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS scenarios (
                    scenario_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS fill_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scenario_id TEXT NOT NULL,
                    bin_id TEXT NOT NULL,
                    simulation_time INTEGER NOT NULL,
                    fill_rate REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scenario_id TEXT NOT NULL,
                    bin_id TEXT NOT NULL,
                    future_time INTEGER NOT NULL,
                    predicted_fill_rate REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scenario_id TEXT NOT NULL,
                    bin_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                """
            )

    def replace_active_scenario(self, scenario: Scenario) -> None:
        payload = json.dumps(scenario.model_dump(mode="json"), ensure_ascii=False)
        with self._connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO scenarios (scenario_id, payload) VALUES (?, ?)",
                (scenario.id, payload),
            )
            connection.execute("DELETE FROM active_scenario")
            connection.execute(
                "INSERT INTO active_scenario (id, scenario_id) VALUES (1, ?)",
                (scenario.id,),
            )

    def reset(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                DELETE FROM active_scenario;
                DELETE FROM scenarios;
                DELETE FROM fill_history;
                DELETE FROM predictions;
                DELETE FROM events;
                """
            )

    def get_active_scenario(self) -> Scenario | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT s.payload FROM scenarios s
                JOIN active_scenario a ON a.scenario_id = s.scenario_id
                WHERE a.id = 1
                """
            ).fetchone()
        if row is None:
            return None
        return Scenario.model_validate(json.loads(row["payload"]))

    def record_fill_history(self, scenario: Scenario) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO fill_history
                    (scenario_id, bin_id, simulation_time, fill_rate)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (scenario.id, node.id, scenario.current_time, node.fill_rate or 0)
                    for node in scenario.bin_nodes
                ],
            )

    def record_predictions(
        self, scenario_id: str, predictions: list[PredictionRecord]
    ) -> None:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO predictions
                    (scenario_id, bin_id, future_time, predicted_fill_rate)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        scenario_id,
                        prediction.bin_id,
                        prediction.future_time,
                        prediction.predicted_fill_rate,
                    )
                    for prediction in predictions
                ],
            )

    def record_event(
        self,
        scenario_id: str,
        bin_id: str,
        *,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO events (scenario_id, bin_id, event_type, payload)
                VALUES (?, ?, ?, ?)
                """,
                (scenario_id, bin_id, event_type, json.dumps(payload)),
            )

    def get_latest_state(self, scenario_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM scenarios WHERE scenario_id = ?",
                (scenario_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"Unknown scenario id: {scenario_id}")
        return {
            "scenario": Scenario.model_validate(json.loads(row["payload"])),
            "history": self.list_history(scenario_id),
            "predictions": self.list_predictions(scenario_id),
        }

    def list_history(self, scenario_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT bin_id, simulation_time, fill_rate
                FROM fill_history
                WHERE scenario_id = ?
                ORDER BY id
                """,
                (scenario_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_predictions(self, scenario_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT bin_id, future_time, predicted_fill_rate
                FROM predictions
                WHERE scenario_id = ?
                ORDER BY id
                """,
                (scenario_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_events(self, scenario_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT bin_id, event_type, payload
                FROM events
                WHERE scenario_id = ?
                ORDER BY id
                """,
                (scenario_id,),
            ).fetchall()
        events = [dict(row) for row in rows]
        for event in events:
            event["payload"] = json.loads(event["payload"])
        return events
