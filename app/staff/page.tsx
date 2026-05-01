'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Restaurant, Queue, QueueEntry, MenuItem } from '@/lib/types'

interface RestaurantWithQueue extends Restaurant { queue: Queue }

type Tab = 'queue' | 'orders' | 'add-restaurant' | 'add-menu'

export default function StaffPage() {
  const [restaurants, setRestaurants] = useState<RestaurantWithQueue[]>([])
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantWithQueue | null>(null)
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([])
  const [preOrders, setPreOrders] = useState<{ id: string; queue_entry_id: string; items: { name: string; quantity: number; price: number }[]; status: string; created_at: string }[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [tab, setTab] = useState<Tab>('queue')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [restaurantForm, setRestaurantForm] = useState({
    name: '', cuisine: '', address: '', phone: '',
    image_emoji: '🍽️', capacity: '50', avg_meal_duration_mins: '45'
  })
  const [menuForm, setMenuForm] = useState({
    name: '', description: '', price: '', category: 'Main'
  })
  const [waitOverride, setWaitOverride] = useState('')
  const [formMsg, setFormMsg] = useState('')

  const fetchQueueForRestaurant = useCallback(async (restaurantId: string) => {
    const { data } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['waiting', 'called'])
      .order('position')
    if (data) setQueueEntries(data)
  }, [])

  const fetchRestaurants = useCallback(async () => {
    const { data } = await supabase
      .from('restaurants')
      .select('*, queue:queues(*)')
      .eq('is_active', true)
      .order('name')
    if (data) {
      setRestaurants(data as RestaurantWithQueue[])
      if (data.length > 0 && !selectedRestaurant) {
        setSelectedRestaurant(data[0] as RestaurantWithQueue)
        fetchQueueForRestaurant(data[0].id)
      }
    }
    setLoading(false)
  }, [selectedRestaurant, fetchQueueForRestaurant])

  useEffect(() => {
    fetchRestaurants()
    const channel = supabase
      .channel('staff-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, () => {
        if (selectedRestaurant) fetchQueueForRestaurant(selectedRestaurant.id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, fetchRestaurants)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchRestaurants, fetchQueueForRestaurant, selectedRestaurant])

  useEffect(() => {
    if (!selectedRestaurant) return
    fetchQueueForRestaurant(selectedRestaurant.id)

    supabase.from('pre_orders').select('*')
      .eq('restaurant_id', selectedRestaurant.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setPreOrders(data) })

    supabase.from('menu_items').select('*')
      .eq('restaurant_id', selectedRestaurant.id)
      .order('category')
      .then(({ data }) => { if (data) setMenuItems(data) })
  }, [selectedRestaurant, fetchQueueForRestaurant])

  async function updateEntryStatus(entryId: string, status: QueueEntry['status']) {
    setActionLoading(entryId)
    const updateData: Partial<QueueEntry> = { status }
    if (status === 'called') updateData.called_at = new Date().toISOString()
    if (status === 'seated') updateData.seated_at = new Date().toISOString()

    await supabase.from('queue_entries').update(updateData).eq('id', entryId)
    if (selectedRestaurant) fetchQueueForRestaurant(selectedRestaurant.id)
    setActionLoading(null)
  }

  async function updateWaitTime() {
    if (!selectedRestaurant || !waitOverride) return
    await supabase.from('queues')
      .update({ current_wait_mins: parseInt(waitOverride), updated_at: new Date().toISOString() })
      .eq('restaurant_id', selectedRestaurant.id)
    setWaitOverride('')
    fetchRestaurants()
  }

  async function addRestaurant() {
    if (!restaurantForm.name || !restaurantForm.cuisine || !restaurantForm.address) {
      setFormMsg('Name, cuisine, and address are required.'); return
    }
    const { data, error } = await supabase.from('restaurants').insert({
      name: restaurantForm.name, cuisine: restaurantForm.cuisine,
      address: restaurantForm.address, phone: restaurantForm.phone || null,
      image_emoji: restaurantForm.image_emoji,
      capacity: parseInt(restaurantForm.capacity),
      avg_meal_duration_mins: parseInt(restaurantForm.avg_meal_duration_mins)
    }).select().single()

    if (error) { setFormMsg('Error: ' + error.message); return }

    await supabase.from('queues').insert({
      restaurant_id: data.id, current_wait_mins: 0, queue_count: 0, tables_available: 0
    })

    setFormMsg('✅ Restaurant added successfully!')
    setRestaurantForm({ name: '', cuisine: '', address: '', phone: '', image_emoji: '🍽️', capacity: '50', avg_meal_duration_mins: '45' })
    fetchRestaurants()
  }

  async function addMenuItem() {
    if (!selectedRestaurant || !menuForm.name || !menuForm.price) {
      setFormMsg('Name and price are required.'); return
    }
    const { error } = await supabase.from('menu_items').insert({
      restaurant_id: selectedRestaurant.id,
      name: menuForm.name, description: menuForm.description || null,
      price: parseFloat(menuForm.price), category: menuForm.category
    })
    if (error) { setFormMsg('Error: ' + error.message); return }
    setFormMsg('✅ Menu item added!')
    setMenuForm({ name: '', description: '', price: '', category: 'Main' })

    const { data } = await supabase.from('menu_items').select('*')
      .eq('restaurant_id', selectedRestaurant.id).order('category')
    if (data) setMenuItems(data)
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 14, color: 'var(--text)'
  }
  const labelStyle = { fontSize: 12, color: 'var(--text2)', marginBottom: 5, display: 'block' as const, fontWeight: 500 }

  const waitingCount = queueEntries.filter(e => e.status === 'waiting').length
  const calledCount = queueEntries.filter(e => e.status === 'called').length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* NAV */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 32px', borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)'
      }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 800 }}>
        <span style={{ color: 'var(--accent)' }}>YOTERS</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-body)', marginLeft: 8, fontWeight: 400 }}>Staff</span>
        </Link>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · Live
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', marginLeft: 8, verticalAlign: 'middle' }} />
        </div>
      </nav>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* SIDEBAR */}
        <div style={{
          width: 240, borderRight: '1px solid var(--border)',
          padding: '24px 16px', background: 'var(--surface)',
          display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', padding: '0 8px', marginBottom: 8 }}>
            Restaurants
          </div>
          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '0 8px' }}>Loading...</div>
          ) : restaurants.map(r => (
            <button key={r.id} onClick={() => setSelectedRestaurant(r)}
              style={{
                padding: '10px 12px', borderRadius: 10, border: 'none', textAlign: 'left',
                background: selectedRestaurant?.id === r.id ? 'var(--surface3)' : 'transparent',
                color: selectedRestaurant?.id === r.id ? 'var(--text)' : 'var(--text2)',
                cursor: 'pointer', transition: 'all 0.15s',
                borderLeft: selectedRestaurant?.id === r.id ? '2px solid var(--accent)' : '2px solid transparent'
              }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.image_emoji} {r.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {r.queue?.queue_count ?? 0} waiting · {r.queue?.current_wait_mins ?? 0}m
              </div>
            </button>
          ))}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setTab('add-restaurant')} style={{
              width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--border)',
              background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer',
              textAlign: 'left'
            }}>+ Add Restaurant</button>
          </div>
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
          {selectedRestaurant && (
            <>
              {/* Header */}
              <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 26, fontWeight: 800 }}>
                  {selectedRestaurant.image_emoji} {selectedRestaurant.name}
                </h1>
                <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 3 }}>{selectedRestaurant.address}</div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Waiting', val: waitingCount, color: 'var(--yellow)' },
                  { label: 'Called', val: calledCount, color: 'var(--accent)' },
                  { label: 'Wait Time', val: `${selectedRestaurant.queue?.current_wait_mins ?? 0}m`, color: 'var(--text)' },
                  { label: 'Tables Free', val: selectedRestaurant.queue?.tables_available ?? 0, color: 'var(--green)' },
                ].map((s, i) => (
                  <div key={i} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '16px 18px'
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 11, padding: 4, width: 'fit-content', marginBottom: 24 }}>
                {([['queue', 'Queue'], ['orders', 'Pre-orders'], ['add-menu', 'Menu Items']] as [Tab, string][]).map(([t, label]) => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '8px 20px', borderRadius: 8, border: 'none',
                    background: tab === t ? 'var(--accent)' : 'transparent',
                    color: tab === t ? 'white' : 'var(--muted)',
                    fontSize: 14, fontWeight: 500, cursor: 'pointer'
                  }}>{label}</button>
                ))}
              </div>

              {/* QUEUE TAB */}
              {tab === 'queue' && (
                <>
                  {/* Wait override */}
                  <div style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 14, padding: '16px 20px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 12
                  }}>
                    <span style={{ fontSize: 14, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Override wait time:</span>
                    <input
                      type="number" placeholder="mins"
                      value={waitOverride} onChange={e => setWaitOverride(e.target.value)}
                      style={{ ...inputStyle, width: 100, flex: 'none' }}
                    />
                    <button onClick={updateWaitTime} style={{
                      padding: '10px 20px', borderRadius: 9, border: 'none',
                      background: 'var(--accent)', color: 'white', fontSize: 14, fontWeight: 600
                    }}>Update</button>
                    <div style={{
                      marginLeft: 'auto', padding: '8px 16px',
                      background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)',
                      borderRadius: 8, fontSize: 13, color: 'var(--green)'
                    }}>
                      Current: {selectedRestaurant.queue?.current_wait_mins ?? 0} mins
                    </div>
                  </div>

                  {queueEntries.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: 60,
                      background: 'var(--surface)', borderRadius: 16,
                      color: 'var(--muted)', border: '1px solid var(--border)'
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>Queue is empty</div>
                      <div style={{ fontSize: 14, marginTop: 6 }}>No customers waiting right now</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {queueEntries.map(entry => (
                        <div key={entry.id} style={{
                          background: 'var(--surface)', border: `1px solid ${entry.status === 'called' ? 'rgba(46,204,113,0.4)' : 'var(--border)'}`,
                          borderRadius: 14, padding: '16px 20px',
                          display: 'flex', alignItems: 'center', gap: 16
                        }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: 10,
                            background: 'var(--surface2)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontFamily: 'var(--font-head)',
                            fontSize: 18, fontWeight: 800, color: 'var(--accent)', flexShrink: 0
                          }}>#{entry.position}</div>

                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{entry.customer_name}</div>
                            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                              {entry.customer_phone} · 👥 {entry.party_size} people
                              {entry.notes && ` · 📝 ${entry.notes}`}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                              Joined {new Date(entry.joined_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            {entry.status === 'waiting' && (
                              <button
                                onClick={() => updateEntryStatus(entry.id, 'called')}
                                disabled={actionLoading === entry.id}
                                style={{
                                  padding: '8px 16px', borderRadius: 8, border: 'none',
                                  background: 'var(--green)', color: 'white', fontSize: 13, fontWeight: 600,
                                  opacity: actionLoading === entry.id ? 0.5 : 1
                                }}>Call</button>
                            )}
                            {entry.status === 'called' && (
                              <button
                                onClick={() => updateEntryStatus(entry.id, 'seated')}
                                disabled={actionLoading === entry.id}
                                style={{
                                  padding: '8px 16px', borderRadius: 8, border: 'none',
                                  background: 'var(--accent2)', color: 'white', fontSize: 13, fontWeight: 600
                                }}>Seated</button>
                            )}
                            <button
                              onClick={() => updateEntryStatus(entry.id, 'no_show')}
                              disabled={actionLoading === entry.id}
                              style={{
                                padding: '8px 14px', borderRadius: 8,
                                border: '1px solid var(--border)', background: 'var(--surface2)',
                                color: 'var(--muted)', fontSize: 13
                              }}>No-show</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* PRE-ORDERS TAB */}
              {tab === 'orders' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {preOrders.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: 60, background: 'var(--surface)',
                      borderRadius: 16, color: 'var(--muted)', border: '1px solid var(--border)'
                    }}>No pre-orders yet</div>
                  ) : preOrders.map(order => {
                    const statusColor: Record<string, string> = {
                      pending: 'var(--yellow)', confirmed: 'var(--accent)',
                      preparing: 'var(--accent2)', ready: 'var(--green)'
                    }
                    return (
                      <div key={order.id} style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 14, padding: '18px 20px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                            {new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <select
                            value={order.status}
                            onChange={async e => {
                              await supabase.from('pre_orders').update({ status: e.target.value }).eq('id', order.id)
                              setPreOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: e.target.value } : o))
                            }}
                            style={{
                              background: 'var(--surface2)', border: '1px solid var(--border)',
                              borderRadius: 8, padding: '5px 10px', fontSize: 13,
                              color: statusColor[order.status] || 'var(--text)'
                            }}>
                            {['pending', 'confirmed', 'preparing', 'ready'].map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                        {order.items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}>
                            <span>{item.name} × {item.quantity}</span>
                            <span style={{ color: 'var(--accent)' }}>₹{item.price * item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* MENU TAB */}
              {tab === 'add-menu' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, marginBottom: 18 }}>
                      Add Menu Item
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { key: 'name', label: 'Item Name *', placeholder: 'Butter Chicken' },
                        { key: 'description', label: 'Description', placeholder: 'Creamy tomato gravy' },
                        { key: 'price', label: 'Price (₹) *', placeholder: '320', type: 'number' },
                      ].map(f => (
                        <div key={f.key}>
                          <label style={labelStyle}>{f.label}</label>
                          <input
                            type={f.type || 'text'}
                            placeholder={f.placeholder}
                            value={menuForm[f.key as keyof typeof menuForm]}
                            onChange={e => setMenuForm(m => ({ ...m, [f.key]: e.target.value }))}
                            style={inputStyle}
                          />
                        </div>
                      ))}
                      <div>
                        <label style={labelStyle}>Category</label>
                        <select value={menuForm.category} onChange={e => setMenuForm(m => ({ ...m, category: e.target.value }))} style={inputStyle}>
                          {['Starter', 'Main', 'Bread', 'Rice', 'Dessert', 'Drinks', 'Sides'].map(c => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      {formMsg && <div style={{ fontSize: 13, color: formMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{formMsg}</div>}
                      <button onClick={addMenuItem} style={{
                        padding: 13, borderRadius: 10, border: 'none',
                        background: 'var(--accent)', color: 'white', fontSize: 15, fontWeight: 700
                      }}>Add to Menu</button>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, marginBottom: 18 }}>
                      Current Menu ({menuItems.length} items)
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflow: 'auto' }}>
                      {menuItems.length === 0 ? (
                        <div style={{ color: 'var(--muted)', fontSize: 14 }}>No items yet</div>
                      ) : menuItems.map(item => (
                        <div key={item.id} style={{
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: '12px 14px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.category}</div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>₹{item.price}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ADD RESTAURANT TAB */}
          {tab === 'add-restaurant' && (
            <div style={{ maxWidth: 560 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 800, marginBottom: 24 }}>
                Add New Restaurant
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { key: 'name', label: 'Restaurant Name *', placeholder: 'Spice Garden' },
                  { key: 'cuisine', label: 'Cuisine Type *', placeholder: 'Indian, Italian, Chinese...' },
                  { key: 'address', label: 'Address *', placeholder: '12 MG Road, Chennai' },
                  { key: 'phone', label: 'Phone Number', placeholder: '+91 98765 43210' },
                  { key: 'image_emoji', label: 'Emoji', placeholder: '🍽️' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input
                      placeholder={f.placeholder}
                      value={restaurantForm[f.key as keyof typeof restaurantForm]}
                      onChange={e => setRestaurantForm(r => ({ ...r, [f.key]: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Seating Capacity</label>
                    <input type="number" value={restaurantForm.capacity}
                      onChange={e => setRestaurantForm(r => ({ ...r, capacity: e.target.value }))}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Avg Meal Duration (mins)</label>
                    <input type="number" value={restaurantForm.avg_meal_duration_mins}
                      onChange={e => setRestaurantForm(r => ({ ...r, avg_meal_duration_mins: e.target.value }))}
                      style={inputStyle} />
                  </div>
                </div>
                {formMsg && <div style={{ fontSize: 13, color: formMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{formMsg}</div>}
                <button onClick={addRestaurant} style={{
                  padding: 14, borderRadius: 11, border: 'none',
                  background: 'var(--accent)', color: 'white', fontSize: 16, fontWeight: 700
                }}>Add Restaurant</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
