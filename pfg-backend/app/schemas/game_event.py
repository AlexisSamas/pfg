from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class GameType(str, Enum):
    CPT = "cpt"
    STROOP = "stroop"
    FLANKER = "flanker"


class StimulusType(str, Enum):
    TARGET = "target"
    NON_TARGET = "non_target"
    CONGRUENT = "congruent"
    INCONGRUENT = "incongruent"


class GameEventCreate(BaseModel):
    game_type: GameType
    event_type: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Tipo de evento: hit, miss, false_alarm, correct_rejection, correct, error, timeout, etc.",
    )
    timestamp_us: int = Field(..., ge=0, description="Timestamp en microsegundos")
    reaction_time_ms: Optional[int] = Field(None, ge=0, description="Tiempo de reacción en milisegundos")
    is_correct: Optional[bool] = Field(None, description="Indica si la respuesta fue correcta")
    stimulus_type: Optional[StimulusType] = Field(None, description="Tipo de estímulo")


class GameEventBatch(BaseModel):
    events: List[GameEventCreate]


class GameEventResponse(BaseModel):
    id: int
    session_id: int
    game_type: GameType
    event_type: str
    timestamp_us: int
    reaction_time_ms: Optional[int] = None
    is_correct: Optional[bool] = None
    stimulus_type: Optional[StimulusType] = None

    model_config = ConfigDict(from_attributes=True)


class GameEventBatchResponse(BaseModel):
    received: int = Field(..., ge=0, description="Número de eventos recibidos y guardados")
