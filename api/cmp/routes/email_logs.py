"""Email logs API routes."""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from cmp.services.email_log_service import get_email_logs, get_email_stats, parse_and_store_logs, init_email_logs_table
from cmp.middleware.auth import get_current_user
import csv
import io
from datetime import datetime

router = APIRouter(prefix="/api/v1/email-logs", tags=["Email Logs"])


async def get_tenant_domains(tenant):
    """Get list of domain names for a tenant. Admin sees all."""
    if hasattr(tenant, 'is_admin') and tenant.is_admin:
        return None  # None = no filter
    import asyncpg
    with open("/opt/cmp/.env") as f:
        for line in f:
            k, _, v = line.partition("=")
            if k.strip() == "DB_PASSWORD":
                db_pw = v.strip()
    conn = await asyncpg.connect(host="127.0.0.1", port=5432, user="cmp", password=db_pw, database="cmp")
    rows = await conn.fetch("SELECT domain_name FROM domains WHERE tenant_id = $1 AND is_active = true", tenant.id)
    await conn.close()
    domains = [r["domain_name"] for r in rows]
    return domains if domains else ["__none__"]


@router.get("")
async def list_logs(
    domain: str = Query(None), direction: str = Query(None), status: str = Query(None),
    sender: str = Query(None), recipient: str = Query(None),
    page: int = Query(1), per_page: int = Query(50),
    tenant=Depends(get_current_user)
):
    tenant_domains = await get_tenant_domains(tenant)
    return await get_email_logs(domain, direction, status, sender, recipient, page, per_page, tenant_domains)


@router.get("/stats")
async def email_stats(days: int = Query(7), tenant=Depends(get_current_user)):
    tenant_domains = await get_tenant_domains(tenant)
    return await get_email_stats(days, tenant_domains)


@router.post("/sync")
async def sync_logs(tenant=Depends(get_current_user)):
    count = await parse_and_store_logs()
    return {"synced": count, "message": f"Synced {count} new entries"}


@router.post("/init")
async def init_logs(tenant=Depends(get_current_user)):
    await init_email_logs_table()
    return {"message": "Table initialized"}


@router.get("/export")
async def export_logs(
    days: int = Query(7), domain: str = Query(None),
    direction: str = Query(None), status: str = Query(None),
    tenant=Depends(get_current_user)
):
    tenant_domains = await get_tenant_domains(tenant)
    result = await get_email_logs(domain, direction, status, page=1, per_page=10000, tenant_domains=tenant_domains)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Direction", "Sender", "Recipient", "Domain", "Status", "Size", "Relay", "Reason"])
    for item in result["items"]:
        writer.writerow([item.get("timestamp"), item.get("direction"), item.get("sender"),
                         item.get("recipient"), item.get("domain"), item.get("status"),
                         item.get("size_bytes"), item.get("destination_relay"), item.get("status_message")])
    output.seek(0)
    filename = f"cmp_email_logs_{days}d_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})
