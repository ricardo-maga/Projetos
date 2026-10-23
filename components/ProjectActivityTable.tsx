import { Comment, Project, ProjectMaterial, ProjectRiskItem, Task } from '../lib/types';

type NamedStatus = { id: string; name: string };
type Activity = { key: string; date: string; kind: string; title: string; detail: string; status: string };

interface ProjectActivityTableProps {
  project: Project;
  tasks: Task[];
  comments: Comment[];
  risks: ProjectRiskItem[];
  materials: ProjectMaterial[];
  taskStatuses: NamedStatus[];
  riskStatuses: NamedStatus[];
  getUserName: (id: string) => string;
  pendingMaterialStatuses: Record<string, string>;
}

const materialStatusNames: Record<string, string> = {
  por_encomendar: 'Por encomendar',
  encomendado: 'Encomendado',
  em_armazem: 'Em armazém',
  em_stock: 'Em stock',
};

function formatDate(value: string) {
  if (!value) return 'Sem data';
  const day = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export default function ProjectActivityTable({ project, tasks, comments, risks, materials, taskStatuses, riskStatuses, getUserName, pendingMaterialStatuses }: ProjectActivityTableProps) {
  const activities: Activity[] = [];
  const projectDates: [string, string][] = [
    ['Criação do projeto', project.createdDate],
    ['Início do projeto', project.startDate],
    ['Entrega do projeto', project.deliveryDate],
    ['Data estimada', project.estimatedDate],
    ['Data agendada', project.scheduledDate],
    ['Forecast', project.forecastDate || ''],
  ];
  projectDates.forEach(([title, date]) => {
    if (date) activities.push({ key: `project-${title}`, date, kind: 'Projeto', title, detail: project.title, status: '—' });
  });
  tasks.filter(task => !task.deleted).forEach(task => {
    activities.push({
      key: `task-${task.id}`, date: task.estimatedDate || task.startDate || task.createdDate || '', kind: 'Tarefa', title: task.title,
      detail: [task.startDate && `Início: ${formatDate(task.startDate)}`, task.endDate && `Fim: ${formatDate(task.endDate)}`].filter(Boolean).join(' · '),
      status: taskStatuses.find(item => item.id === task.statusId)?.name || 'Sem estado',
    });
  });
  comments.forEach(comment => activities.push({
    key: `comment-${comment.id}`, date: comment.createdDate, kind: 'Comentário', title: comment.comment,
    detail: `Comentário de ${getUserName(comment.authorId)} em ${formatDate(comment.createdDate)}`, status: '—',
  }));
  risks.filter(risk => !risk.deleted).forEach(risk => activities.push({
    key: `risk-${risk.id}`, date: risk.reviewDate || risk.identificationDate || risk.createdDate || '', kind: 'Risco', title: risk.title,
    detail: risk.reviewDate ? `Revisão · Identificado em ${formatDate(risk.identificationDate)}` : 'Identificação',
    status: riskStatuses.find(item => item.id === risk.statusId)?.name || 'Sem estado',
  }));
  materials.filter(material => !material.deleted).forEach(material => activities.push({
    key: `material-${material.id}`, date: material.expectedDeliveryDate || material.createdDate || '', kind: 'Material', title: material.description,
    detail: [material.expectedDeliveryDate ? 'Entrega prevista' : 'Registo', material.supplier].filter(Boolean).join(' · '),
    status: materialStatusNames[pendingMaterialStatuses[material.id] || material.status] || pendingMaterialStatuses[material.id] || material.status || 'Sem estado',
  }));
  activities.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));

  return (
    <section className="animate-fade-in rounded-control border border-border bg-surface overflow-hidden" aria-label="Atividade do projeto">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-bold text-text-primary text-body-sm uppercase tracking-wider">Atividade do projeto</h3>
        <p className="text-caption text-text-muted">Datas, tarefas, comentários, riscos e material por ordem de data.</p>
      </div>
      {activities.length === 0 ? <p className="px-4 py-8 text-center text-body-sm text-text-muted">Ainda não há atividade registada neste projeto.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-body-sm">
            <thead className="bg-surface-muted text-caption font-bold uppercase tracking-wide text-text-muted">
              <tr><th scope="col" className="px-4 py-3">Data</th><th scope="col" className="px-4 py-3">Tipo</th><th scope="col" className="px-4 py-3">Atividade</th><th scope="col" className="px-4 py-3">Estado</th></tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {activities.map(activity => (
                <tr key={activity.key} className="align-top hover:bg-surface-muted/50">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-text-secondary">{formatDate(activity.date)}</td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-control border border-border bg-surface-muted px-2 py-0.5 text-caption font-semibold text-text-secondary">{activity.kind}</span></td>
                  <td className="px-4 py-3 min-w-[240px]"><span className="block font-semibold text-text-primary whitespace-pre-wrap break-words">{activity.title}</span>{activity.detail && <span className="block text-caption text-text-muted">{activity.detail}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{activity.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
