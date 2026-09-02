"""Outgoing relay API routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from cmp.services.relay_service import (
    get_relay_config, update_relay_config, add_domain_relay,
    remove_domain_relay, test_relay, get_relay_logs
)
from cmp.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/relay", tags=["Mail Relay"])


class RelayConfigUpdate(BaseModel):
    enabled: bool = True
    relay_host: str = ""
    relay_port: int = 587
    relay_username: str = ""
    relay_password: str = ""
    relay_tls: bool = True


class DomainRelayAdd(BaseModel):
    domain: str
    relay_host: str
    relay_port: int = 587
    username: str = ""
    password: str = ""


class RelayTest(BaseModel):
    host: str
    port: int = 587
    username: str = ""
    password: str = ""


@router.get("")
async def get_config(tenant=Depends(get_current_user)):
    """Get current relay configuration."""
    return await get_relay_config()


@router.put("")
async def update_config(data: RelayConfigUpdate, tenant=Depends(get_current_user)):
    """Update relay configuration."""
    result = await update_relay_config(data.model_dump())
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/domain")
async def add_domain(data: DomainRelayAdd, tenant=Depends(get_current_user)):
    """Add sender-dependent relay for a domain."""
    result = await add_domain_relay(
        data.domain, data.relay_host, data.relay_port,
        data.username, data.password
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.delete("/domain/{domain}")
async def remove_domain(domain: str, tenant=Depends(get_current_user)):
    """Remove sender-dependent relay for a domain."""
    result = await remove_domain_relay(domain)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/test")
async def test_connection(data: RelayTest, tenant=Depends(get_current_user)):
    """Test SMTP relay connection."""
    return await test_relay(data.host, data.port, data.username, data.password)


@router.get("/logs")
async def relay_logs(limit: int = 50, tenant=Depends(get_current_user)):
    """Get recent relay/sending logs."""
    return await get_relay_logs(limit)
