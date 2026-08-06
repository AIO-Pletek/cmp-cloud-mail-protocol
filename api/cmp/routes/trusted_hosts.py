"""Trusted relay hosts API routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from cmp.services.trusted_hosts_service import (
    get_trusted_hosts, add_trusted_host, remove_trusted_host,
    toggle_trusted_host, test_relay_auth, get_relay_stats
)
from cmp.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/trusted-hosts", tags=["Trusted Hosts"])


class TrustedHostAdd(BaseModel):
    address: str = Field(..., description="IP address, CIDR, or hostname")
    label: str = Field("", description="Friendly name for this host")
    auth_type: str = Field("ip", description="Authentication type: ip, smtp_auth, tls_cert")
    username: str = Field("", description="SMTP AUTH username (if auth_type=smtp_auth)")
    password: str = Field("", description="SMTP AUTH password (if auth_type=smtp_auth)")


class HostToggle(BaseModel):
    enabled: bool


class RelayTest(BaseModel):
    address: str
    port: int = 25


@router.get("")
async def list_hosts(tenant=Depends(get_current_user)):
    """Get all trusted relay hosts."""
    hosts = await get_trusted_hosts()
    return {"items": hosts, "total": len(hosts)}


@router.post("")
async def add_host(data: TrustedHostAdd, tenant=Depends(get_current_user)):
    """Add a trusted relay host (origin mail server)."""
    result = await add_trusted_host(
        data.address, data.label, data.auth_type,
        data.username, data.password
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.delete("/{address}")
async def remove_host(address: str, tenant=Depends(get_current_user)):
    """Remove a trusted relay host."""
    # Decode URL-encoded address (CIDR has /)
    address = address.replace("%2F", "/")
    result = await remove_trusted_host(address)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.put("/{address}/toggle")
async def toggle_host(address: str, data: HostToggle, tenant=Depends(get_current_user)):
    """Enable/disable a trusted relay host."""
    address = address.replace("%2F", "/")
    result = await toggle_trusted_host(address, data.enabled)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/test")
async def test_connection(data: RelayTest, tenant=Depends(get_current_user)):
    """Test connection to an origin server."""
    return await test_relay_auth(data.address, data.port)


@router.get("/stats")
async def relay_stats(tenant=Depends(get_current_user)):
    """Get relay statistics."""
    return await get_relay_stats()
