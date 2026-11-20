"""
Who may open the data folder (§6.1 Permissions).

A folder inside the user profile inherits the profile's access list: the user, SYSTEM and Administrators.
One outside it, e.g. D:\\MetisClip, inherits the drive's, where every account of the PC may read the clips
and the database files and change them ("Authenticated Users: Modify", "Users: Read"). The engine gives
such a folder the profile's access list at start; the files inside follow it through inheritance.

Access lists are read as SDDL (`icacls /save`), so SIDs are compared, never the account names Windows
translates ("NT AUTHORITY\\SYSTEM" is "NT-AUTORITÄT\\SYSTEM" on a German Windows).
"""
from __future__ import annotations

import functools
import logging
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from backend.core import procs

logger = logging.getLogger(__name__)

SYSTEM = "S-1-5-18"
ADMINISTRATORS = "S-1-5-32-544"
# SDDL short names of well-known accounts
_ALIASES = {"SY": SYSTEM, "BA": ADMINISTRATORS, "BU": "S-1-5-32-545", "AU": "S-1-5-11", "WD": "S-1-1-0",
            "CO": "S-1-3-0", "OW": "S-1-3-4", "IU": "S-1-5-4"}

_ACE = re.compile(r"\(([^;()]*);([^;()]*);[^;()]*;[^;()]*;[^;()]*;([^;()]+)\)")


@dataclass
class Dacl:
    protected: bool  # does not inherit from the parent folder
    allowed: list[str]  # SIDs of every allow entry (inherited or not)


def parse_sddl(sddl: str) -> Dacl | None:
    """The DACL part of an SDDL string: "D:PAI(A;OICI;FA;;;SY)(A;OICIID;FA;;;S-1-5-21-…)"."""
    m = re.search(r"D:([A-Z]*)((?:\([^()]*\))*)", sddl)
    if not m:
        return None
    allowed = []
    for kind, _flags, sid in _ACE.findall(m.group(2)):
        if kind in ("A", "OA"):
            allowed.append(_ALIASES.get(sid, sid))
    return Dacl(protected="P" in m.group(1), allowed=allowed)


@functools.lru_cache(maxsize=1)
def current_user_sid() -> str | None:
    """The SID of the Windows account the engine runs as (`whoami /user`)."""
    try:
        out = procs.run(["whoami", "/user", "/fo", "csv", "/nh"], timeout=15, check=False).stdout or b""
    except Exception as exc:
        logger.warning("whoami failed: %s", exc)
        return None
    m = re.search(rb'"(S-1-[0-9-]+)"', out)
    return m.group(1).decode("ascii") if m else None


def read_dacl(path: Path) -> Dacl | None:
    if os.name != "nt":
        return None
    with tempfile.TemporaryDirectory(prefix="metisclip-acl-") as tmp:
        out = Path(tmp) / "acl.txt"
        try:
            procs.run(["icacls", str(path), "/save", str(out)], timeout=20, check=False)
            text = out.read_bytes().decode("utf-16", "replace")
        except Exception as exc:
            logger.warning("Could not read the access list of %s: %s", path, exc)
            return None
    return parse_sddl(text)


def is_private(dacl: Dacl, user_sid: str | None) -> bool:
    """Only this user, SYSTEM and Administrators are allowed in (a user profile folder's list)."""
    own = {SYSTEM, ADMINISTRATORS} | ({user_sid} if user_sid else set())
    return bool(dacl.allowed) and all(sid in own for sid in dacl.allowed)


def status(root: Path) -> str:
    """"private" (only this Windows account, plus SYSTEM and Administrators), "shared", or "unknown"."""
    dacl = read_dacl(root)
    if dacl is None:
        return "unknown"
    return "private" if is_private(dacl, current_user_sid()) else "shared"


def restrict_data_root(root: Path) -> bool:
    """
    Gives a data folder that inherits a shared access list (a folder on another drive, or one just moved
    or copied there) the profile's list. A folder whose list was set by hand (it inherits nothing) is left
    as it is. Returns True when the list was changed.
    """
    dacl = read_dacl(root)
    if dacl is None or dacl.protected:
        return False
    sid = current_user_sid()
    if is_private(dacl, sid):
        return False  # inside the user profile: private through inheritance already
    if sid:
        me = f"*{sid}"
    else:
        user = os.environ.get("USERNAME") or ""
        domain = os.environ.get("USERDOMAIN")
        me = f"{domain}\\{user}" if domain else user
    try:
        # /reset drops entries someone added for other accounts; /inheritance:r then the drive's ones.
        # Files inside inherit the new list (about 0.6 s for 3000 files on the reference laptop).
        procs.run(["icacls", str(root), "/reset"], timeout=600)
        procs.run(["icacls", str(root), "/inheritance:r", "/grant:r", f"*{SYSTEM}:(OI)(CI)F",
                   f"*{ADMINISTRATORS}:(OI)(CI)F", f"{me}:(OI)(CI)F"], timeout=600)
    except Exception as exc:
        logger.warning("Could not restrict the data folder %s to this Windows account: %s", root, exc)
        return False
    logger.info("Data folder %s restricted to this Windows account (it inherited %s access entries)",
                root, len(dacl.allowed))
    return True
