"""
Servicio de scoring y cálculo de métricas.

Proporciona funciones para:
- Calcular métricas CPT
- Calcular métricas Stroop
- Calcular métricas Flanker
- Generar scoring y decisión
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional
from statistics import NormalDist, StatisticsError, median

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.game_event import GameEvent
from app.models.exam_session import ExamSession
from app.models.scoring_result import ScoringResult
from app.models.wait_period import WaitPeriod
from app.models.access_decision import AccessDecision
from app.core.config import settings
from app.services import cooldown_cache


DECISION_ACCESS = "ACCESO"
DECISION_WAIT = "ESPERA"
DECISION_BLOCK = "BLOQUEO"
WAIT_MARGIN_POINTS = 20.0

RECOMMENDATION_BY_METRIC = {
    "d_prime": "low_dprime",
    "stroop_effect_ms": "high_stroop_effect",
    "flanker_effect_ms": "high_flanker_effect",
    "flanker_accuracy": "low_flanker_accuracy",
    "stroop_error_rate": "high_stroop_error_rate",
}

NORMAL_DIST = NormalDist()


class ScoringException(Exception):
    """Excepcion relacionada con el calculo de scoring."""
    pass


def _ensure_wait_period_for_result(
    db: Session,
    session: ExamSession,
    scoring_result: ScoringResult,
) -> Optional[WaitPeriod]:
    """
    Crea el wait_period asociado a un resultado ESPERA si todavia no existe.

    Se usa attempt_number como parte de la clave logica para que consultar un
    resultado antiguo no regenere una espera ya expirada.
    """
    if scoring_result.decision != DECISION_WAIT:
        return None

    existing_wait = db.query(WaitPeriod).filter(
        and_(
            WaitPeriod.user_id == session.user_id,
            WaitPeriod.context_id == session.context_id,
            WaitPeriod.attempt_number == session.attempt_number,
        )
    ).first()
    if existing_wait is not None:
        return existing_wait

    wait_until = datetime.utcnow() + timedelta(
        minutes=getattr(settings, "DEFAULT_WAIT_MINUTES", 10)
    )
    wait_period = WaitPeriod(
        user_id=session.user_id,
        context_id=session.context_id,
        attempt_number=session.attempt_number,
        wait_until=wait_until,
        reason="decision_espera",
        recommendation_key=scoring_result.recommendation_key,
    )
    db.add(wait_period)
    return wait_period


class CPTMetrics:
    """Métricas calculadas para el juego CPT."""
    
    def __init__(
        self,
        hits: int = 0,
        misses: int = 0,
        false_alarms: int = 0,
        correct_rejections: int = 0,
        trm_ms: Optional[float] = None,
        d_prime: Optional[float] = None,
    ):
        self.hits = hits
        self.misses = misses
        self.false_alarms = false_alarms
        self.correct_rejections = correct_rejections
        self.trm_ms = trm_ms
        self.d_prime = d_prime


class SroopMetrics:
    """Métricas calculadas para el juego Stroop."""
    
    def __init__(
        self,
        stroop_effect_ms: Optional[float] = None,
        stroop_error_rate: Optional[float] = None,
    ):
        self.stroop_effect_ms = stroop_effect_ms
        self.stroop_error_rate = stroop_error_rate


class FlankerMetrics:
    """Métricas calculadas para el juego Flanker."""
    
    def __init__(
        self,
        flanker_effect_ms: Optional[float] = None,
        flanker_accuracy: Optional[float] = None,
    ):
        self.flanker_effect_ms = flanker_effect_ms
        self.flanker_accuracy = flanker_accuracy


def calculate_cpt_metrics(events: List[GameEvent]) -> CPTMetrics:
    """
    Calcula métricas del juego CPT a partir de una lista de eventos.

    Args:
        events: Lista de eventos GameEvent del tipo 'cpt'.

    Returns:
        CPTMetrics con los valores calculados.

    Notas:
        - hit: respuesta correcta ante target (is_correct=True, stimulus_type=target)
        - miss: no respuesta o fallo ante target (is_correct=False, stimulus_type=target)
        - false_alarm: respuesta ante non_target (is_correct=False, stimulus_type=non_target)
        - correct_rejection: no respuesta correcta ante non_target (is_correct=True, stimulus_type=non_target)
        - trm_ms: mediana de reaction_time_ms en hits válidos
        - d_prime: Z(hit_rate) - Z(false_alarm_rate) con clipping [0.01, 0.99]
    """
    if not events:
        return CPTMetrics()

    hits = 0
    misses = 0
    false_alarms = 0
    correct_rejections = 0
    hit_reaction_times = []

    for event in events:
        # Ignorar eventos sin stimulus_type definido
        if not event.stimulus_type:
            continue

        is_target = event.stimulus_type == "target"
        is_correct = event.is_correct

        if is_target:
            if is_correct:
                hits += 1
                # Recolectar reaction times válidos
                if event.reaction_time_ms is not None and event.reaction_time_ms > 0:
                    hit_reaction_times.append(event.reaction_time_ms)
            else:
                misses += 1
        else:  # non_target
            if is_correct:
                correct_rejections += 1
            else:
                false_alarms += 1

    # Calcular trm_ms (mediana de reaction times)
    trm_ms = None
    if hit_reaction_times:
        try:
            trm_ms = median(hit_reaction_times)
        except StatisticsError:
            trm_ms = None

    # Calcular d_prime
    d_prime = _calculate_d_prime(hits, misses, false_alarms, correct_rejections)

    return CPTMetrics(
        hits=hits,
        misses=misses,
        false_alarms=false_alarms,
        correct_rejections=correct_rejections,
        trm_ms=trm_ms,
        d_prime=d_prime,
    )


def _calculate_d_prime(
    hits: int,
    misses: int,
    false_alarms: int,
    correct_rejections: int,
) -> Optional[float]:
    """
    Calcula d' (d-prime) a partir de hits, misses, false_alarms y correct_rejections.

    d' = Z(hit_rate) - Z(false_alarm_rate)

    Args:
        hits: Número de hits.
        misses: Número de misses.
        false_alarms: Número de false alarms.
        correct_rejections: Número de correct rejections.

    Returns:
        Valor de d' o None si no se puede calcular.
    """
    # Contar targets y non-targets
    n_targets = hits + misses
    n_non_targets = false_alarms + correct_rejections

    # Si no hay suficientes trials, retornar None
    if n_targets == 0 or n_non_targets == 0:
        return None

    # Calcular hit rate y false alarm rate
    hit_rate = hits / n_targets
    false_alarm_rate = false_alarms / n_non_targets

    # Aplicar clipping [0.01, 0.99]
    hit_rate = max(0.01, min(0.99, hit_rate))
    false_alarm_rate = max(0.01, min(0.99, false_alarm_rate))

    # Calcular Z-scores
    try:
        z_hit = NORMAL_DIST.inv_cdf(hit_rate)
        z_fa = NORMAL_DIST.inv_cdf(false_alarm_rate)
        d_prime = z_hit - z_fa
        return d_prime
    except (ValueError, ZeroDivisionError):
        return None


def calculate_stroop_metrics(events: List[GameEvent]) -> SroopMetrics:
    """
    Calcula métricas del juego Stroop a partir de una lista de eventos.

    Args:
        events: Lista de eventos GameEvent del tipo 'stroop'.

    Returns:
        SroopMetrics con los valores calculados.

    Notas:
        - stroop_effect_ms: mediana de RT en ensayos incongruentes correctos -
                           mediana de RT en ensayos congruentes correctos.
        - stroop_error_rate: número de eventos incorrectos / número total de eventos.
        - Solo se consideran eventos con is_correct=true y reaction_time_ms > 0 para RT.
        - Si faltan datos congruentes o incongruentes, devuelve None para stroop_effect_ms.
    """
    if not events:
        return SroopMetrics()

    # Separar eventos por tipo de estímulo
    congruent_times = []
    incongruent_times = []
    total_events = 0
    incorrect_events = 0

    for event in events:
        total_events += 1

        # Contar eventos incorrectos
        if not event.is_correct:
            incorrect_events += 1

        # Recolectar reaction times válidos (is_correct=true, RT > 0)
        if event.is_correct and event.reaction_time_ms is not None and event.reaction_time_ms > 0:
            if event.stimulus_type == "congruent":
                congruent_times.append(event.reaction_time_ms)
            elif event.stimulus_type == "incongruent":
                incongruent_times.append(event.reaction_time_ms)

    # Calcular stroop_effect_ms
    stroop_effect_ms = None
    if congruent_times and incongruent_times:
        try:
            median_congruent = median(congruent_times)
            median_incongruent = median(incongruent_times)
            stroop_effect_ms = median_incongruent - median_congruent
        except StatisticsError:
            stroop_effect_ms = None

    # Calcular stroop_error_rate
    stroop_error_rate = None
    if total_events > 0:
        stroop_error_rate = incorrect_events / total_events

    return SroopMetrics(
        stroop_effect_ms=stroop_effect_ms,
        stroop_error_rate=stroop_error_rate,
    )


def calculate_flanker_metrics(events: List[GameEvent]) -> FlankerMetrics:
    """
    Calcula métricas del juego Flanker a partir de una lista de eventos.

    Args:
        events: Lista de eventos GameEvent del tipo 'flanker'.

    Returns:
        FlankerMetrics con los valores calculados.

    Notas:
        - flanker_effect_ms: mediana de RT en ensayos incongruentes correctos -
                            mediana de RT en ensayos congruentes correctos.
        - flanker_accuracy: número de eventos correctos / número total de eventos.
        - Solo se consideran eventos con is_correct=true y reaction_time_ms > 0 para RT.
        - Si faltan datos congruentes o incongruentes, devuelve None para flanker_effect_ms.
    """
    if not events:
        return FlankerMetrics()

    # Separar eventos por tipo de estímulo
    congruent_times = []
    incongruent_times = []
    total_events = 0
    correct_events = 0

    for event in events:
        total_events += 1

        # Contar eventos correctos
        if event.is_correct:
            correct_events += 1

        # Recolectar reaction times válidos (is_correct=true, RT > 0)
        if event.is_correct and event.reaction_time_ms is not None and event.reaction_time_ms > 0:
            if event.stimulus_type == "congruent":
                congruent_times.append(event.reaction_time_ms)
            elif event.stimulus_type == "incongruent":
                incongruent_times.append(event.reaction_time_ms)

    # Calcular flanker_effect_ms
    flanker_effect_ms = None
    if congruent_times and incongruent_times:
        try:
            median_congruent = median(congruent_times)
            median_incongruent = median(incongruent_times)
            flanker_effect_ms = median_incongruent - median_congruent
        except StatisticsError:
            flanker_effect_ms = None

    # Calcular flanker_accuracy
    flanker_accuracy = None
    if total_events > 0:
        flanker_accuracy = correct_events / total_events

    return FlankerMetrics(
        flanker_effect_ms=flanker_effect_ms,
        flanker_accuracy=flanker_accuracy,
    )


def _normalize(
    value: Optional[float],
    min_value: float,
    max_value: float,
    inverse: bool = False,
) -> float:
    """
    Normaliza un valor al rango [0, 1].

    Args:
        value: Valor a normalizar. Si es None, retorna 0.5 (valor neutral).
        min_value: Valor mínimo esperado.
        max_value: Valor máximo esperado.
        inverse: Si True, invierte la normalización (para métricas donde menor es mejor).

    Returns:
        Valor normalizado en [0, 1].
    """
    if value is None:
        return 0.5  # Valor neutral si es None

    # Limitar el valor dentro de los rangos
    value = max(min_value, min(max_value, value))

    # Normalizar a [0, 1]
    if max_value == min_value:
        normalized = 0.5  # Evitar división por cero
    else:
        normalized = (value - min_value) / (max_value - min_value)

    # Invertir si es necesario (para métricas donde menor es mejor)
    if inverse:
        normalized = 1.0 - normalized

    # Limitar a [0, 1]
    return max(0.0, min(1.0, normalized))


def calculate_global_score(
    d_prime: Optional[float] = None,
    stroop_effect_ms: Optional[float] = None,
    flanker_effect_ms: Optional[float] = None,
    flanker_accuracy: Optional[float] = None,
    stroop_error_rate: Optional[float] = None,
) -> float:
    """
    Calcula la puntuación global de atención entre 0 y 100.

    Combina las métricas de CPT, Stroop y Flanker con pesos específicos.

    Args:
        d_prime: Índice de discriminabilidad del CPT (0.0 a 3.0).
        stroop_effect_ms: Efecto Stroop en ms (0 mejor, 200 peor).
        flanker_effect_ms: Efecto Flanker en ms (0 mejor, 150 peor).
        flanker_accuracy: Precisión en Flanker (0.0 a 1.0).
        stroop_error_rate: Tasa de error Stroop (0.0 a 0.5).

    Returns:
        Score global entre 0 y 100.

    Notas:
        - Pesos: 30% CPT, 25% Stroop effect, 25% Flanker effect, 10% Flanker accuracy, 10% Stroop error
        - Métricas donde menor es mejor (effects, error_rate) se invierten en normalización.
    """
    # Rango esperados (o por defecto si no están definidos en config)
    d_prime_range = (0.0, 3.0)
    stroop_effect_range = (0, 200)  # 0 mejor, 200 peor
    flanker_effect_range = (0, 150)  # 0 mejor, 150 peor
    flanker_accuracy_range = (0.0, 1.0)
    stroop_error_rate_range = (0.0, 0.5)  # 0 mejor, 0.5 peor

    # Normalizar cada métrica
    norm_d_prime = _normalize(
        d_prime,
        d_prime_range[0],
        d_prime_range[1],
        inverse=False  # Mayor es mejor
    )

    norm_stroop_effect = _normalize(
        stroop_effect_ms,
        stroop_effect_range[0],
        stroop_effect_range[1],
        inverse=True  # Menor es mejor
    )

    norm_flanker_effect = _normalize(
        flanker_effect_ms,
        flanker_effect_range[0],
        flanker_effect_range[1],
        inverse=True  # Menor es mejor
    )

    norm_flanker_accuracy = _normalize(
        flanker_accuracy,
        flanker_accuracy_range[0],
        flanker_accuracy_range[1],
        inverse=False  # Mayor es mejor
    )

    norm_stroop_error_rate = _normalize(
        stroop_error_rate,
        stroop_error_rate_range[0],
        stroop_error_rate_range[1],
        inverse=True  # Menor es mejor
    )

    # Aplicar pesos y combinar
    weighted_score = (
        0.30 * norm_d_prime
        + 0.25 * norm_stroop_effect
        + 0.25 * norm_flanker_effect
        + 0.10 * norm_flanker_accuracy
        + 0.10 * norm_stroop_error_rate
    )

    # Escalar a [0, 100] y limitar
    score = weighted_score * 100.0
    return max(0.0, min(100.0, score))


def determine_decision(
    score: float,
    threshold: Optional[float] = None,
) -> str:
    """
    Determina la decisión final basada en el score global.

    Args:
        score: Puntuación global entre 0 y 100.
        threshold: Umbral de acceso. Si no se proporciona, usa DEFAULT_ATTENTION_THRESHOLD.

    Returns:
        Una de las decisiones: 'ACCESO', 'ESPERA', 'BLOQUEO'.
        - ACCESO: score >= threshold
        - ESPERA: threshold - 20 <= score < threshold
        - BLOQUEO: score < threshold - 20
    """
    if threshold is None:
        threshold = getattr(settings, "DEFAULT_ATTENTION_THRESHOLD", 60.0)

    wait_threshold = threshold - WAIT_MARGIN_POINTS

    if score >= threshold:
        return DECISION_ACCESS
    if score >= wait_threshold:
        return DECISION_WAIT
    return DECISION_BLOCK


def identify_weakest_metric(
    d_prime: Optional[float] = None,
    stroop_effect_ms: Optional[float] = None,
    flanker_effect_ms: Optional[float] = None,
    flanker_accuracy: Optional[float] = None,
    stroop_error_rate: Optional[float] = None,
) -> Optional[str]:
    """
    Identifica la métrica más débil basada en su contribución negativa al score.

    Args:
        d_prime: Índice de discriminabilidad del CPT (0.0 a 3.0).
        stroop_effect_ms: Efecto Stroop en ms (0 mejor, 200 peor).
        flanker_effect_ms: Efecto Flanker en ms (0 mejor, 150 peor).
        flanker_accuracy: Precisión en Flanker (0.0 a 1.0).
        stroop_error_rate: Tasa de error Stroop (0.0 a 0.5).

    Returns:
        Una de las métricas más débiles: 'd_prime', 'stroop_effect_ms', 'flanker_effect_ms',
        'flanker_accuracy', 'stroop_error_rate', o None si no hay métricas.
    """
    metrics = {}

    # Normalizar cada métrica (0 = malo, 1 = bueno)
    if d_prime is not None:
        norm_d = _normalize(d_prime, 0.0, 3.0, inverse=False)
        metrics["d_prime"] = norm_d

    if stroop_effect_ms is not None:
        norm_stroop_e = _normalize(stroop_effect_ms, 0, 200, inverse=True)
        metrics["stroop_effect_ms"] = norm_stroop_e

    if flanker_effect_ms is not None:
        norm_flanker_e = _normalize(flanker_effect_ms, 0, 150, inverse=True)
        metrics["flanker_effect_ms"] = norm_flanker_e

    if flanker_accuracy is not None:
        norm_flanker_a = _normalize(flanker_accuracy, 0.0, 1.0, inverse=False)
        metrics["flanker_accuracy"] = norm_flanker_a

    if stroop_error_rate is not None:
        norm_stroop_err = _normalize(stroop_error_rate, 0.0, 0.5, inverse=True)
        metrics["stroop_error_rate"] = norm_stroop_err

    if not metrics:
        return None

    # Encontrar la métrica con la puntuación más baja
    weakest = min(metrics.items(), key=lambda item: item[1])
    return weakest[0]


def assign_recommendation(
    weakest_metric: Optional[str],
    decision: str,
) -> str:
    """
    Asigna una recomendación adaptativa basada en la métrica más débil.

    Args:
        weakest_metric: La métrica más débil identificada.
        decision: La decisión (ACCESO, ESPERA, BLOQUEO).

    Returns:
        Una clave de recomendación: 'low_dprime', 'high_stroop_effect', 'high_flanker_effect',
        'low_flanker_accuracy', 'high_stroop_error_rate', o 'none'.
    """
    # Si es ACCESO, sin recomendación especial
    if decision == DECISION_ACCESS:
        return "none"

    # Si no hay métrica débil identificada
    if weakest_metric is None:
        return "none"

    return RECOMMENDATION_BY_METRIC.get(weakest_metric, "none")


@dataclass(frozen=True)
class DecisionResult:
    """Resultado final de la evaluación."""

    score: float
    decision: str
    weakest_metric: Optional[str]
    recommendation_key: str

    def __repr__(self):
        return (
            f"DecisionResult(score={self.score:.2f}, decision={self.decision}, "
            f"weakest_metric={self.weakest_metric}, recommendation={self.recommendation_key})"
        )


def calculate_decision_result(
    score: float,
    d_prime: Optional[float] = None,
    stroop_effect_ms: Optional[float] = None,
    flanker_effect_ms: Optional[float] = None,
    flanker_accuracy: Optional[float] = None,
    stroop_error_rate: Optional[float] = None,
    threshold: Optional[float] = None,
) -> DecisionResult:
    """
    Construye el resultado final de decision a partir del score y las metricas.

    No persiste datos ni crea wait_periods; solo calcula decision,
    weakest_metric y recommendation_key para que otros servicios los usen.
    """
    decision = determine_decision(score=score, threshold=threshold)
    weakest_metric = identify_weakest_metric(
        d_prime=d_prime,
        stroop_effect_ms=stroop_effect_ms,
        flanker_effect_ms=flanker_effect_ms,
        flanker_accuracy=flanker_accuracy,
        stroop_error_rate=stroop_error_rate,
    )
    recommendation_key = assign_recommendation(
        weakest_metric=weakest_metric,
        decision=decision,
    )

    return DecisionResult(
        score=score,
        decision=decision,
        weakest_metric=weakest_metric,
        recommendation_key=recommendation_key,
    )


def calculate_and_store_scoring_result(
    db: Session,
    session: ExamSession,
) -> ScoringResult:
    """
    Calcula, guarda y devuelve el resultado de scoring de una sesion.

    Si la sesion ya tiene scoring_result, devuelve el existente para mantener
    el endpoint idempotente.
    """
    if session.scoring_result is not None:
        wait_period = _ensure_wait_period_for_result(
            db=db,
            session=session,
            scoring_result=session.scoring_result,
        )
        if session.status != "completed":
            session.status = "completed"
            if session.completed_at is None:
                session.completed_at = datetime.utcnow()
        db.commit()
        if wait_period is not None:
            cooldown_cache.set_cooldown_from_wait_period(wait_period)
        db.refresh(session.scoring_result)
        return session.scoring_result

    events = list(session.events)
    cpt_events = [event for event in events if event.game_type == "cpt"]
    stroop_events = [event for event in events if event.game_type == "stroop"]
    flanker_events = [event for event in events if event.game_type == "flanker"]

    missing_games = [
        game_type
        for game_type, game_events in (
            ("cpt", cpt_events),
            ("stroop", stroop_events),
            ("flanker", flanker_events),
        )
        if not game_events
    ]
    if missing_games:
        raise ScoringException(
            "No hay eventos suficientes para calcular el resultado. "
            f"Faltan eventos de: {', '.join(missing_games)}"
        )

    cpt_metrics = calculate_cpt_metrics(cpt_events)
    stroop_metrics = calculate_stroop_metrics(stroop_events)
    flanker_metrics = calculate_flanker_metrics(flanker_events)

    score = calculate_global_score(
        d_prime=cpt_metrics.d_prime,
        stroop_effect_ms=stroop_metrics.stroop_effect_ms,
        flanker_effect_ms=flanker_metrics.flanker_effect_ms,
        flanker_accuracy=flanker_metrics.flanker_accuracy,
        stroop_error_rate=stroop_metrics.stroop_error_rate,
    )
    decision_result = calculate_decision_result(
        score=score,
        d_prime=cpt_metrics.d_prime,
        stroop_effect_ms=stroop_metrics.stroop_effect_ms,
        flanker_effect_ms=flanker_metrics.flanker_effect_ms,
        flanker_accuracy=flanker_metrics.flanker_accuracy,
        stroop_error_rate=stroop_metrics.stroop_error_rate,
    )

    scoring_result = ScoringResult(
        session_id=session.id,
        trm_ms=cpt_metrics.trm_ms,
        d_prime=cpt_metrics.d_prime,
        stroop_effect_ms=stroop_metrics.stroop_effect_ms,
        flanker_effect_ms=flanker_metrics.flanker_effect_ms,
        stroop_error_rate=stroop_metrics.stroop_error_rate,
        flanker_accuracy=flanker_metrics.flanker_accuracy,
        score=score,
        decision=decision_result.decision,
        weakest_metric=decision_result.weakest_metric,
        recommendation_key=decision_result.recommendation_key,
    )

    session.status = "completed"
    session.completed_at = datetime.utcnow()
    db.add(scoring_result)
    wait_period = _ensure_wait_period_for_result(
        db=db,
        session=session,
        scoring_result=scoring_result,
    )
    db.commit()
    if wait_period is not None:
        cooldown_cache.set_cooldown_from_wait_period(wait_period)
    db.refresh(scoring_result)

    return scoring_result


def get_or_create_access_decision(
    db: Session,
    session: ExamSession,
) -> AccessDecision:
    """
    Devuelve la decision de acceso persistida para una sesion o la crea.

    Requiere que la sesion ya tenga scoring_result calculado.
    """
    if session.scoring_result is None:
        raise ScoringException(
            "La sesion todavia no tiene resultado de scoring calculado"
        )

    existing_decision = db.query(AccessDecision).filter(
        AccessDecision.session_id == session.id
    ).first()
    if existing_decision is not None:
        return existing_decision

    access_decision = AccessDecision(
        session_id=session.id,
        user_id=session.user_id,
        context_id=session.context_id,
        decision=session.scoring_result.decision,
        score=session.scoring_result.score,
    )
    db.add(access_decision)
    db.commit()
    db.refresh(access_decision)

    return access_decision
