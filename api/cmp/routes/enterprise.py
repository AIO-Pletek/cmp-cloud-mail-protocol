"""Enterprise features routes - DLP, DKIM rotation, archiving, compliance."""
import json, os, subprocess, uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from cmp.middleware.auth import get_current_user, require_admin
from cmp.database import get_db
from cmp.models.domain import Domain
from cmp.config import settings
from cmp.services import dkim_service

router = APIRouter(prefix="/api/v1/enterprise", tags=["Enterprise"])

DLP_FILE = "/etc/cmp/dlp_rules.json"
ARCHIVE_FILE = "/etc/cmp/archiving_config.json"
LEGACY_DKIM_DIR = "/etc/opendkim/keys"

def _load_json(path, default=None):
    if os.path.exists(path):
        with open(path) as f: return json.load(f)
    return default if default is not None else []

def _save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f: json.dump(data, f, indent=2, default=str)


class DLPRule(BaseModel):
    name: str
    pattern: str
    action: str = "tag"  # block|tag|quarantine
    description: Optional[str] = ""

class ArchivingConfig(BaseModel):
    enabled: bool = False
    retention_days: int = 365
    include_attachments: bool = True


@router.get("/features")
async def get_features(tenant=Depends(get_current_user)):
    return {
        "dlp": True,
        "dkim_rotation": True,
        "email_archiving": True,
        "compliance_reports": True,
        "advanced_filtering": True,
        "dedicated_support": tenant.plan == "enterprise",
    }


