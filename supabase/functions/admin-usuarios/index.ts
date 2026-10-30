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

// Cuenta cuantos pedidos creo y cuantos despachos recibio el
// usuario. Esos dos son los que tienen ON DELETE RESTRICT contra
// auth.users, o sea los que impiden borrarlo.
const contarHistorial = async (admin, usuarioId) => {
  const [pedidos, despachos] = await Promise.all([
    admin
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('creado_por', usuarioId),
    admin
      .from('despacho_pollo')
      .select('id', { count: 'exact', head: true })
      .eq('recibido_por', usuarioId),
  ])

  const nPedidos = pedidos.count || 0
  const nDespachos = despachos.count || 0

  const partes = []
  if (nPedidos) partes.push(nPedidos + (nPedidos === 1 ? ' pedido' : ' pedidos'))
  if (nDespachos) partes.push(nDespachos + (nDespachos === 1 ? ' despacho' : ' despachos'))

  return {
    tiene: partes.length > 0,
    detalle: partes.join(' y ') || '',
  }
}

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

    if (!perfil || !perfil.roles || !['administrador', 'superadmin'].includes(perfil.roles.nombre)) {
      return reply({ error: 'Solo un administrador puede gestionar usuarios' }, 403)
    }

    const admin = createClient(url, serviceKey)
    const body = await req.json()
    const esSuperadmin = perfil.roles.nombre === 'superadmin'
    const accionesSobreUsuario = ['actualizar_correo', 'eliminar', 'desactivar', 'reactivar', 'resetear']

    if (
      !esSuperadmin &&
      accionesSobreUsuario.includes(body.accion) &&
      body.id &&
      body.id !== authData.user.id
    ) {
      const { data: usuarioObjetivo, error: errorObjetivo } = await admin
        .from('perfiles_usuario')
        .select('roles!inner(nombre)')
        .eq('usuario_id', body.id)
        .maybeSingle()

      if (errorObjetivo) {
        return reply({ error: 'No se pudo verificar el rol del usuario: ' + errorObjetivo.message }, 400)
      }
      if (['administrador', 'superadmin'].includes(usuarioObjetivo?.roles?.nombre)) {
        return reply({ error: 'Solo el Superadmin puede gestionar cuentas de administrador' }, 403)
      }
    }

    if (body.accion === 'listar_correos') {
      const usuarios = []
      let pagina = 1
      const porPagina = 1000

      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({
          page: pagina,
          perPage: porPagina,
        })
        if (error) return reply({ error: 'No se pudieron consultar los correos: ' + error.message }, 400)

        const encontrados = data.users || []
        usuarios.push(...encontrados.map((user) => ({ id: user.id, email: user.email || '' })))
        if (encontrados.length < porPagina) break
        pagina += 1
      }

      return reply({ usuarios })
    }

    if (body.accion === 'actualizar_correo') {
      if (!body.id || !body.email) {
        return reply({ error: 'El correo electrónico es obligatorio' }, 400)
      }

      const email = String(body.email).trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply({ error: 'Escribe un correo electrónico válido' }, 400)
      }

      const { data, error } = await admin.auth.admin.updateUserById(body.id, {
        email,
      })
      if (error) return reply({ error: 'No se pudo actualizar el correo: ' + error.message }, 400)

      return reply({
        ok: true,
        email: data.user?.email || email,
        mensaje: 'Supabase puede pedir confirmar el cambio desde el correo nuevo.',
      })
    }

    if (body.accion === 'crear') {
      if (!body.email || !body.password || !body.nombre_completo) {
        return reply({ error: 'Correo, contrasena y nombre son obligatorios' }, 400)
      }
      if (body.password.length < 6) {
        return reply({ error: 'La contrasena debe tener al menos 6 caracteres' }, 400)
      }
      if (body.rol_id) {
        const { data: rol, error: errorRol } = await admin
          .from('roles')
          .select('nombre')
          .eq('id', body.rol_id)
          .maybeSingle()

        if (errorRol) return reply({ error: 'No se pudo verificar el rol: ' + errorRol.message }, 400)
        if (!rol) return reply({ error: 'El rol seleccionado no existe' }, 400)
        if (!esSuperadmin && ['administrador', 'superadmin'].includes(rol.nombre)) {
          return reply({ error: 'Solo el Superadmin puede crear cuentas de administrador' }, 403)
        }
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
      const { data: perfilGuardado, error: errPerfil } = await admin
        .from('perfiles_usuario')
        .upsert(
          {
            usuario_id: creado.user.id,
            nombre_completo: body.nombre_completo,
            rol_id: body.rol_id || null,
            sucursal_id: body.sucursal_id || null,
            // Si el rol es dueno, se guarda en el mismo upsert para
            // no necesitar un segundo update desde el navegador.
            dueno_id: body.dueno_id || null,
          },
          { onConflict: 'usuario_id' }
        )
        .select('id')
        .single()

      if (errPerfil) {
        await admin.auth.admin.deleteUser(creado.user.id)
        return reply({ error: 'Error al crear el perfil: ' + errPerfil.message }, 400)
      }

      return reply({
        ok: true,
        // id de auth, por compatibilidad
        id: creado.user.id,
        // id del perfil en perfiles_usuario, que es lo que necesita
        // el frontend para editar o vincular despues
        perfil_id: perfilGuardado?.id ?? null,
      })
    }

    if (body.accion === 'eliminar') {
      if (!body.id) return reply({ error: 'Falta el id del usuario' }, 400)
      if (body.id === authData.user.id) {
        return reply({ error: 'No puedes eliminar tu propia cuenta' }, 400)
      }

      // Un usuario con pedidos o despachos registrados NO se puede
      // borrar. Las columnas pedidos.creado_por y
      // despacho_pollo.recibido_por están con ON DELETE RESTRICT
      // contra auth.users, y eso bloquea el borrado a proposito:
      // en un sistema auditable no se puede perder de quien es
      // cada operacion.
      //
      // Antes de intentar nada, se pregunta si tiene historial.
      // Si tiene, se avisa con un mensaje claro en vez de dejar
      // que Supabase tire "Database error deleting user".
      const historial = await contarHistorial(admin, body.id)

      if (historial.tiene) {
        return reply(
          {
            error:
              'Este usuario tiene operaciones registradas (' +
              historial.detalle +
              ') y no se puede borrar, porque se perdería quién las hizo. ' +
              'Desactivalo en su lugar: deja de poder entrar, pero sus ' +
              'pedidos, despachos y firmas quedan intactos.',
            tiene_historial: true,
            detalle: historial.detalle,
          },
          400
        )
      }

      // Si no tiene historial, el perfil se puede borrar. Antes este
      // error se ignoraba, y si fallaba dejaba el perfil colgado
      // sin avisar nada.
      const { error: errPerfil } = await admin
        .from('perfiles_usuario')
        .delete()
        .eq('usuario_id', body.id)

      if (errPerfil) {
        return reply(
          { error: 'No se pudo borrar el perfil: ' + errPerfil.message },
          400
        )
      }

      const { error: errDel } = await admin.auth.admin.deleteUser(body.id)
      if (errDel) {
        return reply(
          {
            error:
              'No se pudo eliminar la cuenta: ' +
              errDel.message +
              ' Si sigue apareciendo este error, revisá si el usuario ' +
              'tiene pedidos o despachos registrados y usá la opción ' +
              'de desactivar.',
            tiene_historial: true,
          },
          400
        )
      }

      return reply({ ok: true })
    }

    if (body.accion === 'desactivar' || body.accion === 'reactivar') {
      if (!body.id) return reply({ error: 'Falta el id del usuario' }, 400)
      if (body.id === authData.user.id && body.accion === 'desactivar') {
        return reply({ error: 'No podés desactivar tu propia cuenta' }, 400)
      }

      const nuevoValor = body.accion === 'reactivar'

      // .eq('usuario_id', ...) y no .eq('id', ...): el frontend
      // manda el id de auth, que es lo que vive en usuario_id.
      const { error: errUp } = await admin
        .from('perfiles_usuario')
        .update({ activo: nuevoValor })
        .eq('usuario_id', body.id)

      if (errUp) {
        // Lo mas probable es que la columna activo todavia no
        // exista en la base. El mensaje lo dice, porque es la
        // causa numero uno y no se entiende sola.
        const faltaColumna =
          errUp.code === '42703' ||
          errUp.message.includes('activo')

        return reply(
          {
            error: faltaColumna
              ? 'La columna "activo" todavía no existe en la base. ' +
                'Corré el archivo supabase/USUARIOS_ACTIVO.sql en Supabase.'
              : 'No se pudo cambiar el estado del usuario: ' + errUp.message,
          },
          400
        )
      }

      return reply({ ok: true, activo: nuevoValor })
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
