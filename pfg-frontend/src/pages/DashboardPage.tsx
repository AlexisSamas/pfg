import { useState, type FormEvent } from 'react'
import { getDashboardContext, grantManualAccess } from '../api'
import { parseApiError } from '../api/errorHandling'
import { getRecommendationMessage } from '../utils/recommendationMessages'
import type { DashboardUserStatus, Decision } from '../types'
import './DashboardPage.css'

const DEFAULT_MANUAL_GRANT_REASON =
  'Acceso concedido manualmente desde el dashboard docente'

function formatNullable(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'Sin datos'
  }

  return String(value)
}

function formatScore(score: number | null): string {
  return score === null ? 'Sin resultado' : score.toFixed(2)
}

function formatDecision(decision: Decision | null): string {
  return decision ?? 'Sin resultado'
}

function parseDashboardError(error: unknown): string {
  const parsedError = parseApiError(error)

  if (parsedError.status === 403) {
    return 'No tienes permisos de docente para acceder al dashboard.'
  }

  return parsedError.message
}

export function DashboardPage() {
  const [contextId, setContextId] = useState('exam_demo_01')
  const [statuses, setStatuses] = useState<DashboardUserStatus[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [grantingUserId, setGrantingUserId] = useState<number | null>(null)

  async function loadDashboard(
    nextContextId = contextId,
    options: { clearSuccess?: boolean } = { clearSuccess: true },
  ) {
    const normalizedContextId = nextContextId.trim()

    if (!normalizedContextId) {
      setError('Introduce el identificador del examen/contexto.')
      return
    }

    setIsLoading(true)
    setError(null)
    if (options.clearSuccess !== false) {
      setSuccessMessage(null)
    }

    try {
      const response = await getDashboardContext(normalizedContextId)
      setStatuses(response)
      setHasSearched(true)
    } catch (requestError) {
      setError(parseDashboardError(requestError))
      setStatuses([])
      setHasSearched(true)
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void loadDashboard()
  }

  async function handleManualGrant(status: DashboardUserStatus) {
    if (!status.user_id || !status.context_id || status.manual_grant) {
      return
    }

    const confirmed = window.confirm(
      `¿Conceder acceso manual a ${status.username ?? status.email ?? status.user_id}?`,
    )

    if (!confirmed) {
      return
    }

    setGrantingUserId(status.user_id)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await grantManualAccess({
        user_id: status.user_id,
        context_id: status.context_id,
        reason: DEFAULT_MANUAL_GRANT_REASON,
      })

      setSuccessMessage(
        response.granted
          ? `Acceso manual concedido para el usuario ${response.user_id}.`
          : 'La solicitud de acceso manual se completó sin confirmación de grant.',
      )
      await loadDashboard(status.context_id, { clearSuccess: false })
    } catch (requestError) {
      setError(parseDashboardError(requestError))
    } finally {
      setGrantingUserId(null)
    }
  }

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <div className="dashboard-header">
        <p className="eyebrow">Requiere permisos de docente</p>
        <h1 id="dashboard-title">Dashboard docente</h1>
        <p className="description">
          Introduce el identificador del examen/contexto para consultar alumnos,
          sesiones y decisiones registradas por el backend.
        </p>
      </div>

      <form className="dashboard-form" onSubmit={handleSubmit}>
        <div className="dashboard-field">
          <label htmlFor="context-id">Identificador del examen/contexto</label>
          <input
            id="context-id"
            name="contextId"
            placeholder="exam_test_01"
            value={contextId}
            onChange={(event) => setContextId(event.target.value)}
          />
        </div>
        <button type="submit" className="primary-action" disabled={isLoading}>
          {isLoading ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && (
        <p className="form-message error-message dashboard-message" role="alert">
          {error}
        </p>
      )}

      {successMessage && (
        <p className="form-message success-message dashboard-message" role="status">
          {successMessage}
        </p>
      )}

      {isLoading && (
        <p className="page-status" aria-live="polite">
          Consultando contexto en el backend...
        </p>
      )}

      {!isLoading && hasSearched && statuses.length === 0 && !error && (
        <p className="page-status">No hay sesiones para este contexto.</p>
      )}

      {!isLoading && statuses.length > 0 && (
        <DashboardTable
          grantingUserId={grantingUserId}
          statuses={statuses}
          onManualGrant={handleManualGrant}
        />
      )}
    </section>
  )
}

function DashboardTable({
  grantingUserId,
  statuses,
  onManualGrant,
}: {
  grantingUserId: number | null
  statuses: DashboardUserStatus[]
  onManualGrant: (status: DashboardUserStatus) => void
}) {
  return (
    <div className="dashboard-results">
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>Usuario / email</th>
            <th>Contexto</th>
            <th>Última sesión</th>
            <th>Intento</th>
            <th>Score</th>
            <th>Decisión</th>
            <th>Métrica débil</th>
            <th>Recomendación</th>
            <th>Espera hasta</th>
            <th>Grant manual</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((status) => (
            <DashboardRow
              grantingUserId={grantingUserId}
              key={`${status.context_id}-${status.user_id ?? status.email}`}
              status={status}
              onManualGrant={onManualGrant}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DashboardRow({
  grantingUserId,
  status,
  onManualGrant,
}: {
  grantingUserId: number | null
  status: DashboardUserStatus
  onManualGrant: (status: DashboardUserStatus) => void
}) {
  const recommendationMessage = getRecommendationMessage(status.recommendation_key)
  const canGrant = Boolean(status.user_id && status.context_id && !status.manual_grant)

  return (
    <tr>
      <td>
        <span className="dashboard-user">
          {formatNullable(status.username ?? status.user_id)}
        </span>
        <span className="dashboard-secondary">{formatNullable(status.email)}</span>
      </td>
      <td>{formatNullable(status.context_id)}</td>
      <td>{formatNullable(status.latest_session_id)}</td>
      <td>{formatNullable(status.latest_attempt_number)}</td>
      <td>{formatScore(status.latest_score)}</td>
      <td>
        <DecisionPill decision={status.latest_decision} />
        <span className="dashboard-secondary">
          Estado: {formatNullable(status.latest_status)}
        </span>
      </td>
      <td>{formatNullable(status.weakest_metric)}</td>
      <td>
        {formatNullable(status.recommendation_key)}
        {status.recommendation_key && (
          <span className="dashboard-secondary">{recommendationMessage}</span>
        )}
      </td>
      <td>{formatNullable(status.wait_until)}</td>
      <td>
        {status.manual_grant ? (
          <span className="grant-status">Acceso manual concedido</span>
        ) : (
          <button
            type="button"
            className="primary-action grant-button"
            disabled={!canGrant || grantingUserId === status.user_id}
            onClick={() => onManualGrant(status)}
          >
            {grantingUserId === status.user_id
              ? 'Concediendo...'
              : 'Conceder acceso manual'}
          </button>
        )}
      </td>
    </tr>
  )
}

function DecisionPill({ decision }: { decision: Decision | null }) {
  const className = decision ? `decision-pill ${decision.toLowerCase()}` : 'decision-pill'

  return <span className={className}>{formatDecision(decision)}</span>
}
