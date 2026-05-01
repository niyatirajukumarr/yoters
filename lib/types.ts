export interface Restaurant {
  id: string
  name: string
  cuisine: string
  address: string
  phone?: string
  image_emoji: string
  capacity: number
  avg_meal_duration_mins: number
  is_active: boolean
  created_at: string
  queue?: Queue
}

export interface Queue {
  id: string
  restaurant_id: string
  current_wait_mins: number
  queue_count: number
  tables_available: number
  updated_at: string
}

export interface QueueEntry {
  id: string
  restaurant_id: string
  customer_name: string
  customer_phone: string
  party_size: number
  position: number
  status: 'waiting' | 'called' | 'seated' | 'no_show' | 'cancelled'
  notes?: string
  joined_at: string
  called_at?: string
  seated_at?: string
  restaurant?: Restaurant
}

export interface MenuItem {
  id: string
  restaurant_id: string
  name: string
  description?: string
  price: number
  category: string
  is_available: boolean
}

export interface PreOrder {
  id: string
  queue_entry_id: string
  restaurant_id: string
  items: OrderItem[]
  special_requests?: string
  status: 'pending' | 'confirmed' | 'preparing' | 'ready'
  created_at: string
}

export interface OrderItem {
  menu_item_id: string
  name: string
  price: number
  quantity: number
}

export type WaitLevel = 'low' | 'mid' | 'high'

export function getWaitLevel(mins: number): WaitLevel {
  if (mins <= 15) return 'low'
  if (mins <= 35) return 'mid'
  return 'high'
}

export function formatWait(mins: number): string {
  if (mins === 0) return 'No wait'
  if (mins < 60) return `~${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}
