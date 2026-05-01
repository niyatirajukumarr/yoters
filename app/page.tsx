'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Restaurant, Queue, formatWait, getWaitLevel } from '@/lib/types'

interface RestaurantWithQueue extends Restaurant {
  queue: Queue
}

export default function LandingPage() {
  const [restaurants, setRestaurants] = useState<RestaurantWithQueue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ total: 0, avgWait: 0, available: 0 })

  useEffect(() => {
    fetchRestaurants()

    const channel = supabase
      .channel('queues-landing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, () => {
        fetchRestaurants()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchRestaurants() {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*, queue:queues(*)')
      .eq('is_active', true)
      .order('name')

    if (error) { console.error(error); return }

    const list = (data || []) as RestaurantWithQueue[]
    setRestaurants(list)

    const withQueue = list.filter(r => r.queue)
    const avgWait = withQueue.length
      ? Math.round(withQueue.reduce((a, r) => a + r.queue.current_wait_mins, 0) / withQueue.length)
      : 0
    const available = withQueue.filter(r => r.queue.tables_available > 0).length

    setStats({ total: list.length, avgWait, available })
    setLoading(false)
  }

  const filtered = restaurants.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.cuisine.toLowerCase().includes(search.toLowerCase()) ||
    r.address.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* NAV */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 40px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(12px)', zIndex: 100
      }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
        <span style={{ color: 'var(--accent)' }}>YOTERS</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/customer">
            <button style={{
              padding: '9px 20px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 500
            }}>Find a Table</button>
          </Link>
          <Link href="/staff">
            <button style={{
              padding: '9px 20px', borderRadius: 9, border: 'none',
              background: 'var(--accent)', color: 'white', fontSize: 14, fontWeight: 500
            }}>Staff Dashboard</button>
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 40px 32px' }}>
        <div style={{
          display: 'inline-block', background: 'rgba(255,107,74,0.1)',
          border: '1px solid rgba(255,107,74,0.3)', color: 'var(--accent)',
          fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
          padding: '6px 14px', borderRadius: 20, marginBottom: 24
        }}>Live Queue Visibility</div>

        <h1 style={{
          fontFamily: 'var(--font-head)', fontSize: 'clamp(36px, 5vw, 68px)',
          fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginBottom: 18
        }}>
          Know before<br />
          <span style={{ color: 'var(--accent)' }}>you go.</span>
        </h1>

        <p style={{ fontSize: 18, color: 'var(--text2)', maxWidth: 480, lineHeight: 1.65, marginBottom: 36 }}>
          Real-time wait times across restaurants. Join the queue remotely. Pre-order your meal before you arrive.
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/customer">
            <button style={{
              padding: '14px 30px', borderRadius: 11, border: 'none',
              background: 'var(--accent)', color: 'white', fontSize: 16, fontWeight: 600
            }}>Browse Restaurants</button>
          </Link>
          <Link href="/staff">
            <button style={{
              padding: '14px 30px', borderRadius: 11,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontSize: 16, fontWeight: 500
            }}>Manage My Queue</button>
          </Link>
        </div>
      </div>

      {/* STATS BAR */}
      <div style={{ maxWidth: 1100, margin: '0 auto 0', padding: '0 40px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)', overflow: 'hidden'
        }}>
          {[
            { val: stats.total, label: 'Restaurants Live', color: 'var(--accent2)' },
            { val: `~${stats.avgWait}m`, label: 'Avg Wait Time', color: 'var(--yellow)' },
            { val: stats.available, label: 'Tables Available Now', color: 'var(--green)' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '24px 28px',
              borderRight: i < 2 ? '1px solid var(--border)' : 'none'
            }}>
              <div style={{
                fontFamily: 'var(--font-head)', fontSize: 36,
                fontWeight: 800, color: s.color, marginBottom: 4
              }}>{loading ? '—' : s.val}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RESTAURANT LIST */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 40px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 700 }}>
              Restaurants Near You
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
              Updated in real-time
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 13, color: 'var(--muted)'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--green)', display: 'inline-block' }} />
              Under 15m
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--yellow)', display: 'inline-block' }} />
              15–35m
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--red)', display: 'inline-block' }} />
              35m+
            </span>
          </div>
        </div>

        <input
          type="text"
          placeholder="Search by name, cuisine, or area..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '14px 18px', marginBottom: 24,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, fontSize: 15
          }}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>
            Loading restaurants...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16
          }}>
            {filtered.map(r => {
              const wait = r.queue?.current_wait_mins ?? 0
              const level = getWaitLevel(wait)
              const levelColor = { low: 'var(--green)', mid: 'var(--yellow)', high: 'var(--red)' }[level]
              const levelBg = { low: 'rgba(46,204,113,0.1)', mid: 'rgba(241,196,15,0.1)', high: 'rgba(231,76,60,0.1)' }[level]
              const levelBorder = { low: 'rgba(46,204,113,0.3)', mid: 'rgba(241,196,15,0.3)', high: 'rgba(231,76,60,0.3)' }[level]

              return (
                <div key={r.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 16, overflow: 'hidden',
                  transition: 'all 0.25s', cursor: 'default'
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                  }}
                >
                  {/* Card header */}
                  <div style={{
                    height: 130, background: 'var(--surface2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 56, position: 'relative'
                  }}>
                    {r.image_emoji}
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      background: levelBg, border: `1px solid ${levelBorder}`,
                      color: levelColor, borderRadius: 8, padding: '5px 11px',
                      fontSize: 12, fontWeight: 700
                    }}>
                      {formatWait(wait)}
                    </div>
                    {r.queue?.tables_available > 0 && (
                      <div style={{
                        position: 'absolute', top: 12, left: 12,
                        background: 'rgba(46,204,113,0.15)', border: '1px solid rgba(46,204,113,0.3)',
                        color: 'var(--green)', borderRadius: 8, padding: '5px 11px',
                        fontSize: 11, fontWeight: 600
                      }}>
                        {r.queue.tables_available} tables free
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div style={{ padding: 18 }}>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
                      {r.name}
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                      <span>🍴 {r.cuisine}</span>
                      <span>📍 {r.address.split(',')[0]}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{
                          background: 'var(--surface2)', borderRadius: 6,
                          padding: '4px 10px', fontSize: 12, color: 'var(--muted)'
                        }}>
                          👥 {r.queue?.queue_count ?? 0} in queue
                        </span>
                      </div>
                      <Link href={`/customer?restaurant=${r.id}`}>
                        <button style={{
                          padding: '8px 18px', borderRadius: 8, border: 'none',
                          background: 'var(--accent)', color: 'white',
                          fontSize: 13, fontWeight: 600
                        }}>Join Queue</button>
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            No restaurants found for "{search}"
          </div>
        )}
      </div>
    </div>
  )
}
