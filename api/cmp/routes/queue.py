"""Mail queue API routes."""
from fastapi import APIRouter, HTTPException, Depends
from cmp.services.queue_service import (
    get_queue_list, flush_queue, flush_single,
    delete_from_queue, delete_all, hold_message, release_message,
    get_queue_stats, get_message_detail, get_message_headers
)

async def get_tenant_domains(tenant):
    """Get list of domain names for a tenant. Admin sees all."""
    if hasattr(tenant, 'is_admin') and tenant.is_admin:
        return None
    from cmp.database import get_db
    from cmp.models.domain import Domain
    from sqlalchemy import select
    conn = await get_db()
    result = await conn.execute(select(Domain.domain_name).where(Domain.tenant_id == tenant.id, Domain.is_active == True))
    domains = [r[0] for r in result.all()]
    return domains if domains else ['__none__']

from cmp.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/queue", tags=["Mail Queue"])


@router.get("")
async def list_queue(tenant=Depends(get_current_user)):
    """List all mail queue entries."""
    items = await get_queue_list()
    return {"items": items, "total": len(items)}


@router.get("/stats")
async def queue_stats(tenant=Depends(get_current_user)):
    """Get queue statistics."""
    return await get_queue_stats()


@router.get("/{queue_id}")
async def message_detail(queue_id: str, tenant=Depends(get_current_user)):
    """Get full message detail including headers and body preview."""
    result = await get_message_detail(queue_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/{queue_id}/headers")
async def message_headers(queue_id: str, tenant=Depends(get_current_user)):
    """Get only headers from a queued message."""
    result = await get_message_headers(queue_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/flush")
async def flush_all(tenant=Depends(get_current_user)):
    """Flush all queued mail."""
    result = await flush_queue()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/{queue_id}/flush")
async def flush_one(queue_id: str, tenant=Depends(get_current_user)):
    """Flush a single queue entry."""
    result = await flush_single(queue_id)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/{queue_id}/hold")
async def hold(queue_id: str, tenant=Depends(get_current_user)):
    """Put a message on hold."""
    result = await hold_message(queue_id)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/{queue_id}/release")
async def release(queue_id: str, tenant=Depends(get_current_user)):
    """Release a held message."""
    result = await release_message(queue_id)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.delete("/{queue_id}")
async def delete_one(queue_id: str, tenant=Depends(get_current_user)):
    """Delete a message from the queue."""
    result = await delete_from_queue(queue_id)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.delete("")
async def delete_all_messages(tenant=Depends(get_current_user)):
    """Delete ALL queued messages."""
    result = await delete_all()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result
