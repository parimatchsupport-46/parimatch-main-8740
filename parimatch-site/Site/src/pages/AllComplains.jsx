import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import { getComplains, clearComplains, formatDate } from '../utils/complainStore'
import { getRecords, getFileUrl, centralConfig } from '../utils/centralBackend'

function AuthImage({ src, alt, className, style, onClick }) {
  const [blobUrl, setBlobUrl] = useState(src && (src.startsWith('data:') || src.startsWith('blob:')) ? src : '')
  useEffect(() => {
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) { setBlobUrl(src || ''); return }
    if (!src.includes('/api/v1/storage/')) { setBlobUrl(src); return }
    let active = true, objUrl = ''
    fetch(src, {
      headers: {
        'x-project-id': import.meta.env.VITE_PROJECT_ID || 'prj_b184e6323c',
        'x-api-key': import.meta.env.VITE_API_KEY || 'pk_live_5247804425cce0596e2beaacafe006ed'
      }
    }).then(r => r.ok ? r.blob() : null).then(b => {
      if (active && b) { objUrl = URL.createObjectURL(b); setBlobUrl(objUrl) }
    }).catch(() => {})
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [src])
  if (!blobUrl) return <span className="complain-detail-value">Loading...</span>
  return <img src={blobUrl} alt={alt} className={className} style={style} onClick={() => onClick && onClick(blobUrl)} />
}

export default function AllComplains() {
  const [complains, setComplains] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewImg, setPreviewImg] = useState(null)

  const load = async () => {
    try {
      const central = await getRecords()
      const list = Array.isArray(central) ? central : (central?.records || central?.data || [])
      if (list && list.length > 0) {
        const normalized = list.map(raw => {
          const r = (raw.data && typeof raw.data === 'object') ? raw.data : raw;
          return {
          id: raw.id || raw._id || r.client_id || String(Date.now()),
          type: r.type || 'Other',
          title: r.title || (r.type ? r.type + ' Complain' : 'Complain'),
          createdAt: r.createdAt || r.created_at || raw.created_at || new Date().toISOString(),
          details: (r.details && typeof r.details === 'object') ? r.details : {
            userName: r.userName || r.user_name || '',
            mobile: r.mobile || r.phone || '',
            email: r.email || '',
          },
          files: r.files || {},
          _raw: raw
        }})
        setComplains(normalized)
      } else {
        setComplains(getComplains())
      }
    } catch { setComplains(getComplains()) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('complains-updated', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('complains-updated', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  return (
    <>
      <Header showMenu />
      <main className="container">
        <div className="card panel">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px'}}>
            <div>
              <h1 className="page-title" style={{marginBottom:'4px'}}>All Complains</h1>
              <p className="page-sub" style={{marginBottom:'0'}}>Track and manage all complaints submitted from this portal.</p>
            </div>
            {complains.length > 0 && (
              <button className="btn secondary sm" onClick={()=>{ if(confirm('Clear all complains?')) { clearComplains(); load() } }}>Clear</button>
            )}
          </div>
        </div>

        {complains.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h2>No Complains Yet</h2>
            <p>You haven't submitted any complains yet. Once you submit a complain, it will appear here with its full status and updates.</p>
            <Link className="btn primary" to="/">Go to Home</Link>
          </div>
        ) : (
          complains.map((c) => (
            <div key={c.id} className="card complain-item">
              <div className="complain-item-head">
                <span className="badge info">{c.type}</span>
                <span className="complain-item-date">{formatDate(c.createdAt)}</span>
              </div>
              <h3 className="complain-item-title">{c.title}</h3>

              <div className="complain-details-grid">
                {Object.entries(c.details || {}).map(([k, v]) => (
                  <div key={k} className="complain-detail">
                    <span className="complain-detail-label">{k.replace(/([A-Z])/g, ' $1').replace(/^./, s=>s.toUpperCase())}</span>
                    <span className="complain-detail-value">{typeof v === 'object' ? JSON.stringify(v) : (v || '-')}</span>
                  </div>
                ))}
              </div>

              {c.files && Object.keys(c.files).length > 0 && (
                <div className="complain-files">
                  <div className="complain-files-title">Uploaded Files</div>
                  <div className="complain-files-grid">
                    {Object.entries(c.files).map(([key, rawF]) => {
                      const f = (rawF && typeof rawF === 'object') ? rawF : { name: key, url: typeof rawF === 'string' ? rawF : '' };
                      const src = f.data || f.url || (f.file_id ? getFileUrl(f.file_id) : '');
                      const isImg = src && (src.startsWith('data:image') || src.match(/\.(jpg|jpeg|png|gif|webp)$/i) || src.includes('/storage/'));
                      return (
                      <div key={key} className="complain-file">
                        <div className="complain-file-label">{key}</div>
                        {src ? (
                          isImg ? <AuthImage src={src} alt={key} className="complain-file-thumb" style={{cursor:'pointer'}} onClick={(u) => setPreviewImg(u)} /> : <a href={src} target="_blank" rel="noreferrer" download={f.name} className="complain-file-link">{f.name || key}</a>
                        ) : (
                          <span className="complain-detail-value">{f.name || key}</span>
                        )}
                        <div className="complain-file-name">{f.name || key}</div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="complain-item-foot">
                <span className="badge warning">Pending</span>
                <span className="complain-item-id">ID: {String(c.id || '').slice(-6)}</span>
              </div>
            </div>
          ))
        )}
      </main>
      {previewImg && (
        <div onClick={() => setPreviewImg(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <button onClick={() => setPreviewImg(null)} style={{position:'fixed',top:16,right:16,background:'#fff',color:'#000',border:'none',borderRadius:'50%',width:36,height:36,fontSize:20,fontWeight:700,cursor:'pointer'}}>×</button>
          <img src={previewImg} alt="Preview" onClick={e => e.stopPropagation()} style={{maxWidth:'95vw',maxHeight:'90vh',borderRadius:10,objectFit:'contain'}} />
        </div>
      )}
            <footer>        <div className="footer-main">
          <p>&copy; 2026 Parimatch Support. All rights reserved.</p>
          <nav className="footer-nav">
            <Link to="/about">About</Link>
            <span className="sep">·</span>
            <Link to="/terms">Terms</Link>
            <span className="sep">·</span>
            <Link to="/all-complains">My Complains</Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
