from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class DecisionType(str, Enum):
    ACCESO = "ACCESO"
    ESPERA = "ESPERA"
    BLOQUEO = "BLOQUEO"


class AttentionMetrics(BaseModel):
    trm_ms: Optional[float] = Field(None, description="Tiempo de reacción medio para CPT en ms")
    d_prime: Optional[float] = Field(None, description="Índice de discriminabilidad d' para CPT")
    stroop_effect_ms: Optional[float] = Field(None, description="Efecto Stroop en milisegundos")
    flanker_effect_ms: Optional[float] = Field(None, description="Efecto Flanker en milisegundos")
    stroop_error_rate: Optional[float] = Field(None, description="Tasa de error en Stroop")
    flanker_accuracy: Optional[float] = Field(None, description="Precisión en Flanker (0 a 1)")

    model_config = ConfigDict(from_attributes=True)


class ScoringResultResponse(BaseModel):
    id: int
    session_id: int
    trm_ms: Optional[float] = None
    d_prime: Optional[float] = None
    stroop_effect_ms: Optional[float] = None
    flanker_effect_ms: Optional[float] = None
    stroop_error_rate: Optional[float] = None
    flanker_accuracy: Optional[float] = None
    score: Optional[float] = None
    decision: DecisionType
    weakest_metric: Optional[str] = None
    recommendation_key: Optional[str] = None
    computed_at: datetime
    new_access_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DecisionResponse(BaseModel):
    session_id: Optional[int] = None
    context_id: str
    decision: DecisionType
    score: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class WaitResponse(BaseModel):
    wait_until: datetime
    recommendation_key: Optional[str] = None
    reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
