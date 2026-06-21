const DEFAULT_RECOMMENDATION_MESSAGE =
  'Es recomendable realizar una pausa breve antes de volver a intentarlo.'

const RECOMMENDATION_MESSAGES: Record<string, string> = {
  low_dprime:
    'Parece que la atención sostenida ha sido baja. Descansa unos minutos, respira con calma y evita distracciones antes de reintentar.',
  high_stroop_effect:
    'Se ha detectado dificultad en la inhibición de respuestas automáticas. Prueba a hacer una pausa breve y retomar la tarea con calma.',
  high_flanker_effect:
    'Se ha detectado interferencia elevada ante estímulos distractores. Aléjate de distracciones visuales y realiza una pausa breve.',
  high_stroop_error:
    'Se han registrado más errores de lo esperado. Revisa las instrucciones y reintenta cuando estés preparado.',
  high_stroop_error_rate:
    'Se han registrado más errores de lo esperado. Revisa las instrucciones y reintenta cuando estés preparado.',
  low_flanker_accuracy:
    'La precisión en la tarea Flanker ha sido baja. Tómate unos minutos para descansar antes de repetir la evaluación.',
}

export function getRecommendationMessage(
  recommendationKey: string | null | undefined,
): string {
  if (!recommendationKey) {
    return DEFAULT_RECOMMENDATION_MESSAGE
  }

  return RECOMMENDATION_MESSAGES[recommendationKey] ?? DEFAULT_RECOMMENDATION_MESSAGE
}
