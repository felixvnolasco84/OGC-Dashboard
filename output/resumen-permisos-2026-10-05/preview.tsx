import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router';
import AutorizacionesObraPage from '../../src/pages/AutorizacionesObra/AutorizacionesObraPage';
import ProyectoProveedoresTablePage from '../../src/pages/ProyectoProveedoresTable/ProyectoProveedoresTablePage';
import IngresosModal from '../../src/components/modals/ingresos-modal';
import { useIngresosModal } from '../../src/hooks/ingresos-modal';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'obra';
const role = params.get('role') || 'admin';
if (view === 'ingresos') useIngresosModal.getState().onOpen({ projectId: 'project' as never, projectName: 'Proyecto de ejemplo' });
function Preview() {
  return <MemoryRouter initialEntries={['/project/project']}><div style={{minHeight:'100vh',background:'white'}}>
    <header style={{padding:'16px 48px',borderBottom:'1px solid #ddd',display:'flex',justifyContent:'space-between',fontFamily:'Arial',fontSize:14}}><strong>OGC · Verificación de permisos</strong><span>Rol: {role} · Datos de ejemplo</span></header>
    <Routes><Route path="/project/:proyectoId" element={view === 'ingresos' ? <IngresosModal/> : view === 'proveedores' ? <ProyectoProveedoresTablePage/> : <AutorizacionesObraPage/>}/></Routes>
    <aside style={{position:'fixed',bottom:0,left:0,right:0,padding:'8px 24px',background:'#111',color:'white',zIndex:1000,fontFamily:'Arial',fontSize:12,textAlign:'center'}}>Vista local de prueba · Componentes actuales · Rol {role} · Datos ficticios · Sin conexión ni cambios en producción</aside>
  </div></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
