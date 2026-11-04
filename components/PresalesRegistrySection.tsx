'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import type {Client,ProjectPriority,User} from '../lib/types';
import type {PresalesRequest} from '../lib/presales';
import {CANONICAL_ROLE_IDS,hasPermission,normalizeRoleId} from '../lib/permissions';
import {getAuthHeaders} from '../lib/clientAuth';
import {M3Button,M3Card,M3SectionHeader} from './M3';
import {Input} from './ui/Input';
import Textarea from './ui/Textarea';

type Form={title:string;clientId:string;description:string;originCode:string;startedOn:string;completedOn:string;
 status:'accepted'|'suspended'|'won'|'lost';priorityId:string;commercialManagerId:string;projectManagerId:string;
 potentialValue:string;saleDate:string;saleValue:string};
const blank:Form={title:'',clientId:'',description:'',originCode:'',startedOn:'',completedOn:'',status:'accepted',
 priorityId:'',commercialManagerId:'',projectManagerId:'',potentialValue:'',saleDate:'',saleValue:''};
const statuses={accepted:'Em curso',suspended:'Suspenso',won:'Ganho',lost:'Perdido'};
const origins=[['email','Email'],['phone','Telefone'],['whatsapp','Whatsapp'],['in_person','Pessoalmente'],['other','Outro']];
type Props={currentUser:User;users:User[];clients:Client[];projectPriorities:ProjectPriority[];initialRequestId?:string|null;onTasksChanged?:()=>Promise<unknown>};
export default function PresalesRegistrySection({currentUser,users,clients,projectPriorities,initialRequestId}:Props) {
 const [rows,setRows]=useState<PresalesRequest[]>([]);
 const [selectedId,setSelectedId]=useState<string|null>(initialRequestId||null);
 const [creating,setCreating]=useState(false); const [form,setForm]=useState<Form>(blank);
 const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 const [page,setPage]=useState(1); const [total,setTotal]=useState(0);
 const key=useRef(crypto.randomUUID()); const flight=useRef(false);
 const selected=rows.find(row=>row.id===selectedId)||null;
 const canCreate=hasPermission(currentUser,'presales_create');
 const canManage=!!selected&&hasPermission(currentUser,'presales_manage')&&
   (selected.ownerId===currentUser.id||hasPermission(currentUser,'presales_coordinate'));
 const activeUsers=[...users].filter(user=>!user.deleted&&user.approved&&user.type!=='External')
   .sort((a,b)=>a.name.localeCompare(b.name,'pt',{sensitivity:'base'}));
 const role=(user:User,id:string)=>(user.roleIds?.length?user.roleIds:[user.roleId]).some(value=>normalizeRoleId(value)===id);
 const managers=activeUsers.filter(user=>role(user,CANONICAL_ROLE_IDS.PROJECT_MANAGER));
 const commercial=activeUsers.filter(user=>role(user,CANONICAL_ROLE_IDS.COMMERCIAL));
 const name=(id:string|null)=>activeUsers.find(user=>user.id===id)?.name||'—';
 const clientName=(id:string|null)=>clients.find(client=>client.id===id)?.clientName||'—';
 const update=<K extends keyof Form>(field:K,value:Form[K])=>setForm(current=>({...current,[field]:value}));
 const load=useCallback(async(targetPage=1)=>{try{const response=await fetch(`/api/v1/presales?page=${targetPage}`,{headers:getAuthHeaders(),cache:'no-store'});
   const result=await response.json();if(!response.ok||!result.success)throw Error(result.message||'Falha ao consultar Presales.');
   setRows(current=>targetPage===1?result.data:[...current,...result.data.filter((row:PresalesRequest)=>!current.some(old=>old.id===row.id))]);
   setPage(targetPage);setTotal(result.total);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'Erro de consulta.');}},[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(initialRequestId)setSelectedId(initialRequestId);},[initialRequestId]);
 useEffect(()=>{if(!selectedId||rows.some(row=>row.id===selectedId))return;
   let cancelled=false;
   void fetch(`/api/v1/presales/${selectedId}`,{headers:getAuthHeaders(),cache:'no-store'})
     .then(response=>response.ok?response.json():null)
     .then(result=>{if(!cancelled&&result?.success)setRows(current=>current.some(row=>row.id===selectedId)?current:[result.data,...current]);})
     .catch(()=>{});
   return()=>{cancelled=true;};
 },[selectedId,rows]);
 useEffect(()=>{if(!selected)return;setForm({title:selected.title,clientId:selected.clientId||'',description:selected.description||selected.requirements,
   originCode:selected.originCode||'',startedOn:selected.startedOn||'',completedOn:selected.completedOn||'',
   status:['accepted','suspended','won','lost'].includes(selected.status)?selected.status as Form['status']:'accepted',
   priorityId:selected.priorityId||'',commercialManagerId:selected.commercialManagerId||'',projectManagerId:selected.projectManagerId||'',
   potentialValue:selected.potentialValue?.toString()||'',saleDate:selected.saleDate||'',saleValue:selected.saleValue?.toString()||''});},[selected]);
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(flight.current)return;flight.current=true;setBusy(true);setError('');setNotice('');
   try{const payload={...form,originCode:form.originCode||null,priorityId:form.priorityId||null,
     commercialManagerId:form.commercialManagerId||null,projectManagerId:form.projectManagerId||null,
     potentialValue:form.potentialValue===''?null:Number(form.potentialValue),saleValue:form.saleValue===''?null:Number(form.saleValue)};
     const response=await fetch(selected?`/api/v1/presales/registry/${selected.id}`:'/api/v1/presales/registry',{
       method:selected?'PATCH':'POST',headers:getAuthHeaders(selected?undefined:{'Idempotency-Key':key.current}),
       body:JSON.stringify(selected?{...payload,version:selected.version}:payload)});
     const result=await response.json();if(!response.ok||!result.success)throw Error(result.message||'Não foi possível guardar.');
     if(!selected){key.current=crypto.randomUUID();setSelectedId(result.data.id);setCreating(false);}await load();setNotice('Processo guardado.');
   }catch(cause){setError(cause instanceof Error?cause.message:'Erro de gravação.');}finally{flight.current=false;setBusy(false);}};
 const field=(label:string,value:keyof Form,type='text')=><Input label={label} type={type} value={form[value]}
   {...(type==='number'?{min:'0',step:'0.01'}:{})}
   onChange={event=>update(value,event.target.value as never)} disabled={!!selected&&!canManage} />;
 return <div className="space-y-5"><M3SectionHeader title="Presales" description="Registo e acompanhamento de oportunidades técnicas."
   actions={canCreate?<M3Button onClick={()=>{setSelectedId(null);setCreating(true);setForm(blank);}}>Novo processo</M3Button>:undefined}/>
   {error&&<p role="alert" className="text-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
   {!selected&&!creating&&<M3Card className="border border-border bg-surface p-5"><h3 className="mb-3 font-bold">Processos Presales ({total})</h3>
     <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Processo</th><th>Cliente</th><th>Pedido</th><th>Estado</th><th>Gestor de projeto</th><th>Valor potencial</th></tr></thead>
     <tbody>{rows.map(row=><tr key={row.id} className="border-t border-border"><td className="p-2">{row.processNumber||'—'}</td>
       <td className="p-2">{clientName(row.clientId)}</td><td className="p-2"><button className="font-semibold text-primary underline" onClick={()=>setSelectedId(row.id)}>{row.title}</button></td>
       <td className="p-2">{statuses[row.status as keyof typeof statuses]||row.status}</td><td className="p-2">{name(row.projectManagerId||row.ownerId)}</td>
       <td className="p-2">{row.potentialValue?.toFixed(2)||'—'}</td></tr>)}</tbody></table></div>
     {rows.length<total&&<M3Button tone="outlined" onClick={()=>void load(page+1)}>Mais processos</M3Button>}</M3Card>}
   {(creating||selected)&&<><M3Button tone="outlined" onClick={()=>{setSelectedId(null);setCreating(false);}}>Voltar à lista</M3Button>
     <M3Card className="border border-border bg-surface p-6"><h3 className="mb-4 text-heading-sm font-bold">{selected?`Processo ${selected.processNumber||''}`:'Novo processo'}</h3>
       <form onSubmit={event=>void save(event)} className="grid gap-4 sm:grid-cols-2">
         {field('Nome do processo','title')}
         <label>Cliente *<select required value={form.clientId} disabled={!!selected&&!canManage} onChange={event=>update('clientId',event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3"><option value="">Selecionar</option>{clients.filter(client=>!client.deleted).sort((a,b)=>a.clientName.localeCompare(b.clientName,'pt')).map(client=><option key={client.id} value={client.id}>{client.clientName}</option>)}</select></label>
         <div className="sm:col-span-2"><Textarea label="Descrição do pedido" value={form.description} disabled={!!selected&&!canManage} onChange={event=>update('description',event.target.value)} rows={4}/></div>
         <label>Origem<select value={form.originCode} disabled={!!selected&&!canManage} onChange={event=>update('originCode',event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3"><option value="">Selecionar</option>{origins.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
         <label>Estado<select value={form.status} disabled={!!selected&&!canManage} onChange={event=>update('status',event.target.value as Form['status'])} className="mt-1 w-full rounded-control border border-border bg-surface p-3">{Object.entries(statuses).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
         {field('Data de início','startedOn','date')}{field('Data de conclusão','completedOn','date')}
         <label>Prioridade<select value={form.priorityId} disabled={!!selected&&!canManage} onChange={event=>update('priorityId',event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3"><option value="">Sem prioridade</option>{projectPriorities.filter(priority=>!priority.deleted).map(priority=><option key={priority.id} value={priority.id}>{priority.name}</option>)}</select></label>
         <label>Gestor comercial<select value={form.commercialManagerId} disabled={!!selected&&!canManage} onChange={event=>update('commercialManagerId',event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3"><option value="">Selecionar</option>{commercial.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
         <label>Gestor de projeto *<select required value={form.projectManagerId} disabled={!!selected&&!canManage} onChange={event=>update('projectManagerId',event.target.value)} className="mt-1 w-full rounded-control border border-border bg-surface p-3"><option value="">Selecionar</option>{managers.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
         {field('Valor potencial','potentialValue','number')}{field('Data de venda','saleDate','date')}{field('Valor de venda','saleValue','number')}
         {(!selected||canManage)&&<M3Button type="submit" isLoading={busy}>Guardar processo</M3Button>}
       </form></M3Card></>}
 </div>;
}
