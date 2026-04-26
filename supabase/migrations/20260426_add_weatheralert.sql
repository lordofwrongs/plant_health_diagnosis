-- Add missing WeatherAlert column to plant_logs
-- Run this in Supabase Dashboard → SQL Editor
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS "WeatherAlert" TEXT;
