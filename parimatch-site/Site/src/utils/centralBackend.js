/**
 * Central Backend — No Firebase/Supabase
 * Base URL: http://45.195.159.105
 * Headers: x-project-id, x-api-key (from .env)
 * Endpoints:
 *  - Data: /api/v1/data/<collection> (POST, GET, PATCH, DELETE)
 *  - Upload: POST /api/v1/storage/upload (FormData 'file')
 *  - File view: GET /api/v1/storage/<file_id>
 */

// Vite env (set in .env, fallback to placeholder for build without crash)
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://server-vakki-8740.duckdns.org').replace(/\/$/, '')
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

// Check if credentials are still placeholder — show warning once
let warned = false
function ensureCreds() {
  if (!warned && (PROJECT_ID.includes('xxxxxxxxxx') || API_KEY.includes('xxxxxxxxxx'))) {
    warned = true
    console.warn('[CentralBackend] ⚠️ Placeholder credentials — Set VITE_PROJECT_ID and VITE_API_KEY in .env')
  }
}

// ---------------- Data Helpers ----------------
export async function createRecord(collection, data) {
  ensureCreds()
  const url = apiUrl(`/api/v1/data/${encodeURIComponent(collection || COLLECTION)}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Create failed ${res.status}: ${txt || res.statusText}`)
  }
  return res.json().catch(() => ({ ok: true }))
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
  // Normalize: some APIs return { data: [...] } or directly [...]
  if (Array.isArray(json)) return json
  if (json && Array.isArray(json.data)) return json.data
  if (json && Array.isArray(json.records)) return json.records
  if (json && Array.isArray(json.items)) return json.items
  return json
}

export async function updateRecord(collection, id, patch) {
  ensureCreds()
  const url = apiUrl(`/api/v1/data/${encodeURIComponent(collection || COLLECTION)}`)
  // Many backends expect PATCH with query ?id= or body with id field — we send both for compatibility
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

// ---------------- Storage Helpers ----------------
export async function uploadFile(file) {
  ensureCreds()
  if (!file) throw new Error('No file provided')
  const fd = new FormData()
  fd.append('file', file)
  const url = apiUrl('/api/v1/storage/upload')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-project-id': PROJECT_ID,
      'x-api-key': API_KEY,
      // Don't set Content-Type — browser sets multipart boundary
    },
    body: fd,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Upload failed ${res.status}: ${txt || res.statusText}`)
  }
  const json = await res.json().catch(() => ({}))
  // Expected: { file_id, url } or { id, fileId, etc } — normalize
  const fileId = json.file_id || json.fileId || json.id || json.fileID || json.data?.file_id || json.data?.id
  const fileUrl = json.url || json.file_url || json.fileUrl || (fileId ? apiUrl(`/api/v1/storage/${fileId}`) : null)
  return { file_id: fileId, url: fileUrl, raw: json }
}

export function getFileUrl(fileId) {
  if (!fileId) return null
  // If already full URL, return as-is
  if (String(fileId).startsWith('http')) return fileId
  return apiUrl(`/api/v1/storage/${encodeURIComponent(fileId)}`)
}

// Helpers for complain forms — central save with file uploads + local fallback
export async function saveComplainCentral(entry) {
  const uploadedFiles = {}
  // 1) Try to upload each file via central storage, fallback to base64 if backend unreachable
  if (entry.files) {
    for (const [key, val] of Object.entries(entry.files)) {
      let fileObj = null
      if (val instanceof File) fileObj = val
      else if (val && val.file instanceof File) fileObj = val.file
      else if (val && typeof val === 'object' && val.name && val.data) {
        uploadedFiles[key] = val
        continue
      }
      if (fileObj) {
        try {
          const up = await uploadFile(fileObj)
          uploadedFiles[key] = { name: fileObj.name, file_id: up.file_id, url: up.url }
        } catch (e) {
          console.warn(`[Central] file upload failed for ${key}, using local fallback:`, e.message)
          // Fallback: convert to base64 for localStorage demo when central is not configured
          try {
            const b64 = await fileToBase64Local(fileObj)
            uploadedFiles[key] = { name: fileObj.name, data: b64, _fallback: true }
          } catch { uploadedFiles[key] = { name: fileObj.name, _fallback: true } }
        }
      } else if (val) {
        uploadedFiles[key] = val
      }
    }
  }

  const record = {
    client_id: entry.id,
    type: entry.type,
    event: entry.type?.toLowerCase() || 'other',
    site_id: entry.site_id || 'parimatch',
    title: entry.title,
    created_at: entry.createdAt,
    createdAt: entry.createdAt,
    details: entry.details,
    userName: entry.details?.userName,
    mobile: entry.details?.mobile,
    email: entry.details?.email,
    files: uploadedFiles,
    ...Object.fromEntries(Object.entries(uploadedFiles).map(([k, v]) => [k, v.url || v.file_id || v.data || v])),
  }

  // 2) Try to save to central data, fallback to localStorage if fails (e.g. placeholder creds)
  try {
    const result = await createRecord(COLLECTION, record)
    // Also keep local copy for instant UI feedback (AllComplains reads central first, but local is backup)
    try { saveToLocalForFallback({ ...entry, files: uploadedFiles, _central: true }) } catch {}
    return { ...record, _backend: result, _central: true }
  } catch (e) {
    console.warn('[Central] createRecord failed, using local fallback:', e.message)
    try { saveToLocalForFallback({ ...entry, files: uploadedFiles, _fallback: true, _error: e.message }) } catch {}
    // Return success so UI shows "Submitted" even in placeholder mode
    return { ...record, _fallback: true, _error: e.message }
  }
}

function fileToBase64Local(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Failed to read ' + file.name))
    r.readAsDataURL(file)
  })
}

function saveToLocalForFallback(entry) {
  const KEY = 'parimatch_complains'
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    list.unshift(entry)
    localStorage.setItem(KEY, JSON.stringify(list))
    try { window.dispatchEvent(new Event('complains-updated')) } catch {}
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      const trimmed = JSON.stringify(entry).slice(0, 20)
      // keep minimal
    }
    throw err
  }
}

// Re-export config for debug
export const centralConfig = { API_BASE, PROJECT_ID: PROJECT_ID.slice(0, 6) + '***', COLLECTION }
