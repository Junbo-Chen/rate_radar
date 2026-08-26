import { useEffect, useRef, type ReactNode } from 'react'
import './Modal.css'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Popup bovenop de pagina, gebouwd op het native `<dialog>`-element.
 *
 * Dat scheelt een hoop handwerk: de browser regelt zelf de focus-trap, sluiten
 * met Esc, het inert maken van de achtergrond en de backdrop. Een zelfgebouwde
 * overlay van divs moet dat allemaal namaken en doet het meestal half.
 */
export function Modal({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    // showModal() op een al open dialog gooit een fout, vandaar de controle.
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      // Vangt zowel Esc als een close() af, zodat de state altijd meeloopt.
      onClose={onClose}
      // Een klik op de backdrop heeft het dialog zelf als target; alles wat
      // binnen het paneel gebeurt niet.
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <h2 id="modal-title" className="modal__title">
            {title}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Sluiten">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {children}
      </div>
    </dialog>
  )
}
