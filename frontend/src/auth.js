const TOKEN_KEY = 'engram_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function isLoggedIn() {
  return !!getToken()
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function login(password) {
  const API = import.meta.env.VITE_API_URL
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Login failed.')
  }
  const data = await res.json()
  localStorage.setItem(TOKEN_KEY, data.access_token)
}
