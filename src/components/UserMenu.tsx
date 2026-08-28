import { useEffect, useId, useRef, useState } from 'react'
import type { User } from '../api/auth'
import { ThemeToggle } from './ThemeToggle'
import './UserMenu.css'

/** "Junbo Chen" wordt JC, "Test" wordt T. Meer dan twee letters wordt een prop. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'

  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

interface Props {
  user: User
  onSignOut: () => void
}

export function UserMenu({ user, onSignOut }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  // Klikken buiten het menu sluit het, net als bij elk ander uitklapmenu.
  // Escape doet hetzelfde en zet de focus terug op de knop, zodat je niet
  // met de tab-toets hoeft te zoeken waar je gebleven was.
  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="user-menu__trigger"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={`Menu van ${user.name}`}
        title={user.name}
      >
        {initials(user.name)}
      </button>

      {isOpen && (
        <div className="user-menu__panel" id={panelId} role="menu">
          <div className="user-menu__identity">
            <span className="user-menu__name">{user.name}</span>
            <span className="user-menu__email">{user.email}</span>
          </div>

          {/* De thema-knop wisselt bij elke klik door systeem, licht en donker.
              Het menu blijft daarom open: anders moet je het drie keer opnieuw
              openen om bij de stand te komen die je wilt. */}
          <div className="user-menu__row">
            <ThemeToggle />
          </div>

          <button
            type="button"
            role="menuitem"
            className="user-menu__signout"
            onClick={() => {
              setIsOpen(false)
              onSignOut()
            }}
          >
            Uitloggen
          </button>
        </div>
      )}
    </div>
  )
}
