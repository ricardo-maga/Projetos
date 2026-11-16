import { expect,it } from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReferenceDataSection from '../domains/administration/ui/ReferenceDataSection';
import UserSection from '../domains/administration/ui/UserSection';
const props:any={active:true,state:{riskCategories:[],riskStatuses:[],riskPriorities:[]},projectCategories:[{id:'category',name:'Categoria de teste',deleted:false}],projectStatuses:[],taskStatuses:[],taskTypes:[],projectRisks:[],projectPriorities:[],projectTeams:[],projectPartners:[],askConfirmation:()=>{}};
it('shows auxiliary data without mutation or ordering controls to a reader',()=>{const html=renderToStaticMarkup(<ReferenceDataSection {...props} canWriteConfig={false}/>);expect(html).toContain('Categoria de teste');expect(html).not.toContain('Adicionar opção');expect(html).not.toContain('title="Editar"');expect(html).not.toContain('title="Eliminar"');expect(html).not.toContain('Reordenar Categoria');expect(html).not.toContain('<form');});
it('keeps labelled creation, editing and ordering controls for a writer',()=>{const html=renderToStaticMarkup(<ReferenceDataSection {...props} canWriteConfig/>);expect(html).toContain('Adicionar opção');expect(html).toContain('aria-label="Nome da opção"');expect(html).toContain('title="Editar"');expect(html).toContain('title="Eliminar"');expect(html).toContain('Reordenar Categoria de teste');});

it('keeps the user directory readable without showing mutation controls to a reader', () => {
  const html = renderToStaticMarkup(<UserSection
    users={[{ id: 'qa-user', name: 'Recurso fictício', email: 'qa@example.invalid', approved: true, deleted: false }]}
    userGroups={[]}
    currentUser={{ roleIds: ['reader'], permissions: ['users.read'] }}
    addUser={() => null}
    updateUser={() => false}
    deleteUser={async () => ({ success: false })}
  />);
  expect(html).toContain('Recurso fictício');
  expect(html).not.toContain('Novo utilizador');
  expect(html).not.toContain('> Editar');
  expect(html).not.toContain('Apagar');
});
