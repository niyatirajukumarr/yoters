'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUserInfo } from '@/lib/hooks/useUserInfo'
import { Clock, CheckCircle, ChefHat, Loader, ChevronDown, ChevronUp } from 'lucide-react'
import { OrderTrackingRoadmap } from '@/components/OrderTrackingRoadmap'
import { PrepTimeCountdown } from '@/components/PrepTimeCountdown'
import { Order } from '@/lib/types'

interface CafeteriaInfo {
  id: string
  name: string
  image_emoji: string
}

export default function MobileOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [cafeterias, setCafeterias] = useState<Record<string, CafeteriaInfo>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'past'>('active')
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { user } = useUserInfo()

  // Fetch cafeterias for mapping
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('cafeterias').select('id, name, image_emoji')
      if (data) {
        const map = Object.fromEntries(data.map(c => [c.id, c]))
        setCafeterias(map)
      }
    }
    fetch()
  }, [])

  // Fetch user orders
  useEffect(() => {
    const fetch = async () => {
      if (!user?.phone) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('student_phone', user.phone)
        .order('created_at', { ascending: false })

      if (data) setOrders(data as Order[])
      setLoading(false)
    }

    fetch()

    // Real-time subscription
    const ch = supabase.channel('mobile-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetch()
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [user?.phone])

  const activeOrders = orders.filter(o => !['collected', 'cancelled'].includes(o.status))
  const pastOrders = orders.filter(o => ['collected', 'cancelled'].includes(o.status))

  const displayOrders = tab === 'active' ? activeOrders : pastOrders
  const statuses = {
    pending: { icon: Clock, color: '#d4821a', label: 'Pending' },
    paid: { icon: Loader, color: '#2563eb', label: 'Paid' },
    preparing: { icon: ChefHat, color: '#E8334A', label: 'Preparing' },
    ready: { icon: CheckCircle, color: '#2e9e6b', label: 'Ready!' },
    collected: { icon: CheckCircle, color: '#2e9e6b', label: 'Collected' },
    cancelled: { icon: Clock, color: '#8a90a8', label: 'Cancelled' },
  }

  if (!user?.phone) {
    return (
      <div style={{ padding: 'var(--mobile-spacing)' }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 700, marginBottom: 20 }}>
          Orders
        </div>
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          <div style={{ marginBottom: 12 }}>Please enter your phone number in Profile first</div>
          <a href="/mobile/profile" style={{ color: 'var(--accent)', textDecoration: 'underline', fontSize: 14 }}>
            Go to Profile
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 'var(--mobile-spacing)' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          My Orders
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['active', 'past'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={t === tab ? 'mobile-btn-primary' : 'mobile-btn-secondary'}
            style={{
              flex: 1,
              padding: '10px 0',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 'var(--mobile-radius)',
              border: 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t === 'active' ? `Active (${activeOrders.length})` : `Past (${pastOrders.length})`}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          Loading orders...
        </div>
      ) : displayOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          No {tab} orders yet
        </div>
      ) : (
        <div>
          {displayOrders.map((order, idx) => {
            const cafe = cafeterias[order.cafeteria_id]
            const statusInfo = statuses[order.status as keyof typeof statuses]
            const StatusIcon = statusInfo?.icon
            const isExpanded = expandedOrderId === order.id

            return (
              <div key={order.id} style={{ marginBottom: 12 }}>
                {/* Order Card */}
                <div
                  className="mobile-card mobile-list-item"
                  style={{ padding: 'var(--mobile-spacing)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 32 }}>
                      {cafe?.image_emoji || '🍱'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-head)', fontSize: 15, fontWeight: 700, marginBottom: 3 }}>
                        {cafe?.name || 'Cafeteria'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>
                        #{order.id.slice(0, 8)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        🕐 {new Date(order.created_at).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {StatusIcon && <StatusIcon size={18} color={statusInfo.color} />}
                      {isExpanded ? <ChevronUp size={18} color="var(--text2)" /> : <ChevronDown size={18} color="var(--text2)" />}
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(26,31,46,0.08)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: statusInfo?.color }}>
                      {statusInfo?.label}
                    </div>
                    {order.queue_position && order.status === 'pending' && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                        Queue position: #{order.queue_position}
                      </div>
                    )}
                    {order.prep_time_minutes && ['approved', 'preparing'].includes(order.status) && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                        Prep time: ~{order.prep_time_minutes} min
                      </div>
                    )}
                  </div>

                  {/* Items */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </div>
                    {order.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{item.quantity}x {item.name}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div style={{ paddingTop: 12, borderTop: '1px solid rgba(26,31,46,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                      ₹{order.total_amount}
                    </span>
                  </div>
                </div>

                {/* Expanded Roadmap View */}
                {isExpanded && (
                  <div style={{ marginTop: 8, padding: 'var(--mobile-spacing)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--mobile-radius)' }}>
                    {order.prep_time_minutes && ['approved', 'preparing'].includes(order.status) && (
                      <PrepTimeCountdown order={order} />
                    )}
                    <OrderTrackingRoadmap order={order} cafeteriaName={cafe?.name} />

                    <div style={{ marginTop: 16, display: 'flex', gap: 8, flexDirection: 'column' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/mobile/track/${order.id}`} style={{ flex: 1 }}>
                          <button style={{ width: '100%', padding: '12px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--mobile-radius)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                            View Full Details
                          </button>
                        </Link>
                        {order.status === 'ready' && (
                          <button
                            style={{ flex: 1, padding: '12px 16px', background: 'var(--green)', color: 'white', border: 'none', borderRadius: 'var(--mobile-radius)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                            onClick={async (e) => {
                              e.stopPropagation()
                              await supabase
                                .from('orders')
                                .update({ status: 'collected', collected_at: new Date().toISOString() })
                                .eq('id', order.id)
                              setExpandedOrderId(null)
                            }}
                          >
                            I've Picked Up
                          </button>
                        )}
                      </div>
                      {(order.status === 'cancelled' || order.status === 'collected') && (
                        <button
                          disabled={deleting === order.id}
                          style={{ width: '100%', padding: '12px 16px', background: deleting === order.id ? '#999999' : '#dc2626', color: 'white', border: 'none', borderRadius: 'var(--mobile-radius)', fontWeight: 600, fontSize: 14, cursor: deleting === order.id ? 'not-allowed' : 'pointer', opacity: deleting === order.id ? 0.6 : 1 }}
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
                              try {
                                setDeleting(order.id)
                                const { error } = await supabase
                                  .from('orders')
                                  .delete()
                                  .eq('id', order.id)

                                if (error) {
                                  console.error('Delete error:', error)
                                  alert('Failed to delete order: ' + error.message)
                                  setDeleting(null)
                                } else {
                                  // Remove from local state
                                  setOrders(orders.filter(o => o.id !== order.id))
                                  setExpandedOrderId(null)
                                  setDeleting(null)
                                }
                              } catch (err: any) {
                                console.error('Delete exception:', err)
                                alert('Error deleting order: ' + err.message)
                                setDeleting(null)
                              }
                            }
                          }}
                        >
                          {deleting === order.id ? '⏳ Deleting...' : '🗑️ Delete Order'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
