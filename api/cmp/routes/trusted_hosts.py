"""Trusted relay hosts API routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from cmp.services.trusted_hosts_service import (
    get_trusted_hosts, add_trusted_host, remove_trusted_host,
    toggle_trusted_host, test_relay_auth, get_relay_stats, verify_host_credential
)
from cmp.middleware.auth import require_admin

router = APIRouter(prefix="/api/v1/trusted-hosts", tags=["Trusted Hosts"])

ALLOWED_AUTH_TYPES = {"smtp_auth", "api_token"}


class TrustedHostAdd(BaseModel):
    address: str = Field(..., description="IP address or CIDR of origin mail server")
    label: str = Field("", description="Friendly name for this server")
    auth_type: str = Field(..., description="Authentication type: smtp_auth or api_token")
    username: Optional[str] = Field("", description="SMTP username (auth_type=smtp_auth)")
    password: Optional[str] = Field("", description="SMTP password (auth_type=smtp_auth)")
    api_token: Optional[str] = Field("", description="API token (auth_type=api_token)")
    port: int = Field(25, description="SMTP port for verification")


class HostToggle(BaseModel):
    enabled: bool


class RelayTest(BaseModel):
    address: str
    port: int = 25
    auth_type: str = "smtp_auth"
    username: Optional[str] = ""
    password: Optional[str] = ""
    api_token: Optional[str] = ""


@router.get("")
async def list_hosts(tenant=Depends(require_admin)):
    """Get all trusted relay hosts."""
    hosts = await get_trusted_hosts()
    return {"items": hosts, "total": len(hosts)}


@router.post("")
async def add_host(data: TrustedHostAdd, tenant=Depends(require_admin)):
    """Add a trusted relay host. Requires smtp_auth or api_token — IP-only not accepted."""
    # Enforce mandatory auth type
    if data.auth_type not in ALLOWED_AUTH_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"auth_type must be one of {sorted(ALLOWED_AUTH_TYPES)}. "
                   f"IP-only is not accepted — all origin servers must be verified."
        )

    # Enforce credentials present
    if data.auth_type == "smtp_auth":
        if not data.username or not data.password:
            raise HTTPException(
                status_code=400,
                detail="SMTP Auth requires both username and password."
            )
    elif data.auth_type == "api_token":
        if not data.api_token:
            raise HTTPException(
                status_code=400,
                detail="API Token auth requires a non-empty token."
            )

    # Verify credential before accepting
    verified = await verify_host_credential(
        address=data.address,
        port=data.port,
        auth_type=data.auth_type,
        username=data.username or "",
        password=data.password or "",
        api_token=data.api_token or "",
    )
    if not verified["success"]:
        raise HTTPException(
            status_code=422,
            detail=f"Credential verification failed: {verified['message']}. "
                   f"Fix the credentials or ensure port {data.port} is reachable from this gateway."
        )

    result = await add_trusted_host(
        data.address, data.label, data.auth_type,
        data.username or "", data.password or "", data.api_token or ""
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.delete("/{address}")
async def remove_host(address: str, tenant=Depends(require_admin)):
    """Remove a trusted relay host."""
    address = address.replace("%2F", "/")
    result = await remove_trusted_host(address)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.put("/{address}/toggle")
async def toggle_host(address: str, data: HostToggle, tenant=Depends(require_admin)):
    """Enable/disable a trusted relay host."""
    address = address.replace("%2F", "/")
    result = await toggle_trusted_host(address, data.enabled)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/test")
async def test_connection(data: RelayTest, tenant=Depends(require_admin)):
    """Test connection and credential to an origin server (pre-add check)."""
    return await verify_host_credential(
        address=data.address,
        port=data.port,
        auth_type=data.auth_type,
        username=data.username or "",
        password=data.password or "",
        api_token=data.api_token or "",
    )


@router.get("/stats")
async def relay_stats(tenant=Depends(require_admin)):
    """Get relay statistics."""
    return await get_relay_stats()
