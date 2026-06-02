"""Unit tests del servicio de scoring segun la especificacion de la memoria."""

import pytest

from app.services.scoring import (
    assign_recommendation,
    calculate_decision_result,
    calculate_global_score,
    determine_decision,
    identify_weakest_metric,
)


def test_rested_student_gets_access():
    score = calculate_global_score(
        d_prime=2.8,
        stroop_effect_ms=30,
        flanker_effect_ms=20,
        flanker_accuracy=0.95,
        stroop_error_rate=0.02,
    )
    result = calculate_decision_result(
        score=score,
        d_prime=2.8,
        stroop_effect_ms=30,
        flanker_effect_ms=20,
        flanker_accuracy=0.95,
        stroop_error_rate=0.02,
    )

    assert score >= 60
    assert result.decision == "ACCESO"
    assert result.recommendation_key == "none"


def test_intermediate_student_gets_wait():
    score = calculate_global_score(
        d_prime=1.5,
        stroop_effect_ms=100,
        flanker_effect_ms=75,
        flanker_accuracy=0.5,
        stroop_error_rate=0.25,
    )
    result = calculate_decision_result(
        score=score,
        d_prime=1.5,
        stroop_effect_ms=100,
        flanker_effect_ms=75,
        flanker_accuracy=0.5,
        stroop_error_rate=0.25,
    )

    assert 40 <= score < 60
    assert result.decision == "ESPERA"
    assert result.recommendation_key != "none"


def test_low_performance_student_gets_blocked():
    score = calculate_global_score(
        d_prime=0.1,
        stroop_effect_ms=190,
        flanker_effect_ms=145,
        flanker_accuracy=0.1,
        stroop_error_rate=0.48,
    )
    result = calculate_decision_result(
        score=score,
        d_prime=0.1,
        stroop_effect_ms=190,
        flanker_effect_ms=145,
        flanker_accuracy=0.1,
        stroop_error_rate=0.48,
    )

    assert score < 40
    assert result.decision == "BLOQUEO"
    assert result.recommendation_key != "none"


@pytest.mark.parametrize(
    "score, expected",
    [
        (60, "ACCESO"),
        (59.99, "ESPERA"),
        (40, "ESPERA"),
        (39.99, "BLOQUEO"),
    ],
)
def test_decision_thresholds(score, expected):
    assert determine_decision(score) == expected


@pytest.mark.parametrize(
    "metrics",
    [
        {},
        {
            "d_prime": None,
            "stroop_effect_ms": None,
            "flanker_effect_ms": None,
            "flanker_accuracy": None,
            "stroop_error_rate": None,
        },
        {
            "d_prime": -5,
            "stroop_effect_ms": -50,
            "flanker_effect_ms": -50,
            "flanker_accuracy": -1,
            "stroop_error_rate": -1,
        },
        {
            "d_prime": 10,
            "stroop_effect_ms": 500,
            "flanker_effect_ms": 500,
            "flanker_accuracy": 2,
            "stroop_error_rate": 2,
        },
        {
            "d_prime": 1.5,
            "stroop_effect_ms": 100,
            "flanker_effect_ms": 75,
            "flanker_accuracy": 0.5,
            "stroop_error_rate": 0.25,
        },
    ],
)
def test_score_is_always_between_0_and_100(metrics):
    score = calculate_global_score(**metrics)

    assert 0 <= score <= 100


@pytest.mark.parametrize(
    "metrics, expected",
    [
        (
            {
                "d_prime": 0.1,
                "stroop_effect_ms": 50,
                "flanker_effect_ms": 30,
                "flanker_accuracy": 0.9,
                "stroop_error_rate": 0.05,
            },
            "d_prime",
        ),
        (
            {
                "d_prime": 2.5,
                "stroop_effect_ms": 190,
                "flanker_effect_ms": 30,
                "flanker_accuracy": 0.9,
                "stroop_error_rate": 0.05,
            },
            "stroop_effect_ms",
        ),
        (
            {
                "d_prime": 2.5,
                "stroop_effect_ms": 50,
                "flanker_effect_ms": 145,
                "flanker_accuracy": 0.9,
                "stroop_error_rate": 0.05,
            },
            "flanker_effect_ms",
        ),
        (
            {
                "d_prime": 2.5,
                "stroop_effect_ms": 50,
                "flanker_effect_ms": 30,
                "flanker_accuracy": 0.1,
                "stroop_error_rate": 0.05,
            },
            "flanker_accuracy",
        ),
        (
            {
                "d_prime": 2.5,
                "stroop_effect_ms": 50,
                "flanker_effect_ms": 30,
                "flanker_accuracy": 0.9,
                "stroop_error_rate": 0.48,
            },
            "stroop_error_rate",
        ),
    ],
)
def test_identifies_weakest_metric(metrics, expected):
    assert identify_weakest_metric(**metrics) == expected


@pytest.mark.parametrize(
    "weakest_metric, decision, expected",
    [
        ("d_prime", "ACCESO", "none"),
        ("d_prime", "ESPERA", "low_dprime"),
        ("stroop_effect_ms", "ESPERA", "high_stroop_effect"),
        ("flanker_effect_ms", "BLOQUEO", "high_flanker_effect"),
        ("flanker_accuracy", "BLOQUEO", "low_flanker_accuracy"),
        ("stroop_error_rate", "ESPERA", "high_stroop_error_rate"),
        (None, "BLOQUEO", "none"),
    ],
)
def test_recommendation_key_is_coherent(weakest_metric, decision, expected):
    assert assign_recommendation(weakest_metric, decision) == expected
