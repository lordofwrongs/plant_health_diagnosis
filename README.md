# PlantCare — Plant Health Diagnosis App

A mobile-friendly web app that lets users photograph their plants and receive AI-powered health diagnoses.

## Stack
- React + Vite (frontend)
- Supabase (storage + database)
- n8n (automation: Vision API + OpenRouter)
- Vercel (hosting)

## Setup

### 1. Add your Supabase credentials
Create a file called `.env` in the root folder (copy from `.env.example`):
```
VITE_SUPABASE_URL=https://thgdxffelonamukytosq.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```
Get your anon key from: Supabase Dashboard → Settings → API → Project API keys → `anon public`

### 2. Supabase table expected schema (plant_logs)
| Column | Type |
|---|---|
| id | uuid (primary key) |
| user_id | text |
| image_url | text |
| status | text |
| plant_name | text |
| health | text |
| issues | text |
| recommendations | text |
| created_at | timestamp |

### 3. n8n workflow should:
1. Trigger on new row in `plant_logs` where `status = 'pending'`
2. Fetch image from `image_url`
3. Send to Google Vision API
4. Send Vision labels + image to OpenRouter for diagnosis
5. Update the `plant_logs` row with:
   - `plant_name` = identified plant
   - `health` = health status
   - `issues` = list of issues (text or JSON array)
   - `recommendations` = remedies (text or JSON array)
   - `status` = 'done'

## Deploying to Vercel (no terminal needed)

1. Upload this folder to GitHub (create a free account at github.com)
2. Go to vercel.com → sign up with GitHub
3. Click "Add New Project" → import your GitHub repo
4. Under "Environment Variables" add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click Deploy — Vercel gives you a live URL instantly
