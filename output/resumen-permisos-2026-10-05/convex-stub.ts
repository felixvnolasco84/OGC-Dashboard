import { getFunctionName } from 'convex/server';
const role = new URLSearchParams(location.search).get('role') || 'admin';
const user = {_id:'current',name:'Administración de ejemplo',email:'demo@example.test',role};
const responsable = {_id:'current',name:'Administración de ejemplo',email:'demo@example.test'};
const sections = ['licencia','poliza','plan_seguridad','tramites','contratos_subcontratistas'].map(seccion=>({_id:seccion,proyecto:'project',seccion,responsable_id:'current',responsable,status_manual:'activo',numero_licencia:'LIC-EJEMPLO',fecha_emision:'01/10/2026',fecha_vencimiento:'01/10/2027'}));
const subs = [{_id:'sub',proyecto:'project',nombre:'Subcontratista de ejemplo',contratista_general_id:'cg',partida_nombre:'Obra civil',monto:50000,status_manual:'activo',siroc_numero:'SIROC-EJEMPLO'}];
const cgs = [{_id:'cg',proyecto:'project',nombre:'Contratista general de ejemplo',responsable_id:'current',responsable,status_manual:'activo',siroc_numero:'SIROC-EJEMPLO'}];
const empty: unknown[]=[];
const responses: Record<string,unknown> = {
 'users:getCurrentUser':user,
 'desarrollos:getById':{_id:'project',nombre:'Proyecto de ejemplo'},
 'autorizaciones_obra:getByProyecto':sections,
 'autorizaciones_obra:getTramitesByProyecto':[{_id:'tramite',autorizacion_id:'tramites',servicio:'Servicio de ejemplo',tramite:'Registro inicial',estado:'En proceso'}],
 'autorizaciones_obra:getAllUsers':[user],
 'autorizaciones_obra:getHistorial':empty,
 'subcontratistas:getByProyecto':subs,
 'subcontratistas:getContratistasGeneralesByProyecto':cgs,
 'subcontratistas:getHistorial':empty,
 'imss_siroc:getConfigByProyecto':{_id:'imss',proyecto:'project',costo_total_imss:10000},
 'imss_siroc:getPagosCuotaByProyecto':empty,
 'imss_siroc:getHistorial':empty,
 'partida:getByNivel':[{_id:'partida',nombre:'Obra civil',nivel:1}],
 'ingresos:getByProyecto':[{_id:'income',proyecto_id:'project',fecha:'05/10/2026',monto:25000,moneda:'MXN',descripcion:'Aportación de ejemplo',added_by_name:'Administración de ejemplo'}],
 'ogc_movimientos:getIncomeByProyecto':empty,
 'ingresos:getTotalsByProyecto':{total_ingresos:25000,total_count:1},
 'ogc_movimientos:getIncomeTotalsByProyecto':{total_ingresos:0,total_count:0},
 'ingresos_documentos:getByProyecto':empty,
 'ingresos_documentos:getByIngreso':empty,
 'proveedores:getByProyectoWithStats':[{_id:'provider',razon_social:'Proveedor de ejemplo',rfc:'RFC DE EJEMPLO',direccion:'Dirección de ejemplo',nombre_contacto:'Contacto de ejemplo',telefono_contacto:'—',cuenta:'—',clabe:'—',banco:'—',transaccionesCount:2,totalAmount:18000}],
};
export function useQuery(reference: Parameters<typeof getFunctionName>[0],args?:unknown) {
 if(args==='skip') return undefined;
 const name=getFunctionName(reference);
 if(!(name in responses)) throw new Error(`Consulta sin simular: ${name}`);
 return responses[name];
}
export function useMutation(){return async()=>{throw new Error('Vista de capturas: las escrituras están deshabilitadas.');};}
export function useAction(){return async()=>{throw new Error('Vista de capturas: las acciones están deshabilitadas.');};}

