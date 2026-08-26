import type { SourceKind } from '../api/client'
import { CredentialsPanel } from '../components/CredentialsPanel'

interface Props {
  source: SourceKind
}

export function CredentialsPage({ source }: Props) {
  const useLive = source === 'live'

  return (
    <>

      <CredentialsPanel useLive={useLive} />
    </>
  )
}
