// Wrapper to use Central Backend with fallback to localStorage (for offline demo)
// This file is imported by complain pages instead of direct saveComplain
import { getComplains as getLocal, saveComplain as saveLocal, generateId as genId } from './complainStore.js'
import { saveComplainCentral, getRecords } from './centralBackend.js'

const COLLECTION = import.meta.env.VITE_COLLECTION_SUBMISSIONS || 'submissions'

export function generateId() { return genId() }

export function getComplains() { return getLocal() }

export async function saveComplain(entry) {
  // Try central first, fall back to local
  try {
    const res = await saveComplainCentral(entry)
    // also keep local copy for immediate AllComplains view without refresh
    try { saveLocal({ ...entry, _central: true, _fileRefs: res.files }) } catch {}
    return res
  } catch (e) {
    console.warn('[Central] save failed, falling back to local:', e.message)
    // fallback: save locally with base64 (old behavior) — but we already have entry without base64, so store minimal
    // For fallback we need to handle File objects that weren't uploaded
    // Convert files to base64 quickly as last resort
    const fbFiles = {}
    if (entry.files) {
      for (const [k, v] of Object.entries(entry.files)) {
        if (v instanceof File) {
          try {
            const b64 = await fileToBase64(v)
            fbFiles[k] = { name: v.name, data: b64 }
          } catch {}
        } else fbFiles[k] = v
      }
    }
    const fallbackEntry = { ...entry, files: fbFiles }
    saveLocal(fallbackEntry)
    throw e // rethrow so UI can show warning but data is not lost locally
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Failed to read ' + file.name))
    r.readAsDataURL(file)
  })
}

export async function fetchComplainsCentral() {
  try {
    const list = await getRecords(COLLECTION, {})
    // Normalize backend records to UI shape (handle different response wraps)
    const arr = Array.isArray(list) ? list : (list?.data || [])
    return arr.map(normalizeRecord)
  } catch (e) {
    console.warn('[Central] fetch failed:', e.message)
    return getLocal()
  }
}

function normalizeRecord(r) {
  // Backend may store flat + nested; we want { id, type, title, createdAt, details, files }
  return {
    id: r.id || r._id || r.client_id || r.clientId || String(Date.now()),
    type: r.type || r.event || 'Other',
    title: r.title || (r.type ? r.type + ' Complain' : 'Complain'),
    createdAt: r.createdAt || r.created_at || r.created_at_ts || new Date().toISOString(),
    details: r.details || {
      userName: r.userName || r.user_name || r.name,
      mobile: r.mobile || r.phone,
      email: r.email,
      depositAmount: r.depositAmount || r.amount,
      withdrawalAmount: r.withdrawalAmount || r.amount,
      ...r,
    },
    files: r.files || {},
    _raw: r,
  }
}