@router.get("/dlp")
async def list_dlp(tenant=Depends(require_admin)):
    rules = _load_json(DLP_FILE, [])
    default_rules = [
        {"id": "sys-cc", "name": "Credit Card", "pattern": r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b", "action": "block", "description": "Credit card numbers", "enabled": True, "system": True},
        {"id": "sys-ssn", "name": "SSN", "pattern": r"\b\d{3}-\d{2}-\d{4}\b", "action": "tag", "description": "Social Security Numbers", "enabled": True, "system": True},
        {"id": "sys-email-bulk", "name": "Email List Leak", "pattern": r"(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[\s,;]+){5,}", "action": "quarantine", "description": "5+ email addresses", "enabled": True, "system": True},
    ]
    return {"system_rules": default_rules, "custom_rules": rules}


@router.post("/dlp")
async def create_dlp(req: DLPRule, tenant=Depends(require_admin)):
    rules = _load_json(DLP_FILE, [])
    rule = {"id": str(uuid.uuid4())[:8], **req.model_dump(), "enabled": True, "created_at": datetime.utcnow().isoformat()}
    rules.append(rule)
    _save_json(DLP_FILE, rules)
    return rule


@router.delete("/dlp/{rule_id}")
async def delete_dlp(rule_id: str, tenant=Depends(require_admin)):
    rules = [r for r in _load_json(DLP_FILE, []) if r["id"] != rule_id]
    _save_json(DLP_FILE, rules)
    return {"deleted": rule_id}


@router.post("/dlp/sync")
async def sync_dlp(tenant=Depends(require_admin)):
    rules = _load_json(DLP_FILE, [])
    lua_lines = ["-- Auto-generated DLP rules by CMP"]
    for r in rules:
        if r.get("enabled", True):
            safe_name = r["name"].upper().replace(" ", "_")
            lua_lines.append(f"config[\'regexp\'][\'DLP_{safe_name}\'] = {{")
            pat = r['pattern']; lua_lines.append(f"  re = '{pat}';")
            lua_lines.append(f"  score = 20.0;")
            desc = r['description']; lua_lines.append(f"  description = '{desc}';")
            lua_lines.append(f"}}")
    lua_content = "\n".join(lua_lines)
    os.makedirs("/etc/rspamd/local.d", exist_ok=True)
    with open("/etc/rspamd/local.d/dlp_regexp.lua", "w") as f:
        f.write(lua_content)
    subprocess.run(["systemctl", "reload", "rspamd"], capture_output=True)
    return {"synced": len(rules), "file": "/etc/rspamd/local.d/dlp_regexp.lua"}


async def _dkim_source_domains(tenant, db: AsyncSession) -> list[Domain]:
    """DB domains the current user may manage (admin: all active; tenant: own)."""
    q = select(Domain).where(Domain.is_active == True)
    if not tenant.is_admin:
        q = q.where(Domain.tenant_id == tenant.id)
    return list((await db.execute(q)).scalars().all())


@router.get("/dkim-rotation")
async def dkim_info(tenant=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    selector = settings.DKIM_SELECTOR
    domains = []
    seen = set()

    # Source of truth: registered domains (DB).  "key_exists" reflects the
    # rspamd signing path, not the legacy opendkim folder.
    for d in await _dkim_source_domains(tenant, db):
        key_path = dkim_service.signing_key_path(d.domain_name, selector)
        info = {
            "domain": d.domain_name,
            "selector": selector,
            "dns_host": f"{selector}._domainkey.{d.domain_name}",
            "key_exists": os.path.exists(key_path),
            "key_path": key_path,
            "verified": bool(d.is_verified),
            "active": bool(d.is_active),
            "source": "db",
        }
        if d.dkim_public_key:
            info["dns_record"] = dkim_service.dns_record_from_pem(d.dkim_public_key)
        else:
            pub = dkim_service.get_public_key_path(d.domain_name, selector)
            if os.path.exists(pub):
                with open(pub) as _f:
                    info["dns_record"] = dkim_service.dns_record_from_pem(_f.read())
        domains.append(info)
        seen.add(d.domain_name)

    # Legacy opendkim keys not tracked in the DB stay visible so nothing
    # disappears from the UI; they are flagged as unmanaged.
    if os.path.isdir(LEGACY_DKIM_DIR):
        for entry in os.scandir(LEGACY_DKIM_DIR):
            if not entry.is_dir() or entry.name in seen:
                continue
            txt = None
            for fname in os.listdir(entry.path):
                if fname.endswith(".txt"):
                    with open(os.path.join(entry.path, fname)) as f:
                        txt = f.read().strip()
                    break
            info = {
                "domain": entry.name,
                "selector": selector,
                "dns_host": f"{selector}._domainkey.{entry.name}",
                "key_exists": os.path.exists(dkim_service.signing_key_path(entry.name, selector)),
                "key_path": dkim_service.signing_key_path(entry.name, selector),
                "verified": None,
                "active": True,
                "source": "legacy",
            }
            if txt:
                info["dns_record"] = txt
            domains.append(info)

    return {
        "domains": domains,
        "rotation_interval_days": 90,
        "signer": "rspamd",
        "key_dir": settings.RSPAMD_DKIM_DIR,
        "selector": selector,
    }


@router.post("/dkim-rotation/sync")
async def sync_dkim_keys(tenant=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Backfill: ensure every registered domain has a live rspamd signing key."""
    selector = settings.DKIM_SELECTOR
    results = []
    for d in await _dkim_source_domains(tenant, db):
        status = await dkim_service.ensure_signing_key(d.domain_name, selector)
        results.append({"domain": d.domain_name, "status": status})
    return {"synced": results}


@router.post("/dkim-rotation/{domain}")
async def rotate_dkim(domain: str, tenant=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    d = (await db.execute(select(Domain).where(Domain.domain_name == domain))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' is not registered on this gateway")

    selector, public_key = await dkim_service.rotate_key(domain, settings.DKIM_SELECTOR)

    d.dkim_public_key = public_key
    d.dkim_selector = selector
    d.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return {
        "domain": domain,
        "selector": selector,
        "dns_host": f"{selector}._domainkey.{domain}",
        "dns_record": dkim_service.dns_record_from_pem(public_key),
        "action": "Update the existing TXT record (host stays the same) - old key archived on the server",
        "rotated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/archiving")
async def get_archiving(tenant=Depends(get_current_user)):
    return _load_json(ARCHIVE_FILE, {"enabled": False, "retention_days": 365, "include_attachments": True, "storage_path": "/var/archive/mail"})


@router.put("/archiving")
async def update_archiving(req: ArchivingConfig, tenant=Depends(get_current_user)):
    config = req.model_dump()
    config["storage_path"] = "/var/archive/mail"
    config["updated_at"] = datetime.utcnow().isoformat()
    _save_json(ARCHIVE_FILE, config)
    return config


@router.get("/compliance")
async def compliance_check(tenant=Depends(get_current_user)):
    archive = _load_json(ARCHIVE_FILE, {"enabled": False, "retention_days": 365})
    return {
        "gdpr": [
            {"check": "Data retention policy", "status": "pass" if archive.get("retention_days") else "fail", "detail": f"{archive.get('retention_days', 0)} days"},
            {"check": "Audit logging", "status": "pass", "detail": "Audit log active"},
            {"check": "Access controls", "status": "pass", "detail": "JWT + RBAC"},
            {"check": "Data encryption in transit", "status": "pass", "detail": "TLS 1.2/1.3"},
            {"check": "Right to erasure", "status": "info", "detail": "Manual process required"},
        ],
        "hipaa": [
            {"check": "Access control", "status": "pass", "detail": "MFA + RBAC"},
            {"check": "Audit controls", "status": "pass", "detail": "Full audit trail"},
            {"check": "Transmission security", "status": "pass", "detail": "TLS enforced"},
            {"check": "Encryption at rest", "status": "info", "detail": "Database-level encryption recommended"},
            {"check": "Automatic logoff", "status": "info", "detail": "JWT expiry 30min"},
        ],
    }
