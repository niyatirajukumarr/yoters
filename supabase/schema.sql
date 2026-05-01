-- ============================================
-- QueueEat Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- RESTAURANTS
create table if not exists restaurants (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  cuisine text not null,
  address text not null,
  phone text,
  image_emoji text default '🍽️',
  capacity integer default 50,
  avg_meal_duration_mins integer default 45,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- QUEUES (one per restaurant, live state)
create table if not exists queues (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade unique,
  current_wait_mins integer default 0,
  queue_count integer default 0,
  tables_available integer default 0,
  updated_at timestamptz default now()
);

-- QUEUE ENTRIES (each customer joining a queue)
create table if not exists queue_entries (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  party_size integer not null default 1,
  position integer not null,
  status text not null default 'waiting' check (status in ('waiting','called','seated','no_show','cancelled')),
  notes text,
  joined_at timestamptz default now(),
  called_at timestamptz,
  seated_at timestamptz
);

-- PRE-ORDERS
create table if not exists pre_orders (
  id uuid default gen_random_uuid() primary key,
  queue_entry_id uuid references queue_entries(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade,
  items jsonb not null default '[]',
  special_requests text,
  status text not null default 'pending' check (status in ('pending','confirmed','preparing','ready')),
  created_at timestamptz default now()
);

-- MENU ITEMS
create table if not exists menu_items (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null,
  category text not null,
  is_available boolean default true,
  created_at timestamptz default now()
);

-- INDEXES for performance (handles 50k+ rows)
create index if not exists idx_queue_entries_restaurant on queue_entries(restaurant_id);
create index if not exists idx_queue_entries_status on queue_entries(status);
create index if not exists idx_queue_entries_restaurant_status on queue_entries(restaurant_id, status);
create index if not exists idx_pre_orders_entry on pre_orders(queue_entry_id);
create index if not exists idx_menu_items_restaurant on menu_items(restaurant_id);
create index if not exists idx_queues_restaurant on queues(restaurant_id);

-- ENABLE REALTIME
alter publication supabase_realtime add table queues;
alter publication supabase_realtime add table queue_entries;

-- RLS POLICIES
alter table restaurants enable row level security;
alter table queues enable row level security;
alter table queue_entries enable row level security;
alter table pre_orders enable row level security;
alter table menu_items enable row level security;

-- Public read for restaurants, queues, menu
create policy "Public read restaurants" on restaurants for select using (true);
create policy "Public read queues" on queues for select using (true);
create policy "Public read menu" on menu_items for select using (true);

-- Customers can insert queue entries
create policy "Customers can join queue" on queue_entries for insert with check (true);
create policy "Public read queue entries" on queue_entries for select using (true);
create policy "Update queue entries" on queue_entries for update using (true);

-- Pre-orders
create policy "Insert pre-orders" on pre_orders for insert with check (true);
create policy "Read pre-orders" on pre_orders for select using (true);
create policy "Update pre-orders" on pre_orders for update using (true);

-- Staff can do everything on restaurants/queues
create policy "Staff manage restaurants" on restaurants for all using (true);
create policy "Staff manage queues" on queues for all using (true);
create policy "Staff manage menu" on menu_items for all using (true);

-- ============================================
-- SEED DATA — 8 Restaurants
-- ============================================

insert into restaurants (id, name, cuisine, address, phone, image_emoji, capacity, avg_meal_duration_mins) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Spice Garden', 'Indian', '12 MG Road, Chennai', '+91 98765 43210', '🍛', 60, 40),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'The Pasta House', 'Italian', '34 Anna Salai, Chennai', '+91 98765 43211', '🍝', 45, 50),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'Dragon Wok', 'Chinese', '56 T Nagar, Chennai', '+91 98765 43212', '🥟', 55, 35),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'Burger Republic', 'American', '78 Nungambakkam, Chennai', '+91 98765 43213', '🍔', 40, 25),
  ('a1b2c3d4-0005-0005-0005-000000000005', 'Sushi Zen', 'Japanese', '90 Adyar, Chennai', '+91 98765 43214', '🍱', 35, 55),
  ('a1b2c3d4-0006-0006-0006-000000000006', 'Chettinad House', 'Chettinad', '23 Mylapore, Chennai', '+91 98765 43215', '🍲', 70, 45),
  ('a1b2c3d4-0007-0007-0007-000000000007', 'Pizza Centrale', 'Italian', '45 Velachery, Chennai', '+91 98765 43216', '🍕', 50, 40),
  ('a1b2c3d4-0008-0008-0008-000000000008', 'The Biryani Co.', 'Mughlai', '67 Tambaram, Chennai', '+91 98765 43217', '🫕', 65, 35)
on conflict do nothing;

insert into queues (restaurant_id, current_wait_mins, queue_count, tables_available) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 35, 8, 0),
  ('a1b2c3d4-0002-0002-0002-000000000002', 15, 3, 2),
  ('a1b2c3d4-0003-0003-0003-000000000003', 50, 12, 0),
  ('a1b2c3d4-0004-0004-0004-000000000004', 5, 1, 4),
  ('a1b2c3d4-0005-0005-0005-000000000005', 25, 5, 1),
  ('a1b2c3d4-0006-0006-0006-000000000006', 45, 10, 0),
  ('a1b2c3d4-0007-0007-0007-000000000007', 20, 4, 2),
  ('a1b2c3d4-0008-0008-0008-000000000008', 60, 15, 0)
on conflict do nothing;

insert into menu_items (restaurant_id, name, description, price, category) values
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Butter Chicken', 'Creamy tomato gravy', 320, 'Main'),
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Garlic Naan', 'Tandoor baked', 60, 'Bread'),
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Dal Makhani', 'Slow cooked black lentils', 220, 'Main'),
  ('a1b2c3d4-0001-0001-0001-000000000001', 'Paneer Tikka', 'Grilled cottage cheese', 280, 'Starter'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Spaghetti Carbonara', 'Egg, pancetta, pecorino', 450, 'Main'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Margherita Pizza', 'San Marzano tomato, mozzarella', 380, 'Main'),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'Tiramisu', 'Classic Italian dessert', 220, 'Dessert'),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'Dim Sum Basket', '6 piece steamed', 240, 'Starter'),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'Kung Pao Chicken', 'Spicy Sichuan style', 340, 'Main'),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'Classic Smash Burger', 'Double patty, American cheese', 350, 'Main'),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'Loaded Fries', 'Cheese, jalapeño, sour cream', 180, 'Sides'),
  ('a1b2c3d4-0008-0008-0008-000000000008', 'Hyderabadi Biryani', 'Dum cooked, raita', 380, 'Main'),
  ('a1b2c3d4-0008-0008-0008-000000000008', 'Mutton Korma', 'Rich Mughal gravy', 420, 'Main')
on conflict do nothing;

-- FUNCTION to recalculate wait time when queue changes
create or replace function update_queue_stats()
returns trigger as $$
declare
  waiting_count integer;
  avg_duration integer;
  wait_time integer;
begin
  select count(*) into waiting_count
  from queue_entries
  where restaurant_id = coalesce(new.restaurant_id, old.restaurant_id)
    and status = 'waiting';

  select avg_meal_duration_mins into avg_duration
  from restaurants
  where id = coalesce(new.restaurant_id, old.restaurant_id);

  wait_time := greatest(0, (waiting_count * (avg_duration / 4)));

  update queues
  set queue_count = waiting_count,
      current_wait_mins = wait_time,
      updated_at = now()
  where restaurant_id = coalesce(new.restaurant_id, old.restaurant_id);

  return new;
end;
$$ language plpgsql;

create or replace trigger queue_entry_changed
after insert or update or delete on queue_entries
for each row execute function update_queue_stats();
