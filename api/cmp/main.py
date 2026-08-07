from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from cmp.database import engine, Base
from cmp.models import Tenant, Domain, FilterRule, Quarantine, AuditLog
from cmp.routes import auth, tenants, domains, filters, quarantine, reports, queue, audit, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="CMP - Cloud Mail Protocol",
    description="White-label mail gateway platform API for managing domains, email filtering, quarantine, DKIM/SPF/DMARC, and mail delivery.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(domains.router)
app.include_router(filters.router)
app.include_router(quarantine.router)
app.include_router(reports.router)
app.include_router(queue.router)
app.include_router(audit.router)
app.include_router(webhooks.router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "CMP", "version": "1.0.0"}
