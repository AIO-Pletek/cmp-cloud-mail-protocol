from pydantic import BaseModel


class SetupCheckResult(BaseModel):
    domain_id: str
    domain_name: str
    step1_dns: bool
    step1_record: dict
    step2_spf: bool
    step2_record: dict
    step3_dkim: bool
    step3_record: dict
    step4_dmarc: bool
    step4_record: dict
    step5_test: bool
    completion_percentage: int
