create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('build', 'design', 'etc')),
  type text,
  date text not null,
  title text not null,
  content text,
  image_url text,
  summary text,
  problem text,
  evidence text,
  hypothesis text,
  solution text,
  result text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts add column if not exists content text;
alter table public.posts add column if not exists image_url text;

alter table public.posts enable row level security;

drop policy if exists "Published posts are readable by everyone." on public.posts;
create policy "Published posts are readable by everyone."
on public.posts
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Authenticated users can create own posts." on public.posts;
drop policy if exists "Only site admin can create posts." on public.posts;
create policy "Only site admin can create posts."
on public.posts
for insert
to authenticated
with check (
  lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
  and (select auth.uid()) = author_id
);

drop policy if exists "Authors can update own posts." on public.posts;
drop policy if exists "Only site admin can update posts." on public.posts;
create policy "Only site admin can update posts."
on public.posts
for update
to authenticated
using (
  lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
  and (select auth.uid()) = author_id
)
with check (
  lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
  and (select auth.uid()) = author_id
);

drop policy if exists "Authors can delete own posts." on public.posts;
drop policy if exists "Only site admin can delete posts." on public.posts;
create policy "Only site admin can delete posts."
on public.posts
for delete
to authenticated
using (
  lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
  and (select auth.uid()) = author_id
);

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Post images are readable by everyone." on storage.objects;
create policy "Post images are readable by everyone."
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'post-images');

drop policy if exists "Only site admin can upload post images." on storage.objects;
create policy "Only site admin can upload post images."
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-images'
  and lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
);

drop policy if exists "Only site admin can update post images." on storage.objects;
create policy "Only site admin can update post images."
on storage.objects
for update
to authenticated
using (
  bucket_id = 'post-images'
  and lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
)
with check (
  bucket_id = 'post-images'
  and lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
);

drop policy if exists "Only site admin can delete post images." on storage.objects;
create policy "Only site admin can delete post images."
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-images'
  and lower((select auth.jwt() ->> 'email')) = 'zlchlrh@gmail.com'
);
