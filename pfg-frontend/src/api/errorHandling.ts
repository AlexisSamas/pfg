import axios from 'axios'
import { getRecommendationMessage } from '../utils/recommendationMessages'

type BackendDetail = {
  message?: string
  max_attempts?: number
  context_id?: string
  requires_manual_grant?: boolean
  reason?: string
  wait_until?: string
  recommendation_key?: string | null
  recommendation?: string | null
}

export type ApiErrorInfo = {
  status?: number
  message: string
  waitUntil?: string
  recommendationKey?: string | null
  recommendationMessage?: string
  requiresManualGrant?: boolean
}

function readDetail(error: unknown): BackendDetail | string | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined
  }

  return error.response?.data?.detail
}

function readStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

function normalizeDetail(detail: BackendDetail | string | undefined): BackendDetail {
  if (!detail) {
    return {}
  }

  if (typeof detail === 'string') {
    return { message: detail }
  }

  return detail
}

export function parseApiError(error: unknown): ApiErrorInfo {
  const status = readStatus(error)
  const detail = normalizeDetail(readDetail(error))
  const message = detail.message ?? ''
  const recommendationKey = detail.recommendation_key ?? detail.recommendation
  const baseInfo: ApiErrorInfo = {
    status,
    recommendationKey,
    waitUntil: detail.wait_until,
    requiresManualGrant: detail.requires_manual_grant,
    message:
      'No se pudo completar la operación. Comprueba la conexión con el backend e inténtalo de nuevo.',
  }

  if (status === 401) {
    return {
      ...baseInfo,
      message: 'La sesión ha expirado. Vuelve a iniciar sesión.',
    }
  }

  if (status === 422) {
    return {
      ...baseInfo,
      message:
        'Los datos enviados no tienen el formato esperado. Revisa la sesión o vuelve a intentarlo.',
    }
  }

  if (status === 425) {
    return {
      ...baseInfo,
      message:
        'El resultado todavía no está disponible porque la sesión está incompleta.',
    }
  }

  if (status === 429) {
    return {
      ...baseInfo,
      message: 'Debes esperar antes de volver a intentarlo.',
      recommendationMessage: getRecommendationMessage(recommendationKey),
    }
  }

  if (
    status === 403 &&
    message.toLowerCase().includes('maximum attempts exceeded')
  ) {
    return {
      ...baseInfo,
      message:
        'Has alcanzado el número máximo de intentos para este contexto. Debes contactar con el docente para solicitar acceso manual.',
    }
  }

  if (
    status === 403 &&
    (message.toLowerCase().includes('blocked') ||
      detail.reason?.toLowerCase().includes('block'))
  ) {
    return {
      ...baseInfo,
      message:
        'El sistema ha bloqueado nuevos intentos para este contexto tras un resultado de bloqueo. Debes contactar con el docente.',
    }
  }

  if (status === 403) {
    return {
      ...baseInfo,
      message:
        'No puedes crear otra sesión para este contexto. Contacta con el docente si necesitas acceso manual.',
    }
  }

  return baseInfo
}
