"""Mail queue management via Postfix."""
import asyncio
import re


async def get_queue_list() -> list[dict]:
    """List all mail queue entries."""
    proc = await asyncio.create_subprocess_exec(
        "postqueue", "-p",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await proc.communicate()
    return _parse_postqueue_text(stdout.decode())


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
    count = 0
    for line in output.split("\n"):
        if line and line[0].isalnum() and " " in line[:20]:
            count += 1
    return count


async def get_message_detail(queue_id: str) -> dict:
    """Get full message detail including headers using postcat."""
    proc = await asyncio.create_subprocess_exec(
        "postcat", "-q", queue_id,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        return {"error": stderr.decode().strip() or f"Message {queue_id} not found"}

    raw = stdout.decode()
    return _parse_postcat_output(raw, queue_id)


async def get_message_headers(queue_id: str) -> dict:
    """Get only headers from a queued message."""
    detail = await get_message_detail(queue_id)
    if "error" in detail:
        return detail
    return {
        "queue_id": queue_id,
        "headers": detail.get("headers", {}),
        "header_raw": detail.get("header_raw", ""),
        "metadata": detail.get("metadata", {}),
    }


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
        return {"total": 0, "active": 0, "hold": 0, "deferred": 0, "oldest_age": None}

    total = active = hold = deferred = 0
    for line in output.split("\n"):
        if not line.strip():
            continue
        if line.startswith("*"):
            active += 1; total += 1
        elif line.startswith("!"):
            hold += 1; total += 1
        elif len(line) > 10 and line[0].isalnum():
            total += 1
            if "deferred" in line.lower():
                deferred += 1
            else:
                active += 1

    return {"total": total, "active": active, "hold": hold, "deferred": deferred, "oldest_age": None}


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
            stripped = line.strip()
            if "@" in stripped:
                current["recipients"].append(stripped.split(";")[0].strip())
            elif stripped:
                current["reason"] = stripped

    if current:
        items.append(current)
    return items


def _parse_postcat_output(raw: str, queue_id: str) -> dict:
    """Parse postcat -q output into structured data."""
    result = {
        "queue_id": queue_id,
        "metadata": {},
        "headers": {},
        "header_raw": "",
        "body_preview": "",
    }

    lines = raw.split("\n")
    in_header = False
    in_body = False
    header_lines = []
    body_lines = []
    current_header = None

    for line in lines:
        # Metadata lines start with *** 
        if line.startswith("*** "):
            # Parse metadata like: *** ENVELOPE RECORDS active/QUEUE_ID ***
            # Or: message_size, arrival_time, etc.
            if ":" in line:
                key, _, val = line.partition(":")
                key = key.strip().lstrip("*** ").rstrip(" ***").strip()
                val = val.strip()
                result["metadata"][key] = val
            continue

        # Header section
        if not in_body:
            # Headers start with a line like "header: value"
            if re.match(r'^[A-Za-z][\w-]*:', line):
                in_header = True
                header_lines.append(line)
                # Parse header
                hname, _, hval = line.partition(":")
                current_header = hname.strip()
                result["headers"][current_header] = hval.strip()
            elif in_header and line.startswith(" ") or line.startswith("\t"):
                # Continuation of previous header
                if current_header and current_header in result["headers"]:
                    result["headers"][current_header] += " " + line.strip()
                header_lines.append(line)
            elif in_header and line.strip() == "":
                # Empty line = end of headers
                in_header = False
                in_body = True
                continue
        else:
            # Body
            body_lines.append(line)

    result["header_raw"] = "\n".join(header_lines)
    result["body_preview"] = "\n".join(body_lines[:50])  # First 50 lines of body

    return result
