"""Enterprise relay API routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from cmp.services.enterprise_relay_service import (
    get_relay_auth_config, update_relay_auth_config,
    list_api_keys, create_api_key, revoke_api_key, verify_api_key,
    get_rate_limits, update_rate_limits,
    get_trusted_hosts, add_trusted_host, remove_trusted_host
)
from cmp.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/gateway", tags=["Enterprise Gateway"])


class RelayConfigUpdate(BaseModel):
    global_config: dict | None = Field(None, alias="global")
    rate_limits: dict | None = None
    verification: dict | None = None
    filtering: dict | None = None
    notifications: dict | None = None


class ApiKeyCreate(BaseModel):
    label: str
    allowed_ips: list[str] = []
    rate_limit: int | None = None
    expires_days: int = 365


class TrustedHostAdd(BaseModel):
    address: str
    label: str = ""
    auth_type: str = "ip"
    username: str = ""
    password: str = ""
    rate_limit: int | None = None
    max_connections: int | None = None


class RateLimitUpdate(BaseModel):
    per_ip_per_minute: int = 60
    per_ip_per_hour: int = 1000
    per_ip_per_day: int = 10000
    per_auth_per_minute: int = 120
    per_auth_per_hour: int = 5000
    connections_per_ip: int = 10


# ==================== CONFIG ====================

@router.get("/config")
async def get_config(tenant=Depends(get_current_user)):
    """Get full enterprise gateway configuration."""
    return await get_relay_auth_config()


@router.put("/config")
async def update_config(data: dict, tenant=Depends(get_current_user)):
    """Update enterprise gateway configuration."""
    return await update_relay_auth_config(data)


# ==================== API KEYS ====================

@router.get("/api-keys")
async def list_keys(tenant=Depends(get_current_user)):
    """List all relay API keys."""
    keys = await list_api_keys()
    return {"items": keys, "total": len(keys)}


@router.post("/api-keys")
async def create_key(data: ApiKeyCreate, tenant=Depends(get_current_user)):
    """Create a new relay API key."""
    result = await create_api_key(data.label, data.allowed_ips, data.rate_limit, data.expires_days)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.delete("/api-keys/{key_id}")
async def revoke_key(key_id: str, tenant=Depends(get_current_user)):
    """Revoke an API key."""
    return await revoke_api_key(key_id)


@router.post("/api-keys/verify")
async def verify_key(key: str, client_ip: str = "", tenant=Depends(get_current_user)):
    """Verify a relay API key (for testing)."""
    return await verify_api_key(key, client_ip)


# ==================== TRUSTED HOSTS ====================

@router.get("/trusted-hosts")
async def list_hosts(tenant=Depends(get_current_user)):
    """Get all trusted relay hosts with security details."""
    hosts = await get_trusted_hosts()
    return {"items": hosts, "total": len(hosts)}


@router.post("/trusted-hosts")
async def add_host(data: TrustedHostAdd, tenant=Depends(get_current_user)):
    """Add a trusted relay host."""
    result = await add_trusted_host(
        data.address, data.label, data.auth_type,
        data.username, data.password, data.rate_limit, data.max_connections
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.delete("/trusted-hosts/{address}")
async def remove_host(address: str, tenant=Depends(get_current_user)):
    """Remove a trusted relay host."""
    address = address.replace("%2F", "/")
    return await remove_trusted_host(address)


# ==================== RATE LIMITS ====================

@router.get("/rate-limits")
async def get_limits(tenant=Depends(get_current_user)):
    """Get rate limit configuration."""
    return await get_rate_limits()


@router.put("/rate-limits")
async def update_limits(data: RateLimitUpdate, tenant=Depends(get_current_user)):
    """Update rate limits."""
    return await update_rate_limits(data.model_dump())
