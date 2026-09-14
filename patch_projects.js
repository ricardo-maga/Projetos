const fs = require('fs');
let code = fs.readFileSync('components/ProjectSection.tsx', 'utf-8');

// We need to find the filtering logic and replace it.
const filterStart = `  // Filter projects
  const activeProjects = projects.filter(p => !p.deleted);`;

const newFetchLogic = `  // --- SERVER SIDE FETCHING LOGIC ---
  const [serverProjects, setServerProjects] = useState<Project[]>([]);
  const [totalServerProjects, setTotalServerProjects] = useState(0);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [serverSelectedProj, setServerSelectedProj] = useState<Project | null>(null);
  const [serverTasks, setServerTasks] = useState<Task[]>([]);
  
  useEffect(() => {
    if (selectedProjectId) return;
    let isMounted = true;
    const fetchProj = async () => {
      setIsLoadingProjects(true);
      try {
        const query = new URLSearchParams({
          page: projectCurrentPage.toString(),
          pageSize: projectPageSize.toString(),
          search: search,
          categoryId: filterCategory,
          statusId: filterStatus,
          managerId: filterManager
        });
        const res = await fetch(\`/api/v1/projects?\${query.toString()}\`);
        const result = await res.json();
        if (result.success && isMounted) {
          setServerProjects(result.data);
          setTotalServerProjects(result.total || result.count);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoadingProjects(false);
      }
    };
    fetchProj();
    return () => { isMounted = false; };
  }, [projectCurrentPage, projectPageSize, search, filterCategory, filterStatus, filterManager, selectedProjectId, projects]); // Re-run if 'projects' prop changes as a fallback refresh

  useEffect(() => {
    if (!selectedProjectId) {
      setServerSelectedProj(null);
      return;
    }
    let isMounted = true;
    const fetchDetails = async () => {
      try {
        const res = await fetch(\`/api/v1/projects/\${selectedProjectId}\`);
        if (res.ok) {
          const result = await res.json();
          if (result.success && isMounted) setServerSelectedProj(result.data);
        }
      } catch (err) {}
      
      try {
        const taskRes = await fetch(\`/api/v1/tasks?projectId=\${selectedProjectId}\`);
        if (taskRes.ok) {
          const taskResult = await taskRes.json();
          if (taskResult.success && isMounted) setServerTasks(taskResult.data);
        }
      } catch (err) {}
    };
    fetchDetails();
    return () => { isMounted = false; };
  }, [selectedProjectId, tasks]);

  // Use server data if available, fallback to props
  const activeProjects = serverProjects.length > 0 ? serverProjects : projects.filter(p => !p.deleted);
  const paginatedProjects = serverProjects.length > 0 ? serverProjects : projects.filter(p => !p.deleted).slice((projectCurrentPage - 1) * projectPageSize, projectCurrentPage * projectPageSize);
  const totalProjects = serverProjects.length > 0 ? totalServerProjects : projects.filter(p => !p.deleted).length;
  const startProjectIndex = (projectCurrentPage - 1) * projectPageSize;
  const endProjectIndex = startProjectIndex + paginatedProjects.length;
  
  const selectedProj = serverSelectedProj || activeProjects.find(p => p.id === selectedProjectId);
  const projTasks = serverTasks.length > 0 ? serverTasks : tasks.filter(t => t.projectId === selectedProjectId && !t.deleted);
`;

code = code.replace(/  \/\/ Filter projects[\s\S]*?const paginatedProjects = filteredProjects\.slice\(startProjectIndex, endProjectIndex\);/, newFetchLogic);

fs.writeFileSync('components/ProjectSection.tsx', code);
console.log('ProjectSection patched');
