from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, unquote, urlparse

from app.models import (
    PlanningRecordDetail,
    PlanningRecordRestoreResponse,
    PlanningRecordSummary,
    PlanningResult,
    PredictionRecord,
    Scenario,
)


class KnowledgePool:
    def __init__(
        self,
        db_path: str | Path = ":memory:",
        *,
        database_url: str | None = None,
    ) -> None:
        if database_url is None and isinstance(db_path, str) and "://" in db_path:
            database_url = db_path

        self.database_url = database_url
        self._dialect = "mysql" if database_url and database_url.startswith("mysql") else "sqlite"
        self._memory_connection: sqlite3.Connection | None = None
        self._mysql_config: dict[str, Any] | None = None

        if self._dialect == "mysql":
            self.db_path = ""
            self._mysql_config = self._parse_mysql_url(database_url or "")
        else:
            self.db_path = self._resolve_sqlite_path(db_path, database_url)

        self._init_db()

    def _resolve_sqlite_path(
        self,
        db_path: str | Path,
        database_url: str | None,
    ) -> str:
        if database_url and database_url.startswith("sqlite"):
            parsed = urlparse(database_url)
            if parsed.path in {"", "/:memory:"}:
                return ":memory:"
            return unquote(parsed.path)
        return str(db_path)

    def _parse_mysql_url(self, database_url: str) -> dict[str, Any]:
        parsed = urlparse(database_url)
        query = parse_qs(parsed.query)
        return {
            "host": parsed.hostname or "127.0.0.1",
            "port": parsed.port or 3306,
            "user": unquote(parsed.username or "root"),
            "password": unquote(parsed.password or ""),
            "database": parsed.path.lstrip("/"),
            "charset": query.get("charset", ["utf8mb4"])[0],
        }

    def _connect(self):
        if self._dialect == "mysql":
            import pymysql
            import pymysql.cursors

            return pymysql.connect(
                **(self._mysql_config or {}),
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=False,
            )

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

    @contextmanager
    def _transaction(self):
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            if self._dialect == "mysql" or self.db_path != ":memory:":
                connection.close()

    def _sql(self, sql: str) -> str:
        if self._dialect == "mysql":
            return sql.replace("?", "%s")
        return sql

    def _execute(self, connection, sql: str, params: Iterable[Any] = ()):
        if self._dialect == "mysql":
            cursor = connection.cursor()
            cursor.execute(self._sql(sql), tuple(params))
            return cursor
        return connection.execute(sql, tuple(params))

    def _executemany(
        self,
        connection,
        sql: str,
        params: Iterable[Iterable[Any]],
    ) -> None:
        if self._dialect == "mysql":
            with connection.cursor() as cursor:
                cursor.executemany(self._sql(sql), [tuple(item) for item in params])
            return
        connection.executemany(sql, [tuple(item) for item in params])

    def _executescript(self, connection, script: str) -> None:
        if self._dialect == "mysql":
            with connection.cursor() as cursor:
                for statement in script.split(";"):
                    statement = statement.strip()
                    if statement:
                        cursor.execute(statement)
            return
        connection.executescript(script)

    def _init_db(self) -> None:
        schema = self._mysql_schema() if self._dialect == "mysql" else self._sqlite_schema()
        with self._transaction() as connection:
            self._executescript(connection, schema)
            self._ensure_planning_record_title_column(connection)

    def _sqlite_schema(self) -> str:
        return """
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
        CREATE TABLE IF NOT EXISTS planning_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            scenario_id TEXT NOT NULL,
            scenario_name TEXT NOT NULL,
            simulation_time INTEGER NOT NULL,
            seed INTEGER,
            threshold_value REAL NOT NULL,
            route_count INTEGER NOT NULL,
            total_distance REAL NOT NULL,
            estimated_fuel REAL NOT NULL,
            estimated_carbon REAL NOT NULL,
            scenario_snapshot TEXT NOT NULL,
            planning_result TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_planning_records_created_at
            ON planning_records (created_at);
        """

    def _mysql_schema(self) -> str:
        return """
        CREATE TABLE IF NOT EXISTS active_scenario (
            id INTEGER PRIMARY KEY,
            scenario_id VARCHAR(255) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scenarios (
            scenario_id VARCHAR(255) PRIMARY KEY,
            payload LONGTEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fill_history (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            scenario_id VARCHAR(255) NOT NULL,
            bin_id VARCHAR(255) NOT NULL,
            simulation_time INTEGER NOT NULL,
            fill_rate DOUBLE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            scenario_id VARCHAR(255) NOT NULL,
            bin_id VARCHAR(255) NOT NULL,
            future_time INTEGER NOT NULL,
            predicted_fill_rate DOUBLE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            scenario_id VARCHAR(255) NOT NULL,
            bin_id VARCHAR(255) NOT NULL,
            event_type VARCHAR(255) NOT NULL,
            payload LONGTEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS planning_records (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            title VARCHAR(255) NOT NULL,
            scenario_id VARCHAR(255) NOT NULL,
            scenario_name VARCHAR(255) NOT NULL,
            simulation_time INTEGER NOT NULL,
            seed INTEGER NULL,
            threshold_value DOUBLE NOT NULL,
            route_count INTEGER NOT NULL,
            total_distance DOUBLE NOT NULL,
            estimated_fuel DOUBLE NOT NULL,
            estimated_carbon DOUBLE NOT NULL,
            scenario_snapshot LONGTEXT NOT NULL,
            planning_result LONGTEXT NOT NULL,
            created_at VARCHAR(40) NOT NULL,
            INDEX idx_planning_records_created_at (created_at)
        );
        """

    def _ensure_planning_record_title_column(self, connection) -> None:
        if self._dialect == "mysql":
            row = self._execute(
                connection,
                "SHOW COLUMNS FROM planning_records LIKE ?",
                ("title",),
            ).fetchone()
            if row is None:
                self._execute(
                    connection,
                    "ALTER TABLE planning_records ADD COLUMN title VARCHAR(255) NULL AFTER id",
                )
        else:
            columns = self._execute(connection, "PRAGMA table_info(planning_records)").fetchall()
            if not any(column["name"] == "title" for column in columns):
                self._execute(connection, "ALTER TABLE planning_records ADD COLUMN title TEXT")

        if self._dialect == "mysql":
            self._execute(
                connection,
                """
                UPDATE planning_records
                SET title = CONCAT(scenario_name, ' · T', simulation_time, ' · ', created_at)
                WHERE title IS NULL OR title = ''
                """,
            )
        else:
            self._execute(
                connection,
                """
                UPDATE planning_records
                SET title = scenario_name || ' · T' || simulation_time || ' · ' || created_at
                WHERE title IS NULL OR title = ''
                """,
            )

    def _default_planning_title(self, scenario: Scenario, created_at: str) -> str:
        return f"{scenario.name} · T{scenario.current_time} · {created_at}"

    def _normalize_record_title(self, title: str) -> str:
        normalized = title.strip()
        if not normalized:
            raise ValueError("Planning record title cannot be blank")
        return normalized

    def replace_active_scenario(self, scenario: Scenario) -> None:
        payload = json.dumps(scenario.model_dump(mode="json"), ensure_ascii=False)
        with self._transaction() as connection:
            if self._dialect == "mysql":
                self._execute(
                    connection,
                    """
                    REPLACE INTO scenarios (scenario_id, payload) VALUES (?, ?)
                    """,
                    (scenario.id, payload),
                )
            else:
                self._execute(
                    connection,
                    "INSERT OR REPLACE INTO scenarios (scenario_id, payload) VALUES (?, ?)",
                    (scenario.id, payload),
                )
            self._execute(connection, "DELETE FROM active_scenario")
            self._execute(
                connection,
                "INSERT INTO active_scenario (id, scenario_id) VALUES (1, ?)",
                (scenario.id,),
            )

    def reset(self) -> None:
        with self._transaction() as connection:
            for table in (
                "active_scenario",
                "scenarios",
                "fill_history",
                "predictions",
                "events",
            ):
                self._execute(connection, f"DELETE FROM {table}")

    def get_active_scenario(self) -> Scenario | None:
        with self._transaction() as connection:
            row = self._execute(
                connection,
                """
                SELECT s.payload FROM scenarios s
                JOIN active_scenario a ON a.scenario_id = s.scenario_id
                WHERE a.id = 1
                """,
            ).fetchone()
        if row is None:
            return None
        return Scenario.model_validate(json.loads(row["payload"]))

    def record_fill_history(self, scenario: Scenario) -> None:
        rows = [
            (scenario.id, node.id, scenario.current_time, node.fill_rate or 0)
            for node in scenario.bin_nodes
        ]
        with self._transaction() as connection:
            self._executemany(
                connection,
                """
                INSERT INTO fill_history
                    (scenario_id, bin_id, simulation_time, fill_rate)
                VALUES (?, ?, ?, ?)
                """,
                rows,
            )

    def record_predictions(
        self, scenario_id: str, predictions: list[PredictionRecord]
    ) -> None:
        rows = [
            (
                scenario_id,
                prediction.bin_id,
                prediction.future_time,
                prediction.predicted_fill_rate,
            )
            for prediction in predictions
        ]
        with self._transaction() as connection:
            self._executemany(
                connection,
                """
                INSERT INTO predictions
                    (scenario_id, bin_id, future_time, predicted_fill_rate)
                VALUES (?, ?, ?, ?)
                """,
                rows,
            )

    def record_event(
        self,
        scenario_id: str,
        bin_id: str,
        *,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        with self._transaction() as connection:
            self._execute(
                connection,
                """
                INSERT INTO events (scenario_id, bin_id, event_type, payload)
                VALUES (?, ?, ?, ?)
                """,
                (scenario_id, bin_id, event_type, json.dumps(payload)),
            )

    def record_planning_result(
        self,
        scenario: Scenario,
        result: PlanningResult,
        *,
        seed: int | None,
        threshold: float,
    ) -> PlanningRecordDetail:
        created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        title = self._default_planning_title(scenario, created_at)
        scenario_payload = json.dumps(scenario.model_dump(mode="json"), ensure_ascii=False)
        initial_plan_payload = json.dumps(result.model_dump(mode="json"), ensure_ascii=False)

        with self._transaction() as connection:
            cursor = self._execute(
                connection,
                """
                INSERT INTO planning_records
                    (
                        title,
                        scenario_id,
                        scenario_name,
                        simulation_time,
                        seed,
                        threshold_value,
                        route_count,
                        total_distance,
                        estimated_fuel,
                        estimated_carbon,
                        scenario_snapshot,
                        planning_result,
                        created_at
                    )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    title,
                    scenario.id,
                    scenario.name,
                    scenario.current_time,
                    seed,
                    threshold,
                    len(result.routes),
                    result.total_distance,
                    result.estimated_fuel,
                    result.estimated_carbon,
                    scenario_payload,
                    initial_plan_payload,
                    created_at,
                ),
            )
            record_id = int(cursor.lastrowid)
            stored_plan = result.model_copy(update={"record_id": record_id})
            self._execute(
                connection,
                "UPDATE planning_records SET planning_result = ? WHERE id = ?",
                (
                    json.dumps(stored_plan.model_dump(mode="json"), ensure_ascii=False),
                    record_id,
                ),
            )

        return PlanningRecordDetail(
            summary=PlanningRecordSummary(
                id=record_id,
                title=title,
                scenario_id=scenario.id,
                scenario_name=scenario.name,
                simulation_time=scenario.current_time,
                seed=seed,
                threshold=threshold,
                route_count=len(result.routes),
                total_distance=result.total_distance,
                estimated_fuel=result.estimated_fuel,
                estimated_carbon=result.estimated_carbon,
                created_at=created_at,
            ),
            scenario=scenario,
            plan=stored_plan,
        )

    def list_planning_records(self) -> list[PlanningRecordSummary]:
        with self._transaction() as connection:
            rows = self._execute(
                connection,
                """
                SELECT
                    id,
                    title,
                    scenario_id,
                    scenario_name,
                    simulation_time,
                    seed,
                    threshold_value,
                    route_count,
                    total_distance,
                    estimated_fuel,
                    estimated_carbon,
                    created_at
                FROM planning_records
                ORDER BY created_at DESC, id DESC
                """,
            ).fetchall()
        return [self._summary_from_row(row) for row in rows]

    def get_planning_record(self, record_id: int) -> PlanningRecordDetail:
        with self._transaction() as connection:
            row = self._execute(
                connection,
                """
                SELECT
                    id,
                    title,
                    scenario_id,
                    scenario_name,
                    simulation_time,
                    seed,
                    threshold_value,
                    route_count,
                    total_distance,
                    estimated_fuel,
                    estimated_carbon,
                    scenario_snapshot,
                    planning_result,
                    created_at
                FROM planning_records
                WHERE id = ?
                """,
                (record_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"Unknown planning record id: {record_id}")

        return PlanningRecordDetail(
            summary=self._summary_from_row(row),
            scenario=Scenario.model_validate(json.loads(row["scenario_snapshot"])),
            plan=PlanningResult.model_validate(json.loads(row["planning_result"])),
        )

    def restore_planning_record(self, record_id: int) -> PlanningRecordRestoreResponse:
        detail = self.get_planning_record(record_id)
        self.replace_active_scenario(detail.scenario)
        return PlanningRecordRestoreResponse(
            record=detail.summary,
            scenario=detail.scenario,
            plan=detail.plan,
        )

    def rename_planning_record(self, record_id: int, title: str) -> PlanningRecordSummary:
        normalized_title = self._normalize_record_title(title)
        with self._transaction() as connection:
            existing = self._execute(
                connection,
                "SELECT id FROM planning_records WHERE id = ?",
                (record_id,),
            ).fetchone()
            if existing is None:
                raise KeyError(f"Unknown planning record id: {record_id}")
            self._execute(
                connection,
                "UPDATE planning_records SET title = ? WHERE id = ?",
                (normalized_title, record_id),
            )
            row = self._execute(
                connection,
                """
                SELECT
                    id,
                    title,
                    scenario_id,
                    scenario_name,
                    simulation_time,
                    seed,
                    threshold_value,
                    route_count,
                    total_distance,
                    estimated_fuel,
                    estimated_carbon,
                    created_at
                FROM planning_records
                WHERE id = ?
                """,
                (record_id,),
            ).fetchone()
        return self._summary_from_row(row)

    def _summary_from_row(self, row) -> PlanningRecordSummary:
        return PlanningRecordSummary(
            id=row["id"],
            title=row["title"],
            scenario_id=row["scenario_id"],
            scenario_name=row["scenario_name"],
            simulation_time=row["simulation_time"],
            seed=row["seed"],
            threshold=row["threshold_value"],
            route_count=row["route_count"],
            total_distance=row["total_distance"],
            estimated_fuel=row["estimated_fuel"],
            estimated_carbon=row["estimated_carbon"],
            created_at=row["created_at"],
        )

    def get_latest_state(self, scenario_id: str) -> dict[str, Any]:
        with self._transaction() as connection:
            row = self._execute(
                connection,
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
        with self._transaction() as connection:
            rows = self._execute(
                connection,
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
        with self._transaction() as connection:
            rows = self._execute(
                connection,
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
        with self._transaction() as connection:
            rows = self._execute(
                connection,
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
