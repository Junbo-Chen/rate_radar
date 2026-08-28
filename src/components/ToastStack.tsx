import type { Toast } from '../hooks/useToasts'
import { StatusBadge } from './StatusBadge'
import './ToastStack.css'

interface Props {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastStack({ toasts, onDismiss }: Props) {
  return (
    /*
     * aria-live staat op de container en niet op de losse melding: die moet er
     * al staan voordat de tekst verschijnt, anders leest een schermlezer hem
     * niet voor. `assertive` omdat een limiet die geraakt wordt niet kan wachten.
     */
    <div className="toasts" role="log" aria-live="assertive" aria-relevant="additions">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast--${toast.status}`}>
          <div className="toast__body">
            <div className="toast__head">
              <StatusBadge status={toast.status} size="sm" label={toast.title} />
            </div>
            <p className="toast__text">{toast.body}</p>
          </div>

          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Melding sluiten"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </article>
      ))}
    </div>
  )
}
