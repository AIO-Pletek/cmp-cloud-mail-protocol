"""Scheduled reports API routes."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from cmp.middleware.auth import get_current_user
from cmp.models.tenant import Tenant
from cmp.services import scheduled_report_service

router = APIRouter(prefix="/api/v1/scheduled-reports", tags=["Scheduled Reports"])


class CreateReportRequest(BaseModel):
    email: str
    frequency: str = "weekly"
    domains: list[str]


@router.get("")
async def list_scheduled_reports(
    tenant: Tenant = Depends(get_current_user),
):
    """List all configured scheduled reports."""
    return scheduled_report_service.list_reports()


@router.post("", status_code=201)
async def create_scheduled_report(
    body: CreateReportRequest,
    tenant: Tenant = Depends(get_current_user),
):
    """Create a new scheduled report."""
    report = scheduled_report_service.add_report(
        email=body.email,
        frequency=body.frequency,
        domains=body.domains,
    )
    return report


@router.delete("/{report_id}")
async def delete_scheduled_report(
    report_id: int,
    tenant: Tenant = Depends(get_current_user),
):
    """Delete a scheduled report."""
    if not scheduled_report_service.delete_report(report_id):
        raise HTTPException(status_code=404, detail="Report not found")
    return {"deleted": True}


@router.post("/{report_id}/test")
async def test_scheduled_report(
    report_id: int,
    tenant: Tenant = Depends(get_current_user),
):
    """Send a test report immediately."""
    report = scheduled_report_service.get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    result = await scheduled_report_service.generate_and_send_report(report)
    return result
