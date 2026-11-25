/**
 * Central Backend — No Firebase/Supabase
 * Base URL: http://45.195.159.105
 * Headers: x-project-id, x-api-key (from .env)
 * Endpoints:
 *  - Data: /api/v1/data/<collection> (POST, GET, PATCH, DELETE)
 *  - Upload: POST /api/v1/storage/upload (FormData 'file')
 *  - File view: GET /api/v1/storage/<file_id>
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://45.195.159.105').replace(/\/$/, '')
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'prj_xxxxxxxxxx'
const API_KEY = import.meta.env.VITE_API_KEY || 'pk_live_xxxxxxxxxx'
const COLLECTION = import.meta.env.VITE_COLLECTION_SUBMISSIONS || 'submissions'

function getHeaders(isFormData = false) {
  const h = {
    'x-project-id': PROJECT_ID,
    'x-api-key': API_KEY,
  }
  if (!isFormData) h['Content-Type'] = 'application/json'
  return h
}

function apiUrl(path) {
  return `${API_BASE}${path}`
}

let warned = false
function ensureCreds() {
  if (!warned && (PROJECT_ID.includes('xxxxxxxxxx') || API_KEY.includes('xxxxxxxxxx'))) {
    warned = true
    console.warn('[CentralBackend] ⚠️ Placeholder credentials — Set VITE_PROJECT_ID and VITE_API_KEY in .env')
  }
}

export async function getRecords(collection, query = {}) {
  ensureCreds()
  const qs = new URLSearchParams(query).toString()
  const url = apiUrl(`/api/v1/data/${encodeURIComponent(collection || COLLECTION)}${qs ? `?${qs}` : ''}`)
  const res = await fetch(url, { method: 'GET', headers: getHeaders() })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Fetch failed ${res.status}: ${txt || res.statusText}`)
  }
  const json = await res.json()
  if (Array.isArray(json)) return json
  if (json && Array.isArray(json.data)) return json.data
  if (json && Array.isArray(json.records)) return json.records
  if (json && Array.isArray(json.items)) return json.items
  return json
}

export async function updateRecord(collection, id, patch) {
  ensureCreds()
  const url = apiUrl(`/api/v1/data/${encodeURIComponent(collection || COLLECTION)}`)
  const body = { id, ...patch }
  const res = await fetch(`${url}?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Update failed ${res.status}: ${txt || res.statusText}`)
  }
  return res.json().catch(() => ({ ok: true }))
}

export async function deleteRecord(collection, id) {
  ensureCreds()
  const url = apiUrl(`/api/v1/data/${encodeURIComponent(collection || COLLECTION)}?id=${encodeURIComponent(id)}`)
  const res = await fetch(url, { method: 'DELETE', headers: getHeaders() })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Delete failed ${res.status}: ${txt || res.statusText}`)
  }
  return res.json().catch(() => ({ ok: true }))
}

export function getFileUrl(fileId) {
  if (!fileId) return null
  if (String(fileId).startsWith('http') || String(fileId).startsWith('data:')) return fileId
  return apiUrl(`/api/v1/storage/${encodeURIComponent(fileId)}`)
}

export function normalizeSubmission(r) {
  const files = {}
  if (r.files && typeof r.files === 'object') {
    for (const [k, v] of Object.entries(r.files)) {
      if (v && typeof v === 'object') {
        const src = v.data || v.url || (v.file_id ? getFileUrl(v.file_id) : null)
        files[k] = { ...v, data: src }
      } else if (typeof v === 'string') {
        files[k] = { name: k, data: getFileUrl(v) }
      }
    }
  }
  return {
    id: r.id || r._id || r.client_id || r.clientId || String(Date.now()),
    type: r.type || r.event || 'Other',
    title: r.title || (r.type ? r.type + ' Complain' : 'Complain'),
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
    details: r.details || {
      userName: r.userName || r.user_name || r.name || '',
      mobile: r.mobile || r.phone || '',
      email: r.email || '',
      ...(r.depositAmount ? { depositAmount: r.depositAmount } : {}),
      ...(r.withdrawalAmount ? { withdrawalAmount: r.withdrawalAmount } : {}),
      ...(r.message ? { message: r.message } : {}),
    },
    files,
    _raw: r,
  }
}

export const centralConfig = { API_BASE, PROJECT_ID: PROJECT_ID.slice(0, 6) + '***', COLLECTION }
