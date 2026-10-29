
DROP TRIGGER IF EXISTS trg_auditoria_pedidos ON public.pedidos;
CREATE TRIGGER trg_auditoria_pedidos AFTER INSERT OR UPDATE OR DELETE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_sucursales ON public.sucursales;
CREATE TRIGGER trg_auditoria_sucursales AFTER INSERT OR UPDATE OR DELETE ON public.sucursales FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_proveedores ON public.proveedores;
CREATE TRIGGER trg_auditoria_proveedores AFTER INSERT OR UPDATE OR DELETE ON public.proveedores FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_roles ON public.roles;
CREATE TRIGGER trg_auditoria_roles AFTER INSERT OR UPDATE OR DELETE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_recepciones ON public.pedido_recepciones;
CREATE TRIGGER trg_auditoria_recepciones AFTER INSERT OR UPDATE OR DELETE ON public.pedido_recepciones FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();
