"""
FloodGuard 2.1 — SQLite Safe Backup & Disaster Recovery Utility
100% Free, Local, and Open Source.
Uses Python sqlite3.Connection.backup() for ACID consistency.

Usage:
    python backup_restore.py backup
    python backup_restore.py restore <path_to_backup.db>
    python backup_restore.py list
    python backup_restore.py check
"""

import os
import sys
import time
import sqlite3

# Set default persistent database path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(BASE_DIR)
DEFAULT_DB_PATH = os.environ.get("FLOODGUARD_DB_PATH", os.environ.get("DATABASE_PATH", os.path.join(BASE_DIR, "floodguard.db")))
BACKUP_DIR = os.path.join(BASE_DIR, "backups")

def ensure_backup_dir():
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR, exist_ok=True)

def backup_database(db_path: str = DEFAULT_DB_PATH) -> str:
    """Performs an atomic, lock-free online backup using sqlite3.Connection.backup()."""
    ensure_backup_dir()
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found at {db_path}")

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_file = f"floodguard_backup_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_file)

    print(f"[*] Starting atomic SQLite backup from {db_path}...")
    src_conn = sqlite3.connect(db_path)
    dest_conn = sqlite3.connect(backup_path)
    try:
        src_conn.backup(dest_conn)
        print("[+] Backup completed successfully!")
    finally:
        dest_conn.close()
        src_conn.close()

    size_bytes = os.path.getsize(backup_path)
    print(f"[+] Saved backup: {backup_path} ({size_bytes:,} bytes)")
    return backup_path

def restore_database(backup_path: str, db_path: str = DEFAULT_DB_PATH):
    """Restores database safely from an existing backup."""
    if not os.path.exists(backup_path):
        raise FileNotFoundError(f"Backup file not found at {backup_path}")

    # Validate backup file integrity before restoring
    print(f"[*] Validating integrity of {backup_path}...")
    test_conn = sqlite3.connect(backup_path)
    cur = test_conn.cursor()
    cur.execute("PRAGMA integrity_check;")
    status = cur.fetchone()[0]
    test_conn.close()

    if status != "ok":
        raise ValueError(f"Integrity check failed: {status}")

    print(f"[*] Backup file verified valid. Restoring to {db_path}...")
    dest_conn = sqlite3.connect(db_path)
    src_conn = sqlite3.connect(backup_path)
    try:
        src_conn.backup(dest_conn)
        print("[+] Database restored successfully!")
    finally:
        src_conn.close()
        dest_conn.close()

def list_backups():
    ensure_backup_dir()
    files = sorted([f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")])
    if not files:
        print("[*] No backups found in backups directory.")
        return
    print(f"[*] Found {len(files)} backups in {BACKUP_DIR}:")
    for f in files:
        full_path = os.path.join(BACKUP_DIR, f)
        size = os.path.getsize(full_path)
        mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(full_path)))
        print(f"  - {f} ({size:,} bytes, created {mtime})")

def check_integrity(db_path: str = DEFAULT_DB_PATH):
    if not os.path.exists(db_path):
        print(f"[-] Database not found at {db_path}")
        return
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA integrity_check;")
    result = cur.fetchone()[0]
    cur.execute("PRAGMA journal_mode;")
    journal = cur.fetchone()[0]
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r[0] for r in cur.fetchall()]
    conn.close()

    print(f"[+] SQLite Database Integrity: {result}")
    print(f"[+] Journal Mode: {journal}")
    print(f"[+] Tables ({len(tables)}): {', '.join(tables)}")

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] == "status":
        check_integrity()
    elif sys.argv[1] == "backup":
        backup_database()
    elif sys.argv[1] == "restore":
        if len(sys.argv) < 3:
            print("Usage: python backup_restore.py restore <backup_path>")
            sys.exit(1)
        restore_database(sys.argv[2])
    elif sys.argv[1] == "list":
        list_backups()
    elif sys.argv[1] == "check":
        check_integrity()
    else:
        print(f"Unknown command: {sys.argv[1]}")
