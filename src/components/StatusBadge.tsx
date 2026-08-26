import { STATUS_LABELS, type Status } from '../lib/status'
import './StatusBadge.css'

/**
 * Elke status krijgt een eigen vórm, niet alleen een eigen kleur: een cirkel,
 * een driehoek en een achthoek. Zo blijft het onderscheid staan voor lezers
 * die groen en oranje niet uit elkaar houden, en in zwart-wit print.
 */
function StatusIcon({ status }: { status: Status }) {
  if (status === 'ok') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="M4.8 8.2l2.1 2.1 4.3-4.5"
          fill="none"
          stroke="var(--surface)"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (status === 'warning') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1.1l6.9 12.3H1.1z" fill="currentColor" />
        <path
          d="M8 5.9v3.2"
          fill="none"
          stroke="var(--surface)"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.4" r="1.05" fill="var(--surface)" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5.3 1h5.4L14.9 5.3v5.4L10.7 15H5.3L1.1 10.7V5.3z" fill="currentColor" />
      <path
        d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface Props {
  status: Status
  /** Overschrijft de standaardtekst, bijv. "4× limiet geraakt". */
  label?: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, label, size = 'md' }: Props) {
  return (
    <span className={`badge badge--${status} badge--${size}`}>
      <StatusIcon status={status} />
      {label ?? STATUS_LABELS[status]}
    </span>
  )
}
