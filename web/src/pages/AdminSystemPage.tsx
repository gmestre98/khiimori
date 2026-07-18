import { useEffect, useState } from 'react'
import { fetchAdminUsers, fetchHealth, type AdminUser, type HealthStatus } from '../lib/api'
import { AdminAvatar } from './adminShared'

// AdminSystemPage is the operational tab of the backoffice (M08.5 redesign): a
// live service-health readout (from /readyz) and the admin roster. Cost + quota
// meters (Cloud Run spend, Maps usage, DB storage) land in a follow-up once a
// stats source for them exists.
export function AdminSystemPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthErr, setHealthErr] = useState(false)
  const [admins, setAdmins] = useState<AdminUser[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchHealth()
      .then((h) => !cancelled && setHealth(h))
      .catch(() => !cancelled && setHealthErr(true))
    fetchAdminUsers()
      .then((u) => !cancelled && setAdmins(u.filter((x) => x.is_admin)))
      .catch(() => !cancelled && setAdmins([]))
    return () => {
      cancelled = true
    }
  }, [])

  const apiUp = health?.status === 'ready'
  const dbCheck = health?.checks?.database

  return (
    <>
      <div className="admin-top">
        <h1>System</h1>
        <p>Service health and who can administer Khiimori</p>
      </div>

      <div className="admin-cols">
        <div className="admin-card">
          <div className="admin-card-hd">
            <h3>Service health</h3>
            {healthErr ? (
              <span className="admin-pill warn">
                <span className="admin-dot" style={{ background: 'var(--warn)' }} />
                Unreachable
              </span>
            ) : health ? (
              <span className={apiUp ? 'admin-pill ok' : 'admin-pill warn'}>
                <span
                  className="admin-dot"
                  style={{ background: apiUp ? 'var(--ok)' : 'var(--warn)' }}
                />
                {apiUp ? 'Operational' : 'Degraded'}
              </span>
            ) : (
              <span className="admin-pill off">Checking…</span>
            )}
          </div>
          <div className="admin-card-bd">
            <HealthRow
              label="API"
              ok={!healthErr && apiUp}
              value={healthErr ? 'no response' : health ? '/readyz 200' : '…'}
            />
            <HealthRow
              label="Database"
              ok={dbCheck === 'ok'}
              value={dbCheck ? dbCheck : health ? 'n/a' : '…'}
            />
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-hd">
            <h3>Administrators</h3>
            <span className="admin-pill off">{admins ? admins.length : '…'}</span>
          </div>
          <div className="admin-card-bd">
            {admins?.length === 0 && <p className="admin-mini">No admins found.</p>}
            {admins?.map((a) => (
              <div className="admin-hrow" key={a.id}>
                <div className="admin-u">
                  <AdminAvatar name={a.name} email={a.email} size={30} />
                  <div>
                    <div className="un">{a.name || a.email}</div>
                    <div className="ue">{a.email}</div>
                  </div>
                </div>
                <span className="admin-badge-admin" style={{ marginLeft: 'auto' }}>
                  Admin
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="admin-mini" style={{ marginTop: 14 }}>
        Live cost and quota meters (Cloud Run spend, Maps usage, database storage) need a GCP
        billing-export + Cloud Monitoring feed, which isn't wired yet — the app can't report real
        spend without it. Budget alerts are configured in the cloud project.
      </p>
    </>
  )
}

function HealthRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="admin-hrow">
      <span className="admin-hl">{label}</span>
      <span className={ok ? 'admin-pill ok' : 'admin-pill off'}>
        <span className="admin-dot" style={{ background: ok ? 'var(--ok)' : 'var(--muted)' }} />
        {value}
      </span>
    </div>
  )
}
