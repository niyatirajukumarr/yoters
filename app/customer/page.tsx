'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Restaurant, Queue, MenuItem, QueueEntry, OrderItem, formatWait, getWaitLevel } from '@/lib/types'

interface RestaurantWithQueue extends Restaurant { queue: Queue }

type Step = 'browse' | 'join' | 'tracking' | 'preorder'

function CustomerPageInner() {
  const searchParams = useSearchParams()
  const preselected = searchParams.get('restaurant')

  const [step, setStep] = useState<Step>('browse')
  const [restaurants, setRestaurants] = useState<RestaurantWithQueue[]>([])
  const [selected, setSelected] = useState<RestaurantWithQueue | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [myEntry, setMyEntry] = useState<QueueEntry | null>(null)
  const [cart, setCart] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [orderSubmitted, setOrderSubmitted] = useState(false)

  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', party_size: '2', notes: ''
  })

  const fetchRestaurants = useCallback(async () => {
    const { data } = await supabase
      .from('restaurants')
      .select('*, queue:queues(*)')
      .eq('is_active', true)
      .order('name')
    if (data) {
      setRestaurants(data as RestaurantWithQueue[])
      if (preselected) {
        const r = data.find((r: RestaurantWithQueue) => r.id === preselected)
        if (r) { setSelected(r as RestaurantWithQueue); setStep('join') }
      }
    }
    setLoading(false)
  }, [preselected])

  useEffect(() => {
    fetchRestaurants()
    const channel = supabase
      .channel('customer-queues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, fetchRestaurants)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'queue_entries' }, (payload) => {
        if (myEntry && payload.new.id === myEntry.id) {
          setMyEntry(payload.new as QueueEntry)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchRestaurants, myEntry])

  async function fetchMenu(restaurantId: string) {
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true)
      .order('category')
    if (data) setMenuItems(data)
  }

  async function joinQueue() {
    if (!selected || !form.customer_name || !form.customer_phone) return
    setSubmitting(true)

    const { data: existing } = await supabase
      .from('queue_entries')
      .select('position')
      .eq('restaurant_id', selected.id)
      .eq('status', 'waiting')
      .order('position', { ascending: false })
      .limit(1)

    const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 1

    const { data, error } = await supabase
      .from('queue_entries')
      .insert({
        restaurant_id: selected.id,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        party_size: parseInt(form.party_size),
        position: nextPosition,
        notes: form.notes || null,
        status: 'waiting'
      })
      .select()
      .single()

    if (error) { alert('Error joining queue. Try again.'); setSubmitting(false); return }
    setMyEntry(data)
    await fetchMenu(selected.id)
    setStep('tracking')
    setSubmitting(false)
  }

  async function submitPreOrder() {
    if (!myEntry || cart.length === 0) return
    setSubmitting(true)
    const { error } = await supabase
      .from('pre_orders')
      .insert({
        queue_entry_id: myEntry.id,
        restaurant_id: myEntry.restaurant_id,
        items: cart,
        status: 'pending'
      })
    if (!error) setOrderSubmitted(true)
    setSubmitting(false)
  }

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const exists = prev.find(i => i.menu_item_id === item.id)
      if (exists) return prev.map(i => i.menu_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function removeFromCart(id: string) {
    setCart(prev => {
      const exists = prev.find(i => i.menu_item_id === id)
      if (exists && exists.quantity > 1) return prev.map(i => i.menu_item_id === id ? { ...i, quantity: i.quantity - 1 } : i)
      return prev.filter(i => i.menu_item_id !== id)
    })
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const categories = [...new Set(menuItems.map(i => i.category))]
  const filtered = restaurants.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.cuisine.toLowerCase().includes(search.toLowerCase())
  )

  const inputStyle = {
    width: '100%', padding: '12px 16px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 15, color: 'var(--text)'
  }

  const labelStyle = { fontSize: 13, color: 'var(--text2)', marginBottom: 6, display: 'block' as const }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* NAV */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 40px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(12px)', zIndex: 100
      }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 800 }}>
          Queue<span style={{ color: 'var(--accent)' }}>Eat</span>
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['browse', 'join', 'tracking', 'preorder'] as Step[]).map((s, i) => (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              {i > 0 && <span style={{ color: 'var(--border2)' }}>›</span>}
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: step === s ? 'var(--accent)' : 'var(--muted)'
              }}>
                {{ browse: 'Browse', join: 'Join', tracking: 'Queue', preorder: 'Pre-order' }[s]}
              </span>
            </div>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* BROWSE STEP */}
        {step === 'browse' && (
          <>
            <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 32, fontWeight: 800, marginBottom: 6 }}>
              Find a Table
            </h1>
            <p style={{ color: 'var(--text2)', marginBottom: 28 }}>
              Select a restaurant to join their virtual queue
            </p>
            <input
              placeholder="Search restaurants or cuisine..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: 24 }}
            />
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered.map(r => {
                  const wait = r.queue?.current_wait_mins ?? 0
                  const level = getWaitLevel(wait)
                  const levelColor = { low: 'var(--green)', mid: 'var(--yellow)', high: 'var(--red)' }[level]
                  return (
                    <div key={r.id} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 14, padding: '18px 22px',
                      display: 'flex', alignItems: 'center', gap: 18,
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}
                      onClick={() => { setSelected(r); setStep('join') }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
                    >
                      <div style={{ fontSize: 40, flexShrink: 0 }}>{r.image_emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-head)', fontSize: 17, fontWeight: 700 }}>{r.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                          {r.cuisine} · {r.address}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 800, color: levelColor }}>
                          {formatWait(wait)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {r.queue?.queue_count ?? 0} in queue
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* JOIN STEP */}
        {step === 'join' && selected && (
          <>
            <button onClick={() => setStep('browse')} style={{
              background: 'none', border: 'none', color: 'var(--muted)',
              fontSize: 14, marginBottom: 24, padding: 0, display: 'flex', alignItems: 'center', gap: 6
            }}>← Back to restaurants</button>

            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 24, marginBottom: 28,
              display: 'flex', alignItems: 'center', gap: 16
            }}>
              <div style={{ fontSize: 48 }}>{selected.image_emoji}</div>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700 }}>{selected.name}</div>
                <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 3 }}>{selected.cuisine} · {selected.address}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 14, color: 'var(--yellow)', fontWeight: 600 }}>
                    ⏱ {formatWait(selected.queue?.current_wait_mins ?? 0)}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                    👥 {selected.queue?.queue_count ?? 0} ahead
                  </span>
                </div>
              </div>
            </div>

            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
              Join Virtual Queue
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  placeholder="Your name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone Number *</label>
                <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                  placeholder="+91 98765 43210" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Party Size</label>
                <select value={form.party_size} onChange={e => setForm(f => ({ ...f, party_size: e.target.value }))}
                  style={inputStyle}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Special Notes (optional)</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="High chair needed, window seat, allergies..." style={inputStyle} />
              </div>

              <button
                onClick={joinQueue}
                disabled={submitting || !form.customer_name || !form.customer_phone}
                style={{
                  padding: '15px', borderRadius: 12, border: 'none',
                  background: 'var(--accent)', color: 'white', fontSize: 16, fontWeight: 700,
                  opacity: submitting || !form.customer_name || !form.customer_phone ? 0.5 : 1,
                  marginTop: 8
                }}
              >
                {submitting ? 'Joining...' : `Join Queue at ${selected.name}`}
              </button>
            </div>
          </>
        )}

        {/* TRACKING STEP */}
        {step === 'tracking' && myEntry && selected && (
          <>
            <div style={{
              background: 'linear-gradient(135deg, rgba(255,107,74,0.1), rgba(124,92,252,0.1))',
              border: '1px solid rgba(255,107,74,0.2)', borderRadius: 20, padding: 32,
              textAlign: 'center', marginBottom: 28
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
                You&apos;re in the queue!
              </div>
              <div style={{ fontSize: 15, color: 'var(--text2)' }}>
                We&apos;ll notify you when your table is ready
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
              {[
                { label: 'Queue Position', val: `#${myEntry.position}`, color: 'var(--accent)' },
                { label: 'Est. Wait', val: formatWait(selected.queue?.current_wait_mins ?? 0), color: 'var(--yellow)' },
                { label: 'Party Size', val: `${myEntry.party_size} people`, color: 'var(--text)' },
                { label: 'Status', val: myEntry.status.charAt(0).toUpperCase() + myEntry.status.slice(1), color: 'var(--green)' },
              ].map((s, i) => (
                <div key={i} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: '20px 22px'
                }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            {myEntry.status === 'called' && (
              <div style={{
                background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)',
                borderRadius: 14, padding: 20, textAlign: 'center', marginBottom: 20,
                color: 'var(--green)', fontWeight: 600, fontSize: 16
              }}>
                🔔 Your table is ready! Please head to the host stand.
              </div>
            )}

            <button
              onClick={() => setStep('preorder')}
              style={{
                width: '100%', padding: 16, borderRadius: 12, border: 'none',
                background: 'var(--accent2)', color: 'white', fontSize: 16, fontWeight: 700
              }}
            >
              Pre-order Food While You Wait →
            </button>
          </>
        )}

        {/* PRE-ORDER STEP */}
        {step === 'preorder' && selected && (
          <>
            <button onClick={() => setStep('tracking')} style={{
              background: 'none', border: 'none', color: 'var(--muted)',
              fontSize: 14, marginBottom: 24, padding: 0
            }}>← Back to queue status</button>

            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
              Pre-order Your Meal
            </h2>
            <p style={{ color: 'var(--text2)', marginBottom: 28 }}>
              Order now, food arrives right when you&apos;re seated
            </p>

            {orderSubmitted ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Order confirmed banner */}
                <div style={{
                  background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)',
                  borderRadius: 16, padding: 24, textAlign: 'center'
                }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>
                    Order placed!
                  </div>
                  <div style={{ color: 'var(--text2)', marginTop: 6, fontSize: 14 }}>
                    Complete payment below to confirm your pre-order
                  </div>
                </div>

                {/* UPI Payment Card */}
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 16, padding: 28, textAlign: 'center'
                }}>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                    Pay via UPI
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
                    Scan QR or tap Pay Now to open your UPI app
                  </div>

                  {/* Amount */}
                  <div style={{
                    background: 'var(--surface2)', borderRadius: 12, padding: '14px 20px',
                    marginBottom: 24, display: 'inline-block'
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>Total Amount</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: 32, fontWeight: 800, color: 'var(--accent)' }}>
                      ₹{cartTotal}
                    </div>
                  </div>

                  {/* QR Code using free API */}
                  <div style={{ marginBottom: 24 }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`upi://pay?pa=niyati.rajukumar@okaxis&pn=Yoters&am=${cartTotal}&cu=INR&tn=Food pre-order at ${selected?.name}`)}`}
                      alt="UPI QR Code"
                      style={{ borderRadius: 12, border: '4px solid white' }}
                    />
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      Scan with any UPI app
                    </div>
                  </div>

                  {/* Pay Now button — opens UPI app directly */}
                  <a
                    href={`upi://pay?pa=niyati.rajukumar@okaxis&pn=Yoters&am=${cartTotal}&cu=INR&tn=Food pre-order at ${selected?.name}`}
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    <button style={{
                      width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #00b09b, #96c93d)',
                      color: 'white', fontSize: 16, fontWeight: 700, marginBottom: 10
                    }}>
                      📱 Pay ₹{cartTotal} Now
                    </button>
                  </a>

                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    UPI ID: niyati.rajukumar@okaxis
                  </div>
                </div>

                <button onClick={() => setStep('tracking')} style={{
                  padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--muted)', fontSize: 14
                }}>Back to Queue Status</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: menuItems.length > 0 ? '1fr 320px' : '1fr', gap: 24 }}>
                {/* Menu */}
                <div>
                  {menuItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 14 }}>
                      No menu items added yet for this restaurant
                    </div>
                  ) : (
                    categories.map(cat => (
                      <div key={cat} style={{ marginBottom: 28 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
                          textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12
                        }}>{cat}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {menuItems.filter(i => i.category === cat).map(item => {
                            const inCart = cart.find(i => i.menu_item_id === item.id)
                            return (
                              <div key={item.id} style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: 12, padding: '14px 16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                              }}>
                                <div>
                                  <div style={{ fontWeight: 500, fontSize: 15 }}>{item.name}</div>
                                  {item.description && (
                                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{item.description}</div>
                                  )}
                                  <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600, marginTop: 4 }}>
                                    ₹{item.price}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  {inCart ? (
                                    <>
                                      <button onClick={() => removeFromCart(item.id)} style={{
                                        width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
                                        background: 'var(--surface2)', color: 'var(--text)', fontSize: 18
                                      }}>−</button>
                                      <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{inCart.quantity}</span>
                                      <button onClick={() => addToCart(item)} style={{
                                        width: 30, height: 30, borderRadius: 8, border: 'none',
                                        background: 'var(--accent)', color: 'white', fontSize: 18
                                      }}>+</button>
                                    </>
                                  ) : (
                                    <button onClick={() => addToCart(item)} style={{
                                      padding: '7px 16px', borderRadius: 8, border: 'none',
                                      background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600
                                    }}>Add</button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Cart */}
                {cart.length > 0 && (
                  <div style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 16, padding: 20, height: 'fit-content',
                    position: 'sticky', top: 100
                  }}>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                      Your Order
                    </div>
                    {cart.map(item => (
                      <div key={item.menu_item_id} style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', padding: '8px 0',
                        borderBottom: '1px solid var(--border)'
                      }}>
                        <div>
                          <div style={{ fontSize: 14 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>x{item.quantity}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>₹{item.price * item.quantity}</div>
                      </div>
                    ))}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '14px 0 16px', fontWeight: 700, fontSize: 16
                    }}>
                      <span>Total</span>
                      <span style={{ color: 'var(--accent)' }}>₹{cartTotal}</span>
                    </div>
                    <button
                      onClick={submitPreOrder}
                      disabled={submitting}
                      style={{
                        width: '100%', padding: 14, borderRadius: 10, border: 'none',
                        background: 'var(--accent)', color: 'white',
                        fontSize: 15, fontWeight: 700, opacity: submitting ? 0.6 : 1
                      }}
                    >
                      {submitting ? 'Placing...' : 'Place Pre-order'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function CustomerPage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>Loading...</div>}>
      <CustomerPageInner />
    </Suspense>
  )
}
