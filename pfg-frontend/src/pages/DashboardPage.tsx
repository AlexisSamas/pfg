import { useState, type FormEvent } from 'react'
import { getDashboardContext, grantManualAccess } from '../api'
import { parseApiError } from '../api/errorHandling'
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

function getDashboardUserLabel(status: DashboardUserStatus): string {
  return status.username ?? status.email ?? 'el usuario seleccionado'
}

function withConfirmedManualGrant(
  statuses: DashboardUserStatus[],
  userId: number,
  contextId: string,
): DashboardUserStatus[] {
  return statuses.map((status) =>
    status.user_id === userId && status.context_id === contextId
      ? {
          ...status,
          latest_decision: 'ACCESO',
          manual_grant: true,
        }
      : status,
  )
}

export function DashboardPage() {
  const [contextId, setContextId] = useState('exam_test_01')
  const [statuses, setStatuses] = useState<DashboardUserStatus[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [grantingUserId, setGrantingUserId] = useState<number | null>(null)
  const [pendingGrantStatus, setPendingGrantStatus] =
    useState<DashboardUserStatus | null>(null)

  async function loadDashboard(
    nextContextId = contextId,
    options: { clearSuccess?: boolean } = { clearSuccess: true },
  ): Promise<DashboardUserStatus[] | null> {
    const normalizedContextId = nextContextId.trim()

    if (!normalizedContextId) {
      setError('Introduce el identificador del examen/contexto.')
      return null
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
      return response
    } catch (requestError) {
      setError(parseDashboardError(requestError))
      setStatuses([])
      setHasSearched(true)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void loadDashboard()
  }

  function handleManualGrantRequest(status: DashboardUserStatus) {
    if (
      !status.user_id ||
      !status.context_id ||
      status.manual_grant ||
      status.latest_decision === 'ACCESO'
    ) {
      return
    }

    setError(null)
    setPendingGrantStatus(status)
  }

  function handleCancelManualGrant() {
    if (grantingUserId !== null) {
      return
    }

    setPendingGrantStatus(null)
  }

  async function handleConfirmManualGrant() {
    const status = pendingGrantStatus
    const userId = status?.user_id
    const grantContextId = status?.context_id

    if (!status || !userId || !grantContextId || status.manual_grant) {
      setPendingGrantStatus(null)
      return
    }

    setGrantingUserId(userId)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await grantManualAccess({
        user_id: userId,
        context_id: grantContextId,
        reason: DEFAULT_MANUAL_GRANT_REASON,
      })
      if (!response.granted || !response.manual_grant) {
        setError(
          'La solicitud no confirmo el grant manual. Vuelve a consultar el contexto.',
        )
        return
      }
      setPendingGrantStatus(null)
      const refreshedStatuses = await loadDashboard(grantContextId, {
        clearSuccess: false,
      })
      const refreshedStatus = refreshedStatuses?.find(
        (item) => item.user_id === userId && item.context_id === grantContextId,
      )

      if (refreshedStatus?.manual_grant) {
        setSuccessMessage(
          `Acceso manual concedido al usuario ${getDashboardUserLabel(refreshedStatus)}.`,
        )
      } else if (refreshedStatuses !== null) {
        setStatuses((currentStatuses) =>
          withConfirmedManualGrant(currentStatuses, userId, grantContextId),
        )
        setSuccessMessage(
          `Acceso manual concedido al usuario ${getDashboardUserLabel(status)}.`,
        )
      }
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
          sesiones y decisiones registradas.
        </p>
      </div>

      <form className="dashboard-form" onSubmit={handleSubmit}>
        <div className="dashboard-field">
          <label htmlFor="context-id">Identificador del examen/contexto</label>
          <input
            id="context-id"
            name="contextId"
            onChange={(event) => setContextId(event.target.value)}
            placeholder="exam_test_01"
            value={contextId}
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
          Consultando contexto...
        </p>
      )}

      {!isLoading && hasSearched && statuses.length === 0 && !error && (
        <p className="page-status">No hay sesiones para este contexto.</p>
      )}

      {!isLoading && statuses.length > 0 && (
        <DashboardTable
          grantingUserId={grantingUserId}
          statuses={statuses}
          onManualGrant={handleManualGrantRequest}
        />
      )}

      {pendingGrantStatus && (
        <ManualGrantModal
          isSubmitting={grantingUserId !== null}
          status={pendingGrantStatus}
          onCancel={handleCancelManualGrant}
          onConfirm={() => {
            void handleConfirmManualGrant()
          }}
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
            <th>Usuario</th>
            <th>Intentos</th>
            <th>Score</th>
            <th>Decisión</th>
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
  const hasNormalAccess =
    status.latest_decision === 'ACCESO' && !status.manual_grant
  const canGrant = Boolean(
    status.user_id &&
      status.context_id &&
      !status.manual_grant &&
      status.latest_decision !== 'ACCESO',
  )

  return (
    <tr>
      <td>
        <span className="dashboard-user">
          {formatNullable(status.username ?? status.user_id)}
        </span>
      </td>
      <td>{formatNullable(status.latest_attempt_number)}</td>
      <td>{formatScore(status.latest_score)}</td>
      <td>
        <DecisionPill decision={status.latest_decision} />
        <span className="dashboard-secondary">
          Estado: {formatNullable(status.latest_status)}
        </span>
      </td>
      <td>
        <div className="grant-cell-content">
          {status.manual_grant ? (
            <span className="grant-status">Acceso manual concedido</span>
          ) : hasNormalAccess ? (
            <span className="grant-status">Acceso ya concedido</span>
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
        </div>
      </td>
    </tr>
  )
}

function DecisionPill({ decision }: { decision: Decision | null }) {
  const className = decision
    ? `decision-pill ${decision.toLowerCase()}`
    : 'decision-pill'

  return <span className={className}>{formatDecision(decision)}</span>
}

function ManualGrantModal({
  isSubmitting,
  status,
  onCancel,
  onConfirm,
}: {
  isSubmitting: boolean
  status: DashboardUserStatus
  onCancel: () => void
  onConfirm: () => void
}) {
  const userLabel = status.username ?? status.email ?? status.user_id

  return (
    <div
      aria-labelledby="manual-grant-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <div className="modal-panel">
        <p className="eyebrow">Grant manual</p>
        <h2 id="manual-grant-title">Conceder acceso manual</h2>
        <p className="description">
          ¿Conceder acceso manual a {formatNullable(userLabel)}?
        </p>
        <p className="modal-helper">
          Esta acción permitirá al alumno continuar en este contexto aunque
          tuviera un bloqueo activo.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-modal-action modal-action-button"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary-action modal-action-button"
            disabled={isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? 'Concediendo...' : 'Conceder acceso'}
          </button>
        </div>
      </div>
    </div>
  )
}
