import { useState, useEffect, useRef } from 'react'
import { type SetupSession } from '@/lib/api'
import { userSessionActions, type SessionActionApi } from './sessionActions'

// The stateful halves of FullStackOutputs, split out so that file exports only
// components. react-refresh/only-export-components: a module mixing components
// with anything else loses Fast Refresh, so editing any card in there would
// full-reload the app instead of preserving what you were looking at.

// Shared state for the single-use DID-hosting admin enrollment link, split
// across two render sites: DidsEnrollAlert (top banner, actionable state
// only) and DidsEnrollConfigRow (Configuration card, reissue once used).
export function useDidsEnroll(session: SetupSession | null, actions: SessionActionApi = userSessionActions) {
  const [enrollUrl, setEnrollUrl] = useState('')
  const [used, setUsed] = useState(false)
  const [reissuing, setReissuing] = useState(false)
  const [reissueError, setReissueError] = useState('')
  const [justReissued, setJustReissued] = useState(false)

  // Follow the polled session until the user acts (open/reissue) — the URL
  // only shows up mid-pipeline, so a seed-once from the first session that
  // arrives would miss it in the create-progress flow. After a local action,
  // handleOpen/handleReissue own these values.
  const touched = useRef(false)
  useEffect(() => {
    if (!session || touched.current) return
    setEnrollUrl(session.action_required?.dids_admin_enroll_url ?? '')
    setUsed(session.dids_enroll_used ?? false)
  }, [session])

  function handleOpen() {
    if (!session) return
    touched.current = true
    setUsed(true)
    actions.ackDidsEnroll(session.id).catch(() => {})
  }

  async function handleReissue() {
    if (!session) return
    touched.current = true
    setReissuing(true)
    setReissueError('')
    try {
      const r = await actions.reissueDidsEnroll(session.id)
      setEnrollUrl(r.dids_admin_enroll_url)
      setUsed(false)
      setJustReissued(true)
    } catch (err) {
      setReissueError(err instanceof Error ? err.message : 'Failed to reissue enrollment link')
    } finally {
      setReissuing(false)
    }
  }

  return { enrollUrl, used, reissuing, reissueError, justReissued, handleOpen, handleReissue }
}

export type DidsEnrollState = ReturnType<typeof useDidsEnroll>

// Shared state for the one-shot VTC admin install URL + claim code — the
// VTC counterpart of useDidsEnroll, split across the same two
// render sites (VtcInstallAlert top banner / VtcInstallConfigRow reissue).
// The setup-minted install token expires after 15 minutes, so reissuing is
// the expected path, not an edge case.
export function useVtcInstall(session: SetupSession | null, actions: SessionActionApi = userSessionActions) {
  const [installUrl, setInstallUrl] = useState('')
  const [claimCode, setClaimCode] = useState('')
  const [used, setUsed] = useState(false)
  const [reissuing, setReissuing] = useState(false)
  const [reissueError, setReissueError] = useState('')
  const [justReissued, setJustReissued] = useState(false)

  // Follow the polled session until the user acts — same convention as
  // useDidsEnroll. The install URL only appears at the very end of the
  // pipeline (after step_vtc_setup), so seeding once from the first session
  // would always miss it in the create-progress flow.
  const touched = useRef(false)
  useEffect(() => {
    if (!session || touched.current) return
    setInstallUrl(session.action_required?.install_url ?? '')
    setClaimCode(session.action_required?.claim_code ?? '')
    setUsed(session.vtc_install_used ?? false)
  }, [session])

  function handleOpen() {
    if (!session) return
    touched.current = true
    setUsed(true)
    actions.ackVtcInstall(session.id).catch(() => {})
  }

  async function handleReissue() {
    if (!session) return
    touched.current = true
    setReissuing(true)
    setReissueError('')
    try {
      const r = await actions.reissueVtcInstall(session.id)
      setInstallUrl(r.install_url)
      setClaimCode(r.claim_code)
      setUsed(false)
      setJustReissued(true)
    } catch (err) {
      setReissueError(err instanceof Error ? err.message : 'Failed to reissue install link')
    } finally {
      setReissuing(false)
    }
  }

  return { installUrl, claimCode, used, reissuing, reissueError, justReissued, handleOpen, handleReissue }
}

export type VtcInstallState = ReturnType<typeof useVtcInstall>
