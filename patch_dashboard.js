const fs = require('fs');
let code = fs.readFileSync('components/BentoDashboard.tsx', 'utf-8');

const newLogic = `
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/v1/dashboard/stats');
        const json = await res.json();
        if (json.success && isMounted) {
          setStats(json.data);
        }
      } catch (err) {} finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, []);

  const activeProjects = stats ? stats.recentProjects : projects.filter(p => !p.deleted);
  const activeTasks = stats ? stats.recentTasks : tasks.filter(t => !t.deleted);
  
  const metrics = {
    totalProjects: stats ? stats.activeProjects : activeProjects.length,
    activeTasks: stats ? stats.activeTasks : activeTasks.length,
    delayedTasks: 0, // Simplified for now
    completedTasks: 0
  };
`;

code = code.replace(/  const activeProjects = projects\.filter\(p => !p\.deleted\);[\s\S]*?completedTasks: activeTasks\.filter\(t => \{\n.*?\}\)\.length\n  \};/, newLogic);

fs.writeFileSync('components/BentoDashboard.tsx', code);
console.log('BentoDashboard patched');
