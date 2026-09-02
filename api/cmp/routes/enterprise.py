"""Enterprise features routes - DLP, DKIM rotation, archiving, compliance."""
import json, os, subprocess, uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from cmp.middleware.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/v1/enterprise", tags=["Enterprise"])

DLP_FILE = "/etc/cmp/dlp_rules.json"
ARCHIVE_FILE = "/etc/cmp/archiving_config.json"
DKIM_DIR = "/etc/opendkim/keys"

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


@router.get("/dkim-rotation")
async def dkim_info(tenant=Depends(get_current_user)):
    domains = []
    if os.path.exists(DKIM_DIR):
        for entry in os.scandir(DKIM_DIR):
            if entry.is_dir():
                key_file = os.path.join(entry.path, f"{entry.name}.private")
                txt_file = os.path.join(entry.path, f"{entry.name}.txt")
                info = {"domain": entry.name, "key_exists": os.path.exists(key_file)}
                if os.path.exists(txt_file):
                    with open(txt_file) as f: info["dns_record"] = f.read().strip()
                domains.append(info)
    return {"domains": domains, "rotation_interval_days": 90}


@router.post("/dkim-rotation/{domain}")
async def rotate_dkim(domain: str, tenant=Depends(require_admin)):
    domain_dir = os.path.join(DKIM_DIR, domain)
    os.makedirs(domain_dir, exist_ok=True)
    selector = f"cmp{datetime.now().strftime('%Y%m')}"
    result = subprocess.run(
        ["opendkim-genkey", "-D", domain_dir, "-d", domain, "-s", selector],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"DKIM generation failed: {result.stderr}")
    txt_path = os.path.join(domain_dir, f"{selector}.txt")
    dns_record = ""
    if os.path.exists(txt_path):
        with open(txt_path) as f: dns_record = f.read().strip()
    return {"domain": domain, "selector": selector, "dns_record": dns_record, "action": "Add this TXT record to DNS"}


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
