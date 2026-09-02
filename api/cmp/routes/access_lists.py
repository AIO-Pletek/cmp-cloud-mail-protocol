"""Whitelist/Blocklist API routes."""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from cmp.services.access_list_service import (
    get_lists, add_entry, remove_entry, toggle_entry,
    get_stats, init_lists_table, sync_to_rspamd
)

async def get_tenant_domains(tenant):
    """Get list of domain names for a tenant. Admin sees all."""
    if hasattr(tenant, "is_admin") and tenant.is_admin:
        return None
    from cmp.database import get_db
    from cmp.models.domain import Domain
    from sqlalchemy import select
    conn = await get_db()
    result = await conn.execute(select(Domain.domain_name).where(Domain.tenant_id == tenant.id, Domain.is_active == True))
    domains = [r[0] for r in result.all()]
    return domains if domains else ["__none__"]

from cmp.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/access-lists", tags=["Access Lists"])


class AddEntryRequest(BaseModel):
    list_type: str = Field(..., description="white or block")
    entry_type: str = Field(..., description="email, domain, or ip")
    value: str
    reason: str = None
    domain_id: str = None


class ToggleRequest(BaseModel):
    enabled: bool


@router.get("")
async def list_entries(
    list_type: str = Query(None),
    entry_type: str = Query(None),
    domain_id: str = Query(None),
    tenant=Depends(get_current_user)
):
    """Get all whitelist/blocklist entries."""
    tenant_id = tenant.get("id") if isinstance(tenant, dict) else None
    return await get_lists(tenant_id, domain_id, list_type, entry_type)


@router.get("/stats")
async def stats(tenant=Depends(get_current_user)):
    """Get whitelist/blocklist statistics."""
    return await get_stats()


@router.post("")
async def create_entry(req: AddEntryRequest, tenant=Depends(get_current_user)):
    """Add a new whitelist/blocklist entry."""
    if req.list_type not in ("white", "block"):
        raise HTTPException(400, "list_type must be 'white' or 'block'")
    if req.entry_type not in ("email", "domain", "ip"):
        raise HTTPException(400, "entry_type must be 'email', 'domain', or 'ip'")
    try:
        tenant_id = tenant.get("id") if isinstance(tenant, dict) else None
        entry = await add_entry(
            req.list_type, req.entry_type, req.value,
            tenant_id, req.domain_id, req.reason
        )
        return entry
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.delete("/{entry_id}")
async def delete_entry(entry_id: int, tenant=Depends(get_current_user)):
    """Delete a whitelist/blocklist entry."""
    removed = await remove_entry(entry_id)
    if not removed:
        raise HTTPException(404, "Entry not found")
    return {"message": "Entry deleted"}


@router.put("/{entry_id}/toggle")
async def toggle(entry_id: int, req: ToggleRequest, tenant=Depends(get_current_user)):
    """Enable/disable a whitelist/blocklist entry."""
    result = await toggle_entry(entry_id, req.enabled)
    if not result:
        raise HTTPException(404, "Entry not found")
    return result


@router.post("/init")
async def init_lists(tenant=Depends(get_current_user)):
    """Initialize access_lists table."""
    await init_lists_table()
    return {"message": "Table initialized"}


@router.post("/sync")
async def sync_lists(tenant=Depends(get_current_user)):
    """Sync whitelist/blocklist to Rspamd and Postfix."""
    result = await sync_to_rspamd()
    return result
