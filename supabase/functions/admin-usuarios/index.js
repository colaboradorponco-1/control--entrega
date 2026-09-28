import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const reply = (data, status) =>
  new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return reply({ error: 'No autorizado' }, 401)

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: authData, error: authErr } = await caller.auth.getUser()
    if (authErr || !authData || !authData.user) return reply({ error: 'Sesion no valida' }, 401)

    const { data: perfil } = await caller
      .from('perfiles_usuario')
      .select('id, rol_id, roles ( nombre )')
      .eq('usuario_id', authData.user.id)
      .maybeSingle()

    if (!perfil || !perfil.roles || perfil.roles.nombre !== 'administrador') {
      return reply({ error: 'Solo un administrador puede gestionar usuarios' }, 403)
    }

    const admin = createClient(url, serviceKey)
    const body = await req.json()

    if (body.accion === 'crear') {
      if (!body.email || !body.password || !body.nombre_completo) {
        return reply({ error: 'Correo, contrasena y nombre son obligatorios' }, 400)
      }
      if (body.password.length < 6) {
        return reply({ error: 'La contrasena debe tener al menos 6 caracteres' }, 400)
      }

      const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { nombre_completo: body.nombre_completo },
      })
      if (errAuth) return reply({ error: errAuth.message }, 400)

      // upsert: el trigger on_auth_user_created puede haber creado
      // ya el perfil. Un insert normal fallaria por llave duplicada.
      const { error: errPerfil } = await admin
        .from('perfiles_usuario')
        .upsert(
          {
            usuario_id: creado.user.id,
            nombre_completo: body.nombre_completo,
            rol_id: body.rol_id || null,
            sucursal_id: body.sucursal_id || null,
          },
          { onConflict: 'usuario_id' }
        )

      if (errPerfil) {
        await admin.auth.admin.deleteUser(creado.user.id)
        return reply({ error: 'Error al crear el perfil: ' + errPerfil.message }, 400)
      }

      return reply({ ok: true, id: creado.user.id })
    }

    if (body.accion === 'eliminar') {
      if (!body.id) return reply({ error: 'Falta el id del usuario' }, 400)
      if (body.id === authData.user.id) {
        return reply({ error: 'No puedes eliminar tu propia cuenta' }, 400)
      }

      await admin.from('perfiles_usuario').delete().eq('usuario_id', body.id)

      const { error: errDel } = await admin.auth.admin.deleteUser(body.id)
      if (errDel) return reply({ error: errDel.message }, 400)

      return reply({ ok: true })
    }

    if (body.accion === 'resetear') {
      if (!body.id || !body.password) return reply({ error: 'Falta id o contrasena' }, 400)
      if (body.password.length < 6) {
        return reply({ error: 'La contrasena debe tener al menos 6 caracteres' }, 400)
      }

      const { error: errUp } = await admin.auth.admin.updateUserById(body.id, {
        password: body.password,
      })
      if (errUp) return reply({ error: errUp.message }, 400)

      return reply({ ok: true })
    }

    return reply({ error: 'Accion no reconocida' }, 400)
  } catch (e) {
    return reply({ error: (e && e.message) || 'Error interno' }, 500)
  }
})
