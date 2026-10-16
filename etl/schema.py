"""Public, auditable observation contract. No implicit zeroes or scope merging."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str
    country: str = Field(pattern=r"^[A-Z]{3}$")
    year: int = Field(ge=1960, le=2100)
    indicator: str
    value: float | None
    unit: str
    scope: Literal[
        "general_government",
        "general_government_excluding_ssf",
        "public_sector_survey",
        "total_economy",
    ]
    sector: str = "TOTAL"
    employment_basis: str
    denominator: str
    comparability_group: str
    status: Literal["observed", "derived", "missing"]
    missing_reason: str | None = None
    source_id: str
    source_url: HttpUrl
    definition: str
    methodology: str
    source_flags: str = ""
    retrieved_at: str
    raw_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    input_ids: list[str] = []
    notes: str = ""

    @model_validator(mode="after")
    def consistency(self):
        if self.status == "missing":
            if self.value is not None or not self.missing_reason:
                raise ValueError("Missing observations require null and a reason")
        elif self.value is None or self.missing_reason is not None:
            raise ValueError(
                "Non-missing observations require a value and no missing reason"
            )
        if self.status == "derived" and not self.input_ids:
            raise ValueError("Derived values require lineage")
        if self.value is not None:
            if self.indicator != "public_wage_premium" and self.value < 0:
                raise ValueError("Negative value")
            if self.unit == "percent_employment" and self.value > 100:
                raise ValueError("Share exceeds 100%")
        return self


def validate_observations(rows):
    validated = [Observation.model_validate(row) for row in rows]
    ids = [r.id for r in validated]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate observation identity")
    available = set(ids)
    for row in validated:
        if any(i not in available for i in row.input_ids):
            raise ValueError(f"Broken lineage for {row.id}")
    return [r.model_dump(mode="json") for r in validated]
