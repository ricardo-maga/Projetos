import { describe, expect, it } from 'bun:test';
import { buildPlannedTaskCopy } from '../domains/tasks/modules/taskCopy';
import { createSectionHarness } from './fixtures/m3-section-harness';
import { createProjectHarness, findProjectElement as find } from './fixtures/projects-m3-harness';
const task: any = { id:'t', projectId:'p', title:'Montagem', description:'Descrição', notes:'Notas', assigneeIds:['u','v'], taskTypeId:'type', statusId:'done', estimatedDate:'2026-10-05', estimatedHours:'3.5', actualHours:'4', startDate:'2026-10-05', endDate:'2026-10-08', startTime:'08:00', endTime:'17:00', completedDate:'2026-10-08', version:9 };
const statuses: any[] = [{id:'pending',scale:1},{id:'done',scale:5}];
const types: any[] = [{id:'type',name:'Instalação'}];
const project: any = {id:'p',title:'Projeto',clientId:'c',statusId:'active',startDate:'2026-10-01'};
const transfer = () => { const values = new Map(); return {effectAllowed:'',dropEffect:'',setData:(k:string,v:string)=>values.set(k,v),getData:(k:string)=>values.get(k)||''}; };
const flush = () => new Promise(resolve=>setTimeout(resolve,0));
const props: any = { projects:[project], clients:[{id:'c',clientName:'Cliente'}], tasks:[task], users:[], projectStatuses:[{id:'active',scale:2}], taskStatuses:statuses, canCreate:true, onSelectTask(){}, onCreateTask(){}, canCopy:true };
describe('CTRL drag task copies',()=>{
 it('copies planning only, preserves original and refuses invalid configuration or projects',()=>{
  const before=structuredClone(task); const copy=buildPlannedTaskCopy(task,'2026-10-12','p',statuses,types);
  expect(copy).toMatchObject({title:'Montagem',description:'Descrição',notes:'Notas',assigneeIds:['u','v'],estimatedHours:'3.5',estimatedDate:'2026-10-12',statusId:'pending',actualHours:null,startDate:'',endDate:'',startTime:'',endTime:'',completedDate:null});
  expect(copy).not.toHaveProperty('id'); expect(copy).not.toHaveProperty('version'); expect(task).toEqual(before); expect(copy.assigneeIds).not.toBe(task.assigneeIds);
  expect(()=>buildPlannedTaskCopy(task,'2026-10-12','other',statuses,types)).toThrow();
  expect(()=>buildPlannedTaskCopy(task,'2026-10-12','p',[],types)).toThrow();
  expect(()=>buildPlannedTaskCopy(task,'2026-10-12','p',statuses,[])).toThrow();
 });
 it('locks copy at drag start, consumes a drop once and preserves the original in normal and HD views',async()=>{
  for(const view of [7,'56-hd']) {
   const copies:any[]=[]; const moves:any[]=[];
   const h=createSectionHarness('ProjectTimeline.tsx',{anchor:new Date(2026,9,5),horizon:'all',view});
   const tree=h.render({...props,onCopyTask:async(...args:any[])=>{copies.push(args);return {...task,id:'new'};},updateTask:(...args:any[])=>moves.push(args)});
   const card=find(tree,e=>e.props?.onDragStart); const dataTransfer=transfer();
   card.props.onDragStart({ctrlKey:true,dataTransfer}); expect(dataTransfer.effectAllowed).toBe('copy');
   const cell=find(tree,e=>e.props?.['data-timeline-drop-cell']==='p:2026-10-06');
   cell.props.onDragOver({ctrlKey:false,dataTransfer,preventDefault(){}}); expect(dataTransfer.dropEffect).toBe('copy');
   cell.props.onDrop({ctrlKey:false,dataTransfer,preventDefault(){}}); cell.props.onDrop({dataTransfer,preventDefault(){}});
   await flush(); expect(copies).toHaveLength(1); expect(copies[0]).toEqual([task,'2026-10-06','p']); expect(moves).toHaveLength(0);
  }
 });
 it('ignores origin drops and cancelled drags and never falls back to move without copy permission',()=>{
  const h=createSectionHarness('ProjectTimeline.tsx',{anchor:new Date(2026,9,5),horizon:'all'});
  let count=0; const tree=h.render({...props,onCopyTask:async()=>{count++;return task;},updateTask:()=>count++});
  const card=find(tree,e=>e.props?.onDragStart), dataTransfer=transfer();
  card.props.onDragStart({ctrlKey:true,dataTransfer}); find(tree,e=>e.props?.['data-timeline-drop-cell']==='p:2026-10-05').props.onDrop({dataTransfer,preventDefault(){}}); expect(count).toBe(0);
  card.props.onDragStart({ctrlKey:true,dataTransfer}); card.props.onDragEnd(); find(tree,e=>e.props?.['data-timeline-drop-cell']==='p:2026-10-06').props.onDrop({dataTransfer,preventDefault(){}}); expect(count).toBe(0);
  const restricted=h.render({...props,canCopy:false,updateTask:()=>count++}); let prevented=false;
  find(restricted,e=>e.props?.onDragStart).props.onDragStart({ctrlKey:true,dataTransfer,preventDefault(){prevented=true;}}); expect(prevented).toBe(true); expect(count).toBe(0);
 });
 it('keeps a move when CTRL is pressed late and reports a failed copy without moving the source',async()=>{
  const h=createSectionHarness('ProjectTimeline.tsx',{anchor:new Date(2026,9,5),horizon:'all'});
  const moves:any[]=[];
  const input={...props,onCopyTask:async()=>{throw new Error('Falha de comunicação');},updateTask:(...args:any[])=>moves.push(args)};
  let tree=h.render(input);let card=find(tree,e=>e.props?.onDragStart); const dataTransfer=transfer();
  card.props.onDragStart({ctrlKey:false,dataTransfer});
  find(tree,e=>e.props?.['data-timeline-drop-cell']==='p:2026-10-06').props.onDrop({ctrlKey:true,dataTransfer,preventDefault(){}});
  expect(moves).toHaveLength(1);
  card.props.onDragStart({ctrlKey:true,dataTransfer});
  find(tree,e=>e.props?.['data-timeline-drop-cell']==='p:2026-10-07').props.onDrop({dataTransfer,preventDefault(){}});
  let prevented=false;card.props.onDragStart({ctrlKey:true,dataTransfer,preventDefault(){prevented=true;}});expect(prevented).toBe(true);
  await flush();expect(h.state.moveError).toBe('Falha de comunicação');expect(moves).toHaveLength(1);expect(h.state.copyBusy).toBe(false);
 });
 it('copies the authoritative monthly task without updating its execution',async()=>{
  const copies:any[]=[]; const moves:any[]=[];
  const h=createProjectHarness({projectViewTab:'calendario',loadedProjectIdForTasks:'p',serverTasks:[task]});
  const tree=h.render({projects:[project],clients:[],users:[],tasks:[],comments:[],projectStatuses:[],taskStatuses:statuses,taskTypes:types,projectCategories:[],projectRisks:[],projectPriorities:[],projectTeams:[],projectPartners:[],selectedProjectId:'p',setSelectedProjectId(){},currentUser:{id:'u',roleId:'ug-1',permissions:['projects.read','tasks.write']},addTask:async(p:any)=>{copies.push(p);return {...p,id:'new'};},updateTask:(...args:any[])=>moves.push(args)});
  const source=find(tree,e=>e.props?.['data-monthly-task-cell']==='2026-10-05'); const card=find(source,e=>e.props?.onDragStart); expect(card).toBeDefined();
  const dataTransfer=transfer();card.props.onDragStart({ctrlKey:true,dataTransfer,stopPropagation(){}});
  const destination=find(tree,e=>e.props?.['data-monthly-task-cell']==='2026-10-12');destination.props.onDrop({dataTransfer,preventDefault(){}});destination.props.onDrop({dataTransfer,preventDefault(){}});
  await flush();expect(copies).toHaveLength(1);expect(copies[0].estimatedDate).toBe('2026-10-12');expect(copies[0].startDate).toBe('');expect(moves).toHaveLength(0);
 });
});
