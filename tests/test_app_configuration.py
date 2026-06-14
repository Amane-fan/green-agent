import os

from app.main import load_environment_config


def test_load_environment_config_reads_dotenv_without_overriding_process_env(
    tmp_path,
    monkeypatch,
):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "GREEN_AGENT_DATABASE_URL=mysql+pymysql://dotenv:secret@127.0.0.1:3306/green_agent",
                "GREEN_AGENT_DB_PATH=/tmp/from-dotenv.sqlite",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("GREEN_AGENT_DATABASE_URL", raising=False)
    monkeypatch.delenv("GREEN_AGENT_DB_PATH", raising=False)

    load_environment_config(env_path)

    assert os.environ["GREEN_AGENT_DATABASE_URL"] == (
        "mysql+pymysql://dotenv:secret@127.0.0.1:3306/green_agent"
    )
    assert os.environ["GREEN_AGENT_DB_PATH"] == "/tmp/from-dotenv.sqlite"

    monkeypatch.setenv(
        "GREEN_AGENT_DATABASE_URL",
        "mysql+pymysql://process:secret@127.0.0.1:3306/green_agent",
    )
    env_path.write_text(
        "GREEN_AGENT_DATABASE_URL=mysql+pymysql://changed:secret@127.0.0.1:3306/green_agent",
        encoding="utf-8",
    )

    load_environment_config(env_path)

    assert os.environ["GREEN_AGENT_DATABASE_URL"] == (
        "mysql+pymysql://process:secret@127.0.0.1:3306/green_agent"
    )
