import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { wipeLocal } from '../db/local'

/*
 * Whether the app is signed in.
 *
 * We deliberately do not wait for `supabase.auth.getSession()` to settle.
 * Offline it can hang indefinitely: the client keeps retrying the refresh_token
 * request and holds an internal lock while doing so, and every other auth call
 * queues behind it. Gating the UI on that promise meant a blank page with no
 * network — which defeats the whole point of an offline-first planner.
 *
 * So we race it against a short timeout and fall back to the session Supabase
 * has already persisted in localStorage. The app never needs the network to
 * render: all reads and writes go to the local database.
 */

const AUTH_TIMEOUT_MS = 1500

export interface SessionState {
  signedIn: boolean
  loading: boolean
}

/** A session Supabase persisted earlier, whether or not it can be refreshed now. */
function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const raw = localStorage.getItem(key)
      if (raw && JSON.parse(raw)?.user) return true
    }
  } catch {
    // Private mode or storage denied: treat it as signed out.
  }
  return false
}

export function useSession(): SessionState {
  const [signedIn, setSignedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), AUTH_TIMEOUT_MS),
    )

    void Promise.race([supabase.auth.getSession(), timeout]).then((result) => {
      if (!alive) return
      setSignedIn(result === 'timeout' ? hasStoredSession() : Boolean(result.data.session))
      setLoading(false)
    })

    // The session can still change later: token expiry, sign-out, sign-in in another tab.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      // Refresh failures offline arrive as a null session; the stored one is still good.
      if (!session && event === 'TOKEN_REFRESHED') return
      setSignedIn(Boolean(session))
      setLoading(false)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { signedIn, loading }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** The local cache is wiped: no data should be left behind on someone else's device. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  await wipeLocal()
}
