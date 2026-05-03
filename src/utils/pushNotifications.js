import { supabase } from '../supabaseClient.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getCurrentSubscription() {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(userId) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permission denied')

  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const json = subscription.toJSON()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
      timezone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )

  return subscription
}

export async function unsubscribeFromPush(userId) {
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  if (!subscription) return
  const { endpoint } = subscription
  await subscription.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
}

export async function isMutedForPlant(userId, plantName) {
  const { data } = await supabase
    .from('push_mutes')
    .select('id')
    .eq('user_id', userId)
    .eq('plant_name', plantName)
    .maybeSingle()
  return !!data
}

export async function muteForPlant(userId, plantName) {
  await supabase
    .from('push_mutes')
    .upsert({ user_id: userId, plant_name: plantName }, { onConflict: 'user_id,plant_name' })
}

export async function unmuteForPlant(userId, plantName) {
  await supabase.from('push_mutes').delete().eq('user_id', userId).eq('plant_name', plantName)
}
