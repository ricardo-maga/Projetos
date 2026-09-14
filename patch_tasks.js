const fs = require('fs');
let code = fs.readFileSync('components/TaskSection.tsx', 'utf-8');

const newFetchLogic = `  // --- SERVER SIDE FETCHING LOGIC ---
  const [serverTasks, setServerTasks] = useState<Task[]>([]);
  const [totalServerTasks, setTotalServerTasks] = useState(0);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  
  useEffect(() => {
    let isMounted = true;
    const fetchTasks = async () => {
      setIsLoadingTasks(true);
      try {
        const query = new URLSearchParams({
          page: currentPage.toString(),
          pageSize: itemsPerPage.toString(),
          search: search,
          projectId: filterProject || formProj,
          statusId: filterStatus,
          taskTypeId: filterType
        });
        const res = await fetch(\`/api/v1/tasks?\${query.toString()}\`);
        const result = await res.json();
        if (result.success && isMounted) {
          setServerTasks(result.data);
          setTotalServerTasks(result.total || result.count);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoadingTasks(false);
      }
    };
    fetchTasks();
    return () => { isMounted = false; };
  }, [currentPage, itemsPerPage, search, filterProject, formProj, filterStatus, filterType, tasks]);

  const activeTasks = useMemo(() => {
    if (serverTasks.length > 0) return serverTasks;
    return tasks.filter(t => {
      const matchP = filterProject ? t.projectId === filterProject : true;
      const matchS = filterStatus ? t.statusId === filterStatus : true;
      const matchT = filterType ? t.taskTypeId === filterType : true;
      const matchSearch = search ? (t.title?.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase())) : true;
      return !t.deleted && matchP && matchS && matchT && matchSearch;
    });
  }, [tasks, filterProject, filterStatus, filterType, search, serverTasks]);
`;

code = code.replace(/  const activeTasks = useMemo\(\(\) => \{[\s\S]*?\}, \[tasks, filterProject, filterStatus, filterType, search\]\);/, newFetchLogic);

fs.writeFileSync('components/TaskSection.tsx', code);
console.log('TaskSection patched');
