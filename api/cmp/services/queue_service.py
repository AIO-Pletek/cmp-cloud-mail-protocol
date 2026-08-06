"""Mail queue management via Postfix."""
import asyncio


async def get_queue_list() -> list[dict]:
    """List all mail queue entries."""
    proc = await asyncio.create_subprocess_exec(
        "postqueue", "-j",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        # Fallback: use postqueue -p (human readable)
        proc2 = await asyncio.create_subprocess_exec(
            "postqueue", "-p",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout2, _ = await proc2.communicate()
        return _parse_postqueue_text(stdout2.decode())

    # JSON output
    import json
    items = []
    for line in stdout.decode().strip().split("\n"):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
            items.append(_normalize_queue_entry(entry))
        except json.JSONDecodeError:
            continue
    return items


async def get_queue_count() -> int:
    """Get total queue count."""
    proc = await asyncio.create_subprocess_exec(
        "postqueue", "-p",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await proc.communicate()
    output = stdout.decode()
    if "Mail queue is empty" in output:
        return 0
    # Count lines starting with queue ID (alphanumeric followed by space)
    count = 0
    for line in output.split("\n"):
        if line and line[0].isalnum() and " " in line[:20]:
            count += 1
    return count


async def flush_queue() -> dict:
    """Flush all queued mail immediately."""
    proc = await asyncio.create_subprocess_exec(
        "postqueue", "-f",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {
        "success": proc.returncode == 0,
        "message": "Queue flushed" if proc.returncode == 0 else stderr.decode().strip()
    }


async def flush_single(queue_id: str) -> dict:
    """Flush a single queue entry."""
    proc = await asyncio.create_subprocess_exec(
        "postqueue", "-i", queue_id,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {
        "success": proc.returncode == 0,
        "message": f"Message {queue_id} flushed" if proc.returncode == 0 else stderr.decode().strip()
    }


async def delete_from_queue(queue_id: str) -> dict:
    """Delete a message from the queue."""
    proc = await asyncio.create_subprocess_exec(
        "postsuper", "-d", queue_id,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {
        "success": proc.returncode == 0,
        "message": f"Message {queue_id} deleted" if proc.returncode == 0 else stderr.decode().strip()
    }


async def delete_all() -> dict:
    """Delete ALL queued messages (dangerous!)."""
    proc = await asyncio.create_subprocess_exec(
        "postsuper", "-d", "ALL",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {
        "success": proc.returncode == 0,
        "message": "All messages deleted" if proc.returncode == 0 else stderr.decode().strip()
    }


async def hold_message(queue_id: str) -> dict:
    """Put a message on hold."""
    proc = await asyncio.create_subprocess_exec(
        "postsuper", "-h", queue_id,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {
        "success": proc.returncode == 0,
        "message": f"Message {queue_id} on hold" if proc.returncode == 0 else stderr.decode().strip()
    }


async def release_message(queue_id: str) -> dict:
    """Release a held message."""
    proc = await asyncio.create_subprocess_exec(
        "postsuper", "-H", queue_id,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {
        "success": proc.returncode == 0,
        "message": f"Message {queue_id} released" if proc.returncode == 0 else stderr.decode().strip()
    }


async def get_queue_stats() -> dict:
    """Get queue statistics."""
    proc = await asyncio.create_subprocess_exec(
        "postqueue", "-p",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await proc.communicate()
    output = stdout.decode()

    if "Mail queue is empty" in output:
        return {
            "total": 0,
            "active": 0,
            "hold": 0,
            "deferred": 0,
            "oldest_age": None
        }

    total = 0
    active = 0
    hold = 0
    deferred = 0

    for line in output.split("\n"):
        if not line.strip():
            continue
        if line.startswith("*"):
            active += 1
            total += 1
        elif line.startswith("!"):
            hold += 1
            total += 1
        elif len(line) > 10 and line[0].isalnum():
            total += 1
            if "deferred" in line.lower():
                deferred += 1
            else:
                active += 1

    return {
        "total": total,
        "active": active,
        "hold": hold,
        "deferred": deferred,
        "oldest_age": None
    }


def _normalize_queue_entry(entry: dict) -> dict:
    """Normalize a JSON queue entry from postqueue -j."""
    return {
        "queue_id": entry.get("queue_id", entry.get("queue_name", "")),
        "sender": entry.get("sender", ""),
        "recipients": [r.get("address", r) if isinstance(r, dict) else r for r in entry.get("recipients", [])],
        "status": entry.get("status", "active"),
        "time": entry.get("time", ""),
        "reason": entry.get("reason", ""),
        "size": entry.get("size", 0),
        "attempts": entry.get("attempts", 0),
        "next_attempt": entry.get("next_attempt", ""),
    }


def _parse_postqueue_text(output: str) -> list[dict]:
    """Parse human-readable postqueue -p output."""
    items = []
    if "Mail queue is empty" in output:
        return items

    current = None
    for line in output.split("\n"):
        line = line.rstrip()
        if not line:
            continue

        # Queue entry header: "QUEUE_ID SIZE TIMESTAMP SENDER"
        if len(line) > 10 and line[0].isalnum() and (" " in line[:20]):
            parts = line.split()
            if len(parts) >= 4:
                if current:
                    items.append(current)
                queue_id = parts[0].replace("*", "").replace("!", "")
                status = "active" if "*" in parts[0] else ("hold" if "!" in parts[0] else "deferred")
                current = {
                    "queue_id": queue_id,
                    "sender": parts[-1] if "@" in parts[-1] else "",
                    "recipients": [],
                    "status": status,
                    "size": parts[1] if len(parts) > 2 else "",
                    "time": " ".join(parts[2:-1]) if len(parts) > 3 else "",
                    "reason": "",
                    "attempts": 0,
                    "next_attempt": "",
                }
        elif current and line.startswith("    "):
            # Recipient line or reason line
            stripped = line.strip()
            if "@" in stripped:
                current["recipients"].append(stripped.split(";")[0].strip())
            elif stripped:
                current["reason"] = stripped

    if current:
        items.append(current)

    return items
