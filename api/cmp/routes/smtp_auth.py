"""SMTP AUTH credentials API routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from cmp.services.smtp_auth_service import (
    list_credentials, create_credential, delete_credential,
    toggle_credential, verify_smtp_auth, get_relay_instructions
)
from cmp.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/smtp-auth", tags=["SMTP Auth"])


class CredentialCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str | None = Field(None, min_length=8)
    label: str = ""
    allowed_ips: list[str] = []


class CredentialToggle(BaseModel):
    enabled: bool


class RelayVerify(BaseModel):
    username: str
    password: str
    client_ip: str = ""


@router.get("/credentials")
async def list_creds(tenant=Depends(get_current_user)):
    """List all SMTP AUTH credentials."""
    creds = await list_credentials()
    return {"items": creds, "total": len(creds)}


@router.post("/credentials")
async def create_cred(data: CredentialCreate, tenant=Depends(get_current_user)):
    """Create SMTP AUTH credentials for a relay client."""
    result = await create_credential(
        data.username, data.password, data.label, data.allowed_ips
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.delete("/credentials/{credential_id}")
async def delete_cred(credential_id: str, tenant=Depends(get_current_user)):
    """Delete SMTP AUTH credentials."""
    return await delete_credential(credential_id)


@router.put("/credentials/{credential_id}/toggle")
async def toggle_cred(credential_id: str, data: CredentialToggle, tenant=Depends(get_current_user)):
    """Enable/disable SMTP AUTH credentials."""
    return await toggle_credential(credential_id, data.enabled)


@router.post("/verify")
async def verify_cred(data: RelayVerify, tenant=Depends(get_current_user)):
    """Verify SMTP AUTH credentials (for testing)."""
    return await verify_smtp_auth(data.username, data.password, data.client_ip)


@router.get("/instructions/{username}")
async def get_instructions(username: str, tenant=Depends(get_current_user)):
    """Get relay configuration instructions for a client."""
    result = await get_relay_instructions(username)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
