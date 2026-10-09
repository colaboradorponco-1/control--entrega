import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const allowedHosts = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
])

const safeMapsUrl = (value) => {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (
    url.protocol !== 'https:'
    || !allowedHosts.has(url.hostname.toLowerCase())
    || url.username
    || url.password
    || url.port
  ) return null

  return url
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return reply({ error: 'Método no permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !authorization) return reply({ error: 'No autorizado' }, 401)

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError || !authData?.user) return reply({ error: 'Sesión no válida' }, 401)

  let body
  try {
    body = await request.json()
  } catch {
    return reply({ error: 'La solicitud no contiene JSON válido' }, 400)
  }

  if (typeof body?.url !== 'string' || body.url.length > 2048) {
    return reply({ error: 'Pega un enlace válido de Google Maps de hasta 2048 caracteres' }, 400)
  }

  let currentUrl = safeMapsUrl(body.url)
  if (!currentUrl) return reply({ error: 'Solo se aceptan enlaces seguros de Google Maps' }, 400)

  try {
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      })
      const location = response.headers.get('location')
      await response.body?.cancel()

      if (response.status >= 300 && response.status < 400 && location) {
        const nextUrl = safeMapsUrl(new URL(location, currentUrl).href)
        if (!nextUrl) return reply({ error: 'El enlace redirige fuera de Google Maps' }, 400)
        currentUrl = nextUrl
        continue
      }

      if (!response.ok) return reply({ error: `Google Maps respondió ${response.status}` }, 502)
      if (currentUrl.hostname === 'maps.app.goo.gl' || currentUrl.hostname === 'goo.gl') {
        return reply({
          error: 'Google no reveló la ubicación. Comparte el enlace completo desde Maps o pega las coordenadas.',
        }, 422)
      }
      return reply({ url: currentUrl.href })
    }

    return reply({ error: 'El enlace tiene demasiadas redirecciones' }, 422)
  } catch {
    return reply({ error: 'No se pudo conectar con Google Maps para resolver el enlace' }, 502)
  }
})
