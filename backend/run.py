"""Engine entry point: `python -m backend.run` (dev) or metisclip-engine.exe (packaged).

Contract (docs/desktop-contract.md §3): bind 127.0.0.1 on METISCLIP_PORT (0 = OS
assigned), print exactly one ready line on stdout once the server accepts
connections, or one fatal line and exit 1.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import sys
import threading
import time
from backend.core import i18n

M = i18n.messages({
    "data_folder": {
        "id": "Folder data tidak dapat disiapkan: {error}",
        "en": "The data folder can't be prepared: {error}",
    },
    "no_token": {
        "id": "METISCLIP_TOKEN tidak di-set",
        "en": "METISCLIP_TOKEN is not set",
    },
    "database": {
        "id": "Database gagal disiapkan: {error}",
        "en": "The database couldn't be prepared: {error}",
    },
    "port": {
        "id": "Port engine tidak dapat dibuka: {error}",
        "en": "The engine port can't be opened: {error}",
    },
    "server_error": {
        "id": "Server engine gagal dijalankan: {error}",
        "en": "The engine server failed to start: {error}",
    },
    "server": {
        "id": "Server engine gagal dijalankan",
        "en": "The engine server failed to start",
    },
})

# stdout is reserved for the ready/fatal line; everything else goes to stderr
_REAL_STDOUT = sys.stdout if sys.stdout is not None else open(os.devnull, "w")
if sys.stderr is None:  # windowed (noconsole) build without a parent pipe
    sys.stderr = open(os.devnull, "w")
sys.stdout = sys.stderr


def _emit(obj: dict) -> None:
    try:
        _REAL_STDOUT.write(json.dumps(obj) + "\n")
        _REAL_STDOUT.flush()
    except Exception:
        pass


def _t(key: str, **values) -> str:
    # Startup errors come before (or instead of) the database: the language comes from METISCLIP_LANG
    return M.text(key, i18n.offline_language(), **values)


def _fatal(message: str) -> None:
    _emit({"event": "fatal", "message": message})
    logging.getLogger("metisclip").error("FATAL: %s", message)
    logging.shutdown()
    os._exit(1)


def _parent_watchdog(request_shutdown) -> None:
    """Exit when the desktop shell that started us disappears (no orphan engine)."""
    import psutil

    ppid_env = os.environ.get("METISCLIP_PARENT_PID")
    try:
        ppid = int(ppid_env) if ppid_env else os.getppid()
    except ValueError:
        return
    if ppid <= 1:
        return
    while True:
        time.sleep(2)
        if not psutil.pid_exists(ppid):
            logging.getLogger("metisclip").warning("Parent process %s is gone; shutting down", ppid)
            request_shutdown()
            return


def _housekeeping(stop: threading.Event) -> None:
    from backend.agents.tools import ytdlp
    from backend.core import acl, cache, disk
    from backend.core.paths import get_paths
    from backend.services.backup import maybe_daily_backup

    log = logging.getLogger("metisclip.housekeeping")
    # A data folder outside the user profile (D:\MetisClip) inherits the drive's access list: every account
    # of the PC could open the clips and the database files
    try:
        acl.restrict_data_root(get_paths().data_root)
    except Exception as exc:
        log.warning("Restricting the data folder failed: %s", exc)
    # Nothing ran in this session yet: whatever the cache holds was left by the last one (a crash, a hard kill)
    try:
        cache.clear_leftovers()
    except Exception as exc:
        log.warning("Cache cleanup failed: %s", exc)
    if stop.wait(120):
        return
    while True:
        try:
            cache.enforce_limit()
        except Exception as exc:
            log.warning("Cache limit check failed: %s", exc)
        try:
            maybe_daily_backup()  # once a day, checked by its own clock
        except Exception as exc:
            log.warning("Daily backup failed: %s", exc)
        try:
            ytdlp.maybe_auto_update()  # once a day, while no job or export runs
        except Exception as exc:
            log.warning("yt-dlp update check failed: %s", exc)
        try:
            disk.warn_if_low()  # under 5 GB: a notice at most every few hours
        except Exception as exc:
            log.warning("Disk space check failed: %s", exc)
        if stop.wait(600):
            return


def selftest() -> None:
    """`metisclip-engine.exe --selftest`: proves the frozen bundle can run ffmpeg + MediaPipe tracking."""
    import tempfile
    from pathlib import Path

    from backend.agents.tools.smart_crop import process_auto_tracking_video
    from backend.core import procs
    from backend.core.config import ffmpeg_path

    result: dict = {"event": "selftest"}
    with tempfile.TemporaryDirectory(prefix="metisclip-selftest-") as tmp:
        src, out = Path(tmp) / "src.mp4", Path(tmp) / "tracked.mp4"
        try:
            procs.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                       "testsrc=size=640x360:rate=30:duration=1", "-pix_fmt", "yuv420p", str(src)], timeout=60)
            result["ffmpeg"] = True
            result["tracking"] = process_auto_tracking_video(str(src), str(out))
        except Exception as exc:
            result["error"] = str(exc)
    result["ok"] = bool(result.get("ffmpeg") and result.get("tracking"))
    _emit(result)
    os._exit(0 if result["ok"] else 1)


def main() -> None:
    from backend.core.paths import get_paths
    from backend.core.logging_setup import setup_logging

    if "--selftest" in sys.argv:
        selftest()
        return

    try:
        paths = get_paths()
        paths.ensure()
        setup_logging()
    except Exception as exc:
        _fatal(_t("data_folder", error=exc))
        return

    log = logging.getLogger("metisclip")
    from backend.core.config import config

    log.info("MetisClip engine %s starting (env=%s, data_root=%s)", config.version, config.env, paths.data_root)
    if not config.token:
        _fatal(_t("no_token"))

    from backend.core import db as dbm
    from backend.core.procs import kill_all
    from backend.core.queue import runner

    try:
        dbm.connect()
        dbm.migrate()
        from backend.core.paths import moved_from

        if moved_from():
            from backend.services.data_move import rewrite_paths

            rewrite_paths(moved_from(), paths.data_root)
        from backend.core.settings_store import get_settings, write_mongod_options

        settings = get_settings()
        write_mongod_options(settings)
    except dbm.DatabaseError as exc:
        _fatal(str(exc))
        return
    except Exception as exc:
        log.exception("Database initialisation failed")
        _fatal(_t("database", error=exc))
        return

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", config.requested_port))
        sock.listen(128)
        config.port = sock.getsockname()[1]
    except OSError as exc:
        _fatal(_t("port", error=exc))
        return

    import uvicorn

    from backend.main import create_app

    server_ref: dict = {}

    def request_shutdown() -> None:
        srv = server_ref.get("server")
        if srv is not None:
            srv.should_exit = True

    app = create_app(request_shutdown)
    uv_config = uvicorn.Config(app, log_config=None, access_log=False, lifespan="on", ws="websockets",
                               timeout_graceful_shutdown=3)
    server = uvicorn.Server(uv_config)
    server_ref["server"] = server

    stop = threading.Event()

    async def serve() -> None:
        task = asyncio.create_task(server.serve(sockets=[sock]))
        while not server.started and not task.done():
            await asyncio.sleep(0.05)
        if server.started:
            # Workers start only once the event loop is bound (events reach the WS bus)
            runner.start()
            threading.Thread(target=_housekeeping, args=(stop,), daemon=True, name="housekeeping").start()
            threading.Thread(target=_parent_watchdog, args=(request_shutdown,), daemon=True, name="watchdog").start()
            from backend.agents.tools.ffmpeg_ops import detect_hw_encoders

            # Warm the encoder probe so the System check / first clip do not wait for it
            threading.Thread(target=detect_hw_encoders, daemon=True, name="encoder-probe").start()
            log.info("Engine ready on 127.0.0.1:%s", config.port)
            _emit({"event": "ready", "port": config.port, "version": config.version})
            await task
            return
        try:
            await task
        except BaseException as exc:  # noqa: BLE001
            _fatal(_t("server_error", error=exc))
        _fatal(_t("server"))

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass
    except Exception:
        log.exception("Server crashed")
    finally:
        log.info("Stopping workers…")
        stop.set()
        try:
            runner.shutdown(timeout=5)
        except Exception:
            log.exception("Runner shutdown failed")
        kill_all()
        if not config.mongodb_uri:
            log.info("Stopping MongoDB…")
            dbm.shutdown_server()
        dbm.close()
        log.info("Engine stopped")
        logging.shutdown()
        os._exit(0)


if __name__ == "__main__":
    main()
